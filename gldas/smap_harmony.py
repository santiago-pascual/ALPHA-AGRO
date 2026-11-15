"""Submit and preserve small NASA Harmony SMAP regional batches."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from urllib.parse import parse_qs, unquote, urlsplit

import requests

from .acquisition import AcquisitionError, NETCDF4_MAGIC, checksum, retry, write_json
from .auth import earthdata_token
from .smap import COLLECTION, DOI

HOST = "harmony.earthdata.nasa.gov"
BASE = "https://" + HOST
CDN = "dqzb5lcolc8fj.cloudfront.net"
MOISTURE = "V3707348437-NSIDC_CPRD"
JOB = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
NAME = r"SMAP_L4_SM_gph_\d{8}T\d{6}_Vv8\d+_\d{3}_Geophysical_Data_sm_rootzone_subsetted\.nc4"


def submit(session, headers, start, end):
    days = (end - start).days + 1
    if not 1 <= days <= 7:
        raise AcquisitionError("Use Harmony batches of one to seven days.")
    endpoint = f"{BASE}/{COLLECTION}/ogc-api-coverages/1.0.0/collections/{MOISTURE}/coverage/rangeset"
    params = [
        ("subset", "lon(-64:-57)"), ("subset", "lat(-38:-30)"),
        ("subset", f'time("{start}T00:00:01Z":"{end}T23:59:59Z")'),
        ("format", "application/netcdf"), ("maxResults", days * 8),
        ("forceAsync", "true"), ("skipPreview", "true"),
    ]
    # A one-second offset omits the prior averaging interval ending at midnight.
    with session.get(endpoint, params=params, headers=headers, allow_redirects=False, timeout=(8, 20)) as response:
        location = response.headers.get("Location", "")
        if response.status_code != 303 or not re.fullmatch(rf"/jobs/{JOB}", location):
            raise AcquisitionError(f"Harmony did not accept the subset job (HTTP {response.status_code}).")
    return location.rsplit("/", 1)[-1]


def output_name(link):
    url = urlsplit(link)
    name = unquote(url.path.rsplit("/", 1)[-1])
    if url.scheme != "https" or url.netloc != HOST or url.query or url.fragment or not re.fullmatch(NAME, name):
        raise AcquisitionError("Unexpected Harmony result location or product filename.")
    return name


def download(session, headers, link, path):
    def fetch():
        with session.get(link, headers=headers, stream=True, allow_redirects=False, timeout=(8, 20)) as response:
            destination = response.headers.get("Location", "")
            parsed = urlsplit(destination)
            if (response.status_code != 307 or parsed.scheme != "https" or parsed.netloc != CDN or parsed.fragment
                    or unquote(parsed.path.rsplit("/", 1)[-1]) != path.name
                    or "X-Amz-Signature" not in parse_qs(parsed.query)):
                raise AcquisitionError(f"Unexpected Harmony output redirect (HTTP {response.status_code}).")
        with session.get(destination, stream=True, allow_redirects=False, timeout=(8, 20)) as response:
            response.raise_for_status()
            if response.status_code != 200 or response.headers.get("Content-Range"):
                raise AcquisitionError("Harmony returned a partial subset.")
            size = 0
            with path.open("wb") as f:
                for block in response.iter_content(65536):
                    size += len(block)
                    if size > 1_000_000:
                        raise AcquisitionError("Harmony result exceeded the subset transfer budget.")
                    f.write(block)
            length = response.headers.get("Content-Length")
            if length is not None and size != int(length):
                raise requests.exceptions.ChunkedEncodingError("Incomplete Harmony subset.")
        with path.open("rb") as f:
            if f.read(8) != NETCDF4_MAGIC:
                raise AcquisitionError("Expected a complete Harmony NetCDF-4 result.")
        return size

    return retry(fetch)


def collect(session, headers, job, root, *, workers=1):
    if not re.fullmatch(JOB, job) or not 1 <= workers <= 4:
        raise ValueError("Use a Harmony job ID.")
    status_url = f"{BASE}/jobs/{job}"
    with session.get(status_url, headers=headers, allow_redirects=False, timeout=(8, 20)) as response:
        if response.status_code != 200:
            raise AcquisitionError(f"Harmony job HTTP {response.status_code}.")
        status = response.json()
    if status.get("status") != "successful":
        raise AcquisitionError(f"Harmony job status: {status.get('status', 'unknown')}.")
    results = [x["href"] for x in status["links"] if x["rel"] == "data"]
    if not results or len(results) > 56 or len(results) != len({output_name(link) for link in results}):
        raise AcquisitionError("Harmony result count is outside the validated batch limit.")
    archive = root / job
    if archive.exists():
        record = json.loads((archive / "capture.json").read_text(encoding="utf-8"))
        verified = read_manifest(archive, record)
        if len(verified) == len(results) and {p.name for p in verified} == {output_name(link) for link in results}:
            return archive
        raise AcquisitionError("Existing Harmony output list changed.")
    root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=root) as stage:
        bundle = Path(stage) / "bundle"
        bundle.mkdir()
        def collect_group(client, links):
            files = []
            for link in links:
                path = bundle / output_name(link)
                size = download(client, headers, link, path)
                files.append({"name": path.name, "bytes": size, "sha256": checksum(path)})
            return files

        if workers == 1:
            files = collect_group(session, results)
        else:
            def collect_with_session(links):
                with requests.Session() as client:
                    client.trust_env = False
                    return collect_group(client, links)

            with ThreadPoolExecutor(max_workers=workers) as executor:
                groups = executor.map(collect_with_session, [results[i::workers] for i in range(workers)])
                files = [record for group in groups for record in group]
        files.sort(key=lambda record: record["name"])
        manifest = {"schema": "smap_harmony_capture_v1", "collection": COLLECTION, "doi": DOI, "version": "008",
                    "job": job, "source": status_url, "provider_sizes": {k: status.get(k) for k in
                    ("originalDataSize", "outputDataSize")}, "files": files,
                    "locally_accessed_at": datetime.now(timezone.utc).isoformat(), "availability_verified": False}
        write_json(bundle / "capture.json", manifest)
        bundle.rename(archive)
    return archive


def read_manifest(bundle, record):
    if (record["schema"] != "smap_harmony_capture_v1" or record["collection"] != COLLECTION
            or record["doi"] != DOI or record["version"] != "008" or record["job"] != bundle.name):
        raise ValueError("Unexpected Harmony manifest source.")
    result = []
    for item in record["files"]:
        if not re.fullmatch(NAME, item["name"]):
            raise ValueError("Unexpected result filename.")
        path = bundle / item["name"]
        if path.stat().st_size != item["bytes"] or checksum(path) != item["sha256"]:
            raise ValueError("Harmony result checksum mismatch.")
        result.append(path)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    request = sub.add_parser("submit")
    request.add_argument("--start", type=date.fromisoformat, required=True)
    request.add_argument("--end", type=date.fromisoformat, required=True)
    retrieve = sub.add_parser("collect")
    retrieve.add_argument("--job", required=True)
    retrieve.add_argument("--archive", type=Path, required=True)
    retrieve.add_argument("--workers", type=int, choices=range(1, 5), default=1)
    for p in (request, retrieve):
        p.add_argument("--prompt-token", action="store_true")
    a = parser.parse_args()
    try:
        token = earthdata_token(prompt=a.prompt_token)
        if not token:
            raise AcquisitionError("Configure NASA Earthdata authentication for Harmony.")
        with requests.Session() as session:
            session.trust_env = False
            headers = {"Authorization": f"Bearer {token}"}
            if a.action == "submit":
                print(submit(session, headers, a.start, a.end))
            else:
                print(collect(session, headers, a.job, a.archive, workers=a.workers))
    except requests.RequestException:
        parser.exit(2, "Harmony request failed before a complete verified response.\n")
    except (ValueError, OSError, KeyError, AcquisitionError) as exc:
        parser.exit(2, f"Harmony subset withheld: {exc}\n")


if __name__ == "__main__":
    main()
