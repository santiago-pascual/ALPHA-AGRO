"""Export validated native SMAP profiles for the agricultural dashboard."""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

from jsonschema import FormatChecker, validate
import netCDF4 as nc
import numpy as np

from .acquisition import checksum
from .smap import COLLECTION, DOI, official_asset, utc

BOUNDS = (-64, -38, -57, -30)
SCHEMA = Path(__file__).resolve().parents[1] / "config/agricultural_water_v1.schema.json"


def observation(bundle):
    capture = json.loads((bundle / "capture.json").read_text(encoding="utf-8"))
    source = capture["source"]
    if (source["collection"] != COLLECTION or source["doi"] != DOI or source["version"] != "008"
            or not official_asset(source["url"]) or capture["filename"] != source["url"].rsplit("/", 1)[-1]):
        raise ValueError("Unexpected SMAP source identity.")
    path = bundle / capture["filename"]
    if path.stat().st_size != capture["bytes"] or checksum(path) != capture["sha256"]:
        raise ValueError("Native SMAP HDF5 checksum failed.")
    start, end = utc(source["observed_start"]), utc(source["observed_end"])
    accessed = utc(capture["locally_accessed_at"])
    if end - start != timedelta(hours=3) or end > accessed:
        raise ValueError("Unexpected SMAP observation interval.")
    with nc.Dataset(path) as data:
        extent = data["Metadata/Extent"]
        field = data["Geophysical_Data/sm_rootzone"]
        if (utc(extent.rangeBeginningDateTime) != start or utc(extent.rangeEndingDateTime) != end
                or field.shape != (1624, 3856) or field.units != "m3 m-3"
                or field._FillValue != -9999):
            raise ValueError("Unexpected native SMAP observation schema.")
        west, south, east, north = BOUNDS
        lat_axis, lon_axis = data["cell_lat"][:, 0], data["cell_lon"][0, :]
        if np.ma.getmaskarray(lat_axis).any() or np.ma.getmaskarray(lon_axis).any():
            raise ValueError("Missing native SMAP grid coordinates.")
        rows = np.flatnonzero((lat_axis >= south) & (lat_axis <= north))
        columns = np.flatnonzero((lon_axis >= west) & (lon_axis <= east))
        if not rows.size or not columns.size or np.any(np.diff(rows) != 1) or np.any(np.diff(columns) != 1):
            raise ValueError("Unexpected Pampas subset grid.")
        latitude, longitude = lat_axis[rows].astype(float), lon_axis[columns].astype(float)
        if (not np.allclose(data["cell_lat"][rows, columns], latitude[:, None])
                or not np.allclose(data["cell_lon"][rows, columns], longitude[None, :])):
            raise ValueError("Pampas coordinates do not match the expected EASE grid.")
        sample = field[rows, columns].astype(float)
        if not sample.count() or not np.isfinite(sample.compressed()).all() or sample.min() < 0 or sample.max() > .9:
            raise ValueError("Physically invalid root-zone volumetric moisture.")
        matrix = [[None if np.ma.is_masked(v) else round(float(v), 6) for v in line] for line in sample]
    return {
        "schema_version": "agricultural_water_v1", "status": "forecast_unavailable",
        "source": {"collection": COLLECTION, "version": "008", "doi": DOI, "granule": source["id"],
                   "sha256": capture["sha256"], "observed_start": start.isoformat(),
                   "observed_end": end.isoformat(), "locally_accessed_at": accessed.isoformat()},
        "grid": {"projection": "EPSG:6933", "bounds": list(BOUNDS), "latitude": latitude.tolist(),
                 "longitude": longitude.tolist(), "moisture": matrix, "valid_cells": int(sample.count())},
        "forecast": {"horizons_days": [14, 28], "issue_date": None, "model": None},
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bundle", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    result = observation(a.bundle)
    validate(result, json.loads(SCHEMA.read_text(encoding="utf-8")), format_checker=FormatChecker())
    payload = json.dumps(result, allow_nan=False, separators=(",", ":")) + "\n"
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open("x", encoding="utf-8") as f:
        f.write(payload)
    print(f"Verified {result['grid']['valid_cells']} native SMAP cells. {a.output}")


if __name__ == "__main__":
    main()
