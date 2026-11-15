"""Frozen-fit regional GLDAS hindcasts with issue-time gates and separate calibration."""
from __future__ import annotations

import argparse
from importlib.util import find_spec
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ..acquisition import checksum
from ..availability.registry import DEFAULT_REGISTRY, check_as_of, load_registry
from .contract import VALUE_COLUMNS, read_parquet
from .evaluation import _baseline_predictions, _choose_params, _feature_values, _target_values
from .export_evaluation import HORIZONS, TARGETS
from .features import make_supervised
from .metrics import classification_metrics, regression_metrics
from .models import estimator, fit, predict

REGISTRY = {
    "seasonal_climatology": None, "persistence": None, "autoregressive_ridge": "sklearn",
    "xgboost": "xgboost", "xgboost_hmm": "xgboost",
}
SELECTED_MODEL = "seasonal_climatology"
HOLDOUT = pd.Timestamp("2024-01-01", tz="UTC")
CALIBRATION = pd.Timestamp("2022-01-01", tz="UTC")


def instant(text):
    value = pd.Timestamp(text)
    if pd.isna(value) or value.tzinfo is None or value.utcoffset().total_seconds() != 0:
        raise ValueError("An explicit UTC issue timestamp is required.")
    return value.tz_convert("UTC")


def iso_utc(value):
    """Serialize a timezone-aware timestamp in the frontend's canonical UTC-Z form."""
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None or timestamp.utcoffset().total_seconds() != 0:
        raise ValueError("Forecast artifact timestamps must be timezone-aware UTC.")
    return timestamp.tz_convert("UTC").isoformat().replace("+00:00", "Z")


def require_operational(issue, registry):
    audit = check_as_of(registry, issue.isoformat())
    raise ValueError(f"Operational forecast withheld ({audit['status']}). A prospectively "
                     "validated model, calibration, and content-bound current input vintages are required.")


def issue_month(target, horizon):
    return target - pd.DateOffset(months=horizon - 1) - pd.Timedelta(1, unit="ns")


def available_rows(panel, issue):
    return panel.loc[panel["observation_end"].le(issue) & panel["available_at"].le(issue)]


def requested_rows(panel, targets, horizon, n_lags):
    data = []
    for target in targets:
        issue = issue_month(target, horizon)
        eligible = available_rows(panel, issue).sort_values("month")
        if eligible.empty or not eligible.iloc[-1]["soil_water_valid"]:
            raise ValueError(f"No eligible soil-water input at {issue}.")
        origin = issue.normalize().replace(day=1)
        row = {"cell_id": eligible.iloc[-1]["cell_id"], "origin_month": origin, "issue_time": issue,
               "target_month": target, "area_weight": float(eligible.iloc[-1]["area_weight"])}
        for lag in range(n_lags):
            source = eligible.iloc[-lag - 1] if lag < len(eligible) else None
            for name in VALUE_COLUMNS:
                row[f"{name}_lag_{lag}"] = np.nan if source is None else source[name]
            row[f"available_age_months_lag_{lag}"] = (np.nan if source is None else
                (origin.year - source["month"].year) * 12 + origin.month - source["month"].month)
            row[f"soil_water_source_month_lag_{lag}"] = np.nan if source is None else source["month"].month
        angle = 2 * np.pi * (target.month - 1) / 12
        row.update(target_month_sin=np.sin(angle), target_month_cos=np.cos(angle))
        data.append(row)
    return pd.DataFrame(data)


def partition(panel, horizon, n_lags):
    earliest_issue = issue_month(CALIBRATION, horizon)
    first_test_issue = issue_month(HOLDOUT, horizon)
    training, features = make_supervised(available_rows(panel, earliest_issue), horizon=horizon, n_lags=n_lags)
    assert training["target_available_at"].le(earliest_issue).all()
    calibration = panel.loc[panel["month"].between(CALIBRATION, HOLDOUT, inclusive="left")
                             & panel["available_at"].le(first_test_issue), "month"]
    if len(calibration) < 12 or training["target_month"].nunique() < 24:
        raise ValueError("Insufficient causally eligible fit or calibration observations.")
    return training, features, calibration


