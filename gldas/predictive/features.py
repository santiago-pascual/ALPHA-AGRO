"""Causal as-of feature construction for monthly, cell-level forecasts."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .contract import VALUE_COLUMNS, validate_frame


def make_supervised(panel: pd.DataFrame, *, horizon: int, n_lags: int = 6) -> tuple[pd.DataFrame, list[str]]:
    """Create one row per cell and issue month; features use only released records.

    Issue time is the last nanosecond of the origin month. The target is the
    monthly observation ``horizon`` calendar months later. Release timestamps
    are honored per row; no full-record climatology is calculated here.
    """
    validate_frame(panel)
    if horizon not in (1, 2, 3):
        raise ValueError("Forecast horizon must be 1, 2, or 3 months.")
    if n_lags < 1:
        raise ValueError("n_lags must be positive.")
    values = VALUE_COLUMNS
    data = panel.copy()
    data["month"] = pd.to_datetime(data["month"], utc=True)
    data["available_at"] = pd.to_datetime(data["available_at"], utc=True)
    data = data.sort_values(["cell_id", "month"], kind="stable")
    by_cell = {cell: group.reset_index(drop=True) for cell, group in data.groupby("cell_id", sort=True)}
    rows: list[dict] = []
    columns: list[str] = []
    months = pd.DatetimeIndex(sorted(data["month"].unique()))
    for origin in months:
        issue = origin + pd.offsets.MonthBegin(1) - pd.Timedelta(nanoseconds=1)
        target_month = origin + pd.DateOffset(months=horizon)
        for cell, group in by_cell.items():
            target_row = group.loc[group["month"].eq(target_month)]
            if target_row.empty:
                continue
            released = group.loc[group["available_at"].le(issue) & group["month"].le(origin)]
            if released.empty:
                continue
            record = {
                "cell_id": cell,
                "origin_month": origin,
                "issue_time": issue,
                "target_month": target_month,
                "target_available_at": target_row.iloc[0]["available_at"],
                "horizon_months": horizon,
                "target_soil_water_mm": target_row.iloc[0]["soil_water_mm"],
                "target_valid": bool(target_row.iloc[0]["soil_water_valid"]),
                "area_weight": float(target_row.iloc[0]["area_weight"]),
                "latitude": float(target_row.iloc[0]["latitude"]),
                "longitude": float(target_row.iloc[0]["longitude"]),
            }
            for lag in range(n_lags):
                source = released.iloc[-1 - lag] if len(released) > lag else None
                for name in values:
                    feature = f"{name}_lag_{lag}"
                    if feature not in columns:
                        columns.append(feature)
                    record[feature] = (float(source[name]) if source is not None
                                       and bool(source[name.replace("_mm_month", "_valid").replace("_c", "_valid")]
                                                     if name != "soil_water_mm" else source["soil_water_valid"])
                                       and pd.notna(source[name]) else np.nan)
                age_name = f"available_age_months_lag_{lag}"
                source_month_name = f"soil_water_source_month_lag_{lag}"
                if age_name not in columns:
                    columns.append(age_name)
                if source_month_name not in columns:
                    columns.append(source_month_name)
                record[age_name] = (int((origin.year - source["month"].year) * 12 + origin.month - source["month"].month)
                                    if source is not None else np.nan)
                record[source_month_name] = int(source["month"].month) if source is not None else np.nan
            month_angle = 2 * np.pi * (target_month.month - 1) / 12
            record["target_month_sin"] = float(np.sin(month_angle))
            record["target_month_cos"] = float(np.cos(month_angle))
            for name in ("target_month_sin", "target_month_cos"):
                if name not in columns:
                    columns.append(name)
            rows.append(record)
    result = pd.DataFrame(rows)
    if result.empty:
        raise ValueError("No supervised rows are available at the requested horizon and release times.")
    result = result.loc[result["target_valid"] & result["target_soil_water_mm"].notna()].reset_index(drop=True)
    if result.empty:
        raise ValueError("No valid soil-water targets remain after applying masks.")
    return result, columns
