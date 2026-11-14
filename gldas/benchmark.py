"""Retrieve and compare the February 2020 OPeNDAP pilot once."""

from getpass import GetPassWarning, getpass
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from time import monotonic
import warnings

import netCDF4 as nc
import numpy as np
import requests

from .acquisition import NETCDF4_MAGIC, checksum, write_json

STEM = "GLDAS_NOAH025_M.A202002.021"
BASE = ("https://opendap.earthdata.nasa.gov/collections/C1342986036-GES_DISC/granules/"
        f"GLDAS_NOAH025_M.2.1%253A{STEM}.nc4.dap.nc4")
LAYERS = ("SoilMoi0_10cm_inst", "SoilMoi10_40cm_inst", "SoilMoi40_100cm_inst")
QUERY = ";".join(("/time", "/time_bnds", "/lat[88:119]", "/lon[464:491]",
                  *(f"/{name}[0][88:119][464:491]" for name in LAYERS)))
ROOT = Path("data/phase1")
LIMIT = 2_000_000


def compare(candidate, reference):
    with nc.Dataset(candidate) as export, nc.Dataset(reference) as local:
        for name in ("time", "time_bnds"):
            values = []
            for dataset in (export, local):
                variable, time = dataset[name], dataset["time"]
                encoded = variable[:]
                if np.ma.getmaskarray(encoded).any():
                    raise ValueError(f"Missing time values in {name}.")
                values.append(nc.num2date(encoded, getattr(variable, "units", time.units),
                                          getattr(variable, "calendar", getattr(time, "calendar", "standard"))))
            if not np.array_equal(*values):
                raise ValueError(f"Decoded {name} differs.")
        for name in ("lat", "lon", *LAYERS):
            first, second = export[name], local[name]
            a, b = first[:], second[:]
            if (first.dimensions != second.dimensions or a.shape != b.shape
                    or first.units != second.units
                    or not np.array_equal(np.ma.getmaskarray(a), np.ma.getmaskarray(b))
                    or not np.array_equal(a.compressed(), b.compressed())):
                raise ValueError(f"Grid, units, mask, or values differ for {name}.")


def main():
    reference = ROOT / "subsets/-64.0_-38.0_-57.0_-30.0" / f"{STEM}.nc4"
    raw = ROOT / "raw" / f"{STEM}.nc4"
    if not reference.is_file() or not raw.is_file() or not sys.stdin.isatty():
        print("Use interactive PowerShell with the verified February pilot files.", file=sys.stderr)
        return 1
    with warnings.catch_warnings():
        warnings.simplefilter("error", GetPassWarning)
        try:
            token = getpass("Earthdata user token: ").strip()
        except (GetPassWarning, EOFError, KeyboardInterrupt):
            print("Hidden token entry unavailable or canceled.", file=sys.stderr)
            return 1
    if not token:
        print("Earthdata token entry was empty.", file=sys.stderr)
        return 1

    destination = ROOT / "benchmark"
    destination.mkdir(parents=True, exist_ok=True)
    size = 0
    status = None
    started = monotonic()
    result = {"status": "failed"}
    try:
        with requests.Session() as session, NamedTemporaryFile(dir=destination, delete=False) as file:
            session.trust_env = False
            temporary = Path(file.name)
            with session.get(BASE, params={"dap4.ce": QUERY}, headers={"Authorization": f"Bearer {token}"},
                             timeout=(8, 15), stream=True, allow_redirects=False) as response:
                status = response.status_code
                if status != 200:
                    raise ValueError(f"OPeNDAP returned HTTP {status}.")
                for chunk in response.iter_content(65536):
                    size += len(chunk)
                    if size > LIMIT or monotonic() - started > 25:
                        raise ValueError("OPeNDAP exceeded the benchmark byte or time limit.")
                    file.write(chunk)
        elapsed = monotonic() - started
        with temporary.open("rb") as file:
            if file.read(8) != NETCDF4_MAGIC:
                raise ValueError("OPeNDAP response was not NetCDF-4.")
        compare(temporary, reference)
        export = destination / f"{STEM}.opendap.nc4"
        temporary.replace(export)
        raw_size = raw.stat().st_size
        result = {"status": "passed", "raw_bytes": raw_size, "elapsed_seconds": elapsed,
                  "reduction_fraction": 1 - size / raw_size, "sha256": checksum(export)}
    except requests.RequestException:
        print("OPeNDAP request timed out or failed.", file=sys.stderr)
    except (AttributeError, KeyError, OSError, ValueError, RuntimeError):
        print(f"OPeNDAP did not produce a matching export (HTTP {status}).", file=sys.stderr)
    finally:
        if "temporary" in locals():
            temporary.unlink(missing_ok=True)
    result.update({"http_status": status, "body_bytes": size})
    result.setdefault("elapsed_seconds", monotonic() - started)
    write_json(destination / "february_2020.json", result)
    print(f"OPeNDAP {result['status']}: {size} bytes in {result['elapsed_seconds']:.2f} seconds.")
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
