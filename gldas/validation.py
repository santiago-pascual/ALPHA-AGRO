"""Validate provider NetCDF and export a centre-selected geographic subset."""

from calendar import monthrange
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile

import netCDF4 as nc
import numpy as np

LAYERS = {
    "SoilMoi0_10cm_inst": 100,
    "SoilMoi10_40cm_inst": 300,
    "SoilMoi40_100cm_inst": 600,
    "SoilMoi100_200cm_inst": 1000,
}
FIELDS = {
    **dict.fromkeys(LAYERS, "kg m-2"),
    "RootMoist_inst": "kg m-2",
    "Rainf_f_tavg": "kg m-2 s-1",
    "Tair_f_inst": "K",
}


class ValidationError(ValueError):
    pass


def check_bounds(bounds):
    west, south, east, north = bounds
    if not (-180 <= west < east <= 180 and -60 <= south < north <= 90):
        raise ValidationError("Use west < east in [-180, 180] and south < north in [-60, 90].")


def coordinate_slice(dataset, name, units, lower, upper):
    if name not in dataset.variables:
        raise ValidationError(f"Missing coordinate {name}.")
    var = dataset[name]
    values = var[:]
    if (var.dimensions != (name,) or getattr(var, "units", None) != units
            or np.ma.getmaskarray(values).any() or not np.isfinite(values).all()
            or values.size < 2 or not np.allclose(np.diff(values), 0.25, atol=1e-6, rtol=0)):
        raise ValidationError(f"Unexpected {name} grid or units.")
    expected_size, first = {"lat": (600, -59.875), "lon": (1440, -179.875)}[name]
    if values.size != expected_size or not np.isclose(values[0], first, atol=1e-6, rtol=0):
        raise ValidationError(f"Unexpected native {name} grid coverage.")
    selected = np.flatnonzero((values >= lower) & (values <= upper))
    if not selected.size:
        raise ValidationError(f"No {name} grid centres in the requested bounds.")
    return slice(int(selected[0]), int(selected[-1]) + 1), values[selected]


def decoded_time(variable, units, calendar, dimensions, shape):
    values = variable[:]
    if variable.dimensions != dimensions or values.shape != shape or np.ma.getmaskarray(values).any():
        raise ValidationError("Unexpected time coordinate or time bounds dimensions.")
    if not np.isfinite(values).all():
        raise ValidationError("Non-finite time coordinate or bounds.")
    return nc.num2date(values, units, calendar, only_use_cftime_datetimes=False)


def time_metadata(dataset, granule, cadence):
    if "time" not in dataset.variables:
        raise ValidationError("Missing time coordinate.")
    var = dataset["time"]
    units, calendar = getattr(var, "units", ""), getattr(var, "calendar", "standard")
    timestamp = decoded_time(var, units, calendar, ("time",), (1,))[0]
    expected = datetime.fromisoformat(granule["start"]).replace(tzinfo=None)
    if timestamp != expected:
        raise ValidationError("Decoded UTC time does not match the CMR granule.")
    bounds = None
    bounds_name = getattr(var, "bounds", None)
    if cadence == "monthly" or bounds_name is not None:
        if bounds_name not in dataset.variables:
            raise ValidationError("Missing referenced time bounds.")
        bnds = dataset[bounds_name]
        if len(bnds.dimensions) != 2 or bnds.dimensions[0] != "time":
            raise ValidationError("Unexpected time bounds dimensions.")
        bounds = decoded_time(bnds, getattr(bnds, "units", units),
                              getattr(bnds, "calendar", calendar), bnds.dimensions, (1, 2))[0]
        if bounds[0] >= bounds[1] or not bounds[0] <= timestamp <= bounds[1]:
            raise ValidationError("Invalid time bounds.")
        if cadence == "monthly":
            next_month = expected + timedelta(days=monthrange(expected.year, expected.month)[1])
            if tuple(bounds) != (expected, next_month):
                raise ValidationError("Monthly interval does not match the catalog month.")
    return {
        "timestamp_utc": timestamp.isoformat() + "Z",
        "bounds_utc": [value.isoformat() + "Z" for value in bounds] if bounds is not None else None,
        "units": units, "calendar": calendar,
    }


