"""Deterministic offline tests for the NASA availability monitor."""

from __future__ import annotations

from datetime import date, datetime, timezone
from io import BytesIO
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from gldas.availability.cli import main
from gldas.availability.monitor import AvailabilityStore, NASAAssetMonitor, ProbeResult, _safe_url


NOW = datetime(2026, 11, 15, 12, tzinfo=timezone.utc)
HDF_PREFIX = b"\x89HDF\r\n\x1a\n" + b"synthetic test bytes"


class FakeResponse:
    def __init__(self, body: bytes, status: int = 200, headers: dict[str, str] | None = None):
        self.body = body
        self.status = status
        self.headers = headers or {"Content-Type": "application/json"}

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, limit: int = -1):
        return self.body if limit < 0 else self.body[:limit]


def cmr_body(url: str = "https://disc.gsfc.nasa.gov/example/file.h5") -> bytes:
    return json.dumps({"items": [{
        "meta": {"native-id": "SYNTHETIC_TEST_GRANULE"},
        "umm": {
            "GranuleUR": "SYNTHETIC_TEST_GRANULE",
            "CollectionReference": {"Version": "07"},
            "TemporalExtent": {"RangeDateTime": {
                "BeginningDateTime": "2026-11-14T00:00:00Z",
                "EndingDateTime": "2026-11-15T00:00:00Z",
            }},
            "RelatedUrls": [{"Type": "GET DATA", "URL": url}],
        },
    }]}).encode()


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = Path(self.temp.name) / "events.sqlite3"
        self.store = AvailabilityStore(self.database)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def monitor(self, transport):
        return NASAAssetMonitor(self.store, transport=transport, clock=lambda: NOW, prefix_limit=4096,
                                earthdata_username=None, earthdata_password=None)

    def test_power_response_requires_valid_nonmissing_parameter_and_hashes_full_body(self):
        payload = {"header": {"api": {"version": "SYNTHETIC_TEST"}}, "properties": {
            "parameter": {"T2M": {"20261114": 18.75}}}}
        body = json.dumps(payload).encode()
        monitor = self.monitor(lambda _request, timeout: FakeResponse(body))
        result = monitor.probe_power(date(2026, 11, 14))
        self.assertEqual(result.availability_status, "verified_available")
        self.assertTrue(result.metadata_access_success)
        self.assertTrue(result.asset_retrieval_success)
        self.assertTrue(result.usable_scientific_data)
        self.assertEqual(result.successful_access_at_utc, "2026-11-15T12:00:00Z")
        self.assertEqual(result.response_bytes, len(body))
        self.assertEqual(len(result.sha256 or ""), 64)
        self.assertEqual(result.content_version, "SYNTHETIC_TEST")
        self.assertEqual(result.observation_start_utc, "2026-11-14T00:00:00Z")

    def test_http_success_without_science_value_remains_unknown(self):
        body = json.dumps({"header": {}, "properties": {"parameter": {"T2M": {"20261114": -999}}}}).encode()
        result = self.monitor(lambda _request, timeout: FakeResponse(body)).probe_power(date(2026, 11, 14))
        self.assertEqual(result.availability_status, "unknown")
        self.assertTrue(result.metadata_access_success)
        self.assertFalse(result.usable_scientific_data)
        self.assertIsNone(result.successful_access_at_utc)

    def test_cmr_metadata_success_is_not_asset_success(self):
        result = self.monitor(lambda _request, timeout: FakeResponse(cmr_body(url="")))._cmr_granule(
            "imerg_v07_late", "GPM_3IMERGDL", "07", "2026-11-14T00:00:00Z", "2026-11-15T00:00:00Z", "precipitationCal", "mm hr-1")
        self.assertEqual(result.endpoint_role, "asset_discovery")
        self.assertEqual(result.availability_status, "unknown")
        self.assertIsNone(result.successful_access_at_utc)
        self.assertTrue(result.metadata_access_success)
        self.assertFalse(result.asset_retrieval_success)
        self.assertFalse(result.usable_scientific_data)
        self.assertIn("NO_DIRECT_ASSET_URL", result.quality_flags)

    def test_cmr_cannot_direct_authenticated_asset_requests_to_non_nasa_host(self):
        calls = []
        monitor = self.monitor(lambda request, timeout: calls.append(request.full_url) or FakeResponse(cmr_body("https://example.invalid/collect")))
        result = monitor._cmr_granule("imerg_v07_late", "GPM_3IMERGDL", "07",
                                      "2026-11-14T00:00:00Z", "2026-11-15T00:00:00Z", "precipitationCal", "mm hr-1")
        self.assertEqual(len(calls), 1, "only public CMR metadata should be requested")
        self.assertEqual(result.endpoint_role, "asset_discovery")
        self.assertIn("NON_OFFICIAL_ASSET_HOST_REJECTED", result.quality_flags)
        self.assertEqual(result.availability_status, "unknown")

    def test_request_evidence_redacts_signed_url_secrets(self):
        safe = _safe_url("https://disc.gsfc.nasa.gov/file?version=7&token=secret-value&signature=also-secret")
        self.assertIn("version=7", safe)
        self.assertNotIn("secret-value", safe)
        self.assertNotIn("also-secret", safe)

    def test_successful_asset_prefix_is_access_evidence_but_not_usable_science(self):
        responses = iter([
            FakeResponse(cmr_body(), headers={"Content-Type": "application/json"}),
            FakeResponse(HDF_PREFIX, status=206, headers={"Content-Type": "application/x-hdf5", "Content-Range": "bytes 0-27/50000000"}),
        ])
        result = self.monitor(lambda _request, timeout: next(responses))._cmr_granule(
            "imerg_v07_late", "GPM_3IMERGDL", "07", "2026-11-14T00:00:00Z", "2026-11-15T00:00:00Z", "precipitationCal", "mm hr-1")
        self.assertEqual(result.endpoint_role, "asset_byte_probe")
        self.assertEqual(result.availability_status, "verified_available")
        self.assertEqual(result.successful_access_at_utc, "2026-11-15T12:00:00Z")
        self.assertTrue(result.asset_retrieval_success)
        self.assertFalse(result.usable_scientific_data)
        self.assertEqual(result.checksum_scope, "asset_prefix_sha256_not_full_file")
        self.assertIn("PARTIAL_ASSET_PREFIX_ONLY; SCIENTIFIC_CONTENT_NOT_PARSED", result.quality_flags)
        rows = self.store.connection.execute("SELECT COUNT(*) FROM probe_events").fetchone()[0]
        self.assertEqual(rows, 2)

    def test_rate_limit_auth_and_network_failures_remain_unknown(self):
        monitor = self.monitor(lambda _request, timeout: FakeResponse(b"", status=429, headers={}))
        result = monitor._probe_asset("gldas_noah_v21_monthly_main", "GLDAS_NOAH025_M", "test", None, None, "2.1", "https://disc.gsfc.nasa.gov/test", "soil moisture", "kg m-2")
        self.assertEqual(result.availability_status, "unknown")
        self.assertIn("RATE_LIMITED; RETRY_LATER", result.quality_flags)

        not_found = self.monitor(lambda _request, timeout: FakeResponse(b"not found", status=404, headers={}))
        result = not_found._probe_asset("gldas_noah_v21_monthly_main", "GLDAS_NOAH025_M", "test", None, None, "2.1", "https://disc.gsfc.nasa.gov/test", "soil moisture", "kg m-2")
        self.assertEqual(result.availability_status, "unknown", "HTTP 404 does not prove an asset was never published")

        def unauthorized(_request, timeout):
            raise HTTPError("https://disc.gsfc.nasa.gov/test", 401, "login required", {}, BytesIO(b""))
        result = self.monitor(unauthorized)._probe_asset("gldas_noah_v21_monthly_main", "GLDAS_NOAH025_M", "test", None, None, "2.1", "https://disc.gsfc.nasa.gov/test", "soil moisture", "kg m-2")
        self.assertEqual(result.availability_status, "unknown")
        self.assertIn("AUTHORIZATION_REQUIRED_OR_DENIED; AVAILABILITY_UNKNOWN", result.quality_flags)

        def offline(_request, timeout):
            raise URLError("network unavailable")
        result = self.monitor(offline)._probe_asset("gldas_noah_v21_monthly_main", "GLDAS_NOAH025_M", "test", None, None, "2.1", "https://disc.gsfc.nasa.gov/test", "soil moisture", "kg m-2")
        self.assertEqual(result.availability_status, "unknown")
        self.assertEqual(result.error_class, "URLError")
        self.assertIn("NOT EVIDENCE_OF_UNPUBLICATION", result.quality_flags[0])

    def test_repeated_product_run_appends_power_cmr_events_with_separate_statuses(self):
        power = json.dumps({"header": {}, "properties": {"parameter": {"T2M": {"20261114": 17.0}}}}).encode()
        responses = iter([
            FakeResponse(power),
            FakeResponse(cmr_body(url="")),
            FakeResponse(cmr_body(url="")),
        ])
        result = self.monitor(lambda _request, timeout: next(responses)).run(date(2026, 11, 14), date(2026, 6, 1))
        self.assertEqual(result["event_count"], 5)
        self.assertEqual(result["usable_science_count"], 1)
        self.assertEqual(len(result["verified_observations"]), 1)
        self.assertEqual(len(result["metadata_only"]), 4)
        self.assertEqual(result["unknown_or_failed"], [])

    def test_sqlite_log_is_append_only(self):
        result = ProbeResult(
            requested_at_utc="2026-11-15T12:00:00Z", completed_at_utc="2026-11-15T12:00:01Z",
            successful_access_at_utc=None,
            source_id="synthetic", product_id="synthetic", asset_identifier="synthetic",
            variable_id="synthetic", units="synthetic",
            observation_start_utc=None, observation_end_utc=None, endpoint_role="metadata",
            request_url="https://example.invalid", spatial_support="synthetic", http_status=200, availability_status="unknown",
            metadata_access_success=True, asset_retrieval_success=False, usable_scientific_data=False,
            content_version=None, response_bytes=0, sha256=None, checksum_scope=None,
            quality_flags=("SYNTHETIC_TEST",),
        )
        self.store.append(result)
        self.store.append(result)
        count = self.store.connection.execute("SELECT COUNT(*) FROM probe_events").fetchone()[0]
        self.assertEqual(count, 2)
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.connection.execute("UPDATE probe_events SET source_id='changed'")
        self.store.connection.rollback()
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.connection.execute("DELETE FROM probe_events")
        self.store.connection.rollback()

    def test_cli_monitor_reports_and_appends_without_replacing_history(self):
        with patch("gldas.availability.cli.run_monitor", return_value={
            "event_count": 3, "verified_observations": [], "metadata_only": [], "unknown_or_failed": [], "usable_science_count": 0,
        }) as run:
            self.assertEqual(main(["monitor", "--database", str(self.database), "--observation-date", "2026-11-14", "--gldas-month", "2026-06-01"]), 0)
            run.assert_called_once()

    def test_cli_rejects_invalid_dates_without_traceback(self):
        self.assertEqual(main(["monitor", "--observation-date", "not-a-date"]), 2)


if __name__ == "__main__":
    unittest.main()