def predictions(model_name, train, requests, features, target):
    if model_name not in REGISTRY:
        raise ValueError("Unknown forecasting model.")
    dependency = REGISTRY[model_name]
    if dependency and find_spec(dependency) is None:
        raise ValueError(f"Model unavailable: missing {dependency}.")
    y, _, info = _target_values(train, train, target)
    baselines = _baseline_predictions(train, requests, target, y, info)
    if model_name in baselines:
        return baselines[model_name], baselines, info, {"filtered": False}
    event = target == "low_moisture"
    if event and np.unique(y).size != 2:
        raise ValueError("Classification requires both outcomes in the training window.")
    model_kind = "ridge" if model_name == "autoregressive_ridge" else model_name
    selected = ([c for c in features if c.startswith("soil_water_mm_lag_")
                 or c in ("target_month_sin", "target_month_cos")]
                if model_kind == "ridge" else features)
    params = _choose_params(model_kind, train, selected, target)
    combined, columns, hmm = _feature_values(pd.concat([train, requests], ignore_index=True), selected,
                                               model_name, set(train["origin_month"]))
    model = estimator(model_kind, task="classification" if event else "regression", params=params)
    fit(model, combined.iloc[:len(train)][columns], y, sample_weight=train["area_weight"].to_numpy())
    return np.asarray(predict(model, combined.iloc[len(train):][columns], probability=event)), baselines, info, hmm


def observed_targets(panel, rows, train, target):
    truth = panel.set_index("month")["soil_water_mm"].reindex(rows["target_month"]).to_numpy()
    if not np.isfinite(truth).all():
        raise ValueError("Evaluation target months have missing soil-water storage.")
    return _target_values(train, rows.assign(target_soil_water_mm=truth), target)[1]


def uncertainty(errors, level=0.90):
    if not 0 < level < 1 or not len(errors) or not np.isfinite(errors).all():
        raise ValueError("Invalid calibration scores.")
    index = int(np.ceil((len(errors) + 1) * level))
    if index > len(errors):
        raise ValueError("Calibration is too small for the requested interval level.")
    return float(np.sort(np.abs(errors))[index - 1])


