"""Discover official GLDAS granules and preserve their original bytes."""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from hashlib import file_digest
import json
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from time import sleep
from urllib.parse import urlsplit

import requests

CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
DATA_HOST = "data.gesdisc.earthdata.nasa.gov"
RETRYABLE = {408, 429, 500, 502, 503, 504}
NETCDF4_MAGIC = b"\x89HDF\r\n\x1a\n"


class AcquisitionError(RuntimeError):
    pass


@dataclass(frozen=True)
class Product:
    short_name: str
    collection: str
    doi: str
    version: str = "2.1"


PRODUCTS = {
    "monthly": Product("GLDAS_NOAH025_M", "C1342986036-GES_DISC", "10.5067/SXAVCZFAQLNO"),
    "3hourly": Product("GLDAS_NOAH025_3H", "C1342986035-GES_DISC", "10.5067/E7TYRXPJKWOQ"),
}


def expected_slots(product, start, end):
    if start > end or start < date(2000, 1, 1):
        raise AcquisitionError("Use ordered dates on or after 2000-01-01.")
    if product == PRODUCTS["monthly"]:
        if start.day != 1 or end.day != monthrange(end.year, end.month)[1]:
            raise AcquisitionError("Monthly requests must contain full calendar months.")
        count = (end.year - start.year) * 12 + end.month - start.month + 1
        return count, None
    return ((end - start).days + 1) * 8, timedelta(hours=3)


def retry(action):
    for attempt in range(3):
        try:
            return action()
        except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError):
            if attempt == 2:
                raise AcquisitionError("NASA request failed after three attempts.") from None
        except requests.HTTPError as error:
            response = error.response
            status = response.status_code
            if status not in RETRYABLE or attempt == 2:
                raise AcquisitionError(f"NASA request failed with HTTP {status}.") from None
        except requests.RequestException:
            raise AcquisitionError("Could not send the NASA request.") from None
        sleep(2**attempt)


def discover(session, product, start, end, limit):
    count, step = expected_slots(product, start, end)
    if not 1 <= limit <= 200 or count > limit:
        raise AcquisitionError(f"The request needs {count} granules. Set a limit of at most 200 and use small batches.")

    def query():
        with session.get(CMR, params={
            "collection_concept_id": product.collection,
            "temporal": f"{start}T00:00:00Z,{end}T23:59:59.999Z",
            "page_size": count + 1,
            "sort_key": "start_date",
        }, timeout=(10, 45)) as response:
            response.raise_for_status()
            return response.json()["items"]

    items = retry(query)
    if len(items) != count:
        raise AcquisitionError(f"CMR returned {len(items)} granules for {count} expected slots.")
    slot = datetime.combine(start, datetime.min.time(), timezone.utc)
    granules = []
    for item in items:
        metadata = item["umm"]
        times = metadata["TemporalExtent"]["RangeDateTime"]
        actual = datetime.fromisoformat(times["BeginningDateTime"])
        if actual != slot:
            raise AcquisitionError(f"CMR gap or duplicate at {slot.isoformat()}.")
        reported_name = metadata["GranuleUR"].split(":")[-1]
        stamp = slot.strftime("%Y%m" if product == PRODUCTS["monthly"] else "%Y%m%d.%H%M")
        name = f"{product.short_name}.A{stamp}.021.nc4"
        links = [entry["URL"] for entry in metadata.get("RelatedUrls", [])
                 if entry.get("Type") == "GET DATA" and valid_data_url(entry["URL"], product, name)]
        if reported_name != name or len(set(links)) != 1:
            raise AcquisitionError(f"CMR did not provide a unique official download for {name}.")
        granules.append({
            "filename": name, "url": links[0], "granule_id": item["meta"]["concept-id"],
            "start": times["BeginningDateTime"], "end": times["EndingDateTime"],
            "collection_id": product.collection, "version": product.version, "doi": product.doi,
        })
        slot += step or timedelta(days=monthrange(slot.year, slot.month)[1])
    return granules


