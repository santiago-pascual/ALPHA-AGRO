"""Acquire bounded batches of the GLDAS monthly Pampas soil-water subset."""

import argparse
from datetime import date, timedelta
import json
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from time import monotonic

import netCDF4 as nc
import numpy as np
import requests

from .acquisition import AcquisitionError, NETCDF4_MAGIC, PRODUCTS, checksum, discover, retry, write_json
from .auth import CredentialError, earthdata_token
from .benchmark import LAYERS, LIMIT, QUERY, ROOT
from .validation import ValidationError, time_metadata

FIRST = date(2006, 1, 1)
LAST = date(2025, 12, 31)
OUTPUT = ROOT / "historical-opendap"


def batch_dates(index):
    year, batch = divmod(index, 3)
    start = date(FIRST.year + year, batch * 4 + 1, 1)
    end = date(start.year + (batch == 2), (start.month + 3) % 12 + 1, 1)
    return start, end - timedelta(days=1)


def validate(path, granule):
    with nc.Dataset(path) as dataset:
        if dataset.data_model != "NETCDF4" or "GLDAS2.1" not in getattr(dataset, "title", ""):
            raise ValidationError("Expected a version 2.1 GLDAS NetCDF-4 export.")
        for axis, first, count, units in (
                ("lat", -37.875, 32, "degrees_north"), ("lon", -63.875, 28, "degrees_east")):
            variable = dataset[axis]
            values = variable[:]
            expected = first + 0.25 * np.arange(count)
            if (variable.dimensions != (axis,) or variable.units != units
                    or np.ma.getmaskarray(values).any() or not np.array_equal(values, expected)):
                raise ValidationError(f"Unexpected Pampas {axis} coordinates.")
        fields = {}
        for name, cap in zip(LAYERS, (100, 300, 600), strict=True):
            variable = dataset[name]
            values = variable[:]
            if (variable.dimensions != ("time", "lat", "lon") or values.shape != (1, 32, 28)
                    or variable.units != "kg m-2" or getattr(variable, "cell_methods", "") != "time: mean"):
                raise ValidationError(f"Unexpected monthly schema for {name}.")
            valid = values.compressed()
            if not valid.size or not np.isfinite(valid).all() or valid.min() < 0 or valid.max() > cap + 0.001:
                raise ValidationError(f"Invalid soil-water values for {name}.")
            fields[name] = {"valid_cells": int(valid.size), "masked_cells": int(values.size - valid.size)}
        return {"time": time_metadata(dataset, granule, "monthly"), "fields": fields}


def acquire(session, granule, token):
    name = granule["filename"]
    collection = granule["collection_id"]
    url = (f"https://opendap.earthdata.nasa.gov/collections/{collection}/granules/"
           f"GLDAS_NOAH025_M.2.1%253A{name}.dap.nc4")
    path = OUTPUT / name
    manifest = path.with_suffix(".json")
    provenance = {"source": granule, "endpoint": url, "constraint": QUERY, "method": "nasa_opendap_dap4"}
    if path.exists() and manifest.exists():
        record = json.loads(manifest.read_text(encoding="utf-8"))
        if (record.get("provenance") != provenance or checksum(path) != record.get("sha256")
                or path.stat().st_size != record.get("bytes")):
            raise AcquisitionError(f"Existing provenance or checksum mismatch for {name}.")
        validate(path, granule)
        return "reused"
    if manifest.exists() or path.exists():
        raise AcquisitionError(f"Incomplete artifact for {name}. Review the saved file before rerunning.")

    def retrieve():
        started = monotonic()
        total = 0
        with session.get(url, params={"dap4.ce": QUERY}, headers={"Authorization": f"Bearer {token}"},
                         timeout=(8, 15), stream=True, allow_redirects=False) as response:
            if response.is_redirect or response.status_code in {401, 403}:
                raise AcquisitionError(f"OPeNDAP access requires authorization (HTTP {response.status_code}).")
            response.raise_for_status()
            if response.status_code != 200:
                raise AcquisitionError(f"Expected a complete OPeNDAP export (HTTP {response.status_code}).")
            with temporary.open("wb") as file:
                for chunk in response.iter_content(65536):
                    total += len(chunk)
                    if total > LIMIT or monotonic() - started > 25:
                        raise AcquisitionError("OPeNDAP exceeded the per-granule transfer limit.")
                    file.write(chunk)
        return total

    with NamedTemporaryFile(dir=OUTPUT, delete=False) as file:
        temporary = Path(file.name)
    try:
        transfer_size = retry(retrieve)
        with temporary.open("rb") as file:
            if file.read(8) != NETCDF4_MAGIC:
                raise ValidationError("Provider response was not NetCDF-4.")
        report = validate(temporary, granule)
        record = {"provenance": provenance, "sha256": checksum(temporary),
                  "bytes": transfer_size, "validation": report}
        path.hardlink_to(temporary)
        write_json(manifest, record)
        return "downloaded and verified"
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batches", type=int, choices=range(1, 61), default=1,
                        metavar="1–60", help="Number of four-month batches, starting in January 2006")
    parser.add_argument("--prompt-token", action="store_true", help="Use hidden input for this run")
    args = parser.parse_args()
    try:
        token = earthdata_token(prompt=args.prompt_token, prompt_if_missing=True)
    except CredentialError as error:
        parser.error(str(error))
    if not token:
        parser.error("Use EARTHDATA_TOKEN, Windows Credential Manager, or --prompt-token.")
    try:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        with requests.Session() as session:
            session.trust_env = False
            completed = 0
            for index in range(args.batches):
                start, end = batch_dates(index)
                for granule in discover(session, PRODUCTS["monthly"], start, end, 4):
                    result = acquire(session, granule, token)
                    completed += 1
                    print(f"{granule['start'][:7]} {result} ({completed}/{4 * args.batches}).", flush=True)
    except (AcquisitionError, ValidationError) as error:
        print(f"GLDAS history: {error}", file=sys.stderr)
        return 1
    except (OSError, KeyError, AttributeError, ValueError, RuntimeError):
        print("GLDAS history: file, metadata, or validation failure.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