def retrospective(panel, issue, *, horizon, target, model_name=SELECTED_MODEL, release_lag=5):
    if horizon not in HORIZONS or target not in TARGETS or not 1 <= release_lag <= 24:
        raise ValueError("Unsupported target, horizon, or release-lag assumption.")
    if panel["cell_id"].nunique() != 1 or not panel["source_doi"].eq("10.5067/SXAVCZFAQLNO").all():
        raise ValueError("This runner requires a GLDAS regional panel.")
    origin = issue.normalize().replace(day=1)
    target_month = origin + pd.DateOffset(months=horizon)
    if issue != issue_month(target_month, horizon) or issue < issue_month(HOLDOUT, horizon):
        raise ValueError("Use an end-of-month UTC issue at or after the first holdout issue.")
    panel = panel.copy()
    panel["available_at"] = panel["month"] + pd.DateOffset(months=release_lag)
    panel["availability_policy"] = f"assumed_release_lag_{release_lag}_calendar_months"
    n_lags = 6
    train, features, cal = partition(panel, horizon, n_lags)
    test = panel.loc[panel["month"].between(HOLDOUT, pd.Timestamp("2025-12-01", tz="UTC")), "month"]
    if len(test) != 24 or target_month not in set(test):
        raise ValueError("The requested research issue must target the reserved 24-month holdout.")
    rows = requested_rows(panel, pd.concat([cal, test]), horizon, n_lags)
    pred, baseline, _, diagnostic = predictions(model_name, train, rows, features, target)
    y = observed_targets(panel, rows, train, target)
    count = len(cal)
    evaluation = rows.iloc[count:]
    position = rows.index[rows["target_month"].eq(target_month)][0]
    point = float(pred[position])
    if not np.isfinite(pred).all():
        raise ValueError("Non-finite predictions.")
    interval = None
    if target == "low_moisture":
        if not np.all((0 <= pred) & (pred <= 1)):
            raise ValueError("Probabilities must be between zero and one.")
        metrics = classification_metrics(evaluation, y[count:], pred[count:],
                                         baseline["persistence"][count:], baseline["seasonal_climatology"][count:])
        calibration_metrics = classification_metrics(rows.iloc[:count], y[:count], pred[:count])
    else:
        radius = uncertainty(pred[:count] - y[:count])
        interval = {"level": 0.9, "lower": point - radius, "upper": point + radius,
                    "method": "Chronological split residual quantile; nominal coverage only"}
        metrics = regression_metrics(evaluation, y[count:], pred[count:], baseline["persistence"][count:])
        metrics["empirical_coverage"] = float(np.mean(np.abs(pred[count:] - y[count:]) <= radius))
        metrics["interval_width_mm"] = 2 * radius
        calibration_metrics = {"absolute_residual_radius_mm": radius}
    used = available_rows(panel, issue).tail(n_lags)
    latest = used.iloc[-1]
    return {"schema_version": "forecast_v1", "status": "retrospective_simulation",
            "issue_time": iso_utc(issue), "target_month": target_month.strftime("%Y-%m"),
            "target_period": {"start": target_month.strftime("%Y-%m-01"),
                              "end_exclusive": (target_month + pd.offsets.MonthBegin(1)).strftime("%Y-%m-%d")},
            "horizon_months": horizon, "scope": {"id": str(latest["cell_id"]),
            "bounds_west_south_east_north": [-64, -38, -57, -30]}, "target": target,
            "model": {"name": model_name, "version": "phase6-research-v1",
                      "phase5b_selected_model": SELECTED_MODEL, "hmm": diagnostic},
            "input_observation_cutoff": iso_utc(latest["observation_end"]),
            "latest_available_observation_month": latest["month"].strftime("%Y-%m"),
            "availability": {"policy": "assumed_archive_lag", "release_lag_months": release_lag,
                             "publication_evidence": None, "operationally_eligible": False,
                             "input_months": [{"month": r["month"].strftime("%Y-%m"),
                                 "observation_start": iso_utc(r["observation_start"]),
                                 "observation_end": iso_utc(r["observation_end"]),
                                 "provider_publication_at": None, "available_at": iso_utc(r["available_at"]),
                                 "availability_is_assumed": True,
                                 "soil_sha256": r["soil_sha256"], "driver_sha256": r["driver_sha256"]}
                                 for _, r in used.iterrows()]},
            "value": point, "units": "probability" if interval is None else "mm", "predictive_interval": interval,
            "training": {"first_target": train["target_month"].min().strftime("%Y-%m"),
                         "last_target": train["target_month"].max().strftime("%Y-%m"),
                         "label_cutoff": iso_utc(issue_month(CALIBRATION, horizon))},
            "calibration": {"start": cal.min().strftime("%Y-%m"), "end": cal.max().strftime("%Y-%m"),
                            "labels_available_by": iso_utc(issue_month(HOLDOUT, horizon)),
                            "n_months": count, "metrics": calibration_metrics,
                            "probability_recalibrated": False},
            "out_of_sample": {"period": ["2024-01", "2025-12"], "metrics": metrics},
            "quality_flags": ["archived_final_product", "publication_unverified", "no_prospective_calibration",
                              "temporal_dependence_limits_interval_guarantees",
                              *(["experimental_model_override"] if model_name != SELECTED_MODEL else [])]}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True, type=Path)
    p.add_argument("--issue-time", required=True, type=instant)
    p.add_argument("--horizon", required=True, choices=HORIZONS, type=int)
    p.add_argument("--target", required=True, choices=TARGETS)
    p.add_argument("--output", required=True, type=Path)
    p.add_argument("--model", choices=REGISTRY, default=SELECTED_MODEL)
    p.add_argument("--release-lag", type=int, default=5)
    p.add_argument("--mode", choices=("retrospective", "operational"), required=True)
    p.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    args = p.parse_args()
    try:
        if args.mode == "operational":
            require_operational(args.issue_time, load_registry(args.registry))
        result = retrospective(read_parquet(args.input), args.issue_time, horizon=args.horizon,
                               target=args.target, model_name=args.model, release_lag=args.release_lag)
        result["source"] = {"collection": "C1342986036-GES_DISC", "doi": "10.5067/SXAVCZFAQLNO",
                            "input_panel_sha256": checksum(args.input)}
        payload = json.dumps(result, allow_nan=False, indent=2)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as file:
            file.write(payload + "\n")
        print(f"Retrospective simulation written to {args.output}.")
    except (ValueError, OSError, KeyError) as error:
        p.exit(2, f"Forecast withheld: {error}\n")


if __name__ == "__main__":
    main()
