"""Pre-registered native SMAP 14/28-day benchmark with an isolated final holdout."""
import argparse
from datetime import timedelta
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .acquisition import checksum
from .predictive.metrics import month_block_scores
from .smap_appeears import DESIGN
from .smap_sites import load_design
from .water_evaluation import HORIZONS, aligned, references

MODELS = ("persistence", "seasonal_climatology", "ridge", "xgboost")
TARGETS = ("moisture_change", "target_moisture", "below_normal", "dry_onset")
MIN_SITES = 12


def split_masks(issues, release, design):
    val, cal, hold, last = (pd.Timestamp(design[key]) for key in
                           ("validation_start", "calibration_start", "holdout_start", "holdout_end"))
    first = pd.Timestamp(design["reference_end"]) + timedelta(days=design["retrospective_lag_days"] + 1)
    return ((issues >= first) & (issues < val) & (release <= val),
            (issues >= val) & (issues < cal) & (release <= cal),
            (issues >= cal) & (issues < hold) & (release <= hold),
            (issues >= hold) & (issues <= last))


def site_data(days, values, design, horizon):
    ref = (days >= design["reference_start"]) & (days <= design["reference_end"])
    center, threshold, freq = references(values[ref], days[ref])
    (x, change, dry, climate_change, climate_prob, persistence_dry, issues, release,
     level, climate_level, onset, persistence_onset, target_month) = aligned(
        days, values, center, threshold, freq, horizon, design["retrospective_lag_days"])
    fit, val, cal, hold = split_masks(issues, release, design)
    y = np.column_stack((change, level, dry, onset)).astype(float)
    if not (fit.sum() >= 365 and val.sum() >= 112 and cal.sum() >= 112):
        return None
    counts = y[fit, 2:].sum(axis=0)
    if np.any(np.minimum(counts, fit.sum() - counts) < 20):
        return None
    onset_freq = pd.Series(onset[fit], index=target_month[fit]).groupby(level=0).mean()
    onset_climate = np.array([onset_freq.get(m, onset[fit].mean()) for m in target_month])
    persistence = np.column_stack((np.zeros(len(issues)), x[:, 0], persistence_dry, persistence_onset))
    climate = np.column_stack((climate_change, climate_level, climate_prob, onset_climate))
    xgb_eligible = bool(fit.sum() >= 550 and np.all(np.minimum(counts, fit.sum() - counts) >= 45))
    return {"x": x, "y": y, "issues": issues, "split": (fit, val, cal, hold),
            "persistence": persistence, "seasonal_climatology": climate, "xgb_eligible": xgb_eligible}


def fit_predictions(data, challenger):
    x, y = data["x"], data["y"]
    fit, _, _, _ = data["split"]
    result = {model: data[model] for model in MODELS[:2]}
    result["ridge"] = np.column_stack([
        make_pipeline(StandardScaler(), Ridge(alpha=10)).fit(x[fit], y[fit, j]).predict(x) if j < 2
        else make_pipeline(StandardScaler(), LogisticRegression(C=.1)).fit(x[fit], y[fit, j]).predict_proba(x)[:, 1]
        for j in range(4)
    ])
    if challenger:
        from xgboost import XGBClassifier, XGBRegressor
        options = dict(n_estimators=60, max_depth=2, learning_rate=.03, min_child_weight=8,
                       reg_lambda=5, n_jobs=1, random_state=1729)
        result["xgboost"] = np.column_stack([
            XGBRegressor(**options).fit(x[fit], y[fit, j]).predict(x) if j < 2
            else XGBClassifier(**options).fit(x[fit], y[fit, j]).predict_proba(x)[:, 1]
            for j in range(4)
        ])
    return result


def calibrate_event(y, raw, prediction):
    if np.count_nonzero(y == 1) < 20 or np.count_nonzero(y == 0) < 20:
        return prediction, "raw_probability"
    transform = lambda v: np.log(np.clip(v, 1e-6, 1 - 1e-6) / (1 - np.clip(v, 1e-6, 1 - 1e-6)))[:, None]
    fitted = LogisticRegression(C=1).fit(transform(raw), y)
    return fitted.predict_proba(transform(prediction))[:, 1], "platt_preholdout"


def measure(frame, event, draws=0):
    y = frame["actual"].to_numpy()
    p = frame["prediction"].to_numpy()
    losses = [(p - y)**2] + [(frame[m].to_numpy() - y)**2 for m in MODELS[:2]]
    metric = (lambda v: v) if event else np.sqrt
    values = [float(metric(np.mean(loss))) for loss in losses]
    intervals = [None, None]
    if draws:
        timed = pd.DataFrame({"target_month": frame["issue"], "area_weight": 1.})
        _, sample = month_block_scores(timed, losses, block_months=28, draws=draws, seed=1729)
        if sample is not None:
            intervals = [np.quantile(metric(sample[:, 0]) - metric(sample[:, j]), [.025, .975]).tolist()
                         for j in (1, 2)]
    result = {"target_observations": len(frame), "locations": int(frame["site"].nunique()),
              "skill_vs_persistence": 1 - values[0] / values[1] if values[1] else None,
              "skill_vs_climatology": 1 - values[0] / values[2] if values[2] else None,
              "paired_interval_vs_persistence": intervals[0], "paired_interval_vs_climatology": intervals[1]}
    if event:
        bins = np.minimum((p * 10).astype(int), 9)
        result.update({"brier": values[0], "probability_bias": float(np.mean(p - y)), "reliability": [
            {"bin": int(k), "count": int((bins == k).sum()), "predicted": float(p[bins == k].mean()),
             "observed": float(y[bins == k].mean())} for k in np.unique(bins)]})
    else:
        result.update({"rmse": values[0], "mae": float(np.mean(np.abs(p - y))), "bias": float(np.mean(p - y)),
                       "interval_coverage": float(np.mean(np.abs(p - y) <= frame.band)),
                       "interval_width": float(2 * frame.band.mean())})
    return result


