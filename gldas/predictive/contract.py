"""Versioned Parquet interface for the historical data-holding computer."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from . import SCHEMA_VERSION

VALUE_COLUMNS = (
    "soil_water_mm", "precipitation_mm_month", "evapotranspiration_mm_month",
    "air_temperature_c", "surface_runoff_mm_month", "subsurface_runoff_mm_month",
)
MASK_COLUMNS = (
    "soil_water_valid", "precipitation_valid", "evapotranspiration_valid",
    "air_temperature_valid", "surface_runoff_valid", "subsurface_runoff_valid",
)
REQUIRED_COLUMNS = (
    "month", "cell_id", "latitude", "longitude", *VALUE_COLUMNS, *MASK_COLUMNS,
    "area_weight", "observation_start", "observation_end", "available_at",
    "source_product", "source_version", "source_doi", "soil_granule_id",
    "driver_granule_id", "soil_sha256", "driver_sha256", "availability_policy",
)
TIMESTAMP_COLUMNS = ("month", "observation_start", "observation_end", "available_at")
UNITS = {
    "soil_water_mm": "mm", "precipitation_mm_month": "mm/month",
    "evapotranspiration_mm_month": "mm/month", "air_temperature_c": "degC",
    "surface_runoff_mm_month": "mm/month", "subsurface_runoff_mm_month": "mm/month",
    "latitude": "degrees_north", "longitude": "degrees_east", "area_weight": "m2",
}


def validate_frame(frame: pd.DataFrame, *, require_complete_months: bool = True) -> None:
    missing = sorted(set(REQUIRED_COLUMNS) - set(frame.columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    if frame.empty:
        raise ValueError("The predictive panel is empty.")
    if frame.duplicated(["month", "cell_id"]).any():
        raise ValueError("Each (month, cell_id) pair must be unique.")
    if not frame["cell_id"].astype(str).str.len().gt(0).all():
        raise ValueError("cell_id cannot be empty.")
    for column in TIMESTAMP_COLUMNS:
        dtype = frame[column].dtype
        if not isinstance(dtype, pd.DatetimeTZDtype) or str(dtype.tz) != "UTC":
            raise ValueError(f"{column} must be stored as an explicit UTC timestamp.")
        values = pd.to_datetime(frame[column], utc=True, errors="coerce")
        if values.isna().any():
            raise ValueError(f"{column} must contain valid UTC timestamps.")
        is_month_start = (values.dt.day.eq(1) & values.dt.hour.eq(0) & values.dt.minute.eq(0)
                          & values.dt.second.eq(0)).all()
        if column in ("month", "observation_start") and not is_month_start:
            raise ValueError(f"{column} must be the first instant of a UTC month.")
    months = pd.to_datetime(frame["month"], utc=True)
    starts = pd.to_datetime(frame["observation_start"], utc=True)
    ends = pd.to_datetime(frame["observation_end"], utc=True)
    available = pd.to_datetime(frame["available_at"], utc=True)
    next_month = starts + pd.offsets.MonthBegin(1)
    if not (months.eq(starts) & ends.eq(next_month) & available.ge(ends)).all():
        raise ValueError("Month bounds or availability time are inconsistent.")
    if not np.isfinite(frame[["latitude", "longitude", "area_weight"]].to_numpy(dtype=float)).all():
        raise ValueError("Coordinates and area weights must be finite.")
    if not frame["latitude"].between(-90, 90).all() or not frame["longitude"].between(-180, 180).all():
        raise ValueError("Coordinates are outside valid geographic ranges.")
    if not frame["area_weight"].gt(0).all():
        raise ValueError("Area weights must be positive.")
    for value, mask in zip(VALUE_COLUMNS, MASK_COLUMNS, strict=True):
        if frame[mask].isna().any() or not frame[mask].isin([True, False, 0, 1]).all():
            raise ValueError(f"{mask} must be a non-null boolean mask.")
        valid = frame[mask].astype(bool)
        numeric = pd.to_numeric(frame[value], errors="coerce")
        if not np.isfinite(numeric[valid].to_numpy(dtype=float)).all() or numeric[~valid].notna().any():
            raise ValueError(f"{value} must be finite where valid and null where masked.")
    for column in ("source_product", "source_version", "source_doi", "soil_granule_id",
                   "driver_granule_id", "soil_sha256", "driver_sha256", "availability_policy"):
        if frame[column].isna().any() or not frame[column].astype(str).str.len().gt(0).all():
            raise ValueError(f"{column} must record non-empty provenance/policy values.")
    for column in ("source_product", "source_version", "source_doi", "availability_policy"):
        if frame[column].nunique(dropna=False) != 1:
            raise ValueError(f"{column} must be consistent within one Parquet dataset.")
    for column in ("soil_sha256", "driver_sha256"):
        if not frame[column].astype(str).str.fullmatch(r"[0-9a-fA-F]{64}").all():
            raise ValueError(f"{column} must contain 64-character SHA-256 checksums.")
    if frame.groupby("cell_id", observed=True)[["latitude", "longitude", "area_weight"]].nunique().gt(1).any().any():
        raise ValueError("Coordinates and area weights must be constant for each cell_id.")
    if require_complete_months:
        ordered = months.drop_duplicates().sort_values()
        expected = pd.date_range(ordered.iloc[0], ordered.iloc[-1], freq="MS", tz="UTC")
        if not ordered.reset_index(drop=True).equals(pd.Series(expected)):
            raise ValueError("Panel months must be continuous with no gaps.")
        counts = frame.groupby("month", observed=True)["cell_id"].nunique()
        if counts.nunique() != 1:
            raise ValueError("Every month must contain the same number of cells.")
        cells = set(frame.loc[months.eq(ordered.iloc[0]), "cell_id"])
        if any(set(group["cell_id"]) != cells for _, group in frame.groupby("month", observed=True)):
            raise ValueError("The cell set must remain constant through the panel.")


def write_parquet(frame: pd.DataFrame, path: str | Path, *, availability_policy: str) -> Path:
    validate_frame(frame)
    destination = Path(path)
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite existing contract file: {destination}")
    table = pa.Table.from_pandas(frame, preserve_index=False)
    metadata = dict(table.schema.metadata or {})
    metadata.update({
        b"quant_alpha_schema_version": SCHEMA_VERSION.encode(),
        b"quant_alpha_availability_policy": availability_policy.encode(),
        b"quant_alpha_time_semantics": b"month=UTC month start; observation interval is half-open UTC",
        b"quant_alpha_units_json": json.dumps(UNITS, sort_keys=True).encode(),
    })
    table = table.replace_schema_metadata(metadata)
    destination.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, destination, compression="zstd", version="2.6")
    return destination


def read_parquet(path: str | Path, *, require_complete_months: bool = True) -> pd.DataFrame:
    table = pq.read_table(path)
    metadata = table.schema.metadata or {}
    version = metadata.get(b"quant_alpha_schema_version", b"").decode()
    if version != SCHEMA_VERSION:
        raise ValueError(f"Unsupported or missing predictive schema version: {version!r}")
    frame = table.to_pandas()
    policy = metadata.get(b"quant_alpha_availability_policy", b"").decode()
    if not policy or not frame["availability_policy"].eq(policy).all():
        raise ValueError("Availability policy differs between Parquet metadata and rows.")
    units = json.loads(metadata.get(b"quant_alpha_units_json", b"{}").decode())
    if units != UNITS:
        raise ValueError("Parquet units metadata is incomplete or incompatible.")
    validate_frame(frame, require_complete_months=require_complete_months)
    return frame
