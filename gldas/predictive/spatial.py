"""Full-grid archival climatology hindcasts on the validated GLDAS panel."""
from __future__ import annotations

import argparse
from itertools import product
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ..acquisition import checksum
from .agricultural import moisture_indicators
from .contract import read_parquet
from .evaluation import _baseline_predictions, _target_values
from .forecast import CALIBRATION, HOLDOUT, available_rows, instant, issue_month
from .features import make_supervised
from .metrics import classification_metrics, regression_metrics

HORIZONS = (1, 2, 3)
TARGETS = ("storage", "anomaly", "low_moisture")
LAG = 5
LEVEL = 0.90


def weighted_radius(residuals, weights):
    errors = np.abs(np.asarray(residuals, dtype=float))
    weights = np.asarray(weights, dtype=float)
    if not len(errors) or not np.isfinite(errors).all() or not np.isfinite(weights).all() or np.any(weights <= 0):
        raise ValueError("Calibration requires finite residuals and positive area weights.")
    order = np.argsort(errors, kind="stable")
    cdf = np.cumsum(weights[order]) / weights.sum()
    return float(errors[order[np.searchsorted(cdf, LEVEL)]])


def training_norms(train):
    month = train["target_month"].dt.month.rename("calendar_month")
    return train.groupby(["cell_id", month])["target_soil_water_mm"].mean()


def context(panel, train, issue):
    visible = available_rows(panel, issue)
    if visible.empty:
        raise ValueError("No released observation at issue time.")
    recent = visible["month"].drop_duplicates().nlargest(12)
    if len(recent) != 12:
        raise ValueError("At least twelve archived months are needed for the indicator window.")
    latest = recent.iloc[0]
    normals = training_norms(train)
    evidence = visible.loc[visible["month"].eq(latest)].iloc[0]
    for key in ("soil_sha256", "driver_sha256", "soil_granule_id", "driver_granule_id", "observation_end", "available_at"):
        if visible.loc[visible["month"].eq(latest), key].nunique(dropna=False) != 1:
            raise ValueError(f"Inconsistent latest-month provenance: {key}.")
    indicators = {}
    for cell, group in visible.loc[visible["month"].isin(recent)].groupby("cell_id"):
        ordered = group.sort_values("month", ascending=False)
        history = []
        for row in ordered.itertuples(index=False):
            normal = normals.get((cell, row.month.month))
            delta = float(row.soil_water_mm - normal) if row.soil_water_valid and normal is not None else None
            history.append((row.month.year * 12 + row.month.month, delta))
        indicators[cell] = moisture_indicators(history)
    last = visible.loc[visible["month"].eq(latest)].set_index("cell_id")
    valid = last["soil_water_valid"] & last.index.isin(normals.index.get_level_values(0))
    values = [(indicators[key]["anomaly_mm"], last.loc[key, "area_weight"]) for key in last.index if valid[key]]
    values = [(v, w) for v, w in values if v is not None]
    if not values:
        raise ValueError("No valid observations for this issue.")
    vals, weights = zip(*values, strict=True)
    return (latest, last, valid, indicators, float(np.average(vals, weights=weights)), evidence)


