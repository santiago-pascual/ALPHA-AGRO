"""Capture and replay complete NASA GLDAS research input vintages."""
import argparse
from calendar import monthrange
from datetime import date, datetime, timezone
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic

import netCDF4 as nc
import numpy as np
import requests

from .acquisition import AcquisitionError, NETCDF4_MAGIC, PRODUCTS, checksum, discover, valid_data_url
from .auth import earthdata_token
from .benchmark import LAYERS
from .history import validate as validate_soil
from .multivariable import DRIVERS, fields
from .predictive.contract import VALUE_COLUMNS
from .predictive.prospective import append, fingerprint, read
from .relationships import convert
from .trends import _cell_areas

PRODUCT = PRODUCTS["monthly"]
NAMES = (*LAYERS, *DRIVERS)
CONSTRAINT = ";".join(("/time", "/time_bnds", "/lat[88:119]", "/lon[464:491]",
                       *(f"/{name}[0][88:119][464:491]" for name in NAMES)))
MAX_BYTES = 2_000_000


def utc_now():
    return datetime.now(timezone.utc)


def month_start(value):
    parsed = date.fromisoformat(value)
    if parsed.day != 1 or parsed < date(2000, 1, 1):
        raise ValueError("Use a GLDAS UTC month start from 2000 onward.")
    return parsed


def endpoint(source):
    filename = source["filename"]
    start = date.fromisoformat(source["start"][:10])
    if (source["collection_id"] != PRODUCT.collection or source["version"] != PRODUCT.version
            or source["doi"] != PRODUCT.doi or start.day != 1
            or filename != f"GLDAS_NOAH025_M.A{start:%Y%m}.021.nc4"
            or not valid_data_url(source["url"], PRODUCT, filename)
            or not source["granule_id"].startswith("G")
            or not source["granule_id"].endswith("-GES_DISC")):
        raise ValueError("Source is not the pinned monthly main-production granule.")
    return (f"https://opendap.earthdata.nasa.gov/collections/{PRODUCT.collection}/granules/"
            f"{PRODUCT.short_name}.2.1%253A{filename}.dap.nc4")


def transfer(session, source, token, path, clock):
    url = endpoint(source)
    requested = clock()
    started = monotonic()
    total = 0
    # Authorization is scoped to the NASA OPeNDAP origin. Reject redirect and partial responses.
    with session.get(url, params={"dap4.ce": CONSTRAINT}, headers={"Authorization": f"Bearer {token}"},
                     timeout=(8, 12), stream=True, allow_redirects=False) as response:
        status = response.status_code
        if status in (401, 403):
            raise AcquisitionError(f"NASA OPeNDAP HTTP {status}. Check token validity and GES DISC application authorization.")
        if status != 200:
            raise AcquisitionError(f"NASA OPeNDAP HTTP {status}; a complete response is required.")
        length = response.headers.get("Content-Length")
        if response.headers.get("Content-Range") or (length is not None and int(length) > MAX_BYTES):
            raise AcquisitionError("Unexpected range response or oversized NASA export.")
        with path.open("xb") as file:
            for chunk in response.iter_content(65536):
                total += len(chunk)
                if total > MAX_BYTES or monotonic() - started > 25:
                    raise AcquisitionError("NASA export exceeded the bounded time or size limit.")
                file.write(chunk)
            file.flush()
            os.fsync(file.fileno())
        accessed = clock()
        if accessed < requested:
            raise ValueError("Local clock moved backward during receipt.")
        if length is not None and response.headers.get("Content-Encoding", "identity") == "identity" and total != int(length):
            raise AcquisitionError("NASA export was truncated.")
        with path.open("rb") as file:
            if file.read(8) != NETCDF4_MAGIC:
                raise ValueError("NASA response lacks the expected NetCDF-4 header.")
    return {"requested_at": requested.isoformat(), "first_success_at": accessed.isoformat(),
            "http_status": 200, "bytes": total}


def normalize(path, source):
    timing = validate_soil(path, source)["time"]
    month = month_start(source["start"][:10])
    with nc.Dataset(path) as data:
        if set(data.variables) != {"time", "time_bnds", "lat", "lon", *NAMES}:
            raise ValueError("Unexpected or missing fields in the NASA export.")
        drivers = fields(data, allow_soil_layers=True)
        soil = sum(data[name][0].astype(float).filled(np.nan) for name in LAYERS)
        converted = [convert(name, drivers[name].astype(float).filled(np.nan), month) for name in DRIVERS]
        matrix = np.stack([soil, *converted])
        common = np.isfinite(matrix).all(axis=0)
        weights = _cell_areas(data["lat"][:], data["lon"][:])
        # Keep the same 867 physical cells as the audited historical study, not just the same count.
        mask_digest = fingerprint(common.ravel().tolist())
        if mask_digest != EXPECTED_SUPPORT or int(common.sum()) != 867:
            raise ValueError("Joint spatial support differs from the pilot's frozen grid mask.")
        average = np.average(matrix[:, common], weights=weights[common], axis=1)
    return {"month": month.strftime("%Y-%m"), "values": dict(zip(VALUE_COLUMNS, average.tolist(), strict=True))}, timing


