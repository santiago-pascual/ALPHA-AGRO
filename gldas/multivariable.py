"""Validate and retrieve monthly GLDAS drivers on the existing Pampas grid."""

import argparse
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic, sleep

import netCDF4 as nc
import numpy as np
import requests

from .acquisition import AcquisitionError, NETCDF4_MAGIC, checksum, retry, write_json
from .auth import CredentialError, earthdata_token
from .benchmark import BASE, LAYERS, LIMIT, ROOT, STEM
from .discovery import DRIVERS
from .history import OUTPUT as SOIL
from .trend_report import INDEX, audit_inputs
from .validation import time_metadata

OUTPUT = ROOT / "multivariable-opendap"
UNITS = dict(zip(DRIVERS, ("kg m-2 s-1", "kg m-2 s-1", "K", "kg m-2", "kg m-2"), strict=True))
SPATIAL = (slice(88, 120), slice(464, 492))
QUERY = ";".join(("/time", "/time_bnds", "/lat[88:119]", "/lon[464:491]",
                  *(f"/{name}[0][88:119][464:491]" for name in DRIVERS)))
REFERENCE_SHA = "852e5f7eeab1c9017f632cef8bf07be6d8d9d365bd52d28b7b75b636b1f94602"
JANUARY_SHA = "5b60e97e2c61ad08cd3d8dc2733508607824446438803abd83e1a815c0bba523"
JANUARY = ROOT / "raw/GLDAS_NOAH025_M.A202001.021.nc4"


def fields(dataset, *, full=False, allow_soil_layers=False):
    if dataset.data_model != "NETCDF4" or "GLDAS2.1" not in dataset.title:
        raise ValueError("Expected GLDAS Noah v2.1 NetCDF-4.")
    expected = {"time", "time_bnds", "lat", "lon", *DRIVERS}
    if allow_soil_layers:
        expected.update(LAYERS)
    if not full and set(dataset.variables) != expected:
        raise ValueError("Unexpected variables in the driver export.")
    spatial = SPATIAL if full else (slice(None), slice(None))
    for axis, first, count, units, selection in zip(
            ("lat", "lon"), (-37.875, -63.875), (32, 28),
            ("degrees_north", "degrees_east"), spatial, strict=True):
        variable = dataset[axis]
        values = variable[selection]
        if (variable.dimensions != (axis,) or variable.units != units
                or np.ma.getmaskarray(values).any()
                or not np.array_equal(values, first + 0.25 * np.arange(count))):
            raise ValueError(f"Unexpected {axis} grid.")
    arrays = {}
    for name, units in UNITS.items():
        variable = dataset[name]
        values = variable[(0, *spatial)]
        if (variable.dimensions != ("time", "lat", "lon") or values.shape != (32, 28)
                or variable.shape[0] != 1 or variable.dtype != np.dtype("float32") or variable.units != units
                or variable.cell_methods != "time: mean" or variable._FillValue != -9999
                or getattr(variable, "missing_value", -9999) != -9999
                or not values.count() or not np.isfinite(values.compressed()).all()):
            raise ValueError(f"Unexpected field schema or values for {name}.")
        arrays[name] = values
    return arrays


def validate(path, source, reference=None):
    with nc.Dataset(path) as dataset:
        timing = time_metadata(dataset, source, "monthly")
        arrays = fields(dataset)
        if reference is not None:
            with nc.Dataset(reference) as full:
                if timing != time_metadata(full, source, "monthly"):
                    raise ValueError("Time label or bounds differ from the reference.")
                for name, expected in fields(full, full=True).items():
                    actual = arrays[name]
                    if (not np.array_equal(np.ma.getmaskarray(actual), np.ma.getmaskarray(expected))
                            or not np.array_equal(actual.compressed(), expected.compressed())):
                        raise ValueError(f"Reference mask or values differ for {name}.")
        return {"time": timing, "fields": {
            name: {"units": UNITS[name], "valid_cells": int(array.count()),
                   "masked_cells": int(array.size - array.count()),
                   "min": float(array.min()), "max": float(array.max()),
                   **({"max_abs_difference": 0.0} if reference is not None else {})}
            for name, array in arrays.items()}}


def source_from(soil_file):
    return json.loads(soil_file.with_suffix(".json").read_text(encoding="utf-8"))["provenance"]["source"]


def endpoint(source):
    return BASE.replace(f"{STEM}.nc4", source["filename"])


def retrieve(session, source, token, path):
    def attempt():
        started = monotonic()
        size = 0
        with session.get(endpoint(source), params={"dap4.ce": QUERY},
                         headers={"Authorization": f"Bearer {token}"}, stream=True,
                         timeout=(8, 15), allow_redirects=False) as response:
            response.raise_for_status()
            if response.status_code != 200:
                raise AcquisitionError(f"OPeNDAP did not return a full response (HTTP {response.status_code}).")
            with path.open("wb") as file:
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > LIMIT or monotonic() - started > 25:
                        raise AcquisitionError("OPeNDAP exceeded the per-file size or time limit.")
                    file.write(chunk)
        with path.open("rb") as file:
            if file.read(8) != NETCDF4_MAGIC:
                raise ValueError("Provider response was not NetCDF-4.")
        return monotonic() - started

    return retry(attempt)


