"""Evaluate cell-level 14/28-day GLDAS storage changes without future inputs."""
from datetime import timedelta

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .predictive.metrics import month_block_scores

HORIZONS = (14, 28)
MODELS = ("persistence", "seasonal_climatology", "ridge")
FEATURE_LAGS = (0, 7, 14, 28)
BLOCK_DAYS = 28
MIN_HOLDOUT_DAYS = 4 * BLOCK_DAYS


def references(storage, days):
    """Frozen per-cell, calendar-month median and 20th-percentile storage."""
    center, threshold, frequency = (np.full(12, np.nan) for _ in range(3))
    for month in range(1, 13):
        sample = days.month == month
        valid = sample & np.isfinite(storage)
        if valid.sum() >= 60 and len(set(days.year[valid])) >= 3:
            center[month - 1], threshold[month - 1] = np.quantile(storage[valid], [.5, .2])
            frequency[month - 1] = np.mean(storage[valid] < threshold[month - 1])
    return center, threshold, frequency


def aligned(days, values, center, threshold, frequency, horizon, lag):
    # Row i is issued at midnight after reference day i. Targets are complete daily means.
    i = np.arange(lag + max(FEATURE_LAGS), len(days) - horizon)
    target = i + horizon
    cutoff = i + 1
    last = i - lag
    feature = np.column_stack([values[last - offset] for offset in FEATURE_LAGS])
    prev_month, target_month = days.month[i] - 1, days.month[target] - 1
    x = np.column_stack((feature, np.sin(2 * np.pi * target_month / 12), np.cos(2 * np.pi * target_month / 12)))
    y = values[target] - values[i]
    dry_limit = threshold[target_month]
    climate_change = center[target_month] - center[prev_month]
    good = np.isfinite(x).all(axis=1) & np.isfinite(y) & np.isfinite(climate_change) & np.isfinite(dry_limit)
    return (x[good], y[good], (values[target] < dry_limit)[good], climate_change[good],
            frequency[target_month[good]], (feature[:, 0] < dry_limit)[good],
            days[cutoff[good]], days[target[good]] + pd.Timedelta(days=1 + lag))


def cell_results(days, values, horizon, lag, reference_start, reference_end, calibration_start, holdout_start, *, training_reference_cutoff):
    ref = (days >= reference_start) & (days <= reference_end)
    center, threshold, frequency = references(values[ref], days[ref])
    x, y, events, climate, climate_event, persistence_event, issues, label_release = aligned(
        days, values, center, threshold, frequency, horizon, lag)
    train = (issues >= training_reference_cutoff) & (issues < calibration_start) & (label_release <= calibration_start)
    calibrate = (issues >= calibration_start) & (issues < holdout_start) & (label_release <= holdout_start)
    test = issues >= holdout_start
    if (train.sum() < 365 or calibrate.sum() < 56 or test.sum() < MIN_HOLDOUT_DAYS
            or len(np.unique(events[train])) != 2):
        return None
    ridge = make_pipeline(StandardScaler(), Ridge(alpha=10)).fit(x[train], y[train])
    event_model = make_pipeline(StandardScaler(), LogisticRegression(C=.1)).fit(x[train], events[train])
    # Freeze all models before calibration and the final holdout. Keep the model set fixed.
    return {
        "issues": issues[test],
        "actual": y[test], "event": events[test].astype(float),
        "predictions": np.column_stack((np.zeros(test.sum()), climate[test], ridge.predict(x[test]))),
        "probabilities": np.column_stack((persistence_event[test], climate_event[test],
                                         event_model.predict_proba(x[test])[:, 1])),
        "calibration_errors": np.column_stack((np.abs(y[calibrate]), np.abs(y[calibrate] - climate[calibrate]),
                                               np.abs(y[calibrate] - ridge.predict(x[calibrate])))),
        "training_count": int(train.sum()),
    }


