"""Build a strictly aligned SMAP daily volumetric-moisture panel from verified Harmony archives."""
import argparse
from collections import defaultdict
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import re

import netCDF4 as nc
import numpy as np

from .acquisition import checksum
from .smap_harmony import COLLECTION, DOI, read_manifest

SLOTS = tuple(f"{hour:02d}3000" for hour in range(1, 24, 3))


def subset(path):
    name = re.match(r"SMAP_L4_SM_gph_(\d{8})T(\d{6})_", path.name)
    if not name or name[2] not in SLOTS:
        raise ValueError("Expected three-hour mean time center.")
    day = datetime.strptime(name[1], "%Y%m%d").date()
    with nc.Dataset(path) as data:
        stem = path.name.split("_Geophysical_Data")[0]
        field = data["Geophysical_Data/sm_rootzone"]
        if (not Path(data.Filename).name == stem + ".h5" or field.units != "m3 m-3"
                or field._FillValue != -9999 or field.ndim != 2):
            raise ValueError("Harmony subset does not match the native SMAP root-zone variable.")
        lat, lon = data["cell_lat"][:], data["cell_lon"][:]
        y, x = data["y"][:], data["x"][:]
        if (lat.shape != field.shape or lon.shape != field.shape or (len(y), len(x)) != field.shape
                or any(np.ma.getmaskarray(values).any() for values in (lat, lon, y, x))
                or not np.allclose(lat, lat[:, :1]) or not np.allclose(lon, lon[:1])
                or not np.allclose(np.diff(y), -9008, atol=2, rtol=0) or not np.allclose(np.diff(x), 9008, atol=2, rtol=0)
                or lat.min() < -38.1 or lat.max() > -29.9 or lon.min() < -64.1 or lon.max() > -56.9):
            raise ValueError("Unexpected native EASE regional grid in Harmony output.")
        values = field[:].astype(float)
        valid = values.compressed()
        if not valid.size or not np.isfinite(valid).all() or valid.min() < 0 or valid.max() > .9:
            raise ValueError("SMAP root-zone values outside valid range.")
        # Harmony may include cells touched by the box. Use exactly the native
        # centers inside our study boundary to match the dashboard selection.
        rows = np.flatnonzero((lat[:, 0] >= -38) & (lat[:, 0] <= -30))
        columns = np.flatnonzero((lon[0] >= -64) & (lon[0] <= -57))
        grid = (lat[rows, 0], lon[0, columns], y[rows], x[columns])
    return day, name[2], values.filled(np.nan)[np.ix_(rows, columns)], tuple(np.asarray(axis) for axis in grid)


def daily_panel(archive, start, end):
    if start > end:
        raise ValueError("Use ordered dates.")
    by_day = defaultdict(dict)
    provenance = []
    grid = None
    for bundle in sorted(p for p in archive.iterdir() if p.is_dir()):
        manifest_path = bundle / "capture.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for path in read_manifest(bundle, manifest):
            day, slot, values, grid_now = subset(path)
            if not start <= day <= end:
                continue
            if grid is None:
                grid = grid_now
            elif any(not np.array_equal(a, b) for a, b in zip(grid, grid_now, strict=True)):
                raise ValueError("Cannot mix different EASE coordinate arrays.")
            if slot in by_day[day]:
                raise ValueError("Duplicate interval. Select a single preserved source vintage before combining batches.")
            by_day[day][slot] = values
        provenance.append({"job": bundle.name, "capture_sha256": checksum(manifest_path)})
    if grid is None:
        raise ValueError("No verified SMAP subsets in this window.")
    days = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
    samples = np.full((len(days), len(grid[0]), len(grid[1])), np.nan, dtype=np.float32)
    coverage = []
    for i, day in enumerate(days):
        slots = by_day[date.fromisoformat(day)]
        if set(slots) == set(SLOTS):
            # Missing/fill data in any of the equally weighted 3h intervals preserve the cell mask.
            samples[i] = np.mean(np.stack([slots[slot] for slot in SLOTS]), axis=0)
        coverage.append({"date": day, "intervals": len(slots), "valid_cells": int(np.isfinite(samples[i]).sum())})
    report = {"schema": "smap_daily_panel_v1", "collection": COLLECTION, "doi": DOI, "version": "008",
              "units": "m3 m-3", "bounds": [-64, -38, -57, -30], "projection": "EPSG:6933",
              "dates": [start.isoformat(), end.isoformat()], "source_manifests": provenance,
              "availability_verified": False, "coverage": coverage}
    return samples, days, grid, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat)
    parser.add_argument("--output", required=True, type=Path)
    a = parser.parse_args()
    samples, days, grid, report = daily_panel(a.archive, a.start, a.end)
    manifest = a.output.with_suffix(".json")
    if manifest.exists() or a.output.exists():
        parser.error("Choose a new output path to preserve the existing panel.")
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open("xb") as f:
        np.savez_compressed(f, storage=samples, days=days, latitude=grid[0], longitude=grid[1], grid_y=grid[2], grid_x=grid[3])
    report["panel_sha256"] = checksum(a.output)
    with manifest.open("x", encoding="utf-8") as f:
        json.dump(report, f, indent=2, allow_nan=False)
    print(f"{sum(x['intervals'] == 8 for x in report['coverage'])}/{len(days)} complete UTC days. {a.output}")


if __name__ == "__main__":
    main()