def export_local(reference, output):
    with nc.Dataset(reference) as full, nc.Dataset(output, "w") as crop:
        crop.title = full.title
        selections = dict(zip(("lat", "lon"), SPATIAL, strict=True))
        for name in ("time", "time_bnds", "lat", "lon", *DRIVERS):
            field = full[name]
            for dim in field.dimensions:
                if dim not in crop.dimensions:
                    indices = selections.get(dim, slice(None))
                    crop.createDimension(dim, len(range(len(full.dimensions[dim]))[indices]))
            target = crop.createVariable(name, field.dtype, field.dimensions,
                                         fill_value=getattr(field, "_FillValue", None), zlib=True)
            target.setncatts({key: field.getncattr(key) for key in field.ncattrs() if key != "_FillValue"})
            target[:] = field[tuple(selections.get(dim, slice(None)) for dim in field.dimensions)]


def acquire(session, source, token, reference=None, *, local_only=False):
    """Publish the export and its manifest together by renaming a directory."""
    destination = OUTPUT / source["start"][:7]
    filename = source["filename"]
    provenance = {"source": source, "endpoint": endpoint(source), "constraint": QUERY}
    reference_sha = JANUARY_SHA if local_only else REFERENCE_SHA
    if local_only:
        if reference is None or checksum(reference) != reference_sha:
            raise ValueError("January full granule differs from the verified reference.")
        provenance = {"source": source, "method": "local_full_granule_crop",
                      "slice": {"lat": [88, 120], "lon": [464, 492]}}
    if destination.exists():
        export = destination / filename
        record = json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
        if (record["provenance"] != provenance or record["sha256"] != checksum(export)
                or record["bytes"] != export.stat().st_size
                or record["validation"] != validate(export, source, reference)
                or (reference is not None and record.get("reference_sha256") != reference_sha)):
            raise ValueError(f"Existing artifact mismatch for {filename}.")
        return record, False
    if session is None and not local_only:
        raise ValueError(f"Missing validated artifact for {filename}.")

    with TemporaryDirectory(dir=OUTPUT) as scratch:
        stage = Path(scratch) / "stage"
        stage.mkdir()
        export = stage / filename
        if local_only:
            export_local(reference, export)
            elapsed = 0.0
        else:
            elapsed = retrieve(session, source, token, export)
        record = {"bytes": export.stat().st_size, "sha256": checksum(export),
                  "validation": validate(export, source, reference), "provenance": provenance,
                  "seconds": elapsed}
        if reference is not None:
            record["reference_sha256"] = reference_sha
        write_json(stage / "manifest.json", record)
        stage.rename(destination)
        return record, True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", type=int, choices=range(1, 241), metavar="1–240",
                        help="After the pilot, validate this many months from January 2006")
    parser.add_argument("--prompt-token", action="store_true")
    args = parser.parse_args()
    try:
        token = earthdata_token(prompt=args.prompt_token, prompt_if_missing=True)
        if not token:
            raise CredentialError("Configure Earthdata credentials using gldas.auth or --prompt-token.")
        reference = ROOT / "raw" / f"{STEM}.nc4"
        if checksum(reference) != REFERENCE_SHA:
            raise ValueError("February full granule differs from the verified reference.")
        paths = audit_inputs(SOIL, INDEX)
        pilot_source = source_from(SOIL / reference.name)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        with requests.Session() as session:
            session.trust_env = False
            pilot, _ = acquire(session, pilot_source, token, reference)
            print(f"February 2020 pilot passed: {pilot['bytes']} bytes in {pilot['seconds']:.2f} seconds.", flush=True)
            if args.months is None:
                return 0
            print(f"Pilot-based estimate: {239 * pilot['bytes']} bytes including the pilot, up to 238 additional granule requests before retries.", flush=True)
            for index, soil in enumerate(paths[:args.months], 1):
                source = source_from(soil)
                local = soil.name == JANUARY.name
                comparison = JANUARY if local else reference if source == pilot_source else None
                _, downloaded = acquire(session, source, token, comparison, local_only=local)
                if index % 4 == 0 or index == args.months:
                    print(f"Historical driver months verified: {index}/{args.months}", flush=True)
                if downloaded:
                    sleep(0.2)
    except (AcquisitionError, CredentialError, ValueError) as error:
        parser.exit(1, f"GLDAS drivers: {error}\n")
    except (OSError, KeyError, AttributeError, RuntimeError):
        parser.exit(1, "GLDAS drivers: local file or product metadata failed validation.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
