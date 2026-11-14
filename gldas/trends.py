"""Monthly GLDAS soil-water trend analysis.

The statistical core uses the standard library. NumPy and netCDF4 are used only
for efficient masked-array input from the acquisition pipeline.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime
import hashlib
import json
import math
from pathlib import Path
import statistics
from typing import Mapping, Sequence

import netCDF4 as nc
import numpy as np


SOIL_LAYERS = (
    "SoilMoi0_10cm_inst",
    "SoilMoi10_40cm_inst",
    "SoilMoi40_100cm_inst",
)
LAYER_MAXIMUMS = (100.0, 300.0, 600.0)
SOIL_UNITS = "kg m-2"
EARTH_RADIUS_M = 6_371_008.8
Z95 = statistics.NormalDist().inv_cdf(0.975)


class TrendAnalysisError(ValueError):
    """Raised when input data do not meet the documented monthly contract."""


def _month(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = date.fromisoformat(value[:10])
        except ValueError as error:
            raise TrendAnalysisError(f"Invalid month label: {value!r}.") from error
    else:
        raise TrendAnalysisError(f"Unsupported month label: {value!r}.")
    if parsed.day != 1:
        raise TrendAnalysisError(f"Monthly labels must be on the first day: {parsed}.")
    return parsed


def _next_month(value: date) -> date:
    return date(value.year + (value.month == 12), 1 if value.month == 12 else value.month + 1, 1)


def _validate_months(months: Sequence[date | datetime | str]) -> list[date]:
    parsed = [_month(item) for item in months]
    if not parsed:
        raise TrendAnalysisError("At least one monthly observation is required.")
    for current, following in zip(parsed, parsed[1:]):
        if following != _next_month(current):
            raise TrendAnalysisError(
                f"Monthly sequence is incomplete or unordered between {current} and {following}."
            )
    return parsed


def _validate_axis(values: Sequence[float], name: str, *, latitude: bool = False) -> list[float]:
    try:
        masked_axis = np.ma.asarray(values, dtype=np.float64)
        if np.ma.getmaskarray(masked_axis).any():
            raise TrendAnalysisError(f"{name} contains masked coordinates.")
        axis = masked_axis.filled(np.nan).tolist()
    except (TypeError, ValueError) as error:
        raise TrendAnalysisError(f"{name} must be numeric.") from error
    if len(axis) < 2 or any(not math.isfinite(value) for value in axis):
        raise TrendAnalysisError(f"{name} must contain at least two finite grid centres.")
    if any(right <= left for left, right in zip(axis, axis[1:])):
        raise TrendAnalysisError(f"{name} must be strictly ascending.")
    steps = [right - left for left, right in zip(axis, axis[1:])]
    if any(abs(step - 0.25) > 1e-6 for step in steps):
        raise TrendAnalysisError(f"{name} must use the GLDAS 0.25 degree grid.")
    if latitude and (axis[0] < -90 or axis[-1] > 90):
        raise TrendAnalysisError("Latitude centres must lie within [-90, 90].")
    if not latitude and (axis[0] < -180 or axis[-1] > 360):
        raise TrendAnalysisError("Longitude centres must lie within [-180, 360].")
    return axis
def _as_float_array(values, expected_shape: tuple[int, int, int], layer_name: str) -> np.ndarray:
    try:
        array = np.ma.asarray(values, dtype=np.float64).filled(np.nan)
    except (TypeError, ValueError) as error:
        raise TrendAnalysisError(f"{layer_name} must be numeric.") from error
    if array.shape != expected_shape:
        raise TrendAnalysisError(
            f"{layer_name} has shape {array.shape}; expected {expected_shape} (time, lat, lon)."
        )
    if np.isinf(array).any():
        raise TrendAnalysisError(f"{layer_name} contains an unmasked infinite value.")
    return array


def _cell_areas(latitudes: Sequence[float], longitudes: Sequence[float]) -> np.ndarray:
    """Exact spherical areas for regular latitude/longitude cells."""
    lat = np.radians(np.asarray(latitudes, dtype=float))
    lon_width = math.radians(0.25)
    half = math.radians(0.125)
    lower = np.maximum(lat - half, -math.pi / 2)
    upper = np.minimum(lat + half, math.pi / 2)
    row_area = EARTH_RADIUS_M**2 * lon_width * (np.sin(upper) - np.sin(lower))
    return np.repeat(row_area[:, None], len(longitudes), axis=1)


def _finite_pairs(values: Sequence[float | None], month_indices: Sequence[int]):
    return [(index, float(value)) for index, value in zip(month_indices, values)
            if value is not None and math.isfinite(float(value))]


def _sen_slope_per_decade(
    pairs: Sequence[tuple[int, float]], calendar_months: Sequence[int] | None = None,
) -> float | None:
    if len(pairs) < 2:
        return None
    if calendar_months is None:
        groups = [pairs]
    else:
        groups = [
            [(index, value) for (index, value), month in zip(pairs, calendar_months)
             if month == calendar_month]
            for calendar_month in range(1, 13)
        ]
    slopes = []
    for group in groups:
        slopes.extend(
            (right_value - left_value) * 120.0 / (right_index - left_index)
            for offset, (left_index, left_value) in enumerate(group[:-1])
            for right_index, right_value in group[offset + 1:]
        )
    return float(statistics.median(slopes)) if slopes else None


def mann_kendall(values: Sequence[float | None]) -> dict:
    """Classic two-sided Mann-Kendall test; its p-value assumes independence."""
    observed = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    n = len(observed)
    if n < 2:
        return {"n": n, "s": None, "tau": None, "z": None, "p_value": None}
    score = sum((right > left) - (right < left)
                for index, left in enumerate(observed[:-1])
                for right in observed[index + 1:])
    ties: dict[float, int] = {}
    for value in observed:
        ties[value] = ties.get(value, 0) + 1
    tie_term = sum(count * (count - 1) * (2 * count + 5)
                   for count in ties.values() if count > 1)
    variance = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    if variance <= 0:
        z_score, p_value = 0.0, 1.0
    else:
        if score > 0:
            z_score = (score - 1) / math.sqrt(variance)
        elif score < 0:
            z_score = (score + 1) / math.sqrt(variance)
        else:
            z_score = 0.0
        p_value = math.erfc(abs(z_score) / math.sqrt(2))
    tau = score / (n * (n - 1) / 2)
    return {"n": n, "s": int(score), "tau": tau, "z": z_score, "p_value": p_value}


def seasonal_mann_kendall(
    values: Sequence[float | None], calendar_months: Sequence[int],
) -> dict:
    """Seasonal Kendall test, comparing observations within the same month-of-year."""
    groups = {
        month: [float(value) for value, observed_month in zip(values, calendar_months)
                if observed_month == month and value is not None and math.isfinite(float(value))]
        for month in range(1, 13)
    }
    score = 0
    variance = 0.0
    pair_count = 0
    observation_count = 0
    for observed in groups.values():
        n = len(observed)
        observation_count += n
        pair_count += n * (n - 1) // 2
        score += sum((right > left) - (right < left)
                     for index, left in enumerate(observed[:-1])
                     for right in observed[index + 1:])
        ties: dict[float, int] = {}
        for value in observed:
            ties[value] = ties.get(value, 0) + 1
        tie_term = sum(count * (count - 1) * (2 * count + 5)
                       for count in ties.values() if count > 1)
        variance += (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    if pair_count == 0:
        return {"n": observation_count, "s": score, "tau": None, "z": None, "p_value": None}
    if variance <= 0:
        z_score, p_value = 0.0, 1.0
    elif score > 0:
        z_score = (score - 1) / math.sqrt(variance)
        p_value = math.erfc(abs(z_score) / math.sqrt(2))
    elif score < 0:
        z_score = (score + 1) / math.sqrt(variance)
        p_value = math.erfc(abs(z_score) / math.sqrt(2))
    else:
        z_score, p_value = 0.0, 1.0
    return {
        "n": observation_count, "s": score, "tau": score / pair_count,
        "z": z_score, "p_value": p_value,
    }


def _linear_hac(
    pairs: Sequence[tuple[int, float]],
    calendar_months: Sequence[int],
    max_lag: int = 12,
) -> dict:
    """OLS trend with month fixed effects and Bartlett-kernel Newey-West HAC uncertainty."""
    n = len(pairs)
    month_groups = [month for month, (_, _) in zip(calendar_months, pairs)]
    distinct_months = set(month_groups)
    parameter_count = 1 + len(distinct_months)
    if n <= parameter_count:
        return {"slope_per_decade": None, "se_hac_per_decade": None,
                "se_iid_per_decade": None, "ci_low_per_decade": None,
                "ci_high_per_decade": None, "p_value": None}
    x = [float(index) for index, _ in pairs]
    y = [value for _, value in pairs]
    group_x: dict[int, list[float]] = {}
    group_y: dict[int, list[float]] = {}
    for group, x_value, y_value in zip(month_groups, x, y):
        group_x.setdefault(group, []).append(x_value)
        group_y.setdefault(group, []).append(y_value)
    mean_x = {group: statistics.fmean(values) for group, values in group_x.items()}
    mean_y = {group: statistics.fmean(values) for group, values in group_y.items()}
    residualized_x = [value - mean_x[group] for group, value in zip(month_groups, x)]
    residualized_y = [value - mean_y[group] for group, value in zip(month_groups, y)]
    sxx = math.fsum(value * value for value in residualized_x)
    if sxx == 0:
        raise TrendAnalysisError("Trend estimation requires variation in month indices.")
    slope_month = math.fsum(dx * dy for dx, dy in zip(residualized_x, residualized_y)) / sxx
    residuals = [
        dy - slope_month * dx for dx, dy in zip(residualized_x, residualized_y)
    ]
    scores = [dx * residual for dx, residual in zip(residualized_x, residuals)]
    bandwidth = min(max(0, int(max_lag)), (pairs[-1][0] - pairs[0][0]) if n > 1 else 0)
    meat = math.fsum(score * score for score in scores)
    for right_index in range(n):
        for left_index in range(right_index):
            lag = pairs[right_index][0] - pairs[left_index][0]
            if 0 < lag <= bandwidth:
                meat += 2.0 * (1.0 - lag / (bandwidth + 1.0)) * scores[right_index] * scores[left_index]
    correction = n / (n - parameter_count)
    variance_hac = max(0.0, meat * correction / (sxx * sxx))
    variance_iid = (math.fsum(value * value for value in residuals) / (n - parameter_count)) / sxx
    slope_decade = slope_month * 120.0
    se_hac = math.sqrt(variance_hac) * 120.0
    se_iid = math.sqrt(max(0.0, variance_iid)) * 120.0
    if se_hac == 0:
        p_value = 1.0 if slope_decade == 0 else 0.0
    else:
        p_value = math.erfc(abs(slope_decade / se_hac) / math.sqrt(2))
    return {
        "slope_per_decade": slope_decade,
        "se_hac_per_decade": se_hac,
        "se_iid_per_decade": se_iid,
        "ci_low_per_decade": slope_decade - Z95 * se_hac,
        "ci_high_per_decade": slope_decade + Z95 * se_hac,
        "p_value": min(1.0, max(0.0, p_value)),
        "hac_max_lag_months": bandwidth,
        "seasonal_fixed_effects": len(distinct_months),
    }


def _trend_summary(
    values: Sequence[float | None],
    month_indices: Sequence[int],
    calendar_months: Sequence[int],
    linear_values: Sequence[float | None],
    hac_max_lag_months: int = 12,
) -> dict:
    pairs = _finite_pairs(linear_values, month_indices)
    linear_months = [calendar_months[index] for index, value in enumerate(linear_values)
                     if value is not None and math.isfinite(float(value))]
    linear = _linear_hac(pairs, linear_months, max_lag=hac_max_lag_months)
    raw_pairs = _finite_pairs(linear_values, month_indices)
    seasonal_mk = seasonal_mann_kendall(linear_values, calendar_months)
    mk = mann_kendall(values)
    return {
        "valid_months": len(pairs),
        "sen_slope_per_decade": _sen_slope_per_decade(raw_pairs, linear_months),
        "linear_hac_slope_per_decade": linear["slope_per_decade"],
        "linear_hac_se_per_decade": linear["se_hac_per_decade"],
        "linear_iid_se_per_decade": linear["se_iid_per_decade"],
        "linear_hac_ci95_per_decade": (
            [linear["ci_low_per_decade"], linear["ci_high_per_decade"]]
            if linear["ci_low_per_decade"] is not None else None
        ),
        "linear_hac_p_value": linear["p_value"],
        "hac_max_lag_months": linear.get("hac_max_lag_months"),
        "mann_kendall_tau": mk["tau"],
        "mann_kendall_p_independence_assumption": mk["p_value"],
        "seasonal_mann_kendall_tau": seasonal_mk["tau"],
        "seasonal_mann_kendall_p_independence_assumption": seasonal_mk["p_value"],
        "mann_kendall_z": mk["z"],
    }

def _benjamini_hochberg(p_values: Sequence[float]) -> list[float]:
    """Benjamini-Hochberg adjusted p-values, returned in original order."""
    count = len(p_values)
    if not count:
        return []
    order = sorted(range(count), key=p_values.__getitem__)
    adjusted = [1.0] * count
    running = 1.0
    for rank_index in range(count - 1, -1, -1):
        original = order[rank_index]
        rank = rank_index + 1
        running = min(running, float(p_values[original]) * count / rank)
        adjusted[original] = min(1.0, running)
    return adjusted


def analyze_monthly_grids(
    months: Sequence[date | datetime | str],
    latitudes: Sequence[float],
    longitudes: Sequence[float],
    layers: Mapping[str, object],
    *,
    units: Mapping[str, str] | None = None,
    minimum_regional_coverage: float = 0.80,
    minimum_spatial_months: int = 60,
    alpha: float = 0.05,
    hac_max_lag_months: int = 12,
) -> dict:
    """Analyze a complete monthly GLDAS 0-100 cm soil-water grid series.

    Input layer arrays must be shaped (months, latitudes, longitudes). Missing
    values must be masked or represented by NaN. Output is JSON-serializable.
    """
    dates = _validate_months(months)
    lat = _validate_axis(latitudes, "latitudes", latitude=True)
    lon = _validate_axis(longitudes, "longitudes")
    if not 0 < minimum_regional_coverage <= 1:
        raise TrendAnalysisError("minimum_regional_coverage must be in (0, 1].")
    if not 0 < alpha < 1:
        raise TrendAnalysisError("alpha must be in (0, 1).")
    if minimum_spatial_months < 3:
        raise TrendAnalysisError("minimum_spatial_months must be at least 3.")
    if not isinstance(hac_max_lag_months, int) or hac_max_lag_months < 1:
        raise TrendAnalysisError("hac_max_lag_months must be a positive integer.")
    if units is None or any(units.get(name) != SOIL_UNITS for name in SOIL_LAYERS):
        raise TrendAnalysisError(f"All three soil layers must declare units {SOIL_UNITS!r}.")
    if any(name not in layers for name in SOIL_LAYERS):
        raise TrendAnalysisError("Input must contain the three GLDAS soil layers from 0 to 100 cm.")
    shape = (len(dates), len(lat), len(lon))
    fields = [_as_float_array(layers[name], shape, name) for name in SOIL_LAYERS]
    for field, maximum, name in zip(fields, LAYER_MAXIMUMS, SOIL_LAYERS):
        valid = field[np.isfinite(field)]
        if valid.size and (float(valid.min()) < 0 or float(valid.max()) > maximum + 0.001):
            raise TrendAnalysisError(f"{name} contains values outside the validated physical range.")
    valid_profile = np.logical_and.reduce([np.isfinite(field) for field in fields])
    storage = np.where(valid_profile, fields[0] + fields[1] + fields[2], np.nan)
    areas = _cell_areas(lat, lon)
    total_area = float(areas.sum())
    regional: list[dict] = []
    regional_values: list[float | None] = []
    regional_coverages: list[float] = []
    for time_index, month in enumerate(dates):
        valid = np.isfinite(storage[time_index])
        valid_area = float(areas[valid].sum())
        coverage = valid_area / total_area
        value = (
            float(np.sum(storage[time_index][valid] * areas[valid]) / valid_area)
            if valid_area > 0 and coverage >= minimum_regional_coverage else None
        )
        regional_values.append(value)
        regional_coverages.append(coverage)
        regional.append({
            "month": month.isoformat(),
            "soil_water_0_100_mm": value,
            "valid_area_fraction": coverage,
            "valid_cells": int(valid.sum()),
            "total_cells": int(valid.size),
        })

    climatology: list[dict] = []
    monthly_means: dict[int, float | None] = {}
    for calendar_month in range(1, 13):
        candidates = [value for month, value in zip(dates, regional_values)
                      if month.month == calendar_month and value is not None]
        mean = statistics.fmean(candidates) if len(candidates) >= 2 else None
        monthly_means[calendar_month] = mean
        climatology.append({
            "calendar_month": calendar_month,
            "mean_soil_water_0_100_mm": mean,
            "valid_years": len(candidates),
        })
    anomalies = [
        value - monthly_means[month.month]
        if value is not None and monthly_means[month.month] is not None else None
        for month, value in zip(dates, regional_values)
    ]
    month_indices = [(month.year - dates[0].year) * 12 + month.month - dates[0].month
                     for month in dates]
    regional_trend = _trend_summary(anomalies, month_indices, [month.month for month in dates], regional_values, hac_max_lag_months)

    spatial_rows: list[dict] = []
    p_values: list[float] = []
    p_row_indices: list[int] = []
    # Process one cell at a time; no per-grid pairwise-slope cube is retained.
    for row, latitude in enumerate(lat):
        for column, longitude in enumerate(lon):
            cell_values: list[float | None] = []
            for time_index in range(len(dates)):
                value = float(storage[time_index, row, column])
                cell_values.append(value if math.isfinite(value) else None)
            n_valid = sum(value is not None for value in cell_values)
            if n_valid < minimum_spatial_months or n_valid / len(dates) < minimum_regional_coverage:
                continue
            cell_climatology = {}
            for calendar_month in range(1, 13):
                selected = [value for month, value in zip(dates, cell_values)
                            if month.month == calendar_month and value is not None]
                cell_climatology[calendar_month] = (
                    statistics.fmean(selected) if len(selected) >= 2 else None
                )
            cell_anomalies = [
                value - cell_climatology[month.month]
                if value is not None and cell_climatology[month.month] is not None else None
                for month, value in zip(dates, cell_values)
            ]
            trend = _trend_summary(cell_anomalies, month_indices, [month.month for month in dates], cell_values, hac_max_lag_months)
            row_result = {
                "latitude": latitude,
                "longitude": longitude,
                "valid_months": trend["valid_months"],
                "linear_hac_slope_per_decade": trend["linear_hac_slope_per_decade"],
                "linear_hac_ci95_per_decade": trend["linear_hac_ci95_per_decade"],
                "linear_hac_p_value": trend["linear_hac_p_value"],
                "sen_slope_per_decade": trend["sen_slope_per_decade"],
                "mann_kendall_tau": trend["mann_kendall_tau"],
                "seasonal_mann_kendall_tau": trend["seasonal_mann_kendall_tau"],
                "seasonal_mann_kendall_p_independence_assumption": trend["seasonal_mann_kendall_p_independence_assumption"],
                "mann_kendall_p_independence_assumption":
                    trend["mann_kendall_p_independence_assumption"],
            }
            spatial_rows.append(row_result)
            if row_result["linear_hac_p_value"] is not None:
                p_row_indices.append(len(spatial_rows) - 1)
                p_values.append(row_result["linear_hac_p_value"])
    q_values = _benjamini_hochberg(p_values)
    for index, q_value in zip(p_row_indices, q_values):
        spatial_rows[index]["linear_hac_bh_q_value"] = q_value
        spatial_rows[index]["significant_after_bh"] = q_value < alpha
    for row_result in spatial_rows:
        row_result.setdefault("linear_hac_bh_q_value", None)
        row_result.setdefault("significant_after_bh", False)

    return {
        "schema_version": "1.0",
        "dataset": "GLDAS Noah v2.1 monthly regional exports",
        "variable": "soil_water_storage_0_100_cm",
        "units": "mm water equivalent (numerically equal to kg m-2)",
        "months": {
            "start": dates[0].isoformat(),
            "end": dates[-1].isoformat(),
            "count": len(dates),
            "cadence": "complete calendar months",
        },
        "spatial_grid": {
            "latitude_count": len(lat),
            "longitude_count": len(lon),
            "cell_count": len(lat) * len(lon),
            "resolution_degrees": 0.25,
            "area_weighting": "exact spherical regular-grid cell area from latitude bounds",
            "boundary_rule": "all cells in the supplied grid; no polygon overlap fraction applied",
        },
        "quality": {
            "minimum_regional_coverage": minimum_regional_coverage,
            "regional_valid_area_fraction_min": min(regional_coverages),
            "regional_valid_area_fraction_mean": statistics.fmean(regional_coverages),
            "missing_profile_values": int((~valid_profile).sum()),
            "missing_profile_fraction": float((~valid_profile).sum() / valid_profile.size),
            "area_coverage_rule": "regional means are withheld below the configured valid-area threshold",
        },
        "seasonal_climatology": climatology,
        "regional_monthly_series": regional,
        "regional_monthly_anomalies": [
            {"month": month.isoformat(), "anomaly_mm": anomaly}
            for month, anomaly in zip(dates, anomalies)
        ],
        "regional_trend": regional_trend,
        "spatial_trends_on_cell_seasonal_anomalies": {
            "minimum_valid_months": minimum_spatial_months,
            "eligible_cells": len(spatial_rows),
            "multiple_testing": "Benjamini-Hochberg false-discovery-rate adjustment of HAC OLS p-values",
            "alpha": alpha,
            "cells": spatial_rows,
        },
        "methods": {
            "0_100_cm_storage": "sum SoilMoi0_10cm_inst, SoilMoi10_40cm_inst, SoilMoi40_100cm_inst; all three layers required",
            "regional_trend": f"OLS trend with calendar-month fixed effects; Newey-West HAC standard error with Bartlett weights and up to {hac_max_lag_months} calendar-month lags",
            "confidence_interval": "95% normal-approximation interval using HAC standard error",
            "sen_slope": "median of pairwise slopes within matching calendar months, using actual elapsed month indices and scaled to decade",
            "mann_kendall": "tie-corrected classic test on displayed monthly anomalies plus seasonal Kendall within matching calendar months; both p-values assume independence and are descriptive under serial dependence",
            "spatial_significance": "HAC OLS p-values with Benjamini-Hochberg adjustment; cells are spatially dependent, so FDR interpretation is approximate",
            "anomalies": "subtract each calendar month's mean across valid regional observations in the full supplied period",
        },
        "limitations": [
            "GLDAS is a modeled hydrological product; these results do not establish crop yield effects or crop damage.",
            "Spatial grid means use complete 0-100 cm profiles and supplied-grid cell areas; they do not apply a Pampas polygon overlap mask.",
            "Newey-West and normal-approximation inference is asymptotic; assess sensitivity to lag choice and analysis period.",
            "Mann-Kendall and Seasonal Kendall p-values do not correct serial autocorrelation.",
            "The full-period climatology is descriptive and should not be used as an issue-time forecast baseline.",
        ],
    }


def load_monthly_netcdf(paths: Sequence[str | Path]) -> tuple[list[date], list[float], list[float], dict, dict]:
    """Load and validate acquisition-pipeline monthly subset NetCDF files.

    Files must each hold exactly one monthly time record and use the acquisition
    pipeline's variable names, units, and (time, lat, lon) dimension order.
    """
    if not paths:
        raise TrendAnalysisError("Provide at least one monthly NetCDF file.")
    ordered_paths = [Path(path) for path in paths]
    months: list[date] = []
    latitudes: list[float] | None = None
    longitudes: list[float] | None = None
    layer_values = {name: [] for name in SOIL_LAYERS}
    units: dict[str, str] = {}
    expected_bounds = None
    for path in ordered_paths:
        try:
            dataset = nc.Dataset(path, "r")
        except OSError as error:
            raise TrendAnalysisError(f"Cannot open monthly NetCDF file {path}: {error}") from error
        with dataset:
            if "time" not in dataset.variables or "lat" not in dataset.variables or "lon" not in dataset.variables:
                raise TrendAnalysisError(f"{path.name} is missing time, lat, or lon coordinates.")
            time_var = dataset["time"]
            if time_var.dimensions != ("time",) or len(time_var) != 1:
                raise TrendAnalysisError(f"{path.name} must contain exactly one time record.")
            time_units = getattr(time_var, "units", None)
            if not time_units:
                raise TrendAnalysisError(f"{path.name} time coordinate has no CF units.")
            try:
                timestamp = nc.num2date(
                    time_var[:], time_units, getattr(time_var, "calendar", "standard"),
                    only_use_cftime_datetimes=False,
                )[0]
            except (ValueError, TypeError) as error:
                raise TrendAnalysisError(f"{path.name} has an invalid CF time coordinate.") from error
            month = _month(date(timestamp.year, timestamp.month, timestamp.day))
            if (month != date(timestamp.year, timestamp.month, 1)
                    or getattr(timestamp, "hour", 0) != 0
                    or getattr(timestamp, "minute", 0) != 0
                    or getattr(timestamp, "second", 0) != 0):
                raise TrendAnalysisError(f"{path.name} time is not at the first of the month.")
            bounds_name = getattr(time_var, "bounds", None)
            if not bounds_name:
                raise TrendAnalysisError(f"{path.name} monthly time coordinate must reference time bounds.")
            if bounds_name:
                if bounds_name not in dataset.variables:
                    raise TrendAnalysisError(f"{path.name} references missing time bounds.")
                bounds = dataset[bounds_name]
                if bounds.dimensions != ("time", "bnds") or bounds.shape != (1, 2):
                    raise TrendAnalysisError(f"{path.name} has invalid monthly time bounds dimensions.")
                bound_values = nc.num2date(
                    bounds[:], getattr(bounds, "units", time_units),
                    getattr(bounds, "calendar", getattr(time_var, "calendar", "standard")),
                    only_use_cftime_datetimes=False,
                )[0]
                start = bound_values[0]
                end = bound_values[1]
                expected_end = _next_month(month)
                if (date(start.year, start.month, start.day) != month
                        or date(end.year, end.month, end.day) != expected_end
                        or getattr(start, "hour", 0) != 0 or getattr(start, "minute", 0) != 0
                        or getattr(end, "hour", 0) != 0 or getattr(end, "minute", 0) != 0):
                    raise TrendAnalysisError(f"{path.name} does not bound one complete calendar month.")
                if expected_bounds is False:
                    raise TrendAnalysisError(f"{path.name} has inconsistent time bounds.")
                expected_bounds = True
            else:
                if expected_bounds is True:
                    raise TrendAnalysisError(f"{path.name} is missing time bounds present in other files.")
                expected_bounds = False

            if getattr(dataset["lat"], "units", None) != "degrees_north":
                raise TrendAnalysisError(f"{path.name} latitude units must be degrees_north.")
            if getattr(dataset["lon"], "units", None) != "degrees_east":
                raise TrendAnalysisError(f"{path.name} longitude units must be degrees_east.")
            current_lat = _validate_axis(dataset["lat"][:], "latitudes", latitude=True)
            current_lon = _validate_axis(dataset["lon"][:], "longitudes")
            if latitudes is None:
                latitudes, longitudes = current_lat, current_lon
            elif current_lat != latitudes or current_lon != longitudes:
                raise TrendAnalysisError(f"{path.name} grid differs from preceding monthly files.")

            months.append(month)
            for name in SOIL_LAYERS:
                if name not in dataset.variables:
                    raise TrendAnalysisError(f"{path.name} is missing {name}.")
                variable = dataset[name]
                field_units = getattr(variable, "units", None)
                if field_units != SOIL_UNITS:
                    raise TrendAnalysisError(f"{path.name} {name} units must be {SOIL_UNITS!r}.")
                if variable.dimensions != ("time", "lat", "lon"):
                    raise TrendAnalysisError(f"{path.name} {name} must have dimensions (time, lat, lon).")
                if variable.shape != (1, len(latitudes), len(longitudes)):
                    raise TrendAnalysisError(f"{path.name} {name} dimensions do not match its grid.")
                units[name] = field_units
                values = np.ma.asarray(variable[:], dtype=np.float64)
                layer_values[name].append(values[0].filled(np.nan))
    _validate_months(months)
    stacked = {name: np.stack(values, axis=0) for name, values in layer_values.items()}
    return months, latitudes, longitudes, stacked, units


def _sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def analyze_monthly_files(
    paths: Sequence[str | Path],
    *,
    minimum_regional_coverage: float = 0.80,
    minimum_spatial_months: int = 60,
    alpha: float = 0.05,
    hac_max_lag_months: int = 12,
) -> dict:
    months, latitudes, longitudes, layers, units = load_monthly_netcdf(paths)
    result = analyze_monthly_grids(
        months, latitudes, longitudes, layers, units=units,
        minimum_regional_coverage=minimum_regional_coverage,
        minimum_spatial_months=minimum_spatial_months,
        alpha=alpha,
        hac_max_lag_months=hac_max_lag_months,
    )
    result["input_files"] = [
        {"filename": path.name, "sha256": _sha256(path)} for path in paths
    ]
    return result


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Analyze a complete sequence of one-record-per-month GLDAS regional NetCDF exports."
    )
    parser.add_argument("input", type=Path, help="Directory containing monthly .nc4 files")
    parser.add_argument("--output", type=Path, default=Path("trend_analysis.json"))
    parser.add_argument("--minimum-regional-coverage", type=float, default=0.80)
    parser.add_argument("--minimum-spatial-months", type=int, default=60)
    parser.add_argument("--alpha", type=float, default=0.05)
    parser.add_argument("--hac-max-lag-months", type=int, default=12)
    args = parser.parse_args(argv)
    paths = sorted(args.input.glob("*.nc4"))
    if not paths:
        parser.error(f"No .nc4 files found in {args.input}.")
    result = analyze_monthly_files(
        paths,
        minimum_regional_coverage=args.minimum_regional_coverage,
        minimum_spatial_months=args.minimum_spatial_months,
        alpha=args.alpha,
        hac_max_lag_months=args.hac_max_lag_months,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Analysis written to {args.output} ({result['months']['count']} months).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
