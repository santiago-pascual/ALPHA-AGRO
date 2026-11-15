"""Extract the frozen native SMAP sites and retain every incomplete daily window."""
import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import re

import numpy as np
import pandas as pd

from .acquisition import checksum, write_json
from .smap import official_asset
from .smap_appeears import DESIGN, PRODUCT
from .smap_harmony import read_manifest
from .smap_panel import SLOTS, subset


def load_design(path=DESIGN):
    design = json.loads(path.read_text(encoding="utf-8"))
    sites = design["sites"]
    if (design["schema_version"] != "smap_phase11_design_v1" or not 12 <= len(sites) <= 30 or
            len({x["id"] for x in sites}) != len(sites) or
            len({(x["y_m"], x["x_m"]) for x in sites}) != len(sites)):
        raise ValueError("Unexpected frozen study design.")
    return design


def harmony_slots(archive, design, start, end):
    observations, captures = {}, []
    sites = design["sites"]
    for bundle in sorted(p for p in archive.iterdir() if p.is_dir()):
        path = bundle / "capture.json"
        assets = read_manifest(bundle, json.loads(path.read_text(encoding="utf-8")))
        used = False
        for asset in assets:
            day = datetime.strptime(asset.name[15:23], "%Y%m%d").date()
            if not start <= day <= end:
                continue
            day, slot, values, (latitude, longitude, y, x) = subset(asset)
            row = np.searchsorted(-y, -np.array([s["y_m"] for s in sites]))
            col = np.searchsorted(x, [s["x_m"] for s in sites])
            if (np.any(row >= len(y)) or np.any(col >= len(x))
                    or not np.allclose(y[row], [s["y_m"] for s in sites], atol=.01, rtol=0)
                    or not np.allclose(x[col], [s["x_m"] for s in sites], atol=.01, rtol=0)
                    or not np.allclose(latitude[row], [s["latitude"] for s in sites], atol=1e-5, rtol=0)
                    or not np.allclose(longitude[col], [s["longitude"] for s in sites], atol=1e-5, rtol=0)):
                raise ValueError("Harmony asset does not contain the frozen native-grid locations.")
            if (day, slot) in observations:
                raise ValueError(f"Overlapping Harmony captures for {day} {slot}. Select an explicit vintage.")
            observations[day, slot] = values[row, col]
            used = True
        if used:
            captures.append({"capture": bundle.name, "sha256": checksum(path)})
    return observations, captures


def appeears_slots(archive, design, start, end, *, probe=None):
    sites = design["sites"]
    indices = {site["id"]: index for index, site in enumerate(sites)}
    observations, seen, captures = {}, set(), []
    field = f"{PRODUCT.replace('.', '_')}_{design['layer']}"
    line_field = "SPL4SMGP_008_Line_Y_9.00805km"
    sample_field = "SPL4SMGP_008_Sample_X_9.00805km"
    for bundle in sorted(p for p in archive.iterdir() if p.is_dir()):
        path = bundle / "capture.json"
        record = json.loads(path.read_text(encoding="utf-8"))
        if (record["schema"] != "smap_appeears_capture_v1" or record["task_id"] != bundle.name or
                record["request"]["layers"] != [{"product": PRODUCT, "layer": design["layer"]}]):
            raise ValueError("Bundle does not match the frozen SMAP variable.")
        if probe is not None:
            requested = {point["id"] for point in record["request"]["coordinates"]}
            expected = {site["id"] for site in (sites[:3] if probe else sites)}
            if requested != expected:
                continue
        granules = {}
        for evidence in record["files"]:
            name = evidence["name"]
            if not name.endswith("-granule-list.txt"):
                continue
            if Path(name).name != name:
                raise ValueError("Unexpected granule-list path.")
            data = bundle / name
            if data.stat().st_size != evidence["bytes"] or checksum(data) != evidence["sha256"]:
                raise ValueError("AppEEARS granule-list checksum mismatch.")
            for url in data.read_text(encoding="utf-8").splitlines():
                if not url.strip():
                    continue
                if not official_asset(url):
                    raise ValueError("Unexpected SMAP granule in AppEEARS provider evidence.")
                stamp = re.search(r"_gph_(\d{8}T\d{6})_", url)[1]
                if stamp in granules and granules[stamp] != url:
                    raise ValueError("Competing SMAP granule versions for the same interval.")
                granules[stamp] = url
        used = False
        for evidence in record["files"]:
            name = evidence["name"]
            if Path(name).name != name:
                raise ValueError("Unexpected archive file path.")
            data = bundle / name
            if data.stat().st_size != evidence["bytes"] or checksum(data) != evidence["sha256"]:
                raise ValueError("AppEEARS evidence checksum mismatch.")
            if not name.lower().endswith(".csv"):
                continue
            header = set(pd.read_csv(data, nrows=0).columns)
            if field not in header:
                continue
            if not {"ID", "Latitude", "Longitude", "Date", line_field, sample_field} <= header:
                raise ValueError("Unrecognized AppEEARS point CSV columns.")
            cols = ["ID", "Latitude", "Longitude", "Date", line_field, sample_field, field]
            if "Time" in header:
                cols.append("Time")
            for row in pd.read_csv(data, usecols=cols).to_dict("records"):
                i = indices[row["ID"]]
                site = sites[i]
                if (abs(row["Latitude"] - site["latitude"]) > 1e-4 or
                        abs(row["Longitude"] - site["longitude"]) > 1e-4):
                    raise ValueError("AppEEARS changed a requested point coordinate.")
                stamp = str(row["Date"])
                if stamp.endswith(" UTC"):
                    stamp = stamp[:-4] + "+00:00"
                if len(stamp) == 10 and "Time" in row:
                    stamp += "T" + str(row["Time"])
                if len(stamp) <= 10:
                    raise ValueError("AppEEARS export contains dates without the native three-hour times.")
                t = datetime.fromisoformat(stamp)
                if t.utcoffset() not in (None, timedelta(0)) or t.strftime("%H%M%S") not in SLOTS or t.microsecond:
                    raise ValueError("AppEEARS timestamps require comparison with native three-hour midpoints.")
                day, slot = t.date(), t.strftime("%H%M%S")
                if not start <= day <= end:
                    continue
                if (day, slot, i) in seen:
                    raise ValueError("Duplicate AppEEARS point and timestamp.")
                seen.add((day, slot, i))
                values = observations.setdefault((day, slot), np.full(len(sites), np.nan))
                v = float(row[field])
                if np.isnan(v) or v == -9999:
                    continue
                if t.strftime("%Y%m%dT%H%M%S") not in granules:
                    raise ValueError("Point value has no matching SMAP V008 granule lineage.")
                if (row[line_field] != round(811.5 - site["y_m"] / 9008.05)
                        or row[sample_field] != round(1927.5 + site["x_m"] / 9008.05)):
                    raise ValueError("AppEEARS sampled a different native EASE cell.")
                if not 0 <= v <= .9:
                    raise ValueError("AppEEARS root-zone moisture value outside valid range.")
                values[i] = v
                used = True
        if used:
            captures.append({"capture": bundle.name, "sha256": checksum(path)})
    return observations, captures


