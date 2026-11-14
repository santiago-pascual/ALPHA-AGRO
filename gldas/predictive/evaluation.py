"""Expanding-window and untouched-holdout forecasting with nested tuning."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Iterable
import hashlib
import json

import numpy as np
import pandas as pd

from .features import make_supervised
from .hmm import DiagonalGaussianHMM
from .metrics import classification_metrics, regression_metrics
from .models import candidate_specs, estimator, fit, predict

HMM_INPUTS = ("soil_water_mm_lag_0", "precipitation_mm_month_lag_0", "air_temperature_c_lag_0")


@dataclass(frozen=True)
class Fold:
    train_months: tuple[str, ...]
    test_months: tuple[str, ...]
    is_final_holdout: bool = False

    def as_dict(self):
        return asdict(self)


def expanding_folds(frame: pd.DataFrame, *, initial_train_months: int = 120,
                    test_window_months: int = 12, holdout_months: int = 24) -> tuple[list[Fold], Fold]:
    months = pd.DatetimeIndex(sorted(pd.to_datetime(frame["target_month"], utc=True).unique()))
    if len(months) <= initial_train_months + holdout_months:
        raise ValueError("Need more target months than initial training plus final holdout windows.")
    holdout_start = len(months) - holdout_months
    pre_holdout = months[:holdout_start]
    folds = []
    start = initial_train_months
    while start < holdout_start:
        end = min(start + test_window_months, holdout_start)
        folds.append(Fold(tuple(m.strftime("%Y-%m") for m in pre_holdout[:start]),
                          tuple(m.strftime("%Y-%m") for m in pre_holdout[start:end])))
        start = end
    final = Fold(tuple(m.strftime("%Y-%m") for m in months[:holdout_start]),
                 tuple(m.strftime("%Y-%m") for m in months[holdout_start:]), True)
    return folds, final


def _target_values(train: pd.DataFrame, test: pd.DataFrame, target: str):
    train_raw = train["target_soil_water_mm"].to_numpy(dtype=float)
    test_raw = test["target_soil_water_mm"].to_numpy(dtype=float)
    train_moy = pd.to_datetime(train["target_month"], utc=True).dt.month.to_numpy()
    test_moy = pd.to_datetime(test["target_month"], utc=True).dt.month.to_numpy()
    train_cells = train["cell_id"].astype(str).to_numpy()
    test_cells = test["cell_id"].astype(str).to_numpy()
    train_weights = train["area_weight"].to_numpy(dtype=float)

    def weighted_quantile(values, weights, quantile):
        order = np.argsort(values)
        values = values[order]
        weights = weights[order]
        cumulative = np.cumsum(weights) / weights.sum()
        return float(values[min(np.searchsorted(cumulative, quantile, side="left"), len(values) - 1)])

    def train_cell_month(statistic):
        by_cell_month = {}
        by_month = {}
        for cell, month in sorted(set(zip(train_cells, train_moy, strict=True))):
            mask = (train_cells == cell) & (train_moy == month)
            by_cell_month[f"{cell}|{month}"] = float(statistic(train_raw[mask], train_weights[mask]))
        for month in np.unique(train_moy):
            mask = train_moy == month
            by_month[str(int(month))] = float(statistic(train_raw[mask], train_weights[mask]))
        return by_cell_month, by_month

    def apply_cell_month(values, cells, months, by_cell_month, by_month, fallback):
        return np.array([by_cell_month.get(f"{cell}|{int(month)}", by_month.get(str(int(month)), fallback))
                         for cell, month in zip(cells, months, strict=True)])

    if target == "storage":
        return train_raw, test_raw, {"target": "storage_mm", "method": "untransformed monthly cell storage"}
    if target == "anomaly":
        monthly = lambda values, weights: float(np.average(values, weights=weights))
        cell_month, month_fallback = train_cell_month(monthly)
        fallback = float(np.average(train_raw, weights=train_weights))
        train_climatology = apply_cell_month(train_raw, train_cells, train_moy, cell_month, month_fallback, fallback)
        test_climatology = apply_cell_month(test_raw, test_cells, test_moy, cell_month, month_fallback, fallback)
        return (train_raw - train_climatology, test_raw - test_climatology,
                {"target": "soil_water_anomaly_mm",
                 "method": "training-only area-weighted mean by cell and calendar month",
                 "_cell_month_climatology": cell_month, "_calendar_month_fallback": month_fallback,
                 "_training_weighted_mean_fallback": fallback})
    if target == "low_moisture":
        quantile = lambda values, weights: weighted_quantile(values, weights, 0.2)
        cell_month, month_fallback = train_cell_month(quantile)
        global_threshold = weighted_quantile(train_raw, train_weights, 0.2)
        train_threshold = apply_cell_month(train_raw, train_cells, train_moy,
                                           cell_month, month_fallback, global_threshold)
        test_threshold = apply_cell_month(test_raw, test_cells, test_moy,
                                          cell_month, month_fallback, global_threshold)
        return ((train_raw <= train_threshold).astype(int), (test_raw <= test_threshold).astype(int),
                {"target": "model_defined_low_moisture",
                 "method": "training-only weighted 20th percentile by cell and calendar month",
                 "quantile": 0.2, "_cell_month_threshold_mm": cell_month,
                 "_calendar_month_threshold_fallback_mm": month_fallback,
                 "_training_weighted_threshold_fallback_mm": global_threshold,
                 "interpretation": "not verified agricultural drought"})
    raise ValueError("target must be storage, anomaly, or low_moisture.")


def _public_target_info(info: dict) -> dict:
    private = {key: value for key, value in info.items() if key.startswith("_")}
    public = {key: value for key, value in info.items() if not key.startswith("_")}
    if private:
        public["training_transform_sha256"] = hashlib.sha256(
            json.dumps(private, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return public


def _feature_values(frame: pd.DataFrame, base_columns: list[str], model_name: str,
                    training_months: set[pd.Timestamp]) -> tuple[pd.DataFrame, list[str], dict]:
    result = frame.copy()
    columns = list(base_columns)
    hmm_metadata = {"used": False}
    if model_name != "xgboost_hmm":
        return result, columns, hmm_metadata
    missing_inputs = sorted(set(HMM_INPUTS) - set(base_columns))
    if missing_inputs:
        raise ValueError(f"Missing causal HMM inputs: {missing_inputs}")
    for index in (1, 2, 3):
        name = f"hmm_filtered_state_{index}"
        result[name] = np.nan
        columns.append(name)
    month_index = pd.to_datetime(result["origin_month"], utc=True)
    def weighted_mean(values, weights):
        values = values.to_numpy(dtype=float)
        weights = weights.to_numpy(dtype=float)
        valid = np.isfinite(values) & np.isfinite(weights) & (weights > 0)
        return float(np.average(values[valid], weights=weights[valid])) if valid.any() else np.nan

    source = result.groupby("origin_month", sort=True).apply(
        lambda group: pd.Series({name: weighted_mean(group[name], group["area_weight"])
                                 for name in HMM_INPUTS}), include_groups=False)
    source = source.dropna()
    train_keys = [pd.Timestamp(value) for value in source.index if pd.Timestamp(value) in training_months]
    if len(train_keys) < 12:
        raise ValueError("HMM requires at least 12 available training issue months.")
    posterior_by_month: dict[pd.Timestamp, np.ndarray] = {}

    def standardize(values, center=None, scale=None):
        center = np.nanmean(values, axis=0) if center is None else center
        scale = np.nanstd(values, axis=0) if scale is None else scale
        scale = np.where(scale > 1e-9, scale, 1.0)
        return (values - center) / scale, center, scale

    train_values = source.loc[train_keys, list(HMM_INPUTS)].to_numpy(dtype=float)
    final_z, center, scale = standardize(train_values)
    final_candidates = [DiagonalGaussianHMM(states).fit(final_z) for states in (2, 3)]
    final_hmm = min(final_candidates, key=lambda item: item.bic)
    final_states = final_hmm.n_states
    # Each historical feature is produced by a model fit only through that issue month.
    for index, key in enumerate(train_keys):
        prefix = source.loc[train_keys[:index + 1], list(HMM_INPUTS)].to_numpy(dtype=float)
        if len(prefix) < 12:
            continue
        prefix_z, _, _ = standardize(prefix)
        candidates = [DiagonalGaussianHMM(states).fit(prefix_z) for states in (2, 3)]
        fitted = min(candidates, key=lambda item: item.bic)
        probability = fitted.filter(prefix_z)[-1]
        ordering = np.argsort(fitted.means_[:, 0])
        ordered = probability[ordering]
        padded = np.zeros(3)
        padded[:min(3, len(ordered))] = ordered[:3]
        posterior_by_month[key] = padded
    # The final model is fitted exclusively on the outer training window.
    initial = final_hmm.filter(final_z)[-1]
    test_keys = [pd.Timestamp(value) for value in source.index if pd.Timestamp(value) not in training_months]
    if test_keys:
        test_values = source.loc[test_keys, list(HMM_INPUTS)].to_numpy(dtype=float)
        test_z, _, _ = standardize(test_values, center, scale)
        filtered = final_hmm.filter(test_z, initial_probability=initial)
        order = np.argsort(final_hmm.means_[:, 0])
        for key, probability in zip(test_keys, filtered, strict=True):
            ordered = probability[order]
            padded = np.zeros(3)
            padded[:min(3, len(ordered))] = ordered[:3]
            posterior_by_month[key] = padded
    for key, probability in posterior_by_month.items():
        mask = month_index.eq(key)
        for index, name in enumerate(columns[-3:]):
            result.loc[mask, name] = probability[index]
    hmm_metadata = {"used": True, "fit_scope": "training rows only", "filtering": "forward filtered",
                    "selected_states_by_training_bic": int(final_states),
                    "candidate_states": [2, 3], "training_issue_months": len(train_keys),
                    "training_bic": {str(item.n_states): float(item.bic) for item in final_candidates},
                    "random_state": 1729,
                    "historical_training_features": "prefix refit at each issue month",
                    "state_order": "ascending mean standardized soil-water input",
                    "future_smoothing_used": False}
    return result, columns, hmm_metadata


def _baseline_predictions(train: pd.DataFrame, test: pd.DataFrame, target: str,
                          y_train: np.ndarray, target_info: dict):
    train_month = pd.to_datetime(train["target_month"], utc=True).dt.month.to_numpy()
    test_month = pd.to_datetime(test["target_month"], utc=True).dt.month.to_numpy()
    train_cells = train["cell_id"].astype(str).to_numpy()
    test_cells = test["cell_id"].astype(str).to_numpy()
    train_weights = train["area_weight"].to_numpy(dtype=float)

    def seasonal_values(values):
        cell_month = {}
        month_fallback = {}
        for cell, month in sorted(set(zip(train_cells, train_month, strict=True))):
            mask = (train_cells == cell) & (train_month == month)
            cell_month[f"{cell}|{month}"] = float(np.average(values[mask], weights=train_weights[mask]))
        for month in np.unique(train_month):
            mask = train_month == month
            month_fallback[str(int(month))] = float(np.average(values[mask], weights=train_weights[mask]))
        global_fallback = float(np.average(values, weights=train_weights))
        prediction = np.array([cell_month.get(f"{cell}|{month}",
                                              month_fallback.get(str(int(month)), global_fallback))
                               for cell, month in zip(test_cells, test_month, strict=True)])
        return prediction

    output = {}
    if target == "low_moisture":
        output["seasonal_climatology"] = seasonal_values(y_train)
        threshold = target_info["_cell_month_threshold_mm"]
        month_fallback = target_info["_calendar_month_threshold_fallback_mm"]
        global_threshold = target_info["_training_weighted_threshold_fallback_mm"]
        persist = test["soil_water_mm_lag_0"].to_numpy(dtype=float)
        source_month = test.get("soil_water_source_month_lag_0", pd.Series(test_month)).to_numpy()
        persist_threshold = np.array([
            threshold.get(f"{cell}|{int(month)}", month_fallback.get(str(int(month)), global_threshold))
            if np.isfinite(month) else global_threshold
            for cell, month in zip(test_cells, source_month, strict=True)])
        output["persistence"] = np.where(np.isfinite(persist), (persist <= persist_threshold).astype(float),
                                         float(np.average(y_train, weights=train_weights)))
    else:
        if target == "anomaly":
            seasonal = np.zeros(len(test))
            persistence = test["soil_water_mm_lag_0"].to_numpy(dtype=float)
            source_month = test.get("soil_water_source_month_lag_0", pd.Series(test_month)).to_numpy()
            clim = target_info["_cell_month_climatology"]
            fallback = target_info["_calendar_month_fallback"]
            pooled = target_info["_training_weighted_mean_fallback"]
            source_clim = np.array([
                clim.get(f"{cell}|{int(month)}", fallback.get(str(int(month)), pooled))
                if np.isfinite(month) else pooled
                for cell, month in zip(test_cells, source_month, strict=True)])
            persistence = persistence - source_clim
        else:
            seasonal = seasonal_values(y_train)
            persistence = test["soil_water_mm_lag_0"].to_numpy(dtype=float)
        output["seasonal_climatology"] = seasonal
        output["persistence"] = np.where(np.isfinite(persistence), persistence, output["seasonal_climatology"])
    return output


def _choose_params(name: str, train: pd.DataFrame, feature_columns: list[str], target: str,
                   *, min_inner_train: int = 24) -> dict:
    months = pd.DatetimeIndex(sorted(pd.to_datetime(train["target_month"], utc=True).unique()))
    if len(months) <= min_inner_train + 3:
        return candidate_specs(name)[0]
    validation_n = min(12, max(3, len(months) // 5))
    cut = len(months) - validation_n
    inner_train = train.loc[pd.to_datetime(train["target_month"], utc=True).isin(months[:cut])].copy()
    inner_valid = train.loc[pd.to_datetime(train["target_month"], utc=True).isin(months[cut:])].copy()
    if inner_train.empty or inner_valid.empty:
        return candidate_specs(name)[0]
    y_train, y_valid, _ = _target_values(inner_train, inner_valid, target)
    fit_frame, columns, _ = _feature_values(
        pd.concat([inner_train, inner_valid], ignore_index=True), feature_columns, name,
        set(pd.to_datetime(inner_train["origin_month"], utc=True).unique()),
    )
    x_train = fit_frame.iloc[:len(inner_train)][columns]
    x_valid = fit_frame.iloc[len(inner_train):][columns]
    best = None
    best_score = np.inf
    for params in candidate_specs(name):
        try:
            model = estimator(name, task="classification" if target == "low_moisture" else "regression", params=params)
            fit(model, x_train, y_train, sample_weight=inner_train["area_weight"].to_numpy())
            pred = predict(model, x_valid, probability=target == "low_moisture")
            if target == "low_moisture":
                score = float(np.average((pred - y_valid) ** 2, weights=inner_valid["area_weight"]))
            else:
                score = float(np.sqrt(np.average((pred - y_valid) ** 2, weights=inner_valid["area_weight"])))
            if score < best_score:
                best, best_score = params, score
        except (ValueError, FloatingPointError):
            continue
    return best or candidate_specs(name)[0]


def _fit_predict_family(name: str, train: pd.DataFrame, test: pd.DataFrame, feature_columns: list[str],
                        target: str, *, params: dict | None = None):
    y_train, y_test, target_info = _target_values(train, test, target)
    if np.unique(y_train).size < 2 and target == "low_moisture":
        prevalence = float(y_train.mean())
        return np.full(len(test), prevalence), y_test, target_info, {"used": name == "xgboost_hmm"}
    combined = pd.concat([train, test], ignore_index=True)
    train_origin = set(pd.to_datetime(train["origin_month"], utc=True).unique())
    selected_columns = feature_columns
    model_family = name
    if name == "autoregressive_ridge":
        selected_columns = [column for column in feature_columns
                            if column.startswith("soil_water_mm_lag_")
                            or column in ("target_month_sin", "target_month_cos")]
        model_family = "ridge"
    combined, columns, hmm_info = _feature_values(combined, selected_columns, name, train_origin)
    x_train = combined.iloc[:len(train)][columns]
    x_test = combined.iloc[len(train):][columns]
    model = estimator(model_family, task="classification" if target == "low_moisture" else "regression", params=params)
    fit(model, x_train, y_train, sample_weight=train["area_weight"].to_numpy())
    prediction = predict(model, x_test, probability=target == "low_moisture")
    return np.asarray(prediction), y_test, target_info, hmm_info


def _score_split(frame: pd.DataFrame, y: np.ndarray, prediction: np.ndarray, target: str,
                 baseline: dict):
    persistence = baseline["persistence"]
    if target == "low_moisture":
        return classification_metrics(frame, y, prediction, persistence=persistence,
                                      climatology=baseline["seasonal_climatology"])
    return regression_metrics(frame, y, prediction, persistence)


def evaluate(panel: pd.DataFrame, *, horizons: Iterable[int] = (1, 2, 3),
             targets: Iterable[str] = ("storage", "anomaly", "low_moisture"),
             initial_train_months: int = 120, test_window_months: int = 12,
             holdout_months: int = 24, n_lags: int = 6,
             model_families: Iterable[str] = ("autoregressive_ridge", "ridge", "xgboost", "xgboost_hmm")) -> dict:
    from .contract import validate_frame
    validate_frame(panel)
    results = []
    family_names = tuple(model_families)
    if not set(family_names).issubset({"autoregressive_ridge", "ridge", "xgboost", "xgboost_hmm"}):
        raise ValueError("Unknown model family requested.")
    for horizon in horizons:
        supervised, feature_columns = make_supervised(panel, horizon=horizon, n_lags=n_lags)
        folds, final = expanding_folds(supervised, initial_train_months=initial_train_months,
                                       test_window_months=test_window_months, holdout_months=holdout_months)
        fold_list = [*folds, final]
        for target in targets:
            for fold in fold_list:
                train_mask = pd.to_datetime(supervised["target_month"], utc=True).dt.strftime("%Y-%m").isin(fold.train_months)
                test_mask = pd.to_datetime(supervised["target_month"], utc=True).dt.strftime("%Y-%m").isin(fold.test_months)
                train, test = supervised.loc[train_mask].copy(), supervised.loc[test_mask].copy()
                if train.empty or test.empty:
                    continue
                y_train, y_test, target_info = _target_values(train, test, target)
                baseline_pred = _baseline_predictions(train, test, target, y_train, target_info)
                for baseline_name, prediction in baseline_pred.items():
                    score = _score_split(test, y_test, prediction, target, baseline_pred)
                    results.append({
                        "horizon_months": horizon, "target": target, "model": baseline_name,
                        "fold": fold.as_dict(), "target_definition": _public_target_info(target_info), "metrics": score,
                    })
                for name in family_names:
                    selection_features = ([column for column in feature_columns
                                           if column.startswith("soil_water_mm_lag_")
                                           or column in ("target_month_sin", "target_month_cos")]
                                          if name == "autoregressive_ridge" else feature_columns)
                    try:
                        params = _choose_params("ridge" if name == "autoregressive_ridge" else name,
                                                train, selection_features, target)
                        prediction, y_evaluated, model_target_info, hmm_info = _fit_predict_family(
                            name, train, test, feature_columns, target, params=params)
                    except (ValueError, FloatingPointError) as error:
                        results.append({"horizon_months": horizon, "target": target, "model": name,
                                        "fold": fold.as_dict(), "status": "not_evaluable", "reason": str(error)})
                        continue
                    score = _score_split(test, y_evaluated, prediction, target, baseline_pred)
                    results.append({
                        "horizon_months": horizon, "target": target, "model": name,
                        "fold": fold.as_dict(), "target_definition": _public_target_info(model_target_info),
                        "selected_parameters": params, "hmm": hmm_info, "metrics": score,
                    })
    return {
        "schema_version": "1.0.0", "evaluation": "expanding-window walk-forward plus untouched final holdout",
        "models": ["seasonal_climatology", "persistence", *family_names],
        "selection": "inner chronological validation on training rows only",
        "spatial_panel_rule": "all cells sharing a target month are assigned to the same fold",
        "release_rule": "each feature row is filtered by available_at <= issue_time",
        "results": results,
    }
