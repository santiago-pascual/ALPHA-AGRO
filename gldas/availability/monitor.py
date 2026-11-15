"""Small, append-only probes for NASA product discovery and asset access.

The monitor never interprets request failure as evidence that a product was
unpublished. Partial asset reads establish byte access only, not usable science.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPBasicAuthHandler, HTTPPasswordMgrWithDefaultRealm, Request, build_opener
from urllib.request import urlopen as _urlopen


USER_AGENT = "QuantAlphaAgroAvailabilityMonitor/0.1 (NASA source availability research)"
DEFAULT_DB = Path("data/availability/asset_availability.sqlite3")
CMR_ENDPOINT = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point"
PAMPAS_POINT = {"longitude": -60.0, "latitude": -34.0}
PREFIX_LIMIT = 4096
HDF5_MAGIC = b"\x89HDF\r\n\x1a\n"
DATA_MAGIC = (HDF5_MAGIC, b"CDF\x01", b"CDF\x02", b"\x0e\x03\x13\x01")


@dataclass(frozen=True)
class ProbeResult:
    requested_at_utc: str
    completed_at_utc: str
    successful_access_at_utc: str | None
    source_id: str
    product_id: str
    variable_id: str
    units: str
    asset_identifier: str
    observation_start_utc: str | None
    observation_end_utc: str | None
    endpoint_role: str
    request_url: str
    spatial_support: str
    http_status: int | None
    availability_status: str
    metadata_access_success: bool
    asset_retrieval_success: bool
    usable_scientific_data: bool
    content_version: str | None
    response_bytes: int
    sha256: str | None
    checksum_scope: str | None
    quality_flags: tuple[str, ...]
    error_class: str | None = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _safe_url(value: str) -> str:
    """Keep provenance URLs without persisting credentials or signed query tokens."""
    parts = urlsplit(value)
    safe_query = [(key, "[REDACTED]" if key.casefold() in {
        "token", "access_token", "auth", "authorization", "signature", "sig", "password", "credential", "key",
    } else val) for key, val in parse_qsl(parts.query, keep_blank_values=True)]
    host = parts.hostname or ""
    if parts.port:
        host += f":{parts.port}"
    return urlunsplit((parts.scheme, host, parts.path, urlencode(safe_query), ""))


def _is_official_nasa_url(value: str) -> bool:
    parts = urlsplit(value)
    host = (parts.hostname or "").casefold()
    return parts.scheme == "https" and (host == "nasa.gov" or host.endswith(".nasa.gov"))


def _month_bounds(month: date) -> tuple[str, str]:
    start = month.replace(day=1)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return _iso(datetime.combine(start, datetime.min.time(), timezone.utc)), _iso(datetime.combine(end, datetime.min.time(), timezone.utc))


def _default_observation_day() -> date:
    return utc_now().date() - timedelta(days=1)


def _gldas_month_as_of(today: date) -> date:
    """Probe a conservative four-month-old complete month (documented lag only)."""
    index = today.year * 12 + today.month - 1 - 4
    return date(index // 12, index % 12 + 1, 1)


class AvailabilityStore:
    """SQLite append-only event store; updates/deletes are rejected by triggers."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS probe_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                requested_at_utc TEXT NOT NULL,
                completed_at_utc TEXT NOT NULL,
                successful_access_at_utc TEXT,
                source_id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                variable_id TEXT NOT NULL,
                units TEXT NOT NULL,
                asset_identifier TEXT NOT NULL,
                observation_start_utc TEXT,
                observation_end_utc TEXT,
                endpoint_role TEXT NOT NULL,
                request_url TEXT NOT NULL,
                spatial_support TEXT NOT NULL,
                http_status INTEGER,
                availability_status TEXT NOT NULL,
                metadata_access_success INTEGER NOT NULL,
                asset_retrieval_success INTEGER NOT NULL,
                usable_scientific_data INTEGER NOT NULL,
                content_version TEXT,
                response_bytes INTEGER NOT NULL,
                sha256 TEXT,
                checksum_scope TEXT,
                quality_flags_json TEXT NOT NULL,
                error_class TEXT
            )
        """)
        self.connection.execute("""
            CREATE TRIGGER IF NOT EXISTS probe_events_no_update
            BEFORE UPDATE ON probe_events BEGIN SELECT RAISE(ABORT, 'probe events are append-only'); END
        """)
        self.connection.execute("""
            CREATE TRIGGER IF NOT EXISTS probe_events_no_delete
            BEFORE DELETE ON probe_events BEGIN SELECT RAISE(ABORT, 'probe events are append-only'); END
        """)
        self.connection.commit()

    def append(self, result: ProbeResult) -> None:
        row = asdict(result)
        row["quality_flags_json"] = json.dumps(row.pop("quality_flags"), separators=(",", ":"))
        for key in ("metadata_access_success", "asset_retrieval_success", "usable_scientific_data"):
            row[key] = int(row[key])
        columns = ",".join(row)
        placeholders = ",".join("?" for _ in row)
        self.connection.execute(f"INSERT INTO probe_events ({columns}) VALUES ({placeholders})", tuple(row.values()))
        self.connection.commit()

    def summary(self) -> dict[str, Any]:
        rows = self.connection.execute("SELECT * FROM probe_events ORDER BY event_id").fetchall()
        return {
            "event_count": len(rows),
            "verified_observations": [dict(row) for row in rows if row["availability_status"] == "verified_available"],
            "metadata_only": [dict(row) for row in rows if row["availability_status"] == "unknown" and row["metadata_access_success"]],
            "unknown_or_failed": [dict(row) for row in rows if row["availability_status"] == "unknown" and not row["metadata_access_success"]],
            "usable_science_count": sum(row["usable_scientific_data"] for row in rows),
        }

    def close(self) -> None:
        self.connection.close()


class NASAAssetMonitor:
    """Probe POWER daily JSON plus public CMR metadata and tiny asset prefixes."""

    def __init__(
        self,
        store: AvailabilityStore,
        *,
        transport: Callable[..., Any] | None = None,
        clock: Callable[[], datetime] = utc_now,
        timeout: float = 12,
        prefix_limit: int = PREFIX_LIMIT,
        earthdata_username: str | None = None,
        earthdata_password: str | None = None,
    ):
        self.store = store
        self.transport = transport or _urlopen
        self.clock = clock
        self.timeout = timeout
        self.prefix_limit = prefix_limit
        self.earthdata_username = earthdata_username if earthdata_username is not None else os.getenv("NASA_EARTHDATA_USERNAME")
        self.earthdata_password = earthdata_password if earthdata_password is not None else os.getenv("NASA_EARTHDATA_PASSWORD")

    def _request(self, url: str, *, range_bytes: bool = False) -> tuple[int | None, Any, bytes, str | None]:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json, application/x-netcdf, application/octet-stream;q=0.9, */*;q=0.5"}
        if range_bytes:
            headers["Range"] = f"bytes=0-{self.prefix_limit - 1}"
        request = Request(url, headers=headers)
        try:
            if self.earthdata_username and self.earthdata_password and "cmr.earthdata.nasa.gov" not in url:
                # Credentials are only enabled from explicit environment variables and are
                # scoped to NASA Earthdata/DAAC hosts. Never put them in URLs or logs.
                password_manager = HTTPPasswordMgrWithDefaultRealm()
                for host in ("https://urs.earthdata.nasa.gov/", "https://disc.gsfc.nasa.gov/", "https://hydro1.gesdisc.eosdis.nasa.gov/", "https://gpm1.gesdisc.eosdis.nasa.gov/", "https://data.gesdisc.earthdata.nasa.gov/"):
                    password_manager.add_password(None, host, self.earthdata_username, self.earthdata_password)
                opener = build_opener(HTTPBasicAuthHandler(password_manager))
                response = opener.open(request, timeout=self.timeout)
            else:
                response = self.transport(request, timeout=self.timeout)
            with response:
                body = response.read(self.prefix_limit + 1 if range_bytes else 2_000_000)
                return response.status, response.headers, body, None
        except HTTPError as error:
            with error:
                return error.code, error.headers, error.read(self.prefix_limit + 1), None
        except (URLError, TimeoutError, OSError) as error:
            return None, {}, b"", type(error).__name__

    def _record(self, **kwargs: Any) -> ProbeResult:
        now = _iso(self.clock())
        result = ProbeResult(
            requested_at_utc=kwargs.pop("requested_at_utc"), completed_at_utc=now,
            successful_access_at_utc=kwargs.pop("successful_access_at_utc", None),
            source_id=kwargs.pop("source_id"), product_id=kwargs.pop("product_id"),
            variable_id=kwargs.pop("variable_id"), units=kwargs.pop("units"),
            asset_identifier=kwargs.pop("asset_identifier"),
            observation_start_utc=kwargs.pop("observation_start_utc", None),
            observation_end_utc=kwargs.pop("observation_end_utc", None),
            endpoint_role=kwargs.pop("endpoint_role"), request_url=_safe_url(kwargs.pop("request_url")),
            spatial_support=kwargs.pop("spatial_support"),
            http_status=kwargs.pop("http_status", None), availability_status=kwargs.pop("availability_status"),
            metadata_access_success=kwargs.pop("metadata_access_success", False),
            asset_retrieval_success=kwargs.pop("asset_retrieval_success", False),
            usable_scientific_data=kwargs.pop("usable_scientific_data", False),
            content_version=kwargs.pop("content_version", None), response_bytes=kwargs.pop("response_bytes", 0),
            sha256=kwargs.pop("sha256", None), checksum_scope=kwargs.pop("checksum_scope", None),
            quality_flags=tuple(kwargs.pop("quality_flags", ())), error_class=kwargs.pop("error_class", None),
        )
        self.store.append(result)
        return result

    def probe_power(self, observation_day: date) -> ProbeResult:
        stamp = _iso(self.clock())
        date_text = observation_day.strftime("%Y%m%d")
        url = POWER_ENDPOINT + "?" + urlencode({
            "parameters": "T2M", "community": "AG", "longitude": PAMPAS_POINT["longitude"],
            "latitude": PAMPAS_POINT["latitude"], "start": date_text, "end": date_text,
            "format": "JSON", "time-standard": "UTC",
        })
        status, headers, body, error = self._request(url)
        parsed: dict[str, Any] = {}
        valid_data = False
        content_version = None
        flags: list[str] = []
        try:
            parsed = json.loads(body.decode("utf-8")) if body else {}
            properties = parsed.get("properties", {})
            header = parsed.get("header", {})
            content_version = header.get("api", {}).get("version") or header.get("api")
            value = properties.get("parameter", {}).get("T2M", {}).get(date_text)
            valid_data = status is not None and 200 <= status < 300 and isinstance(value, (int, float)) and math.isfinite(value) and value != -999
            if valid_data:
                flags.append("POWER_JSON_PARAMETER_VALUE_PRESENT")
            elif status is not None and 200 <= status < 300:
                flags.append("NO_USABLE_T2M_VALUE_FOR_REQUESTED_DAY")
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            flags.append("POWER_RESPONSE_NOT_VALID_JSON")
        if error:
            flags.append("NETWORK_OR_TRANSPORT_ERROR; NOT EVIDENCE_OF_UNPUBLICATION")
        if status == 429:
            flags.append("RATE_LIMITED; RETRY_LATER")
        if status in (401, 403):
            flags.append("AUTHORIZATION_FAILURE; AVAILABILITY_UNKNOWN")
        if status == 404:
            flags.append("HTTP_404; NOT_EVIDENCE_OF_UNPUBLICATION")
        if status is not None and status >= 500:
            flags.append("UPSTREAM_SERVER_ERROR; AVAILABILITY_UNKNOWN")
        digest = hashlib.sha256(body).hexdigest() if body else None
        return self._record(
            requested_at_utc=stamp, source_id="nasa_power_daily_meteorology", product_id="POWER Daily API meteorology",
            variable_id="T2M", units="degC",
            asset_identifier=f"POWER:T2M:{date_text}:{PAMPAS_POINT['latitude']},{PAMPAS_POINT['longitude']}",
            observation_start_utc=_iso(datetime.combine(observation_day, datetime.min.time(), timezone.utc)),
            observation_end_utc=_iso(datetime.combine(observation_day + timedelta(days=1), datetime.min.time(), timezone.utc)),
            endpoint_role="scientific_data_response", request_url=url,
            spatial_support=f"point latitude={PAMPAS_POINT['latitude']}, longitude={PAMPAS_POINT['longitude']}; UTC daily",
            http_status=status,
            availability_status="verified_available" if valid_data else "unknown",
            successful_access_at_utc=stamp if valid_data else None,
            metadata_access_success=bool(status is not None and 200 <= status < 300 and parsed),
            asset_retrieval_success=bool(status is not None and 200 <= status < 300 and body),
            usable_scientific_data=valid_data, content_version=str(content_version) if content_version else None,
            response_bytes=len(body), sha256=digest, checksum_scope="full_response_body_sha256" if digest else None,
            quality_flags=flags, error_class=error,
        )

    def _cmr_granule(self, source_id: str, short_name: str, version: str, start: str, end: str,
                     variable_id: str, units: str) -> ProbeResult:
        stamp = _iso(self.clock())
        url = CMR_ENDPOINT + "?" + urlencode({"short_name": short_name, "version": version, "temporal[]": f"{start},{end}", "page_size": "1", "sort_key": "-start_date"})
        status, _, body, error = self._request(url)
        granule: dict[str, Any] = {}
        valid = False
        flags: list[str] = ["CMR_METADATA_ONLY_NOT_ASSET_AVAILABILITY"]
        try:
            results = json.loads(body.decode("utf-8")).get("items", [])
            granule = results[0] if results else {}
            valid = bool(status is not None and 200 <= status < 300 and granule)
            if not granule and status and 200 <= status < 300:
                flags.append("NO_GRANULE_MATCH; DOES_NOT_PROVE_PRODUCT_UNPUBLISHED")
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            flags.append("CMR_RESPONSE_NOT_VALID_UMM_JSON")
        if error:
            flags.append("NETWORK_OR_TRANSPORT_ERROR; NOT EVIDENCE_OF_UNPUBLICATION")
        if status == 429:
            flags.append("RATE_LIMITED; RETRY_LATER")
        if status in (401, 403):
            flags.append("AUTHORIZATION_FAILURE; AVAILABILITY_UNKNOWN")
        if status == 404:
            flags.append("HTTP_404; NOT_EVIDENCE_OF_UNPUBLICATION")
        if status is not None and status >= 500:
            flags.append("UPSTREAM_SERVER_ERROR; AVAILABILITY_UNKNOWN")
        umm = granule.get("umm", {})
        temporal = umm.get("TemporalExtent", {})
        temporal_range = temporal.get("RangeDateTime", {})
        obs_start = temporal_range.get("BeginningDateTime") or temporal.get("SingleDateTime")
        obs_end = temporal_range.get("EndingDateTime") or obs_start
        native_id = granule.get("meta", {}).get("native-id") or umm.get("GranuleUR") or "no_matching_granule"
        version_label = umm.get("CollectionReference", {}).get("Version") or version
        urls = umm.get("RelatedUrls", [])
        data_url = next((item.get("URL") for item in urls if item.get("Type") in ("GET DATA", "GET DATA VIA DIRECT ACCESS") and item.get("URL")), None)
        self._record(
            requested_at_utc=stamp, source_id=source_id, product_id=short_name, variable_id=variable_id, units=units,
            asset_identifier=str(native_id),
            observation_start_utc=obs_start, observation_end_utc=obs_end, endpoint_role="catalog_metadata",
            request_url=url, spatial_support="product grid per Phase 6A registry", http_status=status, availability_status="unknown",
            metadata_access_success=valid, asset_retrieval_success=False, usable_scientific_data=False,
            content_version=f"CMR:{version_label}" if valid else None, response_bytes=len(body),
            sha256=hashlib.sha256(body).hexdigest() if body else None,
            checksum_scope="cmr_metadata_response_sha256" if body else None, quality_flags=flags, error_class=error,
        )
        if data_url and valid and _is_official_nasa_url(data_url):
            return self._probe_asset(source_id, short_name, native_id, obs_start, obs_end, str(version_label), data_url, variable_id, units)
        return self._record(
            requested_at_utc=stamp, source_id=source_id, product_id=short_name, variable_id=variable_id, units=units,
            asset_identifier=str(native_id),
            observation_start_utc=obs_start, observation_end_utc=obs_end, endpoint_role="asset_discovery",
            request_url=url, spatial_support="product grid per Phase 6A registry", http_status=status, availability_status="unknown", metadata_access_success=valid,
            quality_flags=flags + (["NO_DIRECT_ASSET_URL"] if valid and not data_url else
                                    ["NON_OFFICIAL_ASSET_HOST_REJECTED"] if valid and data_url else ["ASSET_NOT_PROBED"]),
            error_class=error,
        )

    def _probe_asset(self, source_id: str, product_id: str, asset_id: str, obs_start: str | None,
                     obs_end: str | None, version: str, url: str, variable_id: str, units: str) -> ProbeResult:
        stamp = _iso(self.clock())
        status, headers, body, error = self._request(url, range_bytes=True)
        content_type = str(headers.get("Content-Type", "")).lower()
        expected_format = any(body.startswith(magic) for magic in DATA_MAGIC)
        data_bytes = bool(status in (200, 206) and body and "text/html" not in content_type and expected_format)
        try:
            content_length = int(headers.get("Content-Length", "-1"))
        except (TypeError, ValueError):
            content_length = -1
        full = bool(status == 200 and 0 <= content_length <= self.prefix_limit and len(body) >= content_length)
        flags: list[str] = []
        if expected_format:
            flags.append("SCIENTIFIC_CONTAINER_MAGIC_MATCHED")
        if data_bytes and not full:
            flags.append("PARTIAL_ASSET_PREFIX_ONLY; SCIENTIFIC_CONTENT_NOT_PARSED")
        if status == 206:
            flags.append("HTTP_RANGE_RESPONSE")
        if status in (401, 403):
            flags.append("AUTHORIZATION_REQUIRED_OR_DENIED; AVAILABILITY_UNKNOWN")
        if status == 404:
            flags.append("HTTP_404; NOT_EVIDENCE_OF_UNPUBLICATION")
        if status == 429:
            flags.append("RATE_LIMITED; RETRY_LATER")
        if status is not None and status >= 500:
            flags.append("UPSTREAM_SERVER_ERROR; AVAILABILITY_UNKNOWN")
        if error:
            flags.append("NETWORK_OR_TRANSPORT_ERROR; NOT EVIDENCE_OF_UNPUBLICATION")
        if status and 200 <= status < 300 and not expected_format:
            flags.append("RESPONSE_NOT_RECOGNIZED_AS_EXPECTED_SCIENTIFIC_CONTAINER")
        digest = hashlib.sha256(body).hexdigest() if data_bytes else None
        return self._record(
            requested_at_utc=stamp, source_id=source_id, product_id=product_id, variable_id=variable_id, units=units,
            asset_identifier=str(asset_id),
            observation_start_utc=obs_start, observation_end_utc=obs_end, endpoint_role="asset_byte_probe",
            request_url=url, spatial_support="product grid per Phase 6A registry", http_status=status,
            availability_status="verified_available" if data_bytes else "unknown",
            successful_access_at_utc=stamp if data_bytes else None,
            metadata_access_success=False, asset_retrieval_success=data_bytes, usable_scientific_data=full,
            content_version=version, response_bytes=len(body), sha256=digest,
            checksum_scope="asset_prefix_sha256_not_full_file" if digest else None,
            quality_flags=flags, error_class=error,
        )

    def run(self, observation_day: date | None = None, gldas_month: date | None = None) -> dict[str, Any]:
        day = observation_day or _default_observation_day()
        month = gldas_month or _gldas_month_as_of(self.clock().date())
        month_start, month_end = _month_bounds(month)
        day_start = _iso(datetime.combine(day, datetime.min.time(), timezone.utc))
        day_end = _iso(datetime.combine(day + timedelta(days=1), datetime.min.time(), timezone.utc))
        self.probe_power(day)
        self._cmr_granule("imerg_v07_late", "GPM_3IMERGDL", "07", day_start, day_end,
                          "precipitationCal", "mm hr-1")
        self._cmr_granule("gldas_noah_v21_monthly_main", "GLDAS_NOAH025_M", "2.1", month_start, month_end,
                          "SoilMoi0_10cm_inst; SoilMoi10_40cm_inst; SoilMoi40_100cm_inst", "kg m-2 (equivalent to mm water)")
        return self.store.summary()


def run_monitor(database: str | Path = DEFAULT_DB, observation_day: date | None = None,
                gldas_month: date | None = None, *, transport: Callable[..., Any] | None = None) -> dict[str, Any]:
    store = AvailabilityStore(database)
    try:
        return NASAAssetMonitor(store, transport=transport).run(observation_day, gldas_month)
    finally:
        store.close()
