"""Validation and point-in-time eligibility checks for source availability records."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


SCHEMA_VERSION = "availability_registry_v1"
STATUSES = {
    "verified_available",
    "expected_available_not_verified",
    "unavailable",
    "unknown",
}
DEFAULT_REGISTRY = Path(__file__).resolve().parents[2] / "config" / "availability_registry_v1.json"


class AvailabilityError(ValueError):
    """Raised when a registry contains ambiguous or unsafe availability evidence."""


def _object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise AvailabilityError(f"Expected an object at {path}.")
    return value


def _text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise AvailabilityError(f"Expected non-empty text at {path}.")
    return value.strip()


def parse_utc(value: Any, path: str) -> datetime:
    text = _text(value, path)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise AvailabilityError(f"Expected an ISO-8601 timestamp at {path}.") from error
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise AvailabilityError(f"Expected a UTC timestamp with timezone at {path}.")
    return parsed.astimezone(timezone.utc)


def _http_url(value: Any, path: str) -> str:
    url = _text(value, path)
    if urlparse(url).scheme not in {"http", "https"} or not urlparse(url).netloc:
        raise AvailabilityError(f"Expected an HTTP(S) evidence URL at {path}.")
    return url


def validate_registry(registry: Any) -> dict[str, Any]:
    """Validate registry shape and enforce evidence rules for all four statuses."""
    root = _object(registry, "root")
    if root.get("registry_version") != SCHEMA_VERSION:
        raise AvailabilityError(f"Unsupported registry version; expected {SCHEMA_VERSION}.")
    sources = root.get("sources")
    records = root.get("availability_records")
    if not isinstance(sources, list) or not isinstance(records, list):
        raise AvailabilityError("sources and availability_records must be arrays.")

    source_ids: set[str] = set()
    for index, raw in enumerate(sources):
        path = f"sources[{index}]"
        source = _object(raw, path)
        source_id = _text(source.get("source_id"), f"{path}.source_id")
        if source_id in source_ids:
            raise AvailabilityError(f"Duplicate source_id: {source_id}.")
        source_ids.add(source_id)
        if source.get("availability_status") not in STATUSES:
            raise AvailabilityError(f"Unsupported availability status at {path}.availability_status.")
        _text(source.get("product_id"), f"{path}.product_id")

    record_ids: set[str] = set()
    for index, raw in enumerate(records):
        path = f"availability_records[{index}]"
        record = _object(raw, path)
        record_id = _text(record.get("record_id"), f"{path}.record_id")
        if record_id in record_ids:
            raise AvailabilityError(f"Duplicate record_id: {record_id}.")
        record_ids.add(record_id)
        source_id = _text(record.get("source_id"), f"{path}.source_id")
        if source_id not in source_ids:
            raise AvailabilityError(f"Unknown source_id {source_id!r} at {path}.")
        _text(record.get("variable_id"), f"{path}.variable_id")
        _text(record.get("units"), f"{path}.units")
        start = parse_utc(record.get("observation_start"), f"{path}.observation_start")
        end = parse_utc(record.get("observation_end"), f"{path}.observation_end")
        if end < start:
            raise AvailabilityError(f"observation_end precedes observation_start at {path}.")
        status = record.get("availability_status")
        if status not in STATUSES:
            raise AvailabilityError(f"Unsupported availability status at {path}.availability_status.")
        flags = record.get("data_quality_flags")
        if not isinstance(flags, list) or not all(isinstance(flag, str) for flag in flags):
            raise AvailabilityError(f"data_quality_flags must be an array of strings at {path}.")

        published = record.get("publication_timestamp")
        if status == "verified_available":
            if published is None:
                raise AvailabilityError(f"verified_available requires publication_timestamp at {path}.")
            parse_utc(published, f"{path}.publication_timestamp")
            if record.get("publication_timestamp_basis") != "first_successful_http_request":
                raise AvailabilityError(f"verified_available requires first_successful_http_request evidence at {path}.")
            evidence = _object(record.get("availability_evidence"), f"{path}.availability_evidence")
            _http_url(evidence.get("url"), f"{path}.availability_evidence.url")
            evidence_time = parse_utc(evidence.get("observed_at"), f"{path}.availability_evidence.observed_at")
            if evidence_time != parse_utc(published, f"{path}.publication_timestamp"):
                raise AvailabilityError(f"publication_timestamp must equal the successful request observed_at at {path}.")
            code = evidence.get("http_status")
            if not isinstance(code, int) or not 200 <= code < 300:
                raise AvailabilityError(f"verified_available requires a successful 2xx HTTP status at {path}.")
        elif published is not None:
            raise AvailabilityError(f"Only verified_available may set publication_timestamp at {path}.")

        if status == "expected_available_not_verified":
            parse_utc(record.get("expected_available_at"), f"{path}.expected_available_at")
        elif record.get("expected_available_at") is not None:
            parse_utc(record.get("expected_available_at"), f"{path}.expected_available_at")

        if status == "unavailable":
            _text(record.get("unavailability_reason"), f"{path}.unavailability_reason")
            parse_utc(record.get("status_observed_at"), f"{path}.status_observed_at")
            _http_url(record.get("status_evidence_url"), f"{path}.status_evidence_url")
        elif record.get("status_observed_at") is not None:
            parse_utc(record.get("status_observed_at"), f"{path}.status_observed_at")

    return root


def load_registry(path: str | Path = DEFAULT_REGISTRY) -> dict[str, Any]:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AvailabilityError(f"Could not read registry at {path}: {error}") from error
    return validate_registry(payload)


def check_as_of(registry: dict[str, Any], issue_time: str | datetime) -> dict[str, Any]:
    """Return verified inputs whose first successful request was no later than issue_time."""
    root = validate_registry(registry)
    issue = parse_utc(issue_time, "issue_time") if isinstance(issue_time, str) else issue_time
    if issue.tzinfo is None or issue.utcoffset() != timezone.utc.utcoffset(issue):
        raise AvailabilityError("issue_time must have a UTC timezone.")
    issue = issue.astimezone(timezone.utc)
    eligible: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []

    for record in root["availability_records"]:
        status = record["availability_status"]
        disposition = status
        if status == "verified_available":
            published = parse_utc(record["publication_timestamp"], "publication_timestamp")
            disposition = "verified_available" if published <= issue else "verified_after_issue"
        item = {
            "record_id": record["record_id"],
            "source_id": record["source_id"],
            "variable_id": record["variable_id"],
            "units": record["units"],
            "observation_start": record["observation_start"],
            "observation_end": record["observation_end"],
            "publication_timestamp": record.get("publication_timestamp"),
            "availability_status": disposition,
            "data_quality_flags": record["data_quality_flags"],
        }
        if disposition == "verified_available":
            eligible.append(item)
        else:
            excluded.append(item)

    return {
        "registry_version": SCHEMA_VERSION,
        "issue_time": issue.isoformat().replace("+00:00", "Z"),
        "status": "verified_inputs_found" if eligible else "no_verified_inputs",
        "demonstrably_available": eligible,
        "excluded_or_unverified": excluded,
        "forecast_authorized": False,
        "note": "This report is an availability audit only; it does not issue a forecast.",
    }
