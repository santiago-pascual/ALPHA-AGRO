"""CLI for validating the source registry and checking data as-of an issue time."""

from __future__ import annotations

import argparse
import json
import sys

from .registry import AvailabilityError, DEFAULT_REGISTRY, check_as_of, load_registry


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate_parser = subparsers.add_parser("validate", help="validate the versioned registry")
    validate_parser.add_argument("--registry", default=DEFAULT_REGISTRY)
    check_parser = subparsers.add_parser("check", help="list inputs demonstrably available by an issue timestamp")
    check_parser.add_argument("--issue-time", required=True, help="UTC ISO-8601 timestamp, e.g. 2026-11-15T12:00:00Z")
    check_parser.add_argument("--registry", default=DEFAULT_REGISTRY)
    args = parser.parse_args(argv)
    try:
        registry = load_registry(args.registry)
        if args.command == "validate":
            output = {"status": "valid", "registry_version": registry["registry_version"],
                      "sources": len(registry["sources"]), "availability_records": len(registry["availability_records"])}
        else:
            output = check_as_of(registry, args.issue_time)
        print(json.dumps(output, indent=2, sort_keys=True))
    except AvailabilityError as error:
        print(f"Availability registry: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
