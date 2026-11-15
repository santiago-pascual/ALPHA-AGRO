from __future__ import annotations

import numpy as np
import netCDF4 as nc
import pandas as pd
import pytest

from gldas.predictive.contract import MASK_COLUMNS, REQUIRED_COLUMNS, VALUE_COLUMNS, validate_frame
from gldas.predictive.phase8_2026 import (
    _cell_positions,
    _current_request,
    _extract,
    _window,
    bounded_storage_interval,
    convert_driver,
    future_target_month,
)


def _panel(first: str, last: str, *, cells: int = 1) -> pd.DataFrame:
    months = pd.date_range(first, last, freq="MS", tz="UTC")
    rows = []
    for month in months:
        end = month + pd.offsets.MonthBegin(1)
        for index in range(cells):
            row = {
                "month": month,
                "cell_id": f"{index:04d}",
                "latitude": -34.0 - index * 0.25,
                "longitude": -60.0,
                "soil_water_mm": 250.0 + month.month + month.year * 0.01,
                "precipitation_mm_month": 80.0,
                "evapotranspiration_mm_month": 30.0,
                "air_temperature_c": 18.0,
                "surface_runoff_mm_month": 2.0,
                "subsurface_runoff_mm_month": 1.0,
                "area_weight": 1_000_000.0,
                "observation_start": month,
                "observation_end": end,
                "available_at": month + pd.DateOffset(months=5),
                "source_product": "GLDAS Noah v2.1 monthly",
                "source_version": "2.1",
                "source_doi": "10.5067/SXAVCZFAQLNO",
                "soil_granule_id": f"soil-{month:%Y%m}",
                "driver_granule_id": f"driver-{month:%Y%m}",
                "soil_sha256": "a" * 64,
                "driver_sha256": "b" * 64,
                "availability_policy": "assumed_release_lag_5_calendar_months",
            }
            row.update(dict.fromkeys(MASK_COLUMNS, True))
            rows.append(row)
    result = pd.DataFrame(rows, columns=REQUIRED_COLUMNS)
    validate_frame(result)
    return result


def test_grid_indices_and_extract_use_paired_historical_coordinates(tmp_path):
    template = pd.DataFrame({
        "cell_id": ["b", "a", "c"],
        "latitude": [-1.0, -1.5, -1.0],
        "longitude": [10.5, 10.0, 11.0],
    })
    lat = np.array([-1.5, -1.0], dtype=np.float32)
    lon = np.array([10.0, 10.5, 11.0], dtype=np.float32)
    positions = _cell_positions(template, lat, lon)

    path = tmp_path / "small.nc4"
    with nc.Dataset(path, "w", format="NETCDF4") as dataset:
        dataset.createDimension("time", 1)
        dataset.createDimension("lat", 2)
        dataset.createDimension("lon", 3)
        variable = dataset.createVariable("soil", "f4", ("time", "lat", "lon"), fill_value=-9999.0)
        variable[0] = np.array([[1, 2, 3], [4, 5, 6]], dtype=np.float32)

    with nc.Dataset(path) as dataset:
        result = _extract(dataset, "soil", positions)
    # Template order is deliberately different from row-major grid order.
    assert result.tolist() == [5.0, 1.0, 6.0]


def test_driver_conversion_matches_project_units_and_calendar_length():
    february = pd.Timestamp("2026-02-01", tz="UTC")
    assert convert_driver("Rainf_f_tavg", np.array([1.0]), february)[0] == 28 * 86400
    assert convert_driver("Evap_tavg", np.array([-0.25]), february)[0] == -0.25 * 28 * 86400
    assert convert_driver("Tair_f_inst", np.array([273.15]), february)[0] == 0
    assert convert_driver("Qs_acc", np.array([1.0]), february)[0] == 28 * 8
    assert convert_driver("Qsb_acc", np.array([2.0]), february)[0] == 2 * 28 * 8


def test_current_issue_targets_are_calendar_month_offsets():
    issue = pd.Timestamp("2026-11-15T21:00:00Z")
    assert [future_target_month(issue, h).strftime("%Y-%m") for h in (1, 2, 3)] == [
        "2026-12", "2027-01", "2027-02",
    ]
    with pytest.raises(ValueError):
        future_target_month(pd.Timestamp("2026-11-15"), 1)


def test_storage_intervals_respect_physical_layer_sum_bounds():
    assert bounded_storage_interval(5.0, 10.0) == {"lower": 0.0, "upper": 15.0}
    assert bounded_storage_interval(995.0, 20.0) == {"lower": 975.0, "upper": 1000.0}
    with pytest.raises(ValueError):
        bounded_storage_interval(100.0, -1.0)


def test_current_input_cutoff_uses_only_available_observations():
    panel = _panel("2025-07-01", "2026-08-01")
    issue = pd.Timestamp("2026-11-15T21:00:00Z")
    july_verified = pd.Timestamp("2026-11-15T20:00:00Z")
    august_not_yet = pd.Timestamp("2026-12-01T00:00:00Z")
    panel.loc[panel["month"].dt.year.eq(2026) & panel["month"].dt.month.le(7), "available_at"] = july_verified
    panel.loc[panel["month"].eq(pd.Timestamp("2026-08-01", tz="UTC")), "available_at"] = august_not_yet
    train = pd.DataFrame({"cell_id": ["0000"]})
    current, latest, _ = _current_request(panel, issue, future_target_month(issue, 1), train)
    assert latest == pd.Timestamp("2026-07-01", tz="UTC")
    assert current.iloc[0]["target_month"] == pd.Timestamp("2026-12-01", tz="UTC")


def test_current_pipeline_fit_calibration_and_holdout_are_chronological():
    panel = _panel("2006-01-01", "2026-07-01")
    for horizon in (1, 2, 3):
        train, calibration, test, _, _ = _window(panel, horizon, n_lags=1)
        assert train["target_month"].max() < calibration["target_month"].min()
        assert calibration["target_month"].max() < test["target_month"].min()
        assert set(test["target_month"].dt.strftime("%Y-%m").unique()) == {
            f"{year}-{month:02d}" for year in (2024, 2025) for month in range(1, 13)
        }
        assert test["target_month"].max() <= pd.Timestamp("2025-12-01", tz="UTC")