def summarize(results):
    errors = np.concatenate([r["predictions"] - r["actual"][:, None] for r in results])
    actual_event = np.concatenate([r["event"] for r in results])
    probability = np.concatenate([r["probabilities"] for r in results])
    squared, brier = errors**2, (probability - actual_event[:, None])**2
    issue_days = np.concatenate([r["issues"] for r in results])
    areas = np.concatenate([np.full(len(r["issues"]), r["area"]) for r in results])
    # The existing block engine groups by its time key. Here each key is an issue day.
    frame = pd.DataFrame({"target_month": issue_days, "area_weight": areas})
    _, rmse_draws = month_block_scores(frame, list(squared.T), block_months=BLOCK_DAYS)
    _, brier_draws = month_block_scores(frame, list(brier.T), block_months=BLOCK_DAYS)
    coverage = np.concatenate([
        np.abs(r["predictions"] - r["actual"][:, None])
        <= np.quantile(r["calibration_errors"], .9, axis=0, method="higher") for r in results
    ])
    base_rmse = np.sqrt(np.average(squared, axis=0, weights=areas))
    brier_scores = np.average(brier, axis=0, weights=areas)
    model_scores = {}
    for model_index, model in enumerate(MODELS):
        p = probability[:, model_index]
        bins = []
        for lo in range(10):
            selected = np.minimum((p * 10).astype(int), 9) == lo
            if selected.any():
                bins.append({"bin": lo, "n": int(selected.sum()),
                             "mean_probability": float(np.average(p[selected], weights=areas[selected])),
                             "observed_rate": float(np.average(actual_event[selected], weights=areas[selected]))})
        model_scores[model] = {
            "mae_mm": float(np.average(np.abs(errors[:, model_index]), weights=areas)),
            "rmse_mm": float(base_rmse[model_index]),
            "bias_mm": float(np.average(errors[:, model_index], weights=areas)),
            "rmse_skill": {MODELS[j]: float(1 - base_rmse[model_index] / base_rmse[j]) if base_rmse[j] else None for j in (0, 1)},
            "rmse_delta_95_day_block_ci_mm": {
                MODELS[j]: np.quantile(np.sqrt(rmse_draws[:, model_index]) - np.sqrt(rmse_draws[:, j]), [.025, .975]).tolist() for j in (0, 1)},
            "brier": float(brier_scores[model_index]),
            "brier_skill": {MODELS[j]: float(1 - brier_scores[model_index] / brier_scores[j]) if brier_scores[j] else None for j in (0, 1)},
            "brier_delta_95_day_block_ci": {
                MODELS[j]: np.quantile(brier_draws[:, model_index] - brier_draws[:, j], [.025, .975]).tolist() for j in (0, 1)},
            "nominal_90_interval_holdout_coverage": float(np.average(coverage[:, model_index], weights=areas)),
            "calibration_bins": bins,
        }
    return {"cells": len(results), "cell_days": len(errors), "issue_days": len(np.unique(issue_days)),
            "cell_support": [{"row": r["row"], "column": r["column"], "training_days": r["training_count"],
                              "holdout_days": len(r["issues"])} for r in results],
            "models": model_scores}


def evaluate(grid, start, lag, reference_start, reference_end, calibration_start, holdout_start, latitudes):
    if lag < 0:
        raise ValueError("Retrospective lag must be a nonnegative integer.")
    dates = pd.date_range(start, periods=len(grid), freq="D")
    reference_start, reference_end, calibration_start, holdout_start = map(
        pd.Timestamp, (reference_start, reference_end, calibration_start, holdout_start))
    training_reference_cutoff = reference_end + timedelta(days=lag + 1)
    if not dates[0] <= reference_start <= reference_end or not training_reference_cutoff <= calibration_start < holdout_start:
        raise ValueError("The separate climatology must be fully available by calibration start.")
    # A partial panel cannot justify an evaluation or consume final holdout dates.
    required = ((reference_end - reference_start).days + 1 >= 365 * 3
                and (calibration_start - reference_end).days >= 365 + lag + max(HORIZONS)
                and (holdout_start - calibration_start).days >= 56 + lag + max(HORIZONS)
                and (dates[-1] - holdout_start).days >= MIN_HOLDOUT_DAYS + max(HORIZONS) - 2)
    # The reference climatology is a fitted transformation. Do not let it enter a
    # simulated training issue before the last reference day could have arrived.
    results = {}
    for horizon in HORIZONS:
        if not required:
            results[str(horizon)] = {"status": "insufficient_history", "models": {}}
            continue
        eligible = []
        for y, latitude in enumerate(latitudes):
            for x in range(grid.shape[2]):
                result = cell_results(dates, grid[:, y, x], horizon, lag, reference_start, reference_end,
                                      calibration_start, holdout_start, training_reference_cutoff=training_reference_cutoff)
                if result:
                    eligible.append({**result, "row": y, "column": x, "area": float(np.cos(np.deg2rad(latitude)))})
        results[str(horizon)] = ({"status": "scored", **summarize(eligible)} if eligible else
                                 {"status": "insufficient_complete_cells", "models": {}})
    return {"status": "retrospective_only", "assumed_availability_lag_days": lag,
            "reference_start": reference_start.date().isoformat(), "reference_end": reference_end.date().isoformat(),
            "calibration_start": calibration_start.date().isoformat(), "holdout_start": holdout_start.date().isoformat(),
            "horizons_days": results}