# Fingerprint the canonical boolean vector, ordered by ascending latitude and longitude.
EXPECTED_SUPPORT = "6ffa2c4be75815106a40b78a4f7f6ecc59305e6363cb568d5ae96ba49c21d5f1"


def audit(bundle):
    manifest = read(bundle / "capture.json")
    source = manifest["source"]
    path = bundle / "export.nc4"
    snapshot, timing = normalize(path, source)
    digest = checksum(path)
    if (manifest["bundle_version"] != "gldas_vintage_v1" or manifest["asset_sha256"] != digest
            or manifest["snapshot_sha256"] != fingerprint(snapshot) or snapshot != read(bundle / "snapshot.json")
            or manifest["bytes"] != path.stat().st_size or manifest["timing"] != timing
            or manifest["endpoint"] != endpoint(source) or manifest["constraint"] != CONSTRAINT
            or manifest["http_status"] != 200):
        raise ValueError("Vintage archive failed offline replay.")
    start, end = map(datetime.fromisoformat, timing["bounds_utc"])
    accessed = datetime.fromisoformat(manifest["first_success_at"])
    requested = datetime.fromisoformat(manifest["requested_at"])
    if not end <= requested <= accessed:
        raise ValueError("Invalid observation, request or access ordering.")
    return {"collection": PRODUCT.collection, "version": PRODUCT.version, "scope": "pampas-study-box",
            "asset_id": source["granule_id"], "observation_start": start.isoformat(),
            "observation_end": end.isoformat(), "provider_publication_at": None,
            "first_success_at": manifest["first_success_at"], "snapshot_sha256": fingerprint(snapshot),
            "soil_sha256": digest, "driver_sha256": digest,
            "checksum_scope": "full_validated_assets", "usable_scientific_data": True,
            "capture_manifest_sha256": fingerprint(manifest),
            "evidence_status": "local_candidate_unwitnessed"}


def capture(root, month, session, token, clock=utc_now):
    day_end = month.replace(day=monthrange(month.year, month.month)[1])
    source, = discover(session, PRODUCT, month, day_end, 1)
    root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=root) as staging:
        stage = Path(staging) / "bundle"
        stage.mkdir()
        path = stage / "export.nc4"
        access = transfer(session, source, token, path, clock)
        snapshot, timing = normalize(path, source)
        identity = checksum(path)
        result = {"bundle_version": "gldas_vintage_v1", "source": source, "endpoint": endpoint(source),
                  "constraint": CONSTRAINT, "asset_sha256": identity, "snapshot_sha256": fingerprint(snapshot),
                  "timing": timing, **access}
        append(stage / "snapshot.json", snapshot)
        append(stage / "capture.json", result)
        evidence = audit(stage)
        append(stage / "candidate-receipt.json", evidence)
        destination = root / month.strftime("%Y-%m") / identity
        destination.parent.mkdir(exist_ok=True)
        # Protect the first local receipt for this byte identity. Revisions get their own directories.
        if destination.exists():
            if audit(destination) != read(destination / "candidate-receipt.json"):
                raise ValueError("Archived candidate receipt differs from offline replay.")
        else:
            stage.rename(destination)
        return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    take = sub.add_parser("capture")
    take.add_argument("--month", required=True, type=month_start)
    take.add_argument("--root", required=True, type=Path)
    take.add_argument("--prompt-token", action="store_true")
    verify = sub.add_parser("audit")
    verify.add_argument("--bundle", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == "audit":
            evidence = audit(args.bundle)
            if evidence != read(args.bundle / "candidate-receipt.json"):
                raise ValueError("Candidate receipt differs from offline replay.")
            print(f"Verified bytes and normalization for {evidence['asset_id']}; local receipt is unwitnessed.")
            return
        token = earthdata_token(prompt=args.prompt_token)
        if not token:
            raise ValueError("No Earthdata token available to this CLI. Authorize GES DISC and configure the hidden prompt or credential store.")
        with requests.Session() as session:
            session.trust_env = False
            path = capture(args.root, args.month, session, token)
        print(f"Captured locally observed NASA vintage: {path}")
    except requests.RequestException:
        parser.exit(2, "Vintage withheld: NASA request failed before a complete validated response.\n")
    except (AcquisitionError, ValueError, OSError, KeyError, TypeError, RuntimeError) as exc:
        parser.exit(2, f"Vintage withheld: {exc}\n")


if __name__ == "__main__":
    main()
