"""Export the audited Phase 3 NetCDF inputs to the versioned Phase 4 panel."""

from __future__ import annotations

import argparse
from pathlib import Path

import netCDF4 as nc
import numpy as np
import pandas as pd

from ..acquisition import checksum
from ..discovery import DRIVERS
from ..history import OUTPUT as SOIL_INPUT
from ..multivariable import (JANUARY, OUTPUT as DRIVER_INPUT, ROOT as PHASE1_ROOT,
                             STEM, acquire, fields, source_from)
from ..relationships import convert
from ..trend_report import INDEX, audit_inputs
from ..trends import _cell_areas, load_monthly_netcdf
from .contract import MASK_COLUMNS, REQUIRED_COLUMNS, VALUE_COLUMNS, read_parquet, write_parquet

DRIVER_COLUMNS = dict(zip(
    DRIVERS,
    ("precipitation_mm_month", "evapotranspiration_mm_month", "air_temperature_c",
     "surface_runoff_mm_month", "subsurface_runoff_mm_month"), strict=True,
))
DOI = "10.5067/SXAVCZFAQLNO"


def build_panel(*, release_lag_months: int = 5) -> pd.DataFrame:
    if release_lag_months < 0 or release_lag_months > 24:
        raise ValueError("release_lag_months must be from 0 through 24.")
    soil_paths = audit_inputs(SOIL_INPUT, INDEX)
    dates, latitude, longitude, layers, _ = load_monthly_netcdf(soil_paths)
    weights = _cell_areas(latitude, longitude).reshape(-1)
    lat_grid, lon_grid = np.meshgrid(latitude, longitude, indexing="ij")
    cells = [f"{lat:.4f},{lon:.4f}" for lat, lon in zip(lat_grid.ravel(), lon_grid.ravel(), strict=True)]
    rows = []
    for index, (month, soil_path) in enumerate(zip(dates, soil_paths, strict=True)):
        driver_dir = DRIVER_INPUT / month.strftime("%Y-%m")
        driver_path = driver_dir / soil_path.name
        source = source_from(soil_path)
        local_january = soil_path.name == JANUARY.name
        reference = JANUARY if local_january else PHASE1_ROOT / "raw" / f"{STEM}.nc4" \
            if soil_path.name == "GLDAS_NOAH025_M.A202002.021.nc4" else None
        manifest, _ = acquire(None, source, None, reference, local_only=local_january)
        if manifest["sha256"] != checksum(driver_path) or manifest["bytes"] != driver_path.stat().st_size:
            raise ValueError(f"Driver export checksum/size mismatch for {month:%Y-%m}.")
        soil_source = source
        driver_source = manifest["provenance"]["source"]
        with nc.Dataset(driver_path) as dataset:
            native = fields(dataset)
        soil_values = [np.asarray(layers[key][index], dtype=float) for key in layers]
        soil_valid = np.logical_and.reduce([np.isfinite(value) for value in soil_values])
        soil_mm = sum(soil_values)
        values: dict[str, np.ndarray] = {"soil_water_mm": np.asarray(soil_mm).reshape(-1)}
        masks: dict[str, np.ndarray] = {"soil_water_valid": soil_valid.reshape(-1)}
        for source_name, target_name in DRIVER_COLUMNS.items():
            field = native[source_name]
            masks[f"{target_name.removesuffix('_mm_month').removesuffix('_c')}_valid"] = (
                ~np.ma.getmaskarray(field).reshape(-1))
            converted = convert(source_name, field.astype(float).filled(np.nan), month)
            values[target_name] = np.asarray(converted).reshape(-1)
        month_start = pd.Timestamp(month, tz="UTC").normalize().replace(day=1)
        month_end = month_start + pd.offsets.MonthBegin(1)
        available_at = month_start + pd.DateOffset(months=release_lag_months)
        frame = pd.DataFrame({
            "month": month_start,
            "cell_id": cells,
            "latitude": lat_grid.ravel(),
            "longitude": lon_grid.ravel(),
            **values,
            **masks,
            "area_weight": weights,
            "observation_start": month_start,
            "observation_end": month_end,
            "available_at": available_at,
            "source_product": "GLDAS Noah v2.1 monthly",
            "source_version": "2.1",
            "source_doi": DOI,
            "soil_granule_id": soil_source["granule_id"],
            "driver_granule_id": driver_source["granule_id"],
            "soil_sha256": checksum(soil_path),
            "driver_sha256": manifest["sha256"],
            "availability_policy": f"assumed_release_lag_{release_lag_months}_calendar_months",
        })
        for column, valid_name in zip(VALUE_COLUMNS, (
                "soil_water_valid", "precipitation_valid", "evapotranspiration_valid",
                "air_temperature_valid", "surface_runoff_valid", "subsurface_runoff_valid"), strict=True):
            frame.loc[~frame[valid_name].astype(bool), column] = np.nan
        rows.append(frame)
    return pd.concat(rows, ignore_index=True)


def regional_panel(panel: pd.DataFrame) -> pd.DataFrame:
    """Aggregate eligible cells within each month using Phase 3 common support."""
    metadata = [key for key in REQUIRED_COLUMNS if key not in {
        "cell_id", "latitude", "longitude", "area_weight", *VALUE_COLUMNS, *MASK_COLUMNS,
    }]
    rows = []
    for _, group in panel.groupby("month", sort=True):
        if group[metadata].nunique(dropna=False).ne(1).any():
            raise ValueError("Regional aggregation requires consistent per-month provenance and timing.")
        supported = group.loc[group[list(MASK_COLUMNS)].all(axis=1)]
        weights = supported["area_weight"].to_numpy()
        if weights.sum() / group["area_weight"].sum() < 0.80:
            raise ValueError("Regional aggregation requires at least 80% common area coverage.")
        averages = np.average(supported[["latitude", "longitude", *VALUE_COLUMNS]], axis=0, weights=weights)
        rows.append({**group.iloc[0][metadata].to_dict(),
                     **dict(zip(("latitude", "longitude", *VALUE_COLUMNS), averages, strict=True)),
                     **dict.fromkeys(MASK_COLUMNS, True), "cell_id": "pampas-study-box",
                     "area_weight": float(weights.sum())})
    return pd.DataFrame(rows, columns=REQUIRED_COLUMNS)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("data/exports/phase4/monthly_panel.parquet"))
    parser.add_argument("--release-lag-months", type=int, default=5)
    parser.add_argument("--regional-from", type=Path,
                        help="Aggregate an existing spatial Parquet panel into a one-region panel")
    args = parser.parse_args()
    if args.regional_from is None:
        frame = build_panel(release_lag_months=args.release_lag_months)
    else:
        frame = regional_panel(read_parquet(args.regional_from))
    path = write_parquet(
        frame, args.output,
        availability_policy=frame["availability_policy"].iloc[0],
    )
    print(f"Exported {len(frame):,} rows to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
