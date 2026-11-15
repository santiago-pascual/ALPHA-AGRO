"""Request bounded native-resolution SMAP V008 point exports from NASA AppEEARS."""
import argparse
from datetime import date, datetime, timezone
from getpass import GetPassWarning, getpass
import json
import os
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
from time import monotonic, sleep
from urllib.parse import parse_qs, urlsplit
import warnings

import requests

from .acquisition import AcquisitionError, checksum, write_json

API = "https://appeears.earthdatacloud.nasa.gov/api"
PRODUCT = "SPL4SMGP.008"
DESIGN = Path(__file__).resolve().parents[1] / "config/smap_phase11_design_v1.json"
UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
MAX_BYTES = 150_000_000


def task(design, start, end, *, pilot=False):
    if start > end or (end - start).days >= (7 if pilot else 366):
        raise ValueError("Use seven days or less for the probe and one year or less for subsequent jobs.")
    sites = design["sites"]
    if pilot:
        sites = sites[:3]
    if not pilot and (start < date.fromisoformat(design["archive_start"]) or
                      end > date.fromisoformat(design["archive_end"])):
        raise ValueError("Use dates inside the preregistered study window.")
    return {
        "task_type": "point", "task_name": f"alpha-agro-smap-{start}-{end}-" + ("probe" if pilot else "history"),
        "params": {"dates": [{"startDate": start.strftime("%m-%d-%Y"), "endDate": end.strftime("%m-%d-%Y")}],
                   "layers": [{"product": PRODUCT, "layer": design["layer"]}],
                   "coordinates": [{"id": row["id"], "latitude": row["latitude"], "longitude": row["longitude"]}
                                   for row in sites]},
    }


def service_token(session, prompt):
    token = os.getenv("APPEEARS_TOKEN")
    if prompt:
        if not sys.stdin.isatty():
            raise ValueError("Use an interactive PowerShell terminal for the hidden login.")
        with warnings.catch_warnings():
            warnings.simplefilter("error", GetPassWarning)
            username = getpass("Earthdata username: ")
            password = getpass("Earthdata password: ")
        with session.post(f"{API}/login", auth=(username, password), allow_redirects=False, timeout=(8, 20)) as r:
            if r.status_code != 200:
                raise AcquisitionError(f"AppEEARS login returned HTTP {r.status_code}. Authorize AppEEARS in Earthdata.")
            token = r.json()["token"]
    if not token:
        raise ValueError("Use --prompt-login in your local terminal or an AppEEARS service token in APPEEARS_TOKEN.")
    if not re.fullmatch(r"[A-Za-z0-9._~+/=-]+", token):
        raise ValueError("Unexpected service-token format.")
    return {"Authorization": f"Bearer {token}"}


def service_json(session, method, route, headers, **kwargs):
    with session.request(method, f"{API}/{route}", headers=headers, allow_redirects=False, timeout=(8, 30), **kwargs) as r:
        if r.status_code not in (200, 201, 202):
            raise AcquisitionError(f"AppEEARS {route.split('/')[0]} returned HTTP {r.status_code}.")
        return r.json()


def signed_download(url):
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    query = {key.lower() for key in parse_qs(parsed.query)}
    aws_signature = "x-amz-signature" in query or {"awsaccesskeyid", "signature", "expires"} <= query
    cloudfront_signature = {"key-pair-id", "signature"} <= query and bool({"policy", "expires"} & query)
    s3 = re.fullmatch(r"(?:[a-z0-9.-]+\.)?s3(?:[.-][a-z0-9.-]+)?\.amazonaws\.com", host)
    cloudfront = re.fullmatch(r"[a-z0-9-]+\.cloudfront\.net", host)
    if (parsed.scheme != "https" or parsed.netloc != host or parsed.fragment
            or not ((s3 and aws_signature) or (cloudfront and (cloudfront_signature or aws_signature)))):
        raise AcquisitionError(f"AppEEARS redirect is not a recognized signed AWS download (host: {host or 'none'}).")
    return url


def save_file(session, url, headers, path, size):
    with session.get(url, headers=headers, stream=True, allow_redirects=False, timeout=(8, 30)) as r:
        if r.status_code == 200:
            return stream_file(r, path, size)
        if r.status_code not in (302, 303, 307):
            raise AcquisitionError(f"Unsupported AppEEARS bundle download response (HTTP {r.status_code}).")
        destination = signed_download(r.headers.get("Location", ""))
    with session.get(destination, stream=True, allow_redirects=False, timeout=(8, 30)) as r:
        if r.status_code != 200:
            raise AcquisitionError(f"Signed AppEEARS download returned HTTP {r.status_code}.")
        stream_file(r, path, size)


def stream_file(response, path, size):
    written = 0
    with path.open("xb") as f:
        for block in response.iter_content(128 * 1024):
            written += len(block)
            if written > size:
                raise AcquisitionError("Bundle response exceeds the admitted size.")
            f.write(block)
    if written != size:
        raise AcquisitionError("Truncated bundle response.")


