"""Experimental prospective regional pilot with an append-only prediction ledger."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
from importlib.metadata import version
import json
from pathlib import Path
import re
from shutil import which
import subprocess

import numpy as np
import pandas as pd

from .contract import VALUE_COLUMNS
from .forecast import instant, issue_month
from .models import estimator

CONFIG = Path(__file__).resolve().parents[2] / "config/phase7_prospective_pilot_v1.json"
DIGEST = re.compile("[0-9a-f]{64}")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def fingerprint(value):
    return sha256(canonical(value)).hexdigest()


def month(label):
    if not isinstance(label, str) or not re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])", label):
        raise ValueError("Expected a UTC YYYY-MM observation month.")
    return pd.Timestamp(label + "-01", tz="UTC")


def verify_snapshot(snapshot, receipts, cutoff, config):
    """A normalized snapshot must be bound to a trusted complete-content receipt."""
    digest = fingerprint(snapshot)
    matches = [r for r in receipts if r.get("snapshot_sha256") == digest]
    if not matches:
        raise ValueError("No complete validated asset evidence for snapshot.")
    stamps = []
    start = month(snapshot["month"])
    end = start + pd.DateOffset(months=1)
    for record in matches:
        if (record.get("checksum_scope") != "full_validated_assets"
                or record.get("usable_scientific_data") is not True
                or record.get("collection") != config["collection"]
                or record.get("version") != config["version"]
                or record.get("scope") != config["scope"]
                or not record.get("asset_id")
                or not all(DIGEST.fullmatch(record.get(k, "")) for k in ("soil_sha256", "driver_sha256"))
                or record.get("observation_start") != start.isoformat()
                or record.get("observation_end") != end.isoformat()):
            raise ValueError("Incomplete, wrong-scope or prefix-only asset evidence.")
        accessed = instant(record["first_success_at"])
        publication = record.get("provider_publication_at")
        if (publication is not None and not end <= instant(publication) <= accessed) or accessed < end:
            raise ValueError("Invalid publication or access timing.")
        if accessed <= cutoff:
            stamps.append((accessed, record))
    if not stamps:
        raise ValueError("Snapshot was unavailable at the issue cutoff.")
    return min(stamps, key=lambda pair: pair[0])[1]


def features(lags, target, cutoff, receipts, config):
    if len(lags) != config["preprocessing"]["lags"]:
        raise ValueError("Six verified released months are required.")
    dates = [month(row["month"]) for row in lags]
    if any(a != b + pd.DateOffset(months=1) for a, b in zip(dates, dates[1:])):
        raise ValueError("Lags must be consecutive and newest first.")
    evidence = [verify_snapshot(row, receipts, cutoff, config) for row in lags]
    angle = 2 * np.pi * (target.month - 1) / 12
    predictors = []
    for snapshot, observed in zip(lags, dates, strict=True):
        predictors.extend(snapshot["values"][column] for column in VALUE_COLUMNS)
        predictors.extend([(cutoff.year - observed.year) * 12 + cutoff.month - observed.month,
                           observed.month])
    predictors.extend([np.sin(angle), np.cos(angle)])
    if not np.isfinite(np.array(predictors, dtype=float)).all():
        raise ValueError("Missing or non-finite input; pilot does not impute.")
    return predictors, evidence


def freeze(training, receipts, config, cutoff):
    x, y, by_month, targets = [], [], {}, set()
    if version("xgboost") != config["models"]["challenger_dependency"]:
        raise ValueError("Installed XGBoost differs from the frozen version.")
    for row in training:
        target = month(row["label"]["month"])
        if target in targets or target > month(config["training"]["target_cutoff"]):
            raise ValueError("Duplicate or outside-policy training target.")
        targets.add(target)
        verify_snapshot(row["label"], receipts, cutoff, config)
        predictors, _ = features(row["lags"], target, issue_month(target, 1), receipts, config)
        label = float(row["label"]["values"]["soil_water_mm"])
        if not np.isfinite(label):
            raise ValueError("Missing training label.")
        x.append(predictors)
        y.append(label)
        by_month.setdefault(str(target.month), []).append(label)
    if len(y) < config["training"]["minimum_rows"] or len(by_month) != 12:
        raise ValueError("Insufficient verified training labels across calendar months.")
    fit = estimator("xgboost", params=config["models"]["challenger_params"])
    fit.fit(np.asarray(x, float), np.asarray(y), sample_weight=None)
    challenger = json.loads(bytes(fit.get_booster().save_raw(raw_format="json")))
    return {"schema_version": "pilot_model_pair_v1", "config_sha256": fingerprint(config),
            "training_sha256": fingerprint(training), "training_cutoff": cutoff.isoformat(),
            "dependency": version("xgboost"), "training_count": len(y),
            "availability_receipts_sha256": fingerprint(receipts),
            "baseline": {k: float(np.mean(values)) for k, values in by_month.items()},
            "challenger": challenger}


def issue_prediction(config, model, lags, receipts, issue, now):
    """Sample the real clock at the CLI. Tests may inject synthetic timestamps."""
    if (model["schema_version"] != "pilot_model_pair_v1" or model["config_sha256"] != fingerprint(config)
            or model.get("dependency") != config["models"]["challenger_dependency"]
            or version("xgboost") != model["dependency"]
            or instant(model["training_cutoff"]) >= issue):
        raise ValueError("Frozen model or training cutoff does not match this issue.")
    target = issue.normalize().replace(day=1) + pd.DateOffset(months=1)
    if issue != issue_month(target, 1) or not issue <= now < target + pd.Timedelta(minutes=1):
        raise ValueError("Not a current scheduled issue. Historical backfilling is forbidden.")
    if any(r.get("scope") == config["scope"] and r.get("collection") == config["collection"]
           and r.get("observation_start") == target.isoformat()
           and r.get("usable_scientific_data") is True and instant(r["first_success_at"]) <= now
           for r in receipts):
        raise ValueError("Target already available.")
    x, evidence = features(lags, target, issue, receipts, config)
    from xgboost import Booster, DMatrix

    booster = Booster(params={"nthread": 1})
    booster.load_model(bytearray(canonical(model["challenger"])))
    baseline = float(model["baseline"][str(target.month)])
    challenger = float(booster.predict(DMatrix(np.asarray([x], float)))[0])
    if not np.isfinite([baseline, challenger]).all():
        raise ValueError("Non-finite model output.")
    return {"schema_version": "prospective_pilot_record_v1", "status": "experimental",
            "operationally_eligible": False, "config_sha256": fingerprint(config),
            "model_pair_sha256": fingerprint(model), "model_version": model["dependency"],
            "issue_time": issue.isoformat(), "recorded_at": now.isoformat(),
            "target_month": target.strftime("%Y-%m"), "units": "mm",
            "predictions": {"seasonal_climatology": baseline, "xgboost": challenger},
            "input_evidence": evidence}


def score(record, truth, receipts, now, config):
    if (record["status"] != "experimental" or record["config_sha256"] != fingerprint(config)
            or truth["month"] != record["target_month"]):
        raise ValueError("Target or pilot does not match the sealed prediction.")
    evidence = verify_snapshot(truth, receipts, now, config)
    if instant(record["recorded_at"]) >= instant(evidence["first_success_at"]):
        raise ValueError("Prediction was not recorded before target access.")
    first = min(instant(r["first_success_at"]) for r in receipts
                if r.get("scope") == config["scope"] and r.get("collection") == config["collection"]
                and r.get("observation_start") == evidence["observation_start"]
                and r.get("version") == config["version"]
                and r.get("checksum_scope") == "full_validated_assets" and r.get("usable_scientific_data") is True)
    if instant(evidence["first_success_at"]) != first:
        raise ValueError("Score the first verified target vintage, not a revision.")
    actual = float(truth["values"]["soil_water_mm"])
    if not np.isfinite(actual):
        raise ValueError("Missing target value.")
    errors = {model: point - actual for model, point in record["predictions"].items()}
    return {"schema_version": "prospective_pilot_score_v1", "prediction_sha256": fingerprint(record),
            "target_evidence": evidence, "target_month": truth["month"], "scored_at": now.isoformat(),
            "observed_mm": actual, "errors_mm": errors}


def summarize(scores):
    months = {row["target_month"] for row in scores}
    if not scores or len(months) != len(scores):
        raise ValueError("Expected distinct scored target months.")
    calculated = {}
    for model in ("seasonal_climatology", "xgboost"):
        e = np.array([r["errors_mm"][model] for r in scores], dtype=float)
        if not np.isfinite(e).all():
            raise ValueError("Non-finite score.")
        calculated[model] = {"rmse_mm": float(np.sqrt(np.mean(e ** 2))),
                             "mae_mm": float(np.mean(np.abs(e))), "bias_mm": float(np.mean(e))}
    return {"schema_version": "prospective_pilot_summary_v1", "target_months": sorted(months),
            "metrics": calculated, "status": "experimental"}


def trusted_receipts(payload, signature, config):
    key = config.get("verified_receipt_public_key")
    if not key or not signature:
        raise ValueError("No approved receipt signer or detached signature.")
    node = which("node")
    if node is None:
        raise ValueError("Node.js is required to verify Ed25519 evidence.")
    key_bytes = bytes.fromhex(key)
    signature_bytes = bytes.fromhex(signature.strip())
    if len(key_bytes) != 32 or len(signature_bytes) != 64:
        raise ValueError("Invalid Ed25519 key or signature length.")
    # SubjectPublicKeyInfo prefix for a raw 32-byte Ed25519 public key.
    der = bytes.fromhex("302a300506032b6570032100") + key_bytes
    command = """
