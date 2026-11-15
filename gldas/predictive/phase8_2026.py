"""Integrate bounded GLDAS 2026 granules and issue current experimental forecasts.

The historical training/calibration/holdout boundaries are frozen from Phase 5B.
All 2026 source files are date-stamped as locally verified during this run; their
provider first-public-access times are not inferred from catalog update dates.
"""
from __future__ import annotations

import argparse
from calendar import monthrange
from datetime import date, datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
from typing import Any

import jsonschema
import netCDF4 as nc
import numpy as np
import pandas as pd
import requests

from ..acquisition import PRODUCTS, discover
from .contract import MASK_COLUMNS, REQUIRED_COLUMNS, VALUE_COLUMNS, read_parquet, validate_frame, write_parquet
from .evaluation import _baseline_predictions, _target_values
from .features import make_supervised
from .forecast import CALIBRATION, HOLDOUT, available_rows, instant, issue_month, iso_utc, uncertainty
from .metrics import regression_metrics
from .spatial import weighted_radius

HISTORICAL_POLICY = "assumed_release_lag_5_calendar_months"
EXTENDED_POLICY = "historical_assumed_release_lag_5_months__2026_verified_local_access"
COLLECTION = PRODUCTS["monthly"].collection
DOI = PRODUCTS["monthly"].doi
LAYERS = ("SoilMoi0_10cm_inst", "SoilMoi10_40cm_inst", "SoilMoi40_100cm_inst")
LAYER_CAPS = (100.0, 300.0, 600.0)
DRIVERS = ("Rainf_f_tavg", "Evap_tavg", "Tair_f_inst", "Qs_acc", "Qsb_acc")
DRIVER_UNITS = ("kg m-2 s-1", "kg m-2 s-1", "K", "kg m-2", "kg m-2")
ANALYSIS_COLUMNS = (
    "soil_water_mm", "precipitation_mm_month", "evapotranspiration_mm_month",
    "air_temperature_c", "surface_runoff_mm_month", "subsurface_runoff_mm_month",
)
RAW_TO_PANEL = dict(zip(DRIVERS, ANALYSIS_COLUMNS[1:], strict=True))
MASK_FOR_PANEL = dict(zip(ANALYSIS_COLUMNS, MASK_COLUMNS, strict=True))
GRID_BOUNDS = [-64.0, -38.0, -57.0, -30.0]
HORIZONS = (1, 2, 3)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def json_write_exclusive(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(payload, stream, indent=2, allow_nan=False)
        stream.write("\n")


def convert_driver(name: str, values: np.ndarray, month: pd.Timestamp) -> np.ndarray:
    days = monthrange(month.year, month.month)[1]
    if name in ("Rainf_f_tavg", "Evap_tavg"):
        return values * days * 86400.0
    if name == "Tair_f_inst":
        return values - 273.15
    if name in ("Qs_acc", "Qsb_acc"):
        return values * days * 8.0
    raise ValueError(f"Unexpected GLDAS driver: {name}")


def future_target_month(issue: pd.Timestamp, horizon: int) -> pd.Timestamp:
    issue = pd.Timestamp(issue)
    if issue.tzinfo is None or issue.utcoffset().total_seconds() != 0 or horizon not in HORIZONS:
        raise ValueError("Use an explicit UTC issue and a 1-, 2-, or 3-month calendar horizon.")
    return issue.normalize().replace(day=1) + pd.DateOffset(months=horizon)


def bounded_storage_interval(value: float, radius: float) -> dict[str, float]:
    """Clip a residual interval to physical 0–1000 mm GLDAS 0–100 cm bounds."""
    if not np.isfinite(value) or not np.isfinite(radius) or radius < 0:
        raise ValueError("A finite storage point and non-negative residual radius are required.")
    return {"lower": max(0.0, float(value) - float(radius)),
            "upper": min(1000.0, float(value) + float(radius))}


def _date_from_cf(value: Any) -> pd.Timestamp:
    result = pd.Timestamp(value)
    if result.tzinfo is None:
        result = result.tz_localize("UTC")
    else:
        result = result.tz_convert("UTC")
    return result


def _cell_positions(template: pd.DataFrame, latitudes: np.ndarray, longitudes: np.ndarray):
    def find(values: np.ndarray, target: float, axis: str) -> int:
        found = np.flatnonzero(np.isclose(values.astype(float), target, rtol=0, atol=1e-6))
        if found.size != 1:
            raise ValueError(f"Historical {axis} coordinate {target} is not unique on the raw GLDAS grid.")
        return int(found[0])

    return [
        (find(latitudes, float(row.latitude), "latitude"),
         find(longitudes, float(row.longitude), "longitude"))
        for row in template.itertuples(index=False)
    ]


def _extract(ds: nc.Dataset, name: str, positions: list[tuple[int, int]]) -> np.ndarray:
    variable = ds[name]
    if variable.dimensions != ("time", "lat", "lon") or variable.shape[0] != 1:
        raise ValueError(f"Unexpected dimensions or time count for {name}.")
    lat_index = np.array([point[0] for point in positions], dtype=int)
    lon_index = np.array([point[1] for point in positions], dtype=int)
    lat_low, lat_high = int(lat_index.min()), int(lat_index.max()) + 1
    lon_low, lon_high = int(lon_index.min()), int(lon_index.max()) + 1
    # Read a small contiguous hyperslab, then sample the exact historical
    # coordinate pairs. netCDF4 vector indexes are orthogonal (Cartesian),
    # unlike NumPy's paired advanced indexing, and would allocate 896×896.
    slab = np.ma.asarray(variable[0, slice(lat_low, lat_high), slice(lon_low, lon_high)])
    values = slab[lat_index - lat_low, lon_index - lon_low]
    result = np.asarray(values.filled(np.nan), dtype=float)
    result[np.ma.getmaskarray(values)] = np.nan
    if not np.isfinite(result[np.isfinite(result)]).all():
        raise ValueError(f"Non-finite unmasked values in {name}.")
    return result


def _cmr_records(session: requests.Session) -> dict[str, dict[str, Any]]:
    start, end = date(2026, 1, 1), date(2026, 7, 31)
    granules = discover(session, PRODUCTS["monthly"], start, end, 7)
    response = session.get(
        "https://cmr.earthdata.nasa.gov/search/granules.umm_json",
        params={
            "collection_concept_id": COLLECTION,
            "temporal": f"{start}T00:00:00Z,{end}T23:59:59.999Z",
            "page_size": 8,
        }, timeout=(10, 45),
    )
    response.raise_for_status()
    umm = response.json().get("items", [])
    result = {}
    for item in umm:
        metadata = item["umm"]
        filename = metadata["GranuleUR"].split(":")[-1]
        dates = metadata.get("ProviderDates", [])
        result[filename] = {
            "cmr_concept_id": item.get("meta", {}).get("concept-id"),
            "production_datetime": metadata.get("ProductionDateTime"),
            "provider_dates": {entry.get("Type"): entry.get("Date") for entry in dates},
        }
    if len(granules) != 7 or len(result) != 7:
        raise ValueError("CMR must return exactly one granule for each January–July 2026 month.")
    for item in granules:
        row = result.get(item["filename"])
        if row is None:
            raise ValueError(f"CMR UMM metadata is missing {item['filename']}.")
        item["cmr_metadata"] = row
    return {item["filename"]: item for item in granules}


def _masked_historical_support(panel: pd.DataFrame) -> dict[str, pd.Series]:
    result = {}
    grouped = panel.groupby("cell_id", sort=False)
    for value, mask in zip(VALUE_COLUMNS, MASK_COLUMNS, strict=True):
        support = grouped[mask].all().astype(bool)
        if not support.any():
            raise ValueError(f"Historical panel has no stable support for {value}.")
        result[value] = support
    return result


def _preliminary_crosscheck(path: Path, months: list[pd.DataFrame]) -> dict[str, Any]:
    preliminary = pd.read_parquet(path)
    expected_columns = {"time", "lat", "lon", "soil_moisture_0_100cm", "source_file"}
    if set(preliminary.columns) != expected_columns:
        raise ValueError("Preliminary regional Parquet schema differs from the expected five-column extraction.")
    if preliminary.duplicated(["time", "lat", "lon"]).any():
        raise ValueError("Preliminary Parquet has duplicate time/coordinate rows.")
    if preliminary["time"].dt.tz is not None:
        raise ValueError("Preliminary Parquet time should be interpreted as naive UTC month starts, not local time.")
    preliminary["time"] = pd.to_datetime(preliminary["time"], utc=True)
    preliminary["lat_key"] = preliminary["lat"].round(6)
    preliminary["lon_key"] = preliminary["lon"].round(6)
    errors = []
    month_reports = []
    for frame in months:
        month = frame["month"].iloc[0]
        name = frame["source_file"].iloc[0]
        selection = preliminary.loc[preliminary["time"].eq(month)]
        if len(selection) != 2240 or set(selection["source_file"]) != {name}:
            raise ValueError(f"Preliminary extraction does not contain exactly 2,240 rows for {name}.")
        by_coord = selection.set_index(["lat_key", "lon_key"])["soil_moisture_0_100cm"]
        matched = []
        missing = 0
        for row in frame.itertuples(index=False):
            value = by_coord.get((round(float(row.latitude), 6), round(float(row.longitude), 6)), np.nan)
            expected = float(row.soil_water_mm) if row.soil_water_valid else np.nan
            if np.isfinite(expected) and np.isfinite(value):
                matched.append(abs(expected - float(value)))
            elif np.isfinite(expected) != np.isfinite(value):
                missing += 1
        month_reports.append({"month": month.strftime("%Y-%m"), "preliminary_rows": len(selection),
                              "matched_valid_cells": len(matched), "mask_disagreements": missing,
                              "max_abs_difference_mm": max(matched, default=None)})
        errors.extend(matched)
    max_error = max(errors, default=0.0)
    mask_disagreements = sum(row["mask_disagreements"] for row in month_reports)
    if mask_disagreements:
        raise ValueError(f"Preliminary extraction has {mask_disagreements} cell-mask disagreements on the exact grid.")
    if max_error > 2e-4:
        raise ValueError(f"Preliminary extraction differs from exact-grid NetCDF sums by {max_error} mm.")
    return {"preliminary_file": str(path), "shape": list(preliminary.shape),
            "bounding_grid": {"lat_count": int(preliminary["lat"].nunique()),
                              "lon_count": int(preliminary["lon"].nunique())},
            "rows_per_month": 2240, "duplicate_rows": 0, "valid_rows": int(preliminary["soil_moisture_0_100cm"].notna().sum()),
            "valid_cell_months_in_historical_grid": len(errors), "mask_disagreements": mask_disagreements,
            "max_abs_difference_mm": max_error, "months": month_reports,
            "disposition": "Cross-check only; production panel extracted from original NetCDF on exact historical grid."}


def _regionalize(frame: pd.DataFrame, *, expected_support: set[str] | None = None,
                 reference_area_weight: float | None = None,
                 reference_latitude: float | None = None,
                 reference_longitude: float | None = None) -> pd.DataFrame:
    metadata = [column for column in REQUIRED_COLUMNS if column not in {
        "cell_id", "latitude", "longitude", *VALUE_COLUMNS, *MASK_COLUMNS, "area_weight",
    }]
    rows = []
    for _, group in frame.groupby("month", sort=True):
        if group[metadata].nunique(dropna=False).ne(1).any():
            raise ValueError("Regional aggregation requires consistent per-month source and timing provenance.")
        common = group.loc[group[list(MASK_COLUMNS)].all(axis=1)]
        common_cells = set(common["cell_id"].astype(str))
        if expected_support is not None and common_cells != expected_support:
            raise ValueError("The new regional panel common-valid grid differs from the historical GLDAS support.")
        weights = common["area_weight"].to_numpy(dtype=float)
        coverage = weights.sum() / group["area_weight"].sum()
        if coverage < 0.8:
            raise ValueError(f"Regional common-valid area {coverage:.3%} is below the 80% contract threshold.")
        averages = np.average(common[["latitude", "longitude", *VALUE_COLUMNS]], axis=0, weights=weights)
        if reference_latitude is not None:
            averages[0] = reference_latitude
        if reference_longitude is not None:
            averages[1] = reference_longitude
        row = {**group.iloc[0][metadata].to_dict(),
               **dict(zip(("latitude", "longitude", *VALUE_COLUMNS), averages, strict=True)),
               **dict.fromkeys(MASK_COLUMNS, True), "cell_id": "pampas-study-box",
               "area_weight": float(reference_area_weight if reference_area_weight is not None else weights.sum())}
        rows.append(row)
    return pd.DataFrame(rows, columns=REQUIRED_COLUMNS)


def integrate(historical_spatial_path: Path, historical_regional_path: Path, raw_dir: Path,
              preliminary_path: Path, output_dir: Path) -> dict[str, Any]:
    destinations = [output_dir / name for name in (
        "monthly_panel.parquet", "regional_panel.parquet", "MANIFEST.json", "validation_report.json")]
    conflicts = [path for path in destinations if path.exists()]
    if conflicts:
        raise FileExistsError("Refusing to overwrite Phase 8 output(s): " + ", ".join(map(str, conflicts)))

    historical = read_parquet(historical_spatial_path)
    historical_region = read_parquet(historical_regional_path)
    base_spatial_sha = sha256(historical_spatial_path)
    base_region_sha = sha256(historical_regional_path)
    if historical["month"].nunique() != 240 or historical["month"].max() != pd.Timestamp("2025-12-01", tz="UTC"):
        raise ValueError("Expected the verified January 2006–December 2025 spatial panel.")
    if historical["availability_policy"].nunique() != 1 or not historical["availability_policy"].eq(HISTORICAL_POLICY).all():
        raise ValueError("Historical Phase 5A availability policy differs from its verified manifest.")
    cells = historical.loc[historical["month"].eq(historical["month"].max())].sort_values("cell_id").copy()
    if len(cells) != 896 or cells["cell_id"].nunique() != 896:
        raise ValueError("Expected the complete 896-cell Phase 5A grid.")
    support = _masked_historical_support(historical)
    raw_files = sorted(raw_dir.glob("*.nc4"))
    expected_names = [f"GLDAS_NOAH025_M.A2026{month:02d}.021.nc4" for month in range(1, 8)]
    if [path.name for path in raw_files] != expected_names:
        raise ValueError(f"Raw directory must contain exactly the seven ordered files {expected_names}.")

    with requests.Session() as session:
        session.trust_env = False
        cmr = _cmr_records(session)
    reference_raw_shas = {path.name: sha256(path) for path in raw_files}
    accessed_at = pd.Timestamp(datetime.now(timezone.utc))
    all_new_rows = []
    source_provenance = []
    anomaly_checks = []
    for path in raw_files:
        source = cmr[path.name]
        month_text = path.name.split("A2026", 1)[1][:2]
        month = pd.Timestamp(f"2026-{month_text}-01", tz="UTC")
        expected_end = month + pd.offsets.MonthBegin(1)
        with nc.Dataset(path) as ds:
            if ds.data_model != "NETCDF4" or "GLDAS2.1" not in getattr(ds, "title", ""):
                raise ValueError(f"Unexpected NetCDF product title/model in {path.name}.")
            if {"time": len(ds.dimensions["time"]), "lat": len(ds.dimensions["lat"]),
                "lon": len(ds.dimensions["lon"]), "bnds": len(ds.dimensions["bnds"])} != {
                    "time": 1, "lat": 600, "lon": 1440, "bnds": 2}:
                raise ValueError(f"Unexpected dimensions in {path.name}.")
            time = ds["time"]
            calendar = getattr(time, "calendar", "standard")
            times = nc.num2date(time[:], time.units, calendar=calendar, only_use_cftime_datetimes=False)
            bounds = nc.num2date(ds["time_bnds"][:], time.units, calendar=calendar,
                                 only_use_cftime_datetimes=False)
            obs_start = _date_from_cf(times[0])
            obs_start_bound = _date_from_cf(bounds[0][0])
            obs_end = _date_from_cf(bounds[0][1])
            if obs_start != month or obs_start_bound != month or obs_end != expected_end:
                raise ValueError(f"NetCDF time/bounds do not describe {month:%Y-%m} in {path.name}.")
            lat = np.asarray(ds["lat"][:], dtype=float)
            lon = np.asarray(ds["lon"][:], dtype=float)
            if ds["lat"].units != "degrees_north" or ds["lon"].units != "degrees_east":
                raise ValueError(f"Unexpected coordinate units in {path.name}.")
            positions = _cell_positions(cells, lat, lon)
            raw_fields = {}
            expected_variables = (*LAYERS, "SoilMoi100_200cm_inst", "RootMoist_inst", *DRIVERS)
            for name in expected_variables:
                var = ds[name]
                if var.dimensions != ("time", "lat", "lon") or var.shape != (1, 600, 1440):
                    raise ValueError(f"Unexpected dimensions for {name} in {path.name}.")
                expected_unit = "kg m-2" if name in LAYERS or name in ("SoilMoi100_200cm_inst", "RootMoist_inst", "Qs_acc", "Qsb_acc") else (
                    "K" if name == "Tair_f_inst" else "kg m-2 s-1")
                if var.units != expected_unit or getattr(var, "cell_methods", "") != "time: mean" or getattr(var, "_FillValue", None) != -9999.0:
                    raise ValueError(f"Unexpected units, cell methods or fill value for {name} in {path.name}.")
                raw_fields[name] = _extract(ds, name, positions)
            layer_values = [raw_fields[name] for name in LAYERS]
            layer_valid = np.logical_and.reduce([np.isfinite(values) for values in layer_values])
            for name, values, cap in zip(LAYERS, layer_values, LAYER_CAPS, strict=True):
                if np.any(values[np.isfinite(values)] < 0) or np.any(values[np.isfinite(values)] > cap + 0.001):
                    raise ValueError(f"Physical bound failed for {name} in {path.name}.")
            soil = np.sum(np.vstack(layer_values), axis=0)
            soil = np.where(layer_valid, soil, np.nan)
            if np.any(np.isfinite(soil) & ((soil < 0) | (soil > 1000.001))):
                raise ValueError(f"0–100 cm storage is outside the physical range in {path.name}.")

            base = cells.copy().reset_index(drop=True)
            base["month"] = month
            base["observation_start"] = obs_start
            base["observation_end"] = obs_end
            # Keep the old assumption for 2006–2025. For these new inputs, the
            # availability stamp is the successful local verification in this run.
            base["available_at"] = accessed_at
            base["availability_policy"] = EXTENDED_POLICY
            granule_id = source["granule_id"]
            source_sha = reference_raw_shas[path.name]
            base["soil_granule_id"] = granule_id
            base["driver_granule_id"] = granule_id
            base["soil_sha256"] = source_sha
            base["driver_sha256"] = source_sha
            soil_support = base["cell_id"].map(support["soil_water_mm"]).to_numpy(dtype=bool)
            base["soil_water_valid"] = soil_support & layer_valid
            base["soil_water_mm"] = np.where(base["soil_water_valid"], soil, np.nan)
            # The project target is the sum of the first three soil layers (0–100 cm).
            for raw_name, panel_name in RAW_TO_PANEL.items():
                converted = convert_driver(raw_name, raw_fields[raw_name], month)
                if raw_name in ("Rainf_f_tavg", "Qs_acc", "Qsb_acc") and np.any(np.isfinite(converted) & (converted < -1e-7)):
                    raise ValueError(f"Negative precipitation/runoff in {path.name}.")
                if raw_name == "Tair_f_inst" and np.any(np.isfinite(converted) & ((converted < -100) | (converted > 70))):
                    raise ValueError(f"Air temperature outside broad physical bounds in {path.name}.")
                source_valid = np.isfinite(converted)
                cell_support = base["cell_id"].map(support[panel_name]).to_numpy(dtype=bool)
                mask_name = MASK_FOR_PANEL[panel_name]
                base[mask_name] = cell_support & source_valid
                base[panel_name] = np.where(base[mask_name], converted, np.nan)
            base["source_file"] = path.name
            all_new_rows.append(base)
            history_text = str(getattr(ds, "history", ""))
            stat = path.stat()
            source_provenance.append({
                **source, "bytes": path.stat().st_size, "sha256": source_sha,
                "local_file_created_utc": iso_utc(pd.Timestamp(datetime.fromtimestamp(stat.st_ctime, timezone.utc))),
                "local_file_last_write_utc": iso_utc(pd.Timestamp(datetime.fromtimestamp(stat.st_mtime, timezone.utc))),
                "local_verified_at": iso_utc(accessed_at),
                "netcdf_title": ds.title, "netcdf_institution": getattr(ds, "institution", None),
                "netcdf_source": getattr(ds, "source", None), "netcdf_history": history_text,
                "observation_start": iso_utc(obs_start), "observation_end_exclusive": iso_utc(obs_end),
                "availability_interpretation": "Raw file verified locally in this run; provider first-public-access time is not inferred from CMR ProviderDates or NetCDF history.",
                "valid_soil_cells": int(base["soil_water_valid"].sum()),
                "valid_cells_by_variable": {name: int(base[MASK_FOR_PANEL[name]].sum()) for name in VALUE_COLUMNS},
                "variables_used": list(LAYERS) + list(DRIVERS),
                "variables_not_used_for_target": ["SoilMoi100_200cm_inst", "RootMoist_inst"],
            })

            month_climatology = historical.loc[
                historical["month"].dt.month.eq(month.month) & historical["soil_water_valid"]
            ].groupby("cell_id")["soil_water_mm"].median()
            hist_min = historical.loc[
                historical["month"].dt.month.eq(month.month) & historical["soil_water_valid"]
            ].groupby("cell_id")["soil_water_mm"].min()
            hist_max = historical.loc[
                historical["month"].dt.month.eq(month.month) & historical["soil_water_valid"]
            ].groupby("cell_id")["soil_water_mm"].max()
            row_values = base.set_index("cell_id")["soil_water_mm"]
            deltas = (row_values - month_climatology.reindex(row_values.index)).dropna()
            hist_min = hist_min.reindex(row_values.index)
            hist_max = hist_max.reindex(row_values.index)
            outside = ((row_values < hist_min) | (row_values > hist_max)).fillna(False)
            anomaly_checks.append({
                "month": month.strftime("%Y-%m"), "valid_cells": int(base["soil_water_valid"].sum()),
                "median_difference_from_2006_2025_same_calendar_month_mm": float(deltas.median()),
                "median_absolute_difference_mm": float(deltas.abs().median()),
                "cells_outside_historical_same_month_minmax": int(outside.sum()),
                "cells_checked": int(base["soil_water_valid"].sum()),
                "interpretation": "Flag for review only; values outside a 20-sample historical range are not automatically invalid.",
            })

    preliminary = _preliminary_crosscheck(preliminary_path, all_new_rows)
    new_spatial = pd.concat(all_new_rows, ignore_index=True)
    if len(new_spatial) != 7 * 896 or new_spatial["month"].nunique() != 7:
        raise ValueError("Expected exactly seven complete 896-cell month rows after extraction.")
    historical_copy = historical.copy()
    historical_copy["availability_policy"] = EXTENDED_POLICY
    extended_spatial = pd.concat([historical_copy, new_spatial.drop(columns=["source_file"])], ignore_index=True)
    extended_spatial = extended_spatial.sort_values(["month", "cell_id"], kind="stable").reset_index(drop=True)
    for column in ("month", "observation_start", "observation_end", "available_at"):
        extended_spatial[column] = pd.to_datetime(extended_spatial[column], utc=True)
    bad_coordinates = extended_spatial.groupby("cell_id")[["latitude", "longitude", "area_weight"]].nunique()
    if bad_coordinates.gt(1).any().any():
        bad = bad_coordinates.loc[bad_coordinates.gt(1).any(axis=1)].head(5).to_dict(orient="index")
        raise ValueError(f"Grid coordinate/weight continuity failed: {bad}")
    validate_frame(extended_spatial)

    historical_common = historical.loc[historical["month"].eq(historical["month"].max())
                                       & historical[list(MASK_COLUMNS)].all(axis=1)]
    historical_region_row = historical_region.sort_values("month").iloc[-1]
    new_regional = _regionalize(
        new_spatial.drop(columns=["source_file"]),
        expected_support=set(historical_common["cell_id"].astype(str)),
        reference_area_weight=float(historical_region_row["area_weight"]),
        reference_latitude=float(historical_region_row["latitude"]),
        reference_longitude=float(historical_region_row["longitude"]),
    )
    historical_region_copy = historical_region.copy()
    historical_region_copy["availability_policy"] = EXTENDED_POLICY
    extended_regional = pd.concat([historical_region_copy, new_regional], ignore_index=True)
    extended_regional = extended_regional.sort_values(["month", "cell_id"], kind="stable").reset_index(drop=True)
    for column in ("month", "observation_start", "observation_end", "available_at"):
        extended_regional[column] = pd.to_datetime(extended_regional[column], utc=True)
    bad_regional = extended_regional.groupby("cell_id")[["latitude", "longitude", "area_weight"]].nunique()
    if bad_regional.gt(1).any().any():
        weights = extended_regional.groupby("month")["area_weight"].first()
        raise ValueError(f"Regional grid support/weight changed by month: {weights.tail(8).to_dict()}")
    validate_frame(extended_regional)

    # Confirm that re-aggregating the archived spatial panel reproduces its saved regional series.
    rebuilt_historical_region = _regionalize(historical)
    compare_columns = ["soil_water_mm", *VALUE_COLUMNS[1:]]
    for column in compare_columns:
        left = rebuilt_historical_region.sort_values("month")[column].to_numpy(dtype=float)
        right = historical_region.sort_values("month")[column].to_numpy(dtype=float)
        if not np.allclose(left, right, rtol=0, atol=1e-9, equal_nan=True):
            raise ValueError(f"Historical spatial-to-regional compatibility failed for {column}.")
    for month, group in new_spatial.groupby("month"):
        region_row = new_regional.loc[new_regional["month"].eq(month)].iloc[0]
        common = group.loc[group[list(MASK_COLUMNS)].all(axis=1)]
        for column in VALUE_COLUMNS:
            expected = float(np.average(common[column], weights=common["area_weight"]))
            if not np.isclose(expected, region_row[column], rtol=0, atol=1e-10):
                raise ValueError(f"New spatial-to-regional consistency failed for {column} in {month:%Y-%m}.")

    output_dir.mkdir(parents=True, exist_ok=True)
    spatial_path = output_dir / "monthly_panel.parquet"
    regional_path = output_dir / "regional_panel.parquet"
    write_parquet(extended_spatial, spatial_path, availability_policy=EXTENDED_POLICY)
    write_parquet(extended_regional, regional_path, availability_policy=EXTENDED_POLICY)
    verified_spatial = read_parquet(spatial_path)
    verified_regional = read_parquet(regional_path)
    spatial_sha = sha256(spatial_path)
    regional_sha = sha256(regional_path)
    manifest = {
        "schema_version": "phase8_gldas_extension_manifest_v1",
        "product": "GLDAS Noah v2.1 monthly", "collection": COLLECTION, "doi": DOI,
        "first_month": "2006-01", "last_month": "2026-07", "months": 247,
        "grid_degrees": 0.25, "grid_cells": 896,
        "target_definition": {"name": "soil_water_mm", "variables": list(LAYERS),
                              "depth_cm": [0, 100], "operation": "sum of three GLDAS Noah layer monthly means",
                              "units": "kg m-2, numerically equivalent to mm water"},
        "availability_policy": EXTENDED_POLICY,
        "historical_availability": "2006-01 through 2025-12 retains the Phase 5A five-calendar-month assumption.",
        "extension_availability": "Jan-Jul 2026 files were verified locally at local_verified_at; this is not a NASA first-public-access timestamp.",
        "verified_at": iso_utc(accessed_at),
        "historical_inputs": {"spatial_panel": {"path": str(historical_spatial_path), "sha256": base_spatial_sha},
                              "regional_panel": {"path": str(historical_regional_path), "sha256": base_region_sha}},
        "outputs": {"monthly_panel": {"path": str(spatial_path), "rows": len(verified_spatial),
                                       "bytes": spatial_path.stat().st_size, "sha256": spatial_sha},
                    "regional_panel": {"path": str(regional_path), "rows": len(verified_regional),
                                       "bytes": regional_path.stat().st_size, "sha256": regional_sha}},
        "source_files": source_provenance,
    }
    validation = {
        "schema_version": "phase8_gldas_validation_v1", "status": "passed",
        "historical_months": 240, "extended_months": int(verified_spatial["month"].nunique()),
        "grid_cells": int(verified_spatial["cell_id"].nunique()),
        "spatial_rows": len(verified_spatial), "regional_rows": len(verified_regional),
        "valid_cells_by_variable_per_month": {
            name: sorted(verified_spatial.groupby("month")[MASK_FOR_PANEL[name]].sum().unique().tolist())
            for name in VALUE_COLUMNS},
        "soil_water_missing_cell_months_in_2026": int((7 * 896) - new_spatial["soil_water_valid"].sum()),
        "driver_missing_cell_months_in_2026": {
            name: int((7 * 896) - new_spatial[MASK_FOR_PANEL[name]].sum()) for name in VALUE_COLUMNS[1:]},
        "new_months": source_provenance,
        "preliminary_parquet_crosscheck": preliminary,
        "historical_same_month_distribution_checks": anomaly_checks,
        "original_panels_unchanged": {
            "spatial_sha256_before": base_spatial_sha, "spatial_sha256_after": sha256(historical_spatial_path),
            "regional_sha256_before": base_region_sha, "regional_sha256_after": sha256(historical_regional_path),
        },
        "spatial_to_regional_consistency": "Passed for all six measures in the 240-month historical panel and all seven new months.",
        "unit_conversions": {
            "soil_water_mm": "sum of SoilMoi0_10cm_inst, SoilMoi10_40cm_inst, SoilMoi40_100cm_inst; kg m-2 == mm water",
            "precipitation_mm_month": "Rainf_f_tavg * seconds in UTC calendar month",
            "evapotranspiration_mm_month": "Evap_tavg * seconds in UTC calendar month",
            "air_temperature_c": "Tair_f_inst - 273.15",
            "surface_runoff_mm_month": "Qs_acc * days in month * 8, matching project transform",
            "subsurface_runoff_mm_month": "Qsb_acc * days in month * 8, matching project transform",
        },
    }
    json_write_exclusive(output_dir / "MANIFEST.json", manifest)
    json_write_exclusive(output_dir / "validation_report.json", validation)
    return {"manifest": manifest, "validation": validation,
            "spatial_path": spatial_path, "regional_path": regional_path,
            "manifest_path": output_dir / "MANIFEST.json",
            "validation_path": output_dir / "validation_report.json"}


def _selected_evaluation(evaluation: dict[str, Any], scope: str, horizon: int) -> dict[str, Any]:
    if (evaluation.get("schema_version") != "predictive_evaluation_v1"
            or evaluation.get("status") != "retrospective_evaluation"
            or evaluation.get("evaluation", {}).get("holdout_period") != {"start": "2024-01", "end": "2025-12"}):
        raise ValueError("Expected the Phase 5B retrospective evaluation with the reserved 2024–2025 holdout.")
    rows = [row for row in evaluation.get("results", [])
            if row.get("scope") == scope and row.get("horizon_months") == horizon
            and row.get("target") == "storage"]
    if len(rows) != 1:
        raise ValueError(f"Expected one {scope} storage evaluation for horizon {horizon}.")
    row = rows[0]
    selected = [model for model in row.get("models", []) if model.get("selected_before_holdout") is True]
    if row.get("selected_model") != "seasonal_climatology" or len(selected) != 1 or selected[0].get("model") != "seasonal_climatology":
        raise ValueError(f"Phase 5B did not pre-holdout select seasonal climatology for {scope} h{horizon}.")
    return row


def _window(panel: pd.DataFrame, horizon: int, *, n_lags: int):
    features, _ = make_supervised(panel, horizon=horizon, n_lags=n_lags)
    train_cutoff = issue_month(CALIBRATION, horizon)
    calibration_cutoff = issue_month(HOLDOUT, horizon)
    train = features.loc[features["target_available_at"].le(train_cutoff)].copy()
    cal = features.loc[features["target_month"].ge(CALIBRATION)
                       & features["target_month"].lt(HOLDOUT)
                       & features["target_available_at"].le(calibration_cutoff)].copy()
    test = features.loc[features["target_month"].ge(HOLDOUT)
                        & features["target_month"].lt(pd.Timestamp("2026-01-01", tz="UTC"))].copy()
    if (train["target_month"].nunique() < 24 or cal["target_month"].nunique() < 12
            or test["target_month"].nunique() != 24
            or not train["target_month"].max() < cal["target_month"].min() < test["target_month"].min()):
        raise ValueError("Historical fit, calibration and holdout windows are incomplete or overlap.")
    return train, cal, test, train_cutoff, calibration_cutoff


def _historical_reference(scope: str, horizon: int) -> dict[str, Any]:
    if scope == "regional":
        names = {1: "forecast_v1_h1.json", 2: "forecast_v1_h2.json", 3: "forecast_v1.json"}
        path = Path("data/analysis/phase6/monthly-mvp-2025-09") / names[horizon]
        artifact = json.loads(path.read_text(encoding="utf-8"))
        return {"metrics": artifact["out_of_sample"]["metrics"],
                "calibration": artifact["calibration"]["metrics"], "sha256": sha256(path)}
    if scope == "spatial":
        path = Path("artifacts/phase7/spatial_hindcast_2025-09-30.json.gz")
        with gzip.open(path, "rt", encoding="utf-8") as stream:
            artifact = json.load(stream)
        row = next(row for row in artifact["results"]
                   if row["horizon_months"] == horizon and row["target"] == "storage")
        return {"metrics": row["holdout"]["metrics"],
                "calibration": row["calibration"], "sha256": sha256(path)}
    raise ValueError("Unknown historical forecast scope.")


def _input_month_records(panel: pd.DataFrame, issue: pd.Timestamp, latest: pd.Timestamp,
                         verified_at: str) -> list[dict[str, Any]]:
    visible = available_rows(panel, issue)
    months = sorted(visible["month"].drop_duplicates())[-12:]
    rows = []
    for month in months:
        group = visible.loc[visible["month"].eq(month)]
        if group.empty:
            continue
        first = group.iloc[0]
        local = month.year == 2026
        rows.append({
            "month": month.strftime("%Y-%m"),
            "observation_start": iso_utc(first["observation_start"]),
            "observation_end": iso_utc(first["observation_end"]),
            "provider_publication_at": None,
            "available_at": iso_utc(first["available_at"]),
            "availability_is_assumed": not local,
            "local_file_verified_at": verified_at if local else None,
            "soil_sha256": first["soil_sha256"],
            "driver_sha256": first["driver_sha256"],
            "source_granule_id": first["soil_granule_id"],
        })
    if not rows or pd.Timestamp(rows[-1]["month"] + "-01", tz="UTC") != latest:
        raise ValueError("The input-month provenance list does not end with the latest issue-available observation.")
    return rows


def _current_request(panel: pd.DataFrame, issue: pd.Timestamp, target_month: pd.Timestamp,
                     training: pd.DataFrame, n_lags: int = 6) -> tuple[pd.DataFrame, pd.Timestamp, pd.DataFrame]:
    visible = available_rows(panel, issue).sort_values("month")
    latest = pd.Timestamp(visible["month"].max())
    recent_months = visible["month"].drop_duplicates().nlargest(12)
    if len(recent_months) != 12:
        raise ValueError("Current indicators require twelve causally available monthly observations.")
    last = visible.loc[visible["month"].eq(latest)].set_index("cell_id")
    supported = set(training["cell_id"].astype(str).unique())
    keep = last["soil_water_valid"].astype(bool) & last.index.isin(supported)
    if not keep.any():
        raise ValueError("No issue-available current cells overlap the validated training support.")
    current = last.loc[keep].reset_index()[["cell_id", "area_weight"]].copy()
    current["target_month"] = target_month
    current["soil_water_mm_lag_0"] = last.loc[keep, "soil_water_mm"].to_numpy(dtype=float)
    current["soil_water_source_month_lag_0"] = latest.month
    current["available_age_months_lag_0"] = (issue.year - latest.year) * 12 + issue.month - latest.month
    return current, latest, last


def build_forecasts(spatial_path: Path, regional_path: Path, evaluation_path: Path,
                    manifest_path: Path, schema_path: Path, bundle_schema_path: Path,
                    issue: pd.Timestamp) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    issue = pd.Timestamp(issue)
    if issue.tzinfo is None or issue.utcoffset().total_seconds() != 0 or issue.strftime("%Y-%m-%d") != "2026-11-15":
        raise ValueError("Phase 8 current forecast issue must be an explicit UTC time on 2026-11-15.")
    spatial = read_parquet(spatial_path)
    regional = read_parquet(regional_path)
    evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if spatial["availability_policy"].iloc[0] != EXTENDED_POLICY or regional["availability_policy"].iloc[0] != EXTENDED_POLICY:
        raise ValueError("Current forecast requires the verified Phase 8 mixed-availability panels.")
    if manifest.get("outputs", {}).get("monthly_panel", {}).get("sha256") != sha256(spatial_path):
        raise ValueError("The Phase 8 manifest does not bind to the supplied spatial panel.")
    if manifest.get("outputs", {}).get("regional_panel", {}).get("sha256") != sha256(regional_path):
        raise ValueError("The Phase 8 manifest does not bind to the supplied regional panel.")
    verified_at = manifest.get("verified_at")
    if not verified_at or pd.Timestamp(verified_at) > issue:
        raise ValueError("Current input files were not locally verified before this forecast issue time.")
    if not (spatial.loc[spatial["month"].ge(pd.Timestamp("2026-01-01", tz="UTC")), "month"].nunique() == 7):
        raise ValueError("Expected the complete January–July 2026 extension.")

    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    bundle_schema = json.loads(bundle_schema_path.read_text(encoding="utf-8"))
    spatial_digest = sha256(spatial_path)
    regional_digest = sha256(regional_path)
    evaluation_digest = sha256(evaluation_path)
    manifest_digest = sha256(manifest_path)
    regional_records = []
    spatial_results = []
    for horizon in HORIZONS:
        target_month = future_target_month(issue, horizon)
        regional_eval = _selected_evaluation(evaluation, "regional", horizon)
        spatial_eval = _selected_evaluation(evaluation, "spatial", horizon)

        regional_train, regional_cal, regional_test, regional_train_cut, regional_cal_cut = _window(regional, horizon, n_lags=6)
        r_targets = pd.concat([regional_cal, regional_test], ignore_index=True)
        r_y_train, r_truth, r_defs = _target_values(regional_train, r_targets, "storage")
        r_baselines = _baseline_predictions(regional_train, r_targets, "storage", r_y_train, r_defs)
        r_cal_n = len(regional_cal)
        r_radius = uncertainty(r_baselines["seasonal_climatology"][:r_cal_n] - r_truth[:r_cal_n])
        r_metrics = regression_metrics(regional_test, r_truth[r_cal_n:],
                                       r_baselines["seasonal_climatology"][r_cal_n:],
                                       r_baselines["persistence"][r_cal_n:])
        regional_reference = _historical_reference("regional", horizon)
        for metric in ("rmse", "mae", "bias", "skill_vs_persistence"):
            if not np.isclose(r_metrics[metric], regional_reference["metrics"][metric], rtol=0, atol=1e-8):
                raise ValueError(f"Regional historical {metric} no longer reproduces the certified Phase A hindcast for horizon {horizon}.")
        r_request, r_latest, r_last = _current_request(regional, issue, target_month, regional_train)
        r_prediction = float(_baseline_predictions(regional_train, r_request, "storage", r_y_train, r_defs)["seasonal_climatology"][0])
        r_bounds = bounded_storage_interval(r_prediction, r_radius)
        r_test_predictions = r_baselines["seasonal_climatology"][r_cal_n:]
        r_test_bounds = [bounded_storage_interval(float(value), r_radius) for value in r_test_predictions]
        r_truth_test = r_truth[r_cal_n:]
        r_metrics["historical_unbounded_interval_coverage"] = float(np.mean(
            np.abs(r_test_predictions - r_truth_test) <= r_radius))
        r_metrics["physical_bounds_interval_coverage"] = float(np.mean([
            bound["lower"] <= truth <= bound["upper"]
            for bound, truth in zip(r_test_bounds, r_truth_test, strict=True)]))
        r_metrics["physical_bounds_interval_width_mm"] = float(np.mean([
            bound["upper"] - bound["lower"] for bound in r_test_bounds]))
        r_interval = {"level": 0.9, **r_bounds,
                      "method": "Chronological split absolute-residual quantile from the fixed 2022–2023 calibration window; interval truncated to physical 0–1000 mm storage bounds; not prospective calibration."}
        r_latest_row = r_last.iloc[0]
        target_end = target_month + pd.offsets.MonthBegin(1)
        regional_record = {
            "schema_version": "forecast_v1", "status": "experimental",
            "issue_time": iso_utc(issue), "target_month": target_month.strftime("%Y-%m"),
            "target_period": {"start": target_month.strftime("%Y-%m-%d"), "end_exclusive": target_end.strftime("%Y-%m-%d")},
            "horizon_months": horizon,
            "scope": {"id": "pampas-study-box", "bounds_west_south_east_north": GRID_BOUNDS,
                      "support": "Regional area-weighted Pampas study series; not a field or grid-cell forecast."},
            "target": "storage",
            "model": {"name": "seasonal_climatology", "version": "phase8-current-experimental-v1",
                      "selected_before_holdout": True, "selection_source_sha256": evaluation_digest,
                      "selection_evidence": "Phase 5B selected seasonal climatology for all 18 scope/horizon/target comparisons."},
            "input_observation_cutoff": iso_utc(r_latest_row["observation_end"]),
            "latest_available_observation_month": r_latest.strftime("%Y-%m"),
            "availability": {"policy": "historical five-month availability assumption; 2026 inputs locally verified before this issue",
                             "publication_evidence": None, "operationally_eligible": False,
                             "source_publication_time_verified": False,
                             "local_file_verified_at": verified_at,
                             "latency_days_from_latest_observation_end": int((issue - r_latest_row["observation_end"]).total_seconds() // 86400),
                             "input_months": _input_month_records(regional, issue, r_latest, verified_at)},
            "value": r_prediction, "units": "mm", "predictive_interval": r_interval,
            "climatological_reference_mm": r_prediction, "anomaly_mm": 0.0,
            "training": {"first_target": regional_train["target_month"].min().strftime("%Y-%m"),
                         "last_target": regional_train["target_month"].max().strftime("%Y-%m"),
                         "label_cutoff": iso_utc(regional_train_cut)},
            "calibration": {"start": regional_cal["target_month"].min().strftime("%Y-%m"),
                            "end": regional_cal["target_month"].max().strftime("%Y-%m"),
                            "labels_available_by": iso_utc(regional_cal_cut), "n_months": int(regional_cal["target_month"].nunique()),
                            "metrics": {"absolute_residual_radius_mm": r_radius}, "probability_recalibrated": False},
            "out_of_sample": {"period": ["2024-01", "2025-12"], "metrics": r_metrics,
                              "evaluation_source": "Phase 5B untouched chronological holdout; retrospective only."},
            "quality_flags": ["current_issue_experimental", "latest_input_is_2026-07", "source_first_publication_time_unverified",
                              "historical_validation_ends_2025-12", "no_prospective_2026_outcome_validation",
                              "climatology_is_not_a_dynamic_forecast", "soil_water_is_not_crop_yield_or_land_degradation"],
            "source": {"collection": COLLECTION, "doi": DOI, "input_panel_sha256": regional_digest,
                       "spatial_panel_sha256": spatial_digest, "evaluation_sha256": evaluation_digest,
                       "extension_manifest_sha256": manifest_digest,
                       "historical_hindcast_reference_sha256": regional_reference["sha256"]},
        }
        jsonschema.validate(regional_record, schema, format_checker=jsonschema.FormatChecker())
        regional_records.append(regional_record)

        spatial_train, spatial_cal, spatial_test, spatial_train_cut, spatial_cal_cut = _window(spatial, horizon, n_lags=1)
        s_targets = pd.concat([spatial_cal, spatial_test], ignore_index=True)
        s_y_train, s_truth, s_defs = _target_values(spatial_train, s_targets, "storage")
        s_baselines = _baseline_predictions(spatial_train, s_targets, "storage", s_y_train, s_defs)
        s_cal_n = len(spatial_cal)
        radius = weighted_radius(s_baselines["seasonal_climatology"][:s_cal_n] - s_truth[:s_cal_n],
                                 spatial_cal["area_weight"].to_numpy(dtype=float))
        s_metrics = regression_metrics(spatial_test, s_truth[s_cal_n:],
                                       s_baselines["seasonal_climatology"][s_cal_n:],
                                       s_baselines["persistence"][s_cal_n:])
        spatial_reference = _historical_reference("spatial", horizon)
        for metric in ("rmse", "mae", "bias", "skill_vs_persistence"):
            if not np.isclose(s_metrics[metric], spatial_reference["metrics"][metric], rtol=0, atol=1e-8):
                raise ValueError(f"Spatial historical {metric} no longer reproduces the Phase 7 hindcast for horizon {horizon}.")
        current, latest, last = _current_request(spatial, issue, target_month, spatial_train)
        s_predictions = _baseline_predictions(spatial_train, current, "storage", s_y_train, s_defs)["seasonal_climatology"]
        points = dict(zip(current["cell_id"].astype(str), s_predictions.astype(float), strict=True))
        current_cells = set(points)
        grid = last.copy()
        cells_out = []
        for cell_id, row in grid.iterrows():
            eligible = str(cell_id) in current_cells
            value = float(points[str(cell_id)]) if eligible else None
            bounds = bounded_storage_interval(value, radius) if eligible else None
            interval = {"level": 0.9, **bounds,
                        "method": "Pooled area-weighted cell-month calibration residual radius, truncated to physical 0–1000 mm storage bounds; marginal, no per-cell guarantee."} if eligible else None
            cells_out.append({"cell_id": str(cell_id), "latitude": float(row["latitude"]),
                              "longitude": float(row["longitude"]), "area_m2": float(row["area_weight"]),
                              "valid": eligible, "value": value, "units": "mm" if eligible else None,
                              "predictive_interval": interval,
                              "climatological_reference_mm": value,
                              "anomaly_mm": 0.0 if eligible else None})
        valid_rows = [cell for cell in cells_out if cell["valid"]]
        spatial_mean = float(np.average([cell["value"] for cell in valid_rows],
                                        weights=[cell["area_m2"] for cell in valid_rows]))
        if not np.isclose(spatial_mean, r_prediction, rtol=0, atol=1e-8):
            raise ValueError(f"Regional and spatial climatology predictions disagree for horizon {horizon}: {spatial_mean} vs {r_prediction}.")
        s_test_predictions = s_baselines["seasonal_climatology"][s_cal_n:]
        s_test_bounds = [bounded_storage_interval(float(value), radius) for value in s_test_predictions]
        s_truth_test = s_truth[s_cal_n:]
        s_weights = spatial_test["area_weight"].to_numpy(dtype=float)
        s_metrics["historical_unbounded_area_weighted_interval_coverage"] = float(np.average(
            np.abs(s_test_predictions - s_truth_test) <= radius, weights=s_weights))
        s_metrics["physical_bounds_area_weighted_interval_coverage"] = float(np.average(
            [bound["lower"] <= truth <= bound["upper"]
             for bound, truth in zip(s_test_bounds, s_truth_test, strict=True)], weights=s_weights))
        s_metrics["physical_bounds_mean_interval_width_mm"] = float(np.average(
            [bound["upper"] - bound["lower"] for bound in s_test_bounds], weights=s_weights))
        spatial_results.append({
            "horizon_months": horizon, "target_month": target_month.strftime("%Y-%m"), "target": "storage", "units": "mm",
            "model": "seasonal_climatology", "forecast_method": "Training-only cell/calendar-month climatology; same point as historical seasonal normal.",
            "latest_available_observation_month": latest.strftime("%Y-%m"),
            "calibration": {"start": spatial_cal["target_month"].min().strftime("%Y-%m"),
                            "end": spatial_cal["target_month"].max().strftime("%Y-%m"),
                            "n_months": int(spatial_cal["target_month"].nunique()),
                            "weighted_abs_residual_radius_mm": radius, "nominal_level": 0.9,
                            "interval_physical_bounds_mm": [0.0, 1000.0],
                            "per_cell_guarantee": False},
            "holdout": {"period": ["2024-01", "2025-12"], "metrics": s_metrics,
                        "validation_source": "Phase 7 frozen-fit chronological hindcast; retrospective only.",
                        "historical_hindcast_reference_sha256": spatial_reference["sha256"]},
            "regional_spatial_weighted_mean_mm": spatial_mean,
            "cells": cells_out,
        })

    bundle = {
        "schema_version": "phase8_forecast_bundle_v1", "status": "experimental",
        "classification": "current experimental forecast issued after local verification; not operationally eligible",
        "operationally_eligible": False, "issue_time": iso_utc(issue),
        "source_dataset": {"product": "GLDAS Noah v2.1 monthly", "collection": COLLECTION, "doi": DOI,
                           "historical_first_month": "2006-01", "historical_last_month": "2025-12",
                           "extension_first_month": "2026-01", "extension_last_month": "2026-07",
                           "spatial_grid_degrees": 0.25, "historical_panel_sha256": manifest["historical_inputs"]["spatial_panel"]["sha256"],
                           "extended_spatial_panel_sha256": spatial_digest,
                           "extended_regional_panel_sha256": regional_digest,
                           "extension_manifest_sha256": manifest_digest,
                           "phase5b_evaluation_sha256": evaluation_digest},
        "model": {"name": "seasonal_climatology", "version": "phase8-current-experimental-v1",
                  "selection_evidence": "Pre-holdout selected across all 18 Phase 5B configurations; no dynamic model substituted."},
        "target": {"name": "GLDAS Noah 0–100 cm soil-water storage", "variable": "soil_water_mm", "units": "mm",
                   "definition": "sum of SoilMoi0_10cm_inst + SoilMoi10_40cm_inst + SoilMoi40_100cm_inst; not RootMoist_inst or 0–200 cm storage"},
        "latest_available_observation_month": "2026-07",
        "input_observation_cutoff": iso_utc(pd.Timestamp("2026-08-01", tz="UTC")),
        "availability": {"policy": "Historical inputs retain the assumed 5-calendar-month cutoff; 2026 files were verified locally during this run before issue time.",
                         "local_verified_at": verified_at,
                         "provider_first_publication_time_verified": False,
                         "cmr_provider_insert_times_are_not_first_public_access": True,
                         "latency_days": int((issue - pd.Timestamp("2026-08-01", tz="UTC")).total_seconds() // 86400),
                         "near_real_time": False},
        "temporal_convention": {"issue_month": "2026-11", "horizon_semantics": "horizon h targets issue-month calendar start plus h months",
                                "target_months": [item["target_month"] for item in spatial_results]},
        "regional_forecasts": regional_records,
        "spatial_forecasts": {"grid_cells": 896, "eligible_cells": len([row for row in spatial_results[0]["cells"] if row["valid"]]),
                              "masked_cells": len([row for row in spatial_results[0]["cells"] if not row["valid"]]),
                              "spatial_resolution_degrees": 0.25,
            "uncertainty_note": "Pooled spatial calibration intervals are marginal across cell-months, truncated to physical 0–1000 mm bounds, and are not per-cell or simultaneous guarantees.",
                              "forecasts": spatial_results},
        "validation": {"status": "historical_method_reproduced; current targets not yet verifiable",
                       "chronological_holdout": {"start": "2024-01", "end": "2025-12", "reserved_for_selection": False,
                                                  "is_retrospective": True},
                       "training_target_cutoffs_by_horizon": {
                           str(h): iso_utc(issue_month(CALIBRATION, h)) for h in HORIZONS},
                       "calibration_cutoffs_by_horizon": {
                           str(h): iso_utc(issue_month(HOLDOUT, h)) for h in HORIZONS},
                       "no_future_target_data_used": True,
                       "regional_spatial_consistency": "Area-weighted spatial forecasts equal regional forecasts for all three horizons."},
        "limitations": [
            "This issue timestamp is after the source files were locally verified; it does not reconstruct earlier NASA first-public-access times.",
            "CMR ProviderDates and NetCDF history indicate catalog/production events, not first successful user access.",
            "Historical selection, calibration and holdout evidence ends in 2025; no 2026 prospective outcome validation exists.",
            "Seasonal climatology is a baseline outlook, not a demonstrated dynamic forecast; the forecast anomaly is zero by construction.",
            "Uncertainty intervals reuse historical calibration; coverage is retrospective and not a prospective guarantee.",
            "Prediction intervals are truncated to the physical 0–1000 mm storage range; truncation can change empirical coverage.",
            "GLDAS is a modeled 0.25-degree grid product, not a field-scale measurement.",
            "Soil-water storage does not predict crop yield, prove crop damage, or measure long-term land degradation.",
            "No crop-specific agricultural recommendation is included without validated crop stage, soil and management inputs.",
        ],
    }
    jsonschema.validate(bundle, bundle_schema, format_checker=jsonschema.FormatChecker())
    return bundle, regional_records


def load_verified_integration(output_dir: Path) -> dict[str, Any]:
    paths = {"spatial_path": output_dir / "monthly_panel.parquet",
             "regional_path": output_dir / "regional_panel.parquet",
             "manifest_path": output_dir / "MANIFEST.json",
             "validation_path": output_dir / "validation_report.json"}
    missing = [path for path in paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Phase 8 output directory has an incomplete integration; inspect before rerunning: "
                                + ", ".join(map(str, missing)))
    manifest = json.loads(paths["manifest_path"].read_text(encoding="utf-8"))
    validation = json.loads(paths["validation_path"].read_text(encoding="utf-8"))
    if validation.get("status") != "passed":
        raise ValueError("Existing Phase 8 integration report is not marked passed.")
    if (manifest.get("outputs", {}).get("monthly_panel", {}).get("sha256") != sha256(paths["spatial_path"])
            or manifest.get("outputs", {}).get("regional_panel", {}).get("sha256") != sha256(paths["regional_path"])):
        raise ValueError("Existing Phase 8 panel outputs differ from their manifest hashes.")
    read_parquet(paths["spatial_path"])
    read_parquet(paths["regional_path"])
    return {**paths, "manifest": manifest, "validation": validation}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--historical-spatial", type=Path, default=Path("data/exports/phase5a/monthly_panel.parquet"))
    parser.add_argument("--historical-regional", type=Path, default=Path("data/exports/phase5a/regional_panel.parquet"))
    parser.add_argument("--raw-dir", type=Path, default=Path(r"D:\Datos\Downloads\GLDAS_2026_DOWNLOAD"))
    parser.add_argument("--preliminary", type=Path,
                        default=Path(r"D:\Datos\Downloads\GLDAS_2026_WORK\output\gldas_2026_regional_preliminary.parquet"))
    parser.add_argument("--evaluation", type=Path, default=Path("data/analysis/phase6/predictive_evaluation_v1.json"))
    parser.add_argument("--panel-output-dir", type=Path, default=Path("data/exports/phase8_2026"))
    parser.add_argument("--forecast-output-dir", type=Path, default=Path("data/analysis/phase8_2026"))
    parser.add_argument("--forecast-schema", type=Path, default=Path("config/forecast_v1.schema.json"))
    parser.add_argument("--bundle-schema", type=Path, default=Path("config/phase8_forecast_bundle_v1.schema.json"))
    parser.add_argument("--issue-time", type=instant,
                        help="Optional explicit UTC timestamp on 2026-11-15; by default timestamp the run after input verification")
    args = parser.parse_args(argv)
    try:
        panel_files_exist = any((args.panel_output_dir / name).exists() for name in (
            "monthly_panel.parquet", "regional_panel.parquet", "MANIFEST.json", "validation_report.json"))
        panel_outputs = (load_verified_integration(args.panel_output_dir) if panel_files_exist else
                        integrate(args.historical_spatial, args.historical_regional, args.raw_dir,
                                  args.preliminary, args.panel_output_dir))
        now = pd.Timestamp(datetime.now(timezone.utc))
        issue = args.issue_time or now
        if issue < pd.Timestamp(panel_outputs["manifest"]["verified_at"]):
            raise ValueError("Issue time predates local verification of the source files.")
        bundle, regional = build_forecasts(
            panel_outputs["spatial_path"], panel_outputs["regional_path"], args.evaluation,
            panel_outputs["manifest_path"], args.forecast_schema, args.bundle_schema, issue,
        )
        args.forecast_output_dir.mkdir(parents=True, exist_ok=True)
        forecast_names = {1: "forecast_v1_h1.json", 2: "forecast_v1_h2.json", 3: "forecast_v1.json"}
        paths = [args.forecast_output_dir / forecast_names[row["horizon_months"]] for row in regional]
        bundle_path = args.forecast_output_dir / "phase8_forecast_bundle_v1.json"
        conflicts = [path for path in (*paths, bundle_path) if path.exists()]
        if conflicts:
            parser.error("Refusing to overwrite forecast artifact(s): " + ", ".join(map(str, conflicts)))
        for path, row in zip(paths, regional, strict=True):
            json_write_exclusive(path, row)
        json_write_exclusive(bundle_path, bundle)
        print(f"Integrated 247 months, {bundle['spatial_forecasts']['eligible_cells']}/896 forecast cells; latest input {bundle['latest_available_observation_month']}.")
        for row, path in zip(regional, paths, strict=True):
            print(f"{path}: h{row['horizon_months']} target={row['target_month']} point={row['value']:.4f} mm PI90=[{row['predictive_interval']['lower']:.4f}, {row['predictive_interval']['upper']:.4f}] status={row['status']}.")
        print(f"Bundle: {bundle_path} ({bundle_path.stat().st_size} bytes); operationally_eligible=false.")
        return 0
    except (OSError, ValueError, KeyError, jsonschema.ValidationError, requests.RequestException) as error:
        parser.exit(2, f"Phase 8 GLDAS pipeline withheld: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