def inspect_fields(dataset, selections, cadence):
    result = {}
    for name, units in FIELDS.items():
        if name not in dataset.variables:
            raise ValidationError(f"Missing expected variable {name}.")
        var = dataset[name]
        if var.dimensions != ("time", "lat", "lon") or getattr(var, "units", None) != units:
            raise ValidationError(f"Unexpected units or dimensions for {name}.")
        method = getattr(var, "cell_methods", None)
        if cadence == "monthly" and "time: mean" not in (method or ""):
            raise ValidationError(f"Missing monthly average semantics for {name}.")
        values = var[selections]
        masked = np.ma.getmaskarray(values)
        valid = values.data[~masked]
        if not valid.size or not np.isfinite(valid).all():
            raise ValidationError(f"No valid values or unmasked non-finite values for {name}.")
        lower = float(valid.min())
        upper = float(valid.max())
        if lower < 0 or (name in LAYERS and upper > LAYERS[name] + 0.001):
            raise ValidationError(f"Physically impossible values in {name}.")
        result[name] = {
            "units": units, "dtype": str(var.dtype), "dimensions": list(var.dimensions),
            "valid_cells": int(valid.size), "masked_cells": int(masked.sum()),
            "min": lower, "max": upper, "cell_methods": method,
            "fill_value": float(var._FillValue) if hasattr(var, "_FillValue") else None,
            "missing_value": np.asarray(var.missing_value).tolist() if hasattr(var, "missing_value") else None,
        }
    return result


def export_subset(dataset, path, selections):
    with NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temp_path = Path(temporary.name)
    try:
        with nc.Dataset(temp_path, "w", format="NETCDF4") as out:
            out.setncatts({key: dataset.getncattr(key) for key in dataset.ncattrs()
                          if key not in {"SOUTH_WEST_CORNER_LAT", "SOUTH_WEST_CORNER_LON"}})
            out.setncattr("subset_selection", "Native cell centres within the requested WGS84 bounds")
            for name, dim in dataset.dimensions.items():
                out.createDimension(name, len(range(len(dim))[selections.get(name, slice(None))]))
            for name, source in dataset.variables.items():
                target = out.createVariable(name, source.datatype, source.dimensions,
                                            fill_value=getattr(source, "_FillValue", None), zlib=True)
                target.setncatts({key: source.getncattr(key) for key in source.ncattrs() if key != "_FillValue"})
                target.set_auto_maskandscale(False)
                source.set_auto_maskandscale(False)
                target[...] = source[tuple(selections.get(d, slice(None)) for d in source.dimensions)]
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def validate_and_subset(raw, subset, granule, cadence, bounds):
    check_bounds(bounds)
    west, south, east, north = bounds
    with nc.Dataset(raw) as dataset:
        if dataset.data_model != "NETCDF4" or "GLDAS2.1" not in getattr(dataset, "title", ""):
            raise ValidationError("Expected a GLDAS 2.1 NetCDF-4 dataset.")
        time = time_metadata(dataset, granule, cadence)
        lat_slice, lat = coordinate_slice(dataset, "lat", "degrees_north", south, north)
        lon_slice, lon = coordinate_slice(dataset, "lon", "degrees_east", west, east)
        fields = inspect_fields(dataset, (slice(None), lat_slice, lon_slice), cadence)
        report = {
            "time": time, "requested_bounds_wsen": list(bounds), "spatial_resolution_deg": 0.25,
            "actual_centre_bounds_wsen": [float(lon[0]), float(lat[0]), float(lon[-1]), float(lat[-1])],
            "source_dimensions": {name: len(dim) for name, dim in dataset.dimensions.items()},
            "subset_cells": int(lat.size * lon.size), "fields_checked": fields,
            "variables": {name: {"dimensions": list(var.dimensions), "dtype": str(var.dtype),
                                 "units": getattr(var, "units", None)}
                          for name, var in dataset.variables.items()},
            "source_title": getattr(dataset, "title", None),
            "source_forcing": getattr(dataset, "source", None),
            "source_history": getattr(dataset, "history", None),
            "quality_flags_referenced": {name: getattr(dataset[name], "ancillary_variables", None)
                                         for name in fields},
        }
        export_subset(dataset, subset, {"lat": lat_slice, "lon": lon_slice})
    return report