def valid_data_url(url, product, filename):
    parsed = urlsplit(url)
    return (
        parsed.scheme == "https" and parsed.netloc == DATA_HOST
        and re.fullmatch(
            rf"/data/GLDAS/{re.escape(product.short_name)}\.2\.1/\d{{4}}/(?:\d{{3}}/)?{re.escape(filename)}",
            parsed.path,
        ) is not None and not parsed.query and not parsed.fragment
    )


def checksum(path):
    with Path(path).open("rb") as source:
        return file_digest(source, "sha256").hexdigest()


def write_json(path, value):
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temp = Path(file.name)
        try:
            json.dump(value, file, indent=2, sort_keys=True, allow_nan=False)
            file.write("\n")
        except Exception:
            file.close()
            temp.unlink(missing_ok=True)
            raise
    try:
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def preserve(session, granule, raw_dir, token=None, local=None):
    """Write raw bytes once and verify any existing provenance before reuse."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / granule["filename"]
    manifest = raw_dir / f"{path.name}.json"
    if path.exists() and manifest.exists():
        record = json.loads(manifest.read_text(encoding="utf-8"))
        if (any(record.get(key) != value for key, value in granule.items())
                or record.get("sha256") != checksum(path)
                or record.get("bytes") != path.stat().st_size
                or (local is not None and checksum(local) != record["sha256"])):
            raise AcquisitionError(f"Raw provenance or checksum mismatch for {path.name}.")
        return path, record
    if manifest.exists() or (path.exists() and local is None):
        raise AcquisitionError(f"Incomplete raw provenance for {path.name}; inspect the raw directory.")
    if local is None and not token:
        raise AcquisitionError("Supply EARTHDATA_TOKEN, --prompt-token, or --local-file.")
    if local is None and re.fullmatch(r"[A-Za-z0-9._~+/=-]+", token) is None:
        raise AcquisitionError("The Earthdata token contains unexpected characters.")

    def transfer():
        with NamedTemporaryFile(dir=raw_dir, delete=False) as temp_file:
            temp = Path(temp_file.name)
            try:
                if local is not None:
                    with local.open("rb") as source:
                        for chunk in iter(lambda: source.read(1024 * 1024), b""):
                            temp_file.write(chunk)
                    expected = local.stat().st_size
                else:
                    with session.get(granule["url"], headers={"Authorization": f"Bearer {token}"},
                                     timeout=(10, 60), stream=True, allow_redirects=False) as response:
                        if response.is_redirect or response.status_code in {401, 403}:
                            raise AcquisitionError(
                                "GES DISC requires authorized Earthdata access. Check the token and GES DISC "
                                "authorization, or import the official file after a browser download."
                            )
                        response.raise_for_status()
                        for chunk in response.iter_content(1024 * 1024):
                            temp_file.write(chunk)
                        expected = response.headers.get("Content-Length") if not response.headers.get("Content-Encoding") else None
                temp_file.close()
                if expected is not None and temp.stat().st_size != int(expected):
                    raise requests.exceptions.ChunkedEncodingError("Incomplete NASA response")
                with temp.open("rb") as source:
                    if source.read(8) != NETCDF4_MAGIC:
                        raise AcquisitionError("Expected original NetCDF-4 bytes; received another format.")
                return temp
            except BaseException:
                temp_file.close()
                temp.unlink(missing_ok=True)
                raise

    incoming = retry(transfer)
    try:
        digest = checksum(incoming)
        try:
            path.hardlink_to(incoming)
        except FileExistsError:
            if checksum(path) != digest:
                raise AcquisitionError(f"Refusing to replace different raw bytes at {path.name}.") from None
        record = {**granule, "sha256": digest, "bytes": path.stat().st_size,
                  "method": "supplied_file" if local is not None else "ges_disc_https",
                  "recorded_at_utc": datetime.now(timezone.utc).isoformat()}
        write_json(manifest, record)
        return path, record
    finally:
        incoming.unlink(missing_ok=True)
