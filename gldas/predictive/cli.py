"""Command-line data validation and walk-forward evaluation."""

from __future__ import annotations

import argparse
from importlib.metadata import version
import json
from pathlib import Path
import sys
from time import perf_counter

from .contract import read_parquet
from .evaluation import evaluate
from ..acquisition import checksum


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate = subparsers.add_parser("validate", help="validate the versioned Parquet panel")
    validate.add_argument("--input", type=Path, required=True)
    run = subparsers.add_parser("evaluate", help="run chronological model evaluation")
    run.add_argument("--input", type=Path, required=True)
    run.add_argument("--output", type=Path, required=True)
    run.add_argument("--horizons", type=int, nargs="+", choices=(1, 2, 3), default=(1, 2, 3))
    run.add_argument("--targets", nargs="+", choices=("storage", "anomaly", "low_moisture"),
                     default=("storage", "anomaly", "low_moisture"))
    run.add_argument("--initial-train-months", type=int, default=120)
    run.add_argument("--test-window-months", type=int, default=12)
    run.add_argument("--holdout-months", type=int, default=24)
    run.add_argument("--n-lags", type=int, default=6)
    args = parser.parse_args(argv)
    try:
        frame = read_parquet(args.input)
        if args.command == "validate":
            print(f"Valid predictive panel: {len(frame):,} rows, "
                  f"{frame['month'].nunique()} months, {frame['cell_id'].nunique()} cells.")
            return 0
        expected_product = frame["source_product"].eq("GLDAS Noah v2.1 monthly").all()
        expected_doi = frame["source_doi"].eq("10.5067/SXAVCZFAQLNO").all()
        if not (expected_product and expected_doi):
            parser.error("Evaluation requires a validated GLDAS Noah v2.1 monthly panel.")
        if args.output.exists():
            parser.error(f"Refusing to overwrite output: {args.output}")
        started = perf_counter()
        result = evaluate(
            frame, horizons=args.horizons, targets=args.targets,
            initial_train_months=args.initial_train_months,
            test_window_months=args.test_window_months,
            holdout_months=args.holdout_months, n_lags=args.n_lags,
            progress=lambda message: print(message, file=sys.stderr, flush=True),
        )
        result["input"] = {
            "path": str(args.input), "months": int(frame["month"].nunique()),
            "cells": int(frame["cell_id"].nunique()),
            "sha256": checksum(args.input),
            "availability_policy": str(frame["availability_policy"].iloc[0]),
            "real_time_release_snapshots_available": False,
            "interpretation": "retrospective validation on archived final products; not operational skill",
        }
        result["run"] = {
            "elapsed_seconds": perf_counter() - started, "python": sys.version.split()[0],
            "dependencies": {name: version(name) for name in ("numpy", "pandas", "scipy", "xgboost", "scikit-learn")},
            "initial_train_months": args.initial_train_months, "test_window_months": args.test_window_months,
            "holdout_months": args.holdout_months, "horizons": args.horizons, "targets": args.targets,
            "n_lags": args.n_lags, "interval_block_months": 12, "interval_draws": 1000, "random_seed": 1729,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        print(f"Evaluation written to {args.output}; real-time forecast skill remains unverified.")
        return 0
    except (OSError, ValueError, KeyError) as error:
        parser.exit(2, f"Predictive modeling: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
