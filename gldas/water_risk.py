"""Bounded acquisition, retrospective evaluation and fail-closed frontend export."""
import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path

from jsonschema import FormatChecker, validate
import numpy as np

from .acquisition import AcquisitionError
from .auth import earthdata_token
from .water_archive import LAT, LON, MAX_DAYS, PRODUCT, acquire, daily
from .water_evaluation import evaluate

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "config/water_risk_v1.schema.json"


def provenance():
    return {"collection": PRODUCT.collection, "version": PRODUCT.version, "doi": PRODUCT.doi,
            "product": PRODUCT.short_name, "scope": "provisional_pampas_study_box"}


def decision_view(grid, days, digests, start, now):
    cells = []
    for y, lat in enumerate(LAT):
        for x, lon in enumerate(LON):
            valid = np.flatnonzero(np.isfinite(grid[:, y, x]))
            if not valid.size:
                continue
            index = int(valid[-1])
            observed_day = start + timedelta(days=index)
            if observed_day >= now.date():
                raise ValueError("Complete daily means must end before or at issue time.")
            cells.append({"latitude": float(lat), "longitude": float(lon), "observation_day_utc": observed_day.isoformat(),
                          "days_since_window_end": (now.date() - observed_day).days - 1,
                          "historical_storage_mm": float(grid[index, y, x])})
    return {"schema_version": "water_risk_v1", "generated_at_utc": now.isoformat(),
            "data_kind": "nasa_archive", "status": "insufficient_evidence",
            "reason_codes": ["current_availability_unverified", "forecast_skill_unverified", "crop_rule_unvalidated"],
            "source": provenance(), "bounds": [-64, -38, -57, -30], "cells": cells,
            "complete_observation_days": len(days), "source_sha256": sorted(set(digests)),
            "products": [{"horizon_days": h, "expected_change_mm": None, "prediction_interval_mm": None,
                          "below_normal_probability": None, "current_storage_mm": None} for h in (14, 28)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    download = sub.add_parser("acquire")
    research = sub.add_parser("evaluate")
    view = sub.add_parser("export-view")
    for command in (download, research, view):
        command.add_argument("--archive", required=True, type=Path)
        command.add_argument("--start", required=True, type=date.fromisoformat)
        command.add_argument("--end", required=True, type=date.fromisoformat)
    download.add_argument("--prompt-token", action="store_true")
    for command in (research, view):
        command.add_argument("--output", required=True, type=Path)
    research.add_argument("--retrospective-lag-days", required=True, type=int)
    for name in ("reference-start", "reference-end", "calibration-start", "holdout-start"):
        research.add_argument("--" + name, required=True, type=date.fromisoformat)
    args = parser.parse_args()
    try:
        if args.command == "acquire":
            if not 0 <= (args.end - args.start).days < MAX_DAYS:
                raise ValueError(f"Use ordered acquisition batches of at most {MAX_DAYS} days.")
            token = earthdata_token(prompt=args.prompt_token)
            records = acquire(args.archive, args.start, args.end, token)
            print(f"Verified {len(records)} three-hourly regional assets ({sum(r['bytes'] for r in records)} bytes).")
            return
        if not args.archive.is_dir():
            raise ValueError("Archive directory does not exist.")
        grid, days, digests = daily(args.archive, args.start, args.end)
        if args.command == "export-view":
            result = decision_view(grid, days, digests, args.start, datetime.now(timezone.utc))
            validate(result, json.loads(SCHEMA_PATH.read_text(encoding="utf-8")), format_checker=FormatChecker())
        else:
            result = evaluate(grid, args.start, args.retrospective_lag_days, args.reference_start,
                              args.reference_end, args.calibration_start, args.holdout_start, LAT)
            result.update({"source": provenance(), "complete_archive_days": len(days),
                           "archive_start": args.start.isoformat(), "archive_end": args.end.isoformat(),
                           "source_sha256": sorted(set(digests))})
        encoded = json.dumps(result, indent=2, allow_nan=False) + "\n"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as output:
            output.write(encoded)
        print(f"{args.output} ({result['status']})")
    except (ValueError, OSError, AcquisitionError, KeyError) as error:
        parser.exit(2, f"Water risk withheld: {error}\n")


if __name__ == "__main__":
    main()
