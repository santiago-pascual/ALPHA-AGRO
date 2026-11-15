"""Preserve and validate bounded GLDAS Noah 2.1 three-hourly regional batches."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic

import netCDF4 as nc
import numpy as np
import requests

from .acquisition import AcquisitionError, NETCDF4_MAGIC, PRODUCTS, checksum, discover, retry, valid_data_url, write_json
from .benchmark import LAYERS, LIMIT, QUERY
from .validation import LAYERS as PHYSICAL_CAPS, ValidationError, time_metadata


PRODUCT = PRODUCTS["3hourly"]
LAT = -37.875 + 0.25 * np.arange(32)
LON = -63.875 + 0.25 * np.arange(28)
SHAPE = (len(LAT), len(LON))
MAX_DAYS = 7


def endpoint(source):
    timestamp = datetime.fromisoformat(source["start"])
    name = source["filename"]
    if (source["collection_id"] != PRODUCT.collection or source["version"] != PRODUCT.version
            or source["doi"] != PRODUCT.doi or timestamp.utcoffset() != timedelta(0)
            or timestamp.hour % 3 or timestamp.minute or timestamp.second or timestamp.microsecond
            or name != f"{PRODUCT.short_name}.A{timestamp:%Y%m%d.%H%M}.021.nc4"
            or not valid_data_url(source["url"], PRODUCT, name)):
        raise ValidationError("Not an official GLDAS Noah main production three-hourly asset.")
    return (f"https://opendap.earthdata.nasa.gov/collections/{PRODUCT.collection}/granules/"
            f"{PRODUCT.short_name}.2.1%253A{name}.dap.nc4")


def storage(path, source):
    with nc.Dataset(path) as data:
        if data.data_model != "NETCDF4" or "GLDAS2.1" not in getattr(data, "title", ""):
            raise ValidationError("Expected GLDAS 2.1 NetCDF-4.")
        for axis, values, units in (("lat", LAT, "degrees_north"), ("lon", LON, "degrees_east")):
            variable = data[axis]
            if (variable.dimensions != (axis,) or variable.units != units
                    or np.ma.getmaskarray(variable[:]).any() or not np.array_equal(variable[:], values)):
                raise ValidationError("Unexpected regional grid.")
        timing = time_metadata(data, source, "3hourly")
        profile = np.zeros(SHAPE)
        for name in LAYERS:
            variable = data[name]
            if (variable.dimensions != ("time", "lat", "lon") or variable.shape != (1, *SHAPE)
                    or variable.units != "kg m-2"
                    or getattr(variable, "cell_methods", "") not in {"", "time: point", "time: instantaneous"}):
                raise ValidationError(f"Unexpected instantaneous storage schema for {name}.")
            values = variable[0].astype(float)
            valid = values.compressed()
            if not valid.size or not np.isfinite(valid).all() or valid.min() < 0 or valid.max() > PHYSICAL_CAPS[name] + .001:
                raise ValidationError(f"Invalid values for {name}.")
            profile += values.filled(np.nan)
    return profile, timing


def replay(bundle):
    manifest = json.loads((bundle / "capture.json").read_text(encoding="utf-8"))
    path = bundle / "export.nc4"
    if (manifest["schema"] != "gldas_three_hourly_regional_v1"
            or manifest["sha256"] != checksum(path) or manifest["bytes"] != path.stat().st_size
            or manifest["endpoint"] != endpoint(manifest["source"]) or manifest["constraint"] != QUERY):
        raise ValidationError("Archive checksum or source metadata did not match.")
    values, timing = storage(path, manifest["source"])
    if timing != manifest["timing"]:
        raise ValidationError("Archive time metadata did not match.")
    return values, manifest


def capture(session, source, token, root):
    url = endpoint(source)
    asset = root / source["filename"]
    if asset.exists():
        _, manifest = replay(asset)
        if manifest["source"] != source:
            raise ValidationError("Saved archive catalog identity changed.")
        return manifest
    with TemporaryDirectory(dir=root) as staging:
        bundle = Path(staging) / "bundle"
        bundle.mkdir()
        path = bundle / "export.nc4"

        def receive():
            total, started = 0, monotonic()
            with session.get(url, params={"dap4.ce": QUERY},
                             headers={"Authorization": f"Bearer {token}", "Accept-Encoding": "identity"},
                             timeout=(8, 15), stream=True, allow_redirects=False) as response:
                if response.status_code in {401, 403}:
                    raise AcquisitionError(f"NASA HTTP {response.status_code}; check Earthdata token and GES DISC authorization.")
                response.raise_for_status()
                if response.status_code != 200 or response.headers.get("Content-Range"):
                    raise AcquisitionError(f"A complete NASA response is required (HTTP {response.status_code}).")
                with path.open("wb") as file:
                    for chunk in response.iter_content(65536):
                        total += len(chunk)
                        if total > LIMIT or monotonic() - started > 25:
                            raise AcquisitionError("NASA export exceeded the per-granule budget.")
                        file.write(chunk)
                length = response.headers.get("Content-Length")
                if length is not None and response.headers.get("Content-Encoding", "identity") == "identity" and total != int(length):
                    raise requests.exceptions.ChunkedEncodingError("Incomplete regional response.")
            return datetime.now(timezone.utc).isoformat()

        accessed = retry(receive)
        with path.open("rb") as file:
            if file.read(8) != NETCDF4_MAGIC:
                raise ValidationError("NASA response was not NetCDF-4.")
        _, timing = storage(path, source)
        manifest = {"schema": "gldas_three_hourly_regional_v1", "source": source,
                    "endpoint": url, "constraint": QUERY, "bytes": path.stat().st_size,
                    "sha256": checksum(path), "locally_accessed_at": accessed,
                    "provider_publication_at": None, "timing": timing}
        write_json(bundle / "capture.json", manifest)
        bundle.rename(asset)
    return manifest


def acquire(root, start, end, token):
    if not token:
        raise AcquisitionError("Use a configured Earthdata token or the hidden --prompt-token prompt.")
    root.mkdir(parents=True, exist_ok=True)
    with requests.Session() as session:
        session.trust_env = False
        sources = discover(session, PRODUCT, start, end, MAX_DAYS * 8)
        return [capture(session, source, token, root) for source in sources]


def daily(root, start, end):
    """Average eight instantaneous samples per UTC day. Missing slots or layers propagate."""
    days = (end - start).days + 1
    if days < 1:
        raise ValidationError("Use ordered daily dates.")
    values = np.full((days, *SHAPE), np.nan)
    complete_days, digests = [], []
    for i in range(days):
        day = start + timedelta(days=i)
        slots = [root / f"{PRODUCT.short_name}.A{day:%Y%m%d}.{hour:02d}00.021.nc4" for hour in range(0, 24, 3)]
        if not all(slot.is_dir() for slot in slots):
            continue
        profiles = []
        for hour, slot in zip(range(0, 24, 3), slots, strict=True):
            profile, manifest = replay(slot)
            if datetime.fromisoformat(manifest["source"]["start"]) != datetime(day.year, day.month, day.day, hour, tzinfo=timezone.utc):
                raise ValidationError("Archive contains a misaligned three-hourly slot.")
            profiles.append(profile)
            digests.append(manifest["sha256"])
        values[i] = np.mean(profiles, axis=0)
        complete_days.append(day.isoformat())
    return values, complete_days, digests