def collect(session, headers, task_id, root):
    if not re.fullmatch(UUID, task_id):
        raise ValueError("Expected an AppEEARS task ID.")
    status = service_json(session, "GET", f"task/{task_id}", headers)
    if status.get("status") != "done":
        raise AcquisitionError(f"AppEEARS task status: {status.get('status', 'unknown')}.")
    bundle = service_json(session, "GET", f"bundle/{task_id}", headers)
    rows = [row for row in bundle["files"] if row["file_name"].lower().endswith((".csv", ".json", ".txt", ".md"))]
    if not any(row["file_name"].lower().endswith(".csv") for row in rows):
        raise AcquisitionError("AppEEARS point bundle contains no CSV.")
    if not 1 <= sum(row["file_size"] for row in rows) <= MAX_BYTES:
        raise AcquisitionError("Point bundle exceeds the bounded transfer budget.")
    path = root / task_id
    if path.exists():
        manifest = json.loads((path / "capture.json").read_text(encoding="utf-8"))
        if all(checksum(path / row["name"]) == row["sha256"] for row in manifest["files"]):
            return path
        raise AcquisitionError("Existing AppEEARS archive failed checksum replay.")
    root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=root) as temp:
        stage = Path(temp) / "bundle"
        stage.mkdir()
        files = []
        for row in rows:
            source = row["file_id"]
            name = row["file_name"]
            if not re.fullmatch(UUID, source) or not re.fullmatch(r"[A-Za-z0-9_.-]+\.(csv|json|txt|md)", name, re.I):
                raise AcquisitionError("Unexpected bundle file name or ID.")
            dest = stage / name
            save_file(session, f"{API}/bundle/{task_id}/{source}", headers, dest, row["file_size"])
            digest = checksum(dest)
            if row.get("sha256") and digest != row["sha256"]:
                raise AcquisitionError("AppEEARS product checksum mismatch.")
            files.append({"name": name, "bytes": dest.stat().st_size, "sha256": digest, "provider_sha256": row.get("sha256")})
        manifest = {"schema": "smap_appeears_capture_v1", "task_id": task_id, "files": files,
                    "source": f"{API}/bundle/{task_id}", "locally_accessed_at": datetime.now(timezone.utc).isoformat(),
                    "request": status["params"], "created": bundle.get("created")}
        write_json(stage / "capture.json", manifest)
        stage.rename(path)
    return path


def wait_for_task(session, headers, task_id, minutes):
    deadline = monotonic() + 60 * minutes
    while monotonic() < deadline:
        status = service_json(session, "GET", f"task/{task_id}", headers).get("status")
        if status == "done":
            return
        if status in {"error", "failed", "cancelled", "expired"}:
            raise AcquisitionError(f"AppEEARS task status: {status}.")
        sleep(min(20, max(0, deadline - monotonic())))
    raise AcquisitionError("Waiting interval ended. Resume with the preserved task ID.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    for name in ("request", "submit"):
        action = actions.add_parser(name)
        action.add_argument("--start", type=date.fromisoformat, required=True)
        action.add_argument("--end", type=date.fromisoformat, required=True)
        action.add_argument("--pilot", action="store_true")
        if name == "submit":
            action.add_argument("--output", type=Path, required=True)
            action.add_argument("--archive", type=Path, help="Collect a finished task with the same local login.")
            action.add_argument("--wait-minutes", type=int, choices=range(1, 61), default=15, metavar="1..60")
            action.add_argument("--prompt-login", action="store_true")
    get = actions.add_parser("collect")
    get.add_argument("--task-id", required=True)
    get.add_argument("--archive", type=Path, required=True)
    get.add_argument("--prompt-login", action="store_true")
    get.add_argument("--wait-minutes", type=int, choices=range(1, 61), metavar="1..60")
    a = parser.parse_args()
    try:
        if a.action in ("request", "submit"):
            payload = task(json.loads(DESIGN.read_text(encoding="utf-8")), a.start, a.end, pilot=a.pilot)
            if a.action == "request":
                print(json.dumps(payload, indent=2))
                return
            if a.output.exists():
                raise ValueError("Submission record already exists. Reuse its task ID.")
        with requests.Session() as session:
            session.trust_env = False
            headers = service_token(session, a.prompt_login)
            if a.action == "submit":
                response = service_json(session, "POST", "task", headers, json=payload)
                task_id = response["task_id"]
                if not re.fullmatch(UUID, task_id):
                    raise AcquisitionError("Unexpected task ID.")
                write_json(a.output, {"task_id": task_id, "request": payload})
                print(task_id, flush=True)
                if a.archive:
                    wait_for_task(session, headers, task_id, a.wait_minutes)
                    print(collect(session, headers, task_id, a.archive))
            else:
                if a.wait_minutes:
                    if not re.fullmatch(UUID, a.task_id):
                        raise ValueError("Expected an AppEEARS task ID.")
                    wait_for_task(session, headers, a.task_id, a.wait_minutes)
                print(collect(session, headers, a.task_id, a.archive))
    except (requests.RequestException, GetPassWarning, EOFError, KeyboardInterrupt):
        parser.exit(2, "AppEEARS network request or hidden login failed.\n")
    except (AcquisitionError, ValueError, OSError, KeyError) as error:
        parser.exit(2, f"AppEEARS task withheld: {error}\n")


if __name__ == "__main__":
    main()