def build_hindcasts(panel, issue, digest, horizons=HORIZONS, targets=TARGETS):
    if (not panel["source_doi"].eq("10.5067/SXAVCZFAQLNO").all()
            or not panel["availability_policy"].eq("assumed_release_lag_5_calendar_months").all()
            or not panel["available_at"].eq(panel["month"] + pd.DateOffset(months=LAG)).all()):
        raise ValueError("Expected validated GLDAS archived final data with the Phase 5A release policy.")
    if issue != issue_month(issue.normalize().replace(day=1) + pd.DateOffset(months=1), 1):
        raise ValueError("Use the final UTC nanosecond of an issue month.")
    results = []
    for horizon in horizons:
        train_cutoff = issue_month(CALIBRATION, horizon)
        calibration_cutoff = issue_month(HOLDOUT, horizon)
        target_month = issue.normalize().replace(day=1) + pd.DateOffset(months=horizon)
        features, _ = make_supervised(panel, horizon=horizon, n_lags=1)
        train = features.loc[features["target_available_at"].le(train_cutoff)]
        cal = features.loc[features["target_month"].ge(CALIBRATION)
                           & features["target_month"].lt(HOLDOUT)
                           & features["target_available_at"].le(calibration_cutoff)]
        test = features.loc[features["target_month"].ge(HOLDOUT)
                            & features["target_month"].lt(pd.Timestamp("2026-01-01", tz="UTC"))]
        if (train["target_month"].nunique() < 24 or cal["target_month"].nunique() < 12
                or test["target_month"].nunique() != 24 or
                target_month not in set(test["target_month"])):
            raise ValueError("Incomplete chronological training, calibration or reserved holdout windows.")
        if not train["target_month"].max() < cal["target_month"].min() < test["target_month"].min():
            raise ValueError("Training, calibration and holdout must be disjoint.")
        tests = pd.concat([cal, test], ignore_index=True)
        latest, grid, valid, indicators, regional, obs = context(panel, train, issue)
        active = grid.loc[valid].reset_index()
        current = active[["cell_id", "area_weight"]].assign(target_month=target_month,
                    soil_water_mm_lag_0=active["soil_water_mm"],
                    soil_water_source_month_lag_0=latest.month)
        for target in targets:
            y_train, truth, definitions = _target_values(train, tests, target)
            baselines = _baseline_predictions(train, tests, target, y_train, definitions)
            points = _baseline_predictions(train, current, target, y_train, definitions)["seasonal_climatology"]
            predicted = baselines["seasonal_climatology"]
            cutoff = len(cal)
            if target == "low_moisture":
                if not np.all((0 <= points) & (points <= 1)):
                    raise ValueError("Invalid event probability.")
                metrics = classification_metrics(test, truth[cutoff:], predicted[cutoff:],
                                                baselines["persistence"][cutoff:], predicted[cutoff:])
                radius = None
                uncertainty = {"kind": "raw_probability", "calibrated": False}
            else:
                radius = weighted_radius(predicted[:cutoff] - truth[:cutoff], cal["area_weight"])
                metrics = regression_metrics(test, truth[cutoff:], predicted[cutoff:],
                                             baselines["persistence"][cutoff:])
                metrics["area_weighted_coverage"] = float(np.average(
                    np.abs(predicted[cutoff:] - truth[cutoff:]) <= radius, weights=test["area_weight"]))
                metrics["interval_width_mm"] = 2 * radius
                uncertainty = {"kind": "pooled_spatial_residual_interval", "nominal_level": LEVEL,
                               "radius_mm": radius, "per_cell_guarantee": False}
            by_cell = dict(zip(current["cell_id"], points, strict=True))
            cells = []
            for cell, row in grid.iterrows():
                point = float(by_cell[cell]) if cell in by_cell else None
                interval = [point - radius, point + radius] if point is not None and radius is not None else None
                cells.append({"cell_id": cell, "latitude": float(row["latitude"]),
                              "longitude": float(row["longitude"]), "area_m2": float(row["area_weight"]),
                              "valid": point is not None, "value": point, "interval": interval,
                              "indicators": indicators[cell]})
            results.append({"horizon_months": horizon, "target": target, "target_month": target_month.strftime("%Y-%m"),
                            "units": "probability" if target == "low_moisture" else "mm",
                            "last_observation_month": latest.strftime("%Y-%m"),
                            "observed_region_anomaly_mm": regional,
                            "availability": {"assumed": True, "available_at": obs["available_at"].isoformat(),
                                "observation_end": obs["observation_end"].isoformat(),
                                "provider_publication_at": None,
                                "soil_granule_id": obs["soil_granule_id"], "driver_granule_id": obs["driver_granule_id"],
                                "soil_sha256": obs["soil_sha256"], "driver_sha256": obs["driver_sha256"]},
                            "calibration": {"train_cutoff": train_cutoff.isoformat(),
                                "labels_available_by": calibration_cutoff.isoformat(),
                                "months": int(cal["target_month"].nunique()), "rows": len(cal), **uncertainty},
                            "holdout": {"start": "2024-01", "end": "2025-12", "metrics": metrics},
                            "cells": cells})
    return {"schema_version": "spatial_hindcast_v1", "status": "retrospective_simulation",
            "operationally_eligible": False, "issue_time": issue.isoformat(),
            "source": {"product": "GLDAS Noah v2.1 monthly", "doi": "10.5067/SXAVCZFAQLNO",
                       "parquet_sha256": digest, "grid_count": int(panel["cell_id"].nunique()),
                       "release_lag_months": LAG},
            "model": {"id": "seasonal_climatology", "version": "spatial-research-v1"},
            "limitations": ["Archived final GLDAS; publication times unknown and five-month lag assumed",
                            "Pooled marginal calibration over area, with dependent months and cells",
                            "Generic soil-water indicators; crop-specific thresholds and recommendations pending"],
            "results": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--issue-time", type=instant, required=True)
    parser.add_argument("--pilot-cells", type=int, choices=range(2, 65))
    args = parser.parse_args()
    try:
        panel = read_parquet(args.input)
        if args.pilot_cells:
            valid_cells = sorted(panel.loc[panel["soil_water_valid"], "cell_id"].unique())
            panel = panel.loc[panel["cell_id"].isin(valid_cells[:args.pilot_cells])]
        payload = build_hindcasts(panel, args.issue_time, checksum(args.input))
        payload["source"]["pilot_subset"] = args.pilot_cells is not None
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(json.dumps(payload, separators=(",", ":"), allow_nan=False) + "\n")
        print(f"Wrote {len(payload['results'])} comparisons on {payload['source']['grid_count']} cells.")
    except (OSError, ValueError, KeyError) as error:
        parser.exit(2, f"Spatial hindcast withheld: {error}\n")


if __name__ == "__main__":
    main()
