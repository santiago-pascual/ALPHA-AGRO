import copy
import json
import subprocess

import pandas as pd
import pytest

from gldas.predictive.contract import VALUE_COLUMNS
from gldas.predictive.forecast import instant, issue_month
from gldas.predictive.prospective import (
    CONFIG, append, canonical, features, fingerprint, freeze, issue_prediction, read, score,
    summarize, trusted_receipts,
)


def fixture():
    config = {**read(CONFIG), "verified_receipt_authority": "fixture-witness"}
    receipts = {}
    def snapshot(day):
        name = day.strftime("%Y-%m")
        row = {"month": name, "values": dict.fromkeys(VALUE_COLUMNS, 20 + day.month)}
        end = day + pd.DateOffset(months=1)
        receipts[name] = {"collection": config["collection"], "version": config["version"],
                          "scope": config["scope"], "snapshot_sha256": fingerprint(row),
                          "asset_id": "SYNTHETIC:" + name, "soil_sha256": "a"*64, "driver_sha256": "b"*64,
                          "checksum_scope": "full_validated_assets", "usable_scientific_data": True,
                          "evidence_status": "independently_witnessed", "authority_id": "fixture-witness",
                          "capture_manifest_sha256": "c"*64, "witness_record_id": "fixture:" + name,
                          "witnessed_at": (end + pd.Timedelta(days=2)).isoformat(),
                          "first_success_at": (end + pd.Timedelta(days=1)).isoformat(),
                          "observation_start": day.isoformat(), "observation_end": end.isoformat(),
                          "provider_publication_at": None}
        return row
    def lags(target):
        return [snapshot(target - pd.DateOffset(months=n)) for n in range(3, 9)]
    training = [{"label": snapshot(target), "lags": lags(target)}
                for target in pd.date_range("2020-01-01", periods=24, freq="MS", tz="UTC")]
    target = instant("2026-01-01T00:00:00Z")
    inputs = lags(target)
    return config, training, inputs, snapshot(target), list(receipts.values())


def test_synthetic_frozen_workflow_scores_only_available_first_vintage(tmp_path):
    config, data, inputs, truth, receipts = fixture()
    cutoff = instant("2025-12-01T00:00:00Z")
    pair = freeze(data, receipts, config, cutoff)
    issue = issue_month(instant("2026-01-01T00:00:00Z"), 1)
    now = instant("2026-01-01T00:00:15Z")
    prediction = issue_prediction(config, pair, inputs, receipts, issue, now)
    assert prediction["target_month"] == "2026-01"
    assert prediction["status"] == "experimental" and not prediction["operationally_eligible"]
    append(tmp_path/"prediction.json", prediction)
    with pytest.raises(FileExistsError):
        append(tmp_path/"prediction.json", prediction)
    seal = {"schema_version": "pilot_prediction_seal_v1", "authority_id": "fixture-witness",
            "witness_record_id": "fixture-prediction", "prediction_sha256": fingerprint(prediction),
            "witnessed_at": "2026-01-01T00:01:00Z"}
    with pytest.raises(ValueError, match="unavailable"):
        score(prediction, truth, receipts, now, config, seal=seal)
    evaluation = instant("2026-03-01T00:00:00Z")
    result = score(prediction, truth, receipts, evaluation, config, seal=seal)
    assert result["prediction_sha256"] == fingerprint(prediction)
    with pytest.raises(ValueError, match="before first outcome"):
        score(prediction, truth, receipts, evaluation, config,
              seal={**seal, "witnessed_at": "2026-02-03T00:00:00Z"})
    later_truth = {**truth, "values": {**truth["values"], "soil_water_mm": 37}}
    first = result["target_evidence"]
    revision = {**first, "snapshot_sha256": fingerprint(later_truth), "soil_sha256": "d"*64,
                "first_success_at": "2026-02-05T00:00:00Z", "witnessed_at": "2026-02-05T00:00:01Z"}
    with pytest.raises(ValueError, match="not a revision"):
        score(prediction, later_truth, [*receipts, revision], evaluation, config, seal=seal)
    with pytest.raises(ValueError, match="ambiguous"):
        score(prediction, truth, [*receipts, {**revision, "first_success_at": first["first_success_at"]}],
              evaluation, config, seal=seal)
    summary = summarize([result])
    assert summary["metrics"]["seasonal_climatology"]["rmse_mm"] == 0
    bad = {**pair, "config_sha256": "c"*64}
    with pytest.raises(ValueError, match="Frozen model"):
        issue_prediction(config, bad, inputs, receipts, issue, now)
    with pytest.raises(ValueError, match="backfilling"):
        issue_prediction(config, pair, inputs, receipts, issue, instant("2026-01-03T00:00:00Z"))


def test_features_reject_prefix_and_future_publication():
    config, _, inputs, _, receipts = fixture()
    target = instant("2026-01-01T00:00:00Z")
    issue = issue_month(target, 1)
    prefix = copy.deepcopy(receipts)
    next(r for r in prefix if r["snapshot_sha256"] == fingerprint(inputs[0]))["checksum_scope"] = "prefix"
    with pytest.raises(ValueError, match="prefix-only"):
        features(inputs, target, issue, prefix, config)
    future = copy.deepcopy(receipts)
    row = next(r for r in future if r["snapshot_sha256"] == fingerprint(inputs[0]))
    row["first_success_at"] = "2026-01-09T00:00:00Z"
    row["provider_publication_at"] = "2026-01-08T00:00:00Z"
    row["witnessed_at"] = "2026-01-10T00:00:00Z"
    with pytest.raises(ValueError, match="unavailable"):
        features(inputs, target, issue, future, config)


def test_receipts_fail_closed_and_verify_signature():
    config, _, _, _, data = fixture()
    with pytest.raises(ValueError, match="No approved"):
        trusted_receipts(data, "aa", config)
    command = """
const crypto = require('node:crypto');
const {readFileSync} = require('node:fs');
const pair = crypto.generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({format: 'der', type: 'spki'}).subarray(-32).toString('hex');
const signature = crypto.sign(null, readFileSync(0), pair.privateKey).toString('hex');
console.log(JSON.stringify({publicKey, signature}));
"""
    signed = json.loads(subprocess.check_output(["node", "-e", command], input=canonical(data)))
    configured = {**config, "verified_receipt_public_key": signed["publicKey"]}
    assert trusted_receipts(data, signed["signature"], configured) == data
    with pytest.raises(ValueError, match="signature"):
        trusted_receipts(data[:-1], signed["signature"], configured)
