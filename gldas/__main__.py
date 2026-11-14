"""Run the GLDAS acquisition and validation pipeline."""

import argparse
from datetime import date
from getpass import getpass
import os
from pathlib import Path
import sys

import requests

from .acquisition import AcquisitionError, PRODUCTS, checksum, discover, preserve, write_json
from .validation import ValidationError, check_bounds, validate_and_subset


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--product", choices=PRODUCTS, default="monthly")
    parser.add_argument("--start", required=True, type=date.fromisoformat)
    parser.add_argument("--end", required=True, type=date.fromisoformat, help="Inclusive UTC date")
    parser.add_argument("--bounds", nargs=4, type=float, metavar=("W", "S", "E", "N"),
                        default=(-64, -38, -57, -30))
    parser.add_argument("--max-granules", type=int, default=8)
    parser.add_argument("--output", type=Path, default=Path("data/phase1"))
    credentials = parser.add_mutually_exclusive_group()
    credentials.add_argument("--local-file", type=Path)
    credentials.add_argument("--prompt-token", action="store_true")
    args = parser.parse_args()
    if args.prompt_token and not sys.stdin.isatty():
        parser.error("--prompt-token requires an interactive terminal.")
    token = getpass("Earthdata user token: ").strip() if args.prompt_token else os.getenv("EARTHDATA_TOKEN")

    try:
        check_bounds(args.bounds)
        with requests.Session() as session:
            # The catalog is public and the token is scoped to the explicit GES DISC request.
            session.trust_env = False
            granules = discover(session, PRODUCTS[args.product], args.start, args.end, args.max_granules)
            if args.local_file and (len(granules) != 1 or args.local_file.name != granules[0]["filename"]):
                raise AcquisitionError("--local-file must match the filename of the single requested granule.")
            bounds_key = "_".join(repr(float(value)) for value in args.bounds)
            run_dir = args.output / "subsets" / bounds_key
            run_dir.mkdir(parents=True, exist_ok=True)
            for granule in granules:
                raw, record = preserve(session, granule, args.output / "raw", token, args.local_file)
                subset = run_dir / raw.name
                report_path = subset.with_suffix(".json")
                try:
                    report = validate_and_subset(raw, subset, granule, args.product, args.bounds)
                except (OSError, ValueError, RuntimeError) as error:
                    write_json(report_path, {"status": "failed", "provenance": record,
                                             "error": str(error), "requested_bounds_wsen": args.bounds})
                    raise ValidationError(f"{raw.name} failed validation. See {report_path}.") from None
                write_json(report_path, {**report, "status": "passed", "provenance": record,
                                         "subset_sha256": checksum(subset)})
                print(f"Validated {raw.name}: {report['subset_cells']} cells. Report: {report_path}")
    except (AcquisitionError, ValidationError, OSError, KeyError, ValueError) as error:
        print(f"GLDAS: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
