"""Area-weighted forecast scores and month-block uncertainty summaries."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import expit
from sklearn.metrics import log_loss


def month_block_scores(frame, errors, *, block_months=12, draws=1000, seed=1729):
    """Area-weighted loss for the observed sample and each joint month resample."""
    codes, months = pd.factorize(frame["target_month"], sort=True)
    weights = frame["area_weight"].to_numpy(dtype=float)
    per_month = np.bincount(codes, weights=weights)
    losses = np.column_stack([np.bincount(codes, weights=weights * error) for error in errors])
    if len(months) < 2:
        return losses.sum(axis=0) / per_month.sum(), None
    rng = np.random.default_rng(seed)
    shape = (draws, int(np.ceil(len(months) / block_months)), 1)
    starts = rng.integers(0, len(months), size=shape)
    sampled = ((starts + np.arange(block_months)) % len(months)).reshape(draws, -1)[:, :len(months)]
    return losses.sum(axis=0) / per_month.sum(), (
        losses[sampled].sum(axis=1) / per_month[sampled].sum(axis=1)[:, None])


def _block_differences(frame: pd.DataFrame, values: np.ndarray, *, seed: int = 1729) -> list[float]:
    observed, draws = month_block_scores(frame, [values], seed=seed)
    return draws[:, 0].tolist() if draws is not None else [float(observed[0])]


def _paired_rmse_interval(frame: pd.DataFrame, actual: np.ndarray, predicted: np.ndarray,
                          baseline: np.ndarray, *, seed: int = 1729) -> list[float | None]:
    _, draws = month_block_scores(frame, [(predicted - actual) ** 2, (baseline - actual) ** 2], seed=seed)
    if draws is None:
        return [None, None]
    return np.quantile(np.sqrt(draws[:, 0]) - np.sqrt(draws[:, 1]), [0.025, 0.975]).tolist()


def regression_metrics(frame: pd.DataFrame, actual: np.ndarray, predicted: np.ndarray,
                       persistence: np.ndarray, *, seed: int = 1729) -> dict:
    weights = frame["area_weight"].to_numpy(dtype=float)
    weights = weights / weights.sum()
    error = predicted - actual
    persistence_error = persistence - actual
    rmse = float(np.sqrt(np.sum(weights * error**2)))
    mae = float(np.sum(weights * np.abs(error)))
    baseline_rmse = float(np.sqrt(np.sum(weights * persistence_error**2)))
    rmse_delta = rmse - baseline_rmse
    delta_interval = _paired_rmse_interval(frame, actual, predicted, persistence, seed=seed)
    return {
        "n_rows": int(len(frame)), "n_months": int(frame["target_month"].nunique()),
        "rmse": rmse, "mae": mae, "bias": float(np.sum(weights * error)),
        "skill_vs_persistence": float(1 - rmse / baseline_rmse) if baseline_rmse else None,
        "rmse_difference_vs_persistence": rmse_delta,
        "rmse_difference_vs_persistence_95_block_interval": delta_interval,
    }


def classification_metrics(frame: pd.DataFrame, actual: np.ndarray, probability: np.ndarray,
                           persistence: np.ndarray | None = None,
                           climatology: np.ndarray | None = None, *, seed: int = 1729) -> dict:
    y = np.asarray(actual, dtype=int)
    p = np.clip(np.asarray(probability, dtype=float), 1e-6, 1 - 1e-6)
    weights = frame["area_weight"].to_numpy(dtype=float)
    weights = weights / weights.sum()
    brier = float(np.sum(weights * (p - y) ** 2))
    prevalence = float(np.sum(weights * y))
    climate = (np.full(len(y), prevalence) if climatology is None
               else np.clip(np.asarray(climatology, dtype=float), 1e-6, 1 - 1e-6))
    climatology_brier = float(np.sum(weights * (climate - y) ** 2))
    calibration_error = float(abs(np.sum(weights * p) - prevalence))
    ece = 0.0
    # Ten equal-width bins are descriptive; they do not imply probability reliability.
    bins = []
    for left in np.linspace(0, 1, 11)[:-1]:
        right = left + 0.1
        mask = (p >= left) & ((p < right) if right < 1 else (p <= right))
        if mask.any():
            bin_probability = float(np.average(p[mask], weights=weights[mask]))
            bin_rate = float(np.average(y[mask], weights=weights[mask]))
            bin_weight = float(weights[mask].sum())
            ece += bin_weight * abs(bin_probability - bin_rate)
            bins.append({"lower": float(left), "upper": float(right),
                         "mean_probability": bin_probability,
                         "event_rate": bin_rate,
                         "n": int(mask.sum())})
    brier_diff = (p - y) ** 2 - (climate - y) ** 2
    bootstrap = _block_differences(frame, brier_diff, seed=seed)
    interval = [float(np.quantile(bootstrap, q)) for q in (0.025, 0.975)] if bootstrap else [None, None]
    persistence_brier = None
    persistence_skill = None
    persistence_interval = [None, None]
    if persistence is not None:
        baseline = np.clip(np.asarray(persistence, dtype=float), 1e-6, 1 - 1e-6)
        persistence_brier = float(np.sum(weights * (baseline - y) ** 2))
        persistence_skill = float(1 - brier / persistence_brier) if persistence_brier else None
        paired = (p - y) ** 2 - (baseline - y) ** 2
        paired_draws = _block_differences(frame, paired, seed=seed)
        persistence_interval = ([float(np.quantile(paired_draws, q)) for q in (0.025, 0.975)]
                                if paired_draws else [None, None])
    calibration_fit = {"intercept": None, "slope": None}
    if np.unique(y).size > 1:
        logit_probability = np.log(p / (1 - p))
        def calibration_loss(parameters):
            fitted = expit(parameters[0] + parameters[1] * logit_probability)
            return float(-np.sum(weights * (y * np.log(fitted + 1e-12)
                                            + (1 - y) * np.log(1 - fitted + 1e-12))))
        fitted = minimize(calibration_loss, np.array([0.0, 1.0]), method="BFGS")
        if fitted.success and np.isfinite(fitted.x).all():
            calibration_fit = {"intercept": float(fitted.x[0]), "slope": float(fitted.x[1])}
    return {
        "n_rows": int(len(frame)), "n_months": int(frame["target_month"].nunique()),
        "brier": brier, "log_loss": float(log_loss(y, p, sample_weight=weights, labels=[0, 1])),
        "skill_vs_climatology": float(1 - brier / climatology_brier) if climatology_brier else None,
        "brier_vs_persistence": persistence_brier,
        "skill_vs_persistence": persistence_skill,
        "brier_difference_vs_persistence_95_block_interval": persistence_interval,
        "brier_difference_vs_climatology": float(brier - climatology_brier),
        "calibration_in_the_large_abs_error": calibration_error,
        "expected_calibration_error_10_bins": float(ece),
        "calibration_intercept_and_slope": calibration_fit,
        "calibration_bins": bins,
        "brier_difference_vs_climatology_95_block_interval": interval,
    }