def report_target(rows, target, horizon):
    event = target >= 2
    pre = {}
    for model in rows[0]["predictions"]:
        errors = [r["predictions"][model][r["split"][1], target] - r["y"][r["split"][1], target] for r in rows]
        mean_square = float(np.mean(np.concatenate(errors)**2))
        pre[model] = mean_square if event else float(np.sqrt(mean_square))
    selected = min(pre, key=pre.get)
    models = {}
    for model in pre:
        frames = []
        for row in rows:
            _, _, cal, test = row["split"]
            if test.sum() < 112:
                continue
            truth = row["y"][:, target]
            raw = row["predictions"][model][:, target]
            if event:
                predicted, method = calibrate_event(truth[cal], raw[cal], raw[test])
                band = np.nan
            else:
                predicted, method = raw[test], "empirical_residual_90"
                band = np.quantile(np.abs(raw[cal] - truth[cal]), .9, method="higher")
            issue = row["issues"][test]
            month = (issue + pd.Timedelta(days=horizon - 1)).month
            frames.append(pd.DataFrame({"issue": issue, "season": np.array(["DJF", "MAM", "JJA", "SON"])[month % 12 // 3],
                                        "site": row["site"]["id"], "region": row["site"]["region"],
                                        "actual": truth[test], "prediction": predicted, "band": band, "method": method}))
        models[model] = pd.concat(frames, ignore_index=True)
    result = {}
    for model, frame in models.items():
        for baseline in MODELS[:2]:
            frame[baseline] = models[baseline]["prediction"]
        result[model] = {**measure(frame, event, draws=1000),
                         "calibration_methods": frame["method"].value_counts().to_dict(),
                         **{f"by_{name}": {str(k): measure(v, event) for k, v in frame.groupby(name)}
                            for name in ("season", "region", "site")}}
    return {"selected_on_validation": selected, "validation_metric": "brier" if event else "rmse",
            "validation_scores": pre, "holdout_models": result}


def evaluate_sites(days, panel, design):
    results = {}
    for h in HORIZONS:
        eligible = []
        for i, site in enumerate(design["sites"]):
            row = site_data(days, panel[:, i], design, h)
            if row is not None:
                eligible.append({**row, "site": site})
        holdout_locations = sum(row["split"][3].sum() >= 112 for row in eligible)
        if len(eligible) < MIN_SITES or holdout_locations < MIN_SITES:
            results[str(h)] = {"status": "insufficient_history", "eligible_locations": len(eligible),
                               "holdout_locations": int(holdout_locations),
                               "minimum_locations": MIN_SITES, "holdout_models": {}}
            continue
        challenger = all(row["xgb_eligible"] for row in eligible)
        for row in eligible:
            row["predictions"] = fit_predictions(row, challenger)
        results[str(h)] = {"status": "scored", "locations": int(holdout_locations), "xgboost_included": challenger,
                           "targets": {target: report_target(eligible, i, h) for i, target in enumerate(TARGETS)}}
    return results


def observation_coverage(days, values, design):
    reference_end = pd.Timestamp(design["reference_end"])
    validation, calibration, holdout, last = (pd.Timestamp(design[key]) for key in
        ("validation_start", "calibration_start", "holdout_start", "holdout_end"))
    available = np.isfinite(values)
    windows = {
        "reference": (days >= design["reference_start"]) & (days <= reference_end),
        "fit": (days > reference_end) & (days < validation),
        "validation": (days >= validation) & (days < calibration),
        "calibration": (days >= calibration) & (days < holdout),
        "holdout": (days >= holdout) & (days <= last),
    }
    return {name: {"observed_days": int(available[mask].any(axis=1).sum()),
                   "site_days": int(available[mask].sum())} for name, mask in windows.items()}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--panel", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    design = load_design()
    record = json.loads(a.panel.with_suffix(".json").read_text(encoding="utf-8"))
    if (record["schema"] != "smap_phase11_site_panel_v1" or record["source"] != design["collection"]
            or record["version"] != "008" or record["units"] != design["units"]
            or record["panel_sha256"] != checksum(a.panel) or record["design_sha256"] != checksum(DESIGN)):
        p.error("Panel provenance or checksum failed.")
    with np.load(a.panel, allow_pickle=False) as d:
        days, values = pd.DatetimeIndex(d["days"]), d["moisture"]
        if d["site_ids"].tolist() != [s["id"] for s in design["sites"]]:
            p.error("Panel coordinates differ from the preregistration.")
    if (values.shape != (len(days), len(design["sites"])) or not len(days) or
            not days.equals(pd.date_range(days[0], days[-1])) or np.isinf(values).any() or
            np.any((values[np.isfinite(values)] < 0) | (values[np.isfinite(values)] > .9))):
        p.error("Panel time axis or values are invalid.")
    results = evaluate_sites(days, values, design)
    report = {"status": "retrospective_research", "units": design["units"],
              "availability_assumption_days": design["retrospective_lag_days"],
              "panel_sha256": record["panel_sha256"], "verified_site_days": record["valid_site_days"],
              "observation_days_by_window": observation_coverage(days, values, design),
              "horizons_days": results, "prospective_issuance": "disabled"}
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2, allow_nan=False)
    print({h: value["status"] for h, value in results.items()})


if __name__ == "__main__":
    main()