def verify_overlap(points, harmony, n_sites):
    matches = np.zeros(n_sites, dtype=int)
    for key in sorted(points.keys() & harmony.keys()):
        first, second = points[key], harmony[key]
        valid = np.isfinite(first) & np.isfinite(second)
        if not np.allclose(first[valid], second[valid], atol=2e-6, rtol=0):
            raise ValueError("AppEEARS point estimates disagree with the native Harmony reference.")
        if np.any(np.isfinite(first) & ~np.isfinite(second)):
            raise ValueError("AppEEARS returned values for a masked native cell.")
        matches += valid
    accepted = matches >= 16
    if accepted.sum() < 3 or np.any((matches > 0) & ~accepted):
        raise ValueError("Require at least two days of native overlap for three or more probed locations.")
    return int(accepted.sum()), int(matches.sum())


def daily(observations, start, end, n_sites):
    if end < start:
        raise ValueError("Use ordered dates.")
    dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    values = np.full((len(dates), n_sites), np.nan)
    for i, day in enumerate(dates):
        slots = [observations.get((day, slot)) for slot in SLOTS]
        if all(row is not None for row in slots):
            values[i] = np.mean(np.stack(slots), axis=0)
    return dates, values


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--harmony", type=Path, required=True)
    p.add_argument("--appeears", type=Path)
    p.add_argument("--probe-only", action="store_true", help="Export only the three-site AppEEARS verification probe.")
    p.add_argument("--start", type=date.fromisoformat, required=True)
    p.add_argument("--end", type=date.fromisoformat, required=True)
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    design = load_design()
    captures = {}
    if a.appeears:
        compare_start, compare_end = date(2020, 1, 2), date(2020, 1, 3)
        points, _ = appeears_slots(a.appeears, design, compare_start, compare_end, probe=True)
        harmony, audit_captures = harmony_slots(a.harmony, design, compare_start, compare_end)
        count, overlaps = verify_overlap(points, harmony, len(design["sites"]))
        print(f"Native overlap passed for {count} sites and {overlaps} intervals.")
        observations, captures["appeears"] = appeears_slots(a.appeears, design, a.start, a.end, probe=a.probe_only)
        captures["harmony_overlap"] = audit_captures
    else:
        observations, captures["harmony"] = harmony_slots(a.harmony, design, a.start, a.end)
    if not observations:
        raise ValueError("No verified source intervals within the requested dates.")
    dates, values = daily(observations, a.start, a.end, len(design["sites"]))
    manifest = a.output.with_suffix(".json")
    if manifest.exists() or a.output.exists():
        raise ValueError("Choose a new output path to preserve existing results.")
    a.output.parent.mkdir(parents=True, exist_ok=True)
    with a.output.open("xb") as f:
        np.savez_compressed(f, days=[d.isoformat() for d in dates], moisture=values,
                            site_ids=[s["id"] for s in design["sites"]])
    counts = np.isfinite(values).sum(axis=1)
    report = {"schema": "smap_phase11_site_panel_v1", "design_sha256": checksum(DESIGN),
              "source": design["collection"], "version": design["version"], "units": design["units"],
              "dates": [a.start.isoformat(), a.end.isoformat()],
              "source_captures": captures, "panel_sha256": checksum(a.output),
              "complete_days_all_sites": int(np.sum(counts == len(design["sites"]))),
              "valid_site_days": int(counts.sum()), "verified_intervals": len(observations),
              "locally_built_at": datetime.now(timezone.utc).isoformat()}
    write_json(manifest, report)
    print(report["complete_days_all_sites"], "complete days at all sites;", report["valid_site_days"], "verified site-days.")


if __name__ == "__main__":
    main()
