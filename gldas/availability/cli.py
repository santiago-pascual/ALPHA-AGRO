"""CLI for validating the source registry and checking data as-of an issue time."""

from __future__ import annotations

import argparse
from datetime import date
import json
import sys

from .registry import AvailabilityError, DEFAULT_REGISTRY, check_as_of, load_registry
from .monitor import DEFAULT_DB, run_monitor


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate_parser = subparsers.add_parser("validate", help="validate the versioned registry")
    validate_parser.add_argument("--registry", default=DEFAULT_REGISTRY)
    check_parser = subparsers.add_parser("check", help="list inputs demonstrably available by an issue timestamp")
    check_parser.add_argument("--issue-time", required=True, help="UTC ISO-8601 timestamp, e.g. 2026-11-15T12:00:00Z")
    check_parser.add_argument("--registry", default=DEFAULT_REGISTRY)
    monitor_parser = subparsers.add_parser("monitor", help="probe selected NASA products and append evidence locally")
    monitor_parser.add_argument("--database", default=DEFAULT_DB, help="append-only SQLite log path")
    monitor_parser.add_argument("--observation-date", help="POWER and IMERG UTC observation date (YYYY-MM-DD); defaults to yesterday UTC")
    monitor_parser.add_argument("--gldas-month", help="GLDAS UTC month to query (YYYY-MM-01); defaults to four months behind current month")
    args = parser.parse_args(argv)
    try:
        if args.command == "monitor":
            observation_day = date.fromisoformat(args.observation_date) if args.observation_date else None
            gldas_month = date.fromisoformat(args.gldas_month) if args.gldas_month else None
            output = run_monitor(args.database, observation_day, gldas_month)
            output["status"] = "monitor_completed"
            output["note"] = "Probe failures and missing catalog matches remain unknown; this command does not establish historical first-publication times or issue forecasts."
        else:
            registry = load_registry(args.registry)
        if args.command == "validate":
            output = {"status": "valid", "registry_version": registry["registry_version"],
                      "sources": len(registry["sources"]), "availability_records": len(registry["availability_records"])}
        elif args.command == "check":
            output = check_as_of(registry, args.issue_time)
        print(json.dumps(output, indent=2, sort_keys=True))
    except (AvailabilityError, ValueError) as error:
        print(f"Availability registry: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