const { createPublicKey, verify } = require('node:crypto');
const { readFileSync } = require('node:fs');
const [key, signature] = process.argv.slice(1);
const publicKey = createPublicKey({ key: Buffer.from(key, 'hex'), format: 'der', type: 'spki' });
process.exitCode = verify(null, readFileSync(0), publicKey, Buffer.from(signature, 'hex')) ? 0 : 1;
"""
    process = subprocess.run([node, "-e", command, der.hex(), signature_bytes.hex()],
                             input=canonical(payload), capture_output=True, timeout=10, check=False)
    if process.returncode != 0:
        raise ValueError("Receipt signature validation failed.")
    return payload


def append(path, record):
    """Use an exclusive create for one file per target; caller anchors its digest off-host."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as out:
        out.write(canonical(record) + b"\n")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=("freeze", "issue", "score", "summarize"))
    p.add_argument("--receipts", type=Path)
    p.add_argument("--receipts-signature", type=Path)
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--output-dir", required=True, type=Path)
    p.add_argument("--model", type=Path)
    p.add_argument("--model-sha256", help="Previously anchored canonical frozen-model digest")
    p.add_argument("--record", type=Path)
    p.add_argument("--record-sha256", help="Previously anchored canonical prediction digest")
    p.add_argument("--issue-time")
    a = p.parse_args()
    now = pd.Timestamp(datetime.now(timezone.utc))
    try:
        config, payload = read(CONFIG), read(a.input)
        if a.action == "summarize":
            result, name = summarize(payload), "pilot-summary-v1.json"
            append(a.output_dir / name, result)
            return
        if a.receipts is None or a.receipts_signature is None:
            raise ValueError("A signed full-content receipt manifest is required.")
        receipts = trusted_receipts(read(a.receipts), a.receipts_signature.read_text(), config)
        if a.action == "freeze":
            result, name = freeze(payload, receipts, config, now), "frozen-model-v1.json"
        elif a.action == "issue":
            if a.model is None or a.issue_time is None:
                raise ValueError("Issue requires a frozen model and scheduled UTC issue time.")
            model = read(a.model)
            if fingerprint(model) != a.model_sha256:
                raise ValueError("Model does not match the anchored frozen digest.")
            result = issue_prediction(config, model, payload, receipts, instant(a.issue_time), now)
            name = "prediction-" + result["target_month"] + ".json"
        else:
            if a.record is None:
                raise ValueError("Score requires a sealed prediction record.")
            record = read(a.record)
            if fingerprint(record) != a.record_sha256:
                raise ValueError("Prediction does not match the anchored issue digest.")
            result = score(record, payload, receipts, now, config)
            name = "score-" + result["target_month"] + ".json"
        append(a.output_dir / name, result)
        print(f"{a.output_dir / name} SHA-256 (canonical content): {fingerprint(result)}")
    except (ValueError, OSError, KeyError, TypeError, ImportError, subprocess.TimeoutExpired) as exc:
        p.exit(2, f"Pilot withheld: {exc}\n")


if __name__ == "__main__":
    main()
