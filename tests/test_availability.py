"""Synthetic-only tests for versioned source availability and issue-time cutoffs."""

from __future__ import annotations

import json
import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from gldas.availability.registry import (
    AvailabilityError,
    check_as_of,
    load_registry,
    validate_registry,
)
from gldas.availability.cli import main as availability_main


ROOT = Path(__file__).resolve().parents[1]
SYNTHETIC_FIXTURE = ROOT / "tests" / "fixtures" / "availability_registry_synthetic.json"
DEFAULT_REGISTRY = ROOT / "config" / "availability_registry_v1.json"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class AvailabilityTests(unittest.TestCase):
    def test_real_registry_is_versioned_and_has_no_unverified_data_rows(self):
        registry = load_registry(DEFAULT_REGISTRY)
        self.assertEqual(registry["registry_version"], "availability_registry_v1")
        self.assertGreaterEqual(len(registry["sources"]), 7)
        self.assertEqual(registry["availability_records"], [])

    def test_as_of_lists_only_verified_records_available_by_issue_time(self):
        fixture = load_registry(SYNTHETIC_FIXTURE)
        result = check_as_of(fixture, "2098-01-03T00:00:00Z")
        self.assertEqual(result["status"], "verified_inputs_found")
        self.assertEqual([row["record_id"] for row in result["demonstrably_available"]], ["SYNTHETIC_TEST_AVAILABLE_BEFORE"])
        excluded = {row["record_id"]: row["availability_status"] for row in result["excluded_or_unverified"]}
        self.assertEqual(excluded, {
            "SYNTHETIC_TEST_AVAILABLE_AFTER": "verified_after_issue",
            "SYNTHETIC_TEST_EXPECTED_NOT_VERIFIED": "expected_available_not_verified",
            "SYNTHETIC_TEST_UNKNOWN": "unknown",
            "SYNTHETIC_TEST_UNAVAILABLE": "unavailable",
        })
        self.assertFalse(result["forecast_authorized"])

    def test_future_expected_timestamp_never_counts_as_verified(self):
        result = check_as_of(load_registry(SYNTHETIC_FIXTURE), "2098-01-03T00:00:00Z")
        self.assertTrue(all(row["availability_status"] != "expected_available_not_verified" for row in result["demonstrably_available"]))

    def test_verified_status_requires_timestamped_successful_asset_evidence(self):
        mutations = (
            lambda record: record.update(publication_timestamp=None),
            lambda record: record.update(publication_timestamp_basis="cmr_provider_insert"),
            lambda record: record["availability_evidence"].update(http_status=404),
            lambda record: record.update(publication_timestamp="2098-01-02T02:00:00"),
        )
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                registry = read_json(SYNTHETIC_FIXTURE)
                mutate(registry["availability_records"][0])
                with self.assertRaises(AvailabilityError):
                    validate_registry(registry)

    def test_unknown_cannot_carry_a_publication_timestamp(self):
        registry = read_json(SYNTHETIC_FIXTURE)
        registry["availability_records"][3]["publication_timestamp"] = "2098-01-02T02:00:00Z"
        with self.assertRaisesRegex(AvailabilityError, "Only verified_available"):
            validate_registry(registry)

    def test_issue_time_requires_explicit_utc_offset(self):
        with self.assertRaisesRegex(AvailabilityError, "UTC timestamp"):
            check_as_of(load_registry(SYNTHETIC_FIXTURE), "2098-01-03T00:00:00")

    def test_empty_real_registry_fails_closed(self):
        result = check_as_of(load_registry(DEFAULT_REGISTRY), "2026-11-15T12:00:00Z")
        self.assertEqual(result["status"], "no_verified_inputs")
        self.assertEqual(result["demonstrably_available"], [])

    def test_cli_validate_and_as_of_commands(self):
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(availability_main(["validate", "--registry", str(DEFAULT_REGISTRY)]), 0)
        self.assertIn('"status": "valid"', output.getvalue())
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(availability_main(["check", "--issue-time", "2098-01-03T00:00:00Z", "--registry", str(SYNTHETIC_FIXTURE)]), 0)
        result = json.loads(output.getvalue())
        self.assertEqual(result["status"], "verified_inputs_found")
        self.assertEqual(len(result["demonstrably_available"]), 1)
