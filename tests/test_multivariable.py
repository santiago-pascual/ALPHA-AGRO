from datetime import date
from shutil import copyfile

import netCDF4 as nc
import numpy as np
import pytest

from gldas.discovery import detrend
from gldas import multivariable
from gldas.multivariable import SPATIAL, UNITS, export_local, validate
from gldas.relationships import association, baselines, convert, forecast_inputs, lagged_pair, verify_months


def make_export(path, full=False):
    lat_count, lon_count = (600, 1440) if full else (32, 28)
    with nc.Dataset(path, "w") as dataset:
        dataset.title = "GLDAS2.1 fixture"
        for name, n in (("time", 1), ("lat", lat_count), ("lon", lon_count), ("nv", 2)):
            dataset.createDimension(name, n)
        time = dataset.createVariable("time", "f8", ("time",))
        time.units = "days since 2020-02-01"
        time.bounds = "time_bnds"
        time[:] = 0
        dataset.createVariable("time_bnds", "f8", ("time", "nv"))[:] = [[0, 29]]
        for axis, units, start, count in (
                ("lat", "degrees_north", -59.875 if full else -37.875, lat_count),
                ("lon", "degrees_east", -179.875 if full else -63.875, lon_count)):
            var = dataset.createVariable(axis, "f4", (axis,))
            var.units = units
            var[:] = start + np.arange(count) * 0.25
        values = np.ma.array(np.arange(896, dtype=float).reshape(32, 28), mask=False)
        values.mask[0, 0] = True
        for name, units in UNITS.items():
            var = dataset.createVariable(name, "f4", ("time", "lat", "lon"), fill_value=-9999)
            var.units = units
            var.cell_methods = "time: mean"
            var[(0, *SPATIAL) if full else (0, slice(None), slice(None))] = values


def test_equivalence_catches_changed_values_masks_units_and_coordinates(tmp_path):
    reference = tmp_path / "full.nc4"
    export = tmp_path / "export.nc4"
    make_export(reference, full=True)
    make_export(export)
    granule = {"start": "2020-02-01T00:00:00Z"}
    result = validate(export, granule, reference)
    assert result["fields"]["Qs_acc"]["valid_cells"] == 895
    assert result["fields"]["Qs_acc"]["max_abs_difference"] == 0
    local = tmp_path / "crop.nc4"
    export_local(reference, local)
    assert validate(local, granule, reference) == result
    with nc.Dataset(export, "a") as dataset:
        dataset["Qs_acc"][0, 0, 0] = 0
    with pytest.raises(ValueError, match="mask or values"):
        validate(export, granule, reference)
    with nc.Dataset(export, "a") as dataset:
        dataset["Qs_acc"].units = "K"
    with pytest.raises(ValueError, match="schema"):
        validate(export, granule, reference)
    with nc.Dataset(export, "a") as dataset:
        dataset["lat"][0] = -38
    with pytest.raises(ValueError, match="lat grid"):
        validate(export, granule, reference)


def test_leap_month_conversion_and_missing_values():
    month = date(2020, 2, 1)
    values = np.array([1., np.nan])
    np.testing.assert_equal(convert("Rainf_f_tavg", values, month), [29 * 86400, np.nan])
    np.testing.assert_equal(convert("Qs_acc", values, month), [29 * 8, np.nan])
    np.testing.assert_allclose(convert("Tair_f_inst", np.array([283.15]), month), [10])


def test_acquisition_reuses_verified_month_and_rejects_corruption(tmp_path, monkeypatch):
    fixture = tmp_path / "provider.nc4"
    make_export(fixture)
    output = tmp_path / "archive"
    output.mkdir()
    source = {"filename": "GLDAS_NOAH025_M.A202002.021.nc4", "start": "2020-02-01T00:00:00Z"}
    monkeypatch.setattr(multivariable, "OUTPUT", output)

    def retrieve(session, source, token, path):
        copyfile(fixture, path)
        return 1.0

    monkeypatch.setattr(multivariable, "retrieve", retrieve)
    record, downloaded = multivariable.acquire(object(), source, "placeholder")
    assert downloaded
    assert multivariable.acquire(None, source, None) == (record, False)
    with (output / "2020-02" / source["filename"]).open("ab") as file:
        file.write(b"corrupted")
    with pytest.raises(ValueError, match="Existing artifact mismatch"):
        multivariable.acquire(None, source, None)


def test_month_continuity_reports_missing_and_extra_months():
    verify_months({"2006-01", "2006-02"}, {"2006-01", "2006-02"})
    with pytest.raises(ValueError, match="1 missing and 1 unexpected"):
        verify_months({"2006-01", "2006-02"}, {"2006-01", "2006-03"})


def test_lag_alignment_correlation_and_season_adjustment():
    x = np.arange(36, dtype=float)
    np.testing.assert_allclose(detrend(x + np.sin(x * np.pi / 6)), 0, atol=1e-11)
    driver, target = lagged_pair(x, np.r_[99., x[:-1]], 1)
    result, _ = association(driver, target, np.arange(35)[None, :])
    assert result["r"] == pytest.approx(1)
    assert result["n"] == 35


def test_predictors_and_fitted_climatology_cannot_see_future_observations():
    past = np.arange(480, dtype=float).reshape(240, 2)
    changed = past.copy()
    changed[180:] += 10_000
    months, target, features = forecast_inputs(past, 180)
    _, new_target, new_features = forecast_inputs(changed, 180)
    np.testing.assert_array_equal(features[months < 185], new_features[months < 185])
    np.testing.assert_array_equal(target[months < 180], new_target[months < 180])
    assert target[months == 184][0] != new_target[months == 184][0]


def test_baseline_uses_a_purged_56_month_holdout():
    rng = np.random.default_rng(113)
    data = rng.normal(size=(240, 6))
    report = baselines(data, rng)
    assert (report["train_n"], report["test_n"]) == (175, 56)
    persistence = report["scores"]["persistence"]
    assert persistence["rmse_difference_vs_persistence_ci95"] == [0, 0]
