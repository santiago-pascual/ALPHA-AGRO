from datetime import date, datetime
import json
import math
import random

import netCDF4 as nc
import numpy as np
import pytest

from gldas.trend_report import regional_diagnostics
from gldas.trends import (
    SOIL_LAYERS,
    SOIL_UNITS,
    TrendAnalysisError,
    _benjamini_hochberg,
    analyze_monthly_grids,
    analyze_monthly_files,
    load_monthly_netcdf,
    mann_kendall,
)


def monthly_dates(count):
    result = []
    year, month = 2000, 1
    for _ in range(count):
        result.append(date(year, month, 1))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return result


def make_fields(count=120, slope_per_decade=8.0, noise=None):
    dates = monthly_dates(count)
    latitudes = [-35.125, -34.875]
    longitudes = [-61.125, -60.875]
    layer0 = np.empty((count, 2, 2), dtype=float)
    layer1 = np.full((count, 2, 2), 80.0)
    layer2 = np.full((count, 2, 2), 160.0)
    for index, month in enumerate(dates):
        year_index = index / 12
        seasonal = 5.0 * math.sin(2 * math.pi * (month.month - 1) / 12)
        perturbation = 0.0 if noise is None else noise[index]
        layer0[index, :, :] = 40.0 + slope_per_decade * year_index / 10 + seasonal + perturbation
    layers = dict(zip(SOIL_LAYERS, (layer0, layer1, layer2)))
    units = {name: SOIL_UNITS for name in SOIL_LAYERS}
    return dates, latitudes, longitudes, layers, units


def test_report_matches_regional_hac_and_area_weighted_cell_slopes():
    noise = [math.sin(index / 5) for index in range(120)]
    dates, lat, lon, layers, units = make_fields(noise=noise)
    layers[SOIL_LAYERS[0]][:, 1, :] += np.arange(len(dates))[:, None] * 0.08
    result = analyze_monthly_grids(dates, lat, lon, layers, units=units)

    diagnostics = regional_diagnostics(result)

    trend = result["regional_trend"]
    intervals = diagnostics["hac_ci95_by_lag_months"]
    assert set(intervals) == {"6", "12", "24"}
    assert intervals["12"] == pytest.approx(trend["linear_hac_ci95_per_decade"])
    assert diagnostics["area_weighted_cell_slope_per_decade"] == pytest.approx(
        trend["linear_hac_slope_per_decade"]
    )


@pytest.mark.parametrize("slope", [12.0, -12.0, 0.0])
def test_trend_direction_and_seasonal_anomalies(slope):
    dates, lat, lon, layers, units = make_fields(slope_per_decade=slope)
    result = analyze_monthly_grids(
        dates, lat, lon, layers, units=units, minimum_spatial_months=60,
    )
    trend = result["regional_trend"]
    assert trend["valid_months"] == len(dates)
    assert trend["linear_hac_slope_per_decade"] == pytest.approx(slope, abs=0.2)
    if slope:
        assert trend["sen_slope_per_decade"] == pytest.approx(slope, abs=0.2)
    else:
        assert trend["sen_slope_per_decade"] == pytest.approx(0, abs=1e-8)
    assert result["regional_monthly_series"][0]["soil_water_0_100_mm"] == pytest.approx(280)
    assert len(result["seasonal_climatology"]) == 12
    low, high = trend["linear_hac_ci95_per_decade"]
    assert low <= slope <= high
    spatial = result["spatial_trends_on_cell_seasonal_anomalies"]
    assert spatial["eligible_cells"] == 4
    assert all("linear_hac_bh_q_value" in cell for cell in spatial["cells"])
    json.dumps(result, allow_nan=False)
    assert result["methods"]["mann_kendall"].startswith("tie-corrected")
    assert "crop damage" in " ".join(result["limitations"])


def test_autocorrelation_aware_hac_standard_error():
    generator = random.Random(510)
    dates = monthly_dates(240)
    residual = 0.0
    noise = []
    for _ in dates:
        residual = 0.85 * residual + generator.gauss(0, 1)
        noise.append(residual)
    dates, lat, lon, layers, units = make_fields(240, 1.0, noise)
    result = analyze_monthly_grids(
        dates, lat, lon, layers, units=units, minimum_spatial_months=60,
        hac_max_lag_months=6,
    )
    trend = result["regional_trend"]
    assert trend["linear_hac_se_per_decade"] > trend["linear_iid_se_per_decade"]
    assert trend["hac_max_lag_months"] == 6


def test_mann_kendall_positive_negative_and_ties():
    assert mann_kendall([1, 2, 2, 4])["tau"] > 0
    assert mann_kendall([4, 2, 2, 1])["tau"] < 0
    result = mann_kendall([3, 3, 3, 3])
    assert result["tau"] == 0
    assert result["p_value"] == 1


def test_missing_layer_coverage_and_full_profile_rule():
    dates, lat, lon, layers, units = make_fields(36)
    for field in layers.values():
        field[:, 0, 0] = np.nan
    result = analyze_monthly_grids(
        dates, lat, lon, layers, units=units, minimum_regional_coverage=0.70,
        minimum_spatial_months=24,
    )
    row = result["regional_monthly_series"][0]
    assert row["valid_cells"] == 3
    assert row["valid_area_fraction"] == pytest.approx(0.75, abs=0.001)
    assert row["soil_water_0_100_mm"] is not None
    assert result["quality"]["missing_profile_values"] == 36


def test_regional_mean_is_withheld_below_coverage_threshold():
    dates, lat, lon, layers, units = make_fields(36)
    for field in layers.values():
        field[:, 0, :] = np.nan
    result = analyze_monthly_grids(
        dates, lat, lon, layers, units=units, minimum_regional_coverage=0.80,
    )
    assert result["regional_monthly_series"][0]["soil_water_0_100_mm"] is None


def test_rejects_wrong_units_and_incomplete_months():
    dates, lat, lon, layers, units = make_fields(36)
    units[SOIL_LAYERS[1]] = "m3 m-3"
    with pytest.raises(TrendAnalysisError, match="units"):
        analyze_monthly_grids(dates, lat, lon, layers, units=units)
    units[SOIL_LAYERS[1]] = SOIL_UNITS
    with pytest.raises(TrendAnalysisError, match="incomplete or unordered"):
        analyze_monthly_grids(dates[:4] + dates[5:], lat, lon, layers, units=units)


def test_rejects_invalid_grid_and_physical_values():
    dates, lat, lon, layers, units = make_fields(36)
    with pytest.raises(TrendAnalysisError, match="0.25 degree"):
        analyze_monthly_grids(dates, [-35.125, -34.80], lon, layers, units=units)
    layers[SOIL_LAYERS[0]][0, 0, 0] = 101
    with pytest.raises(TrendAnalysisError, match="physical range"):
        analyze_monthly_grids(dates, lat, lon, layers, units=units)


def test_area_weighting_uses_cell_area():
    dates, lat, lon, layers, units = make_fields(36)
    for field in layers.values():
        field[:, 0, :] = 0
        field[:, 1, :] = 20 if field is layers[SOIL_LAYERS[0]] else 0
    result = analyze_monthly_grids(
        dates, lat, lon, layers, units=units, minimum_regional_coverage=1,
    )
    assert 0 < result["regional_monthly_series"][0]["soil_water_0_100_mm"] < 20
    assert result["spatial_grid"]["area_weighting"].startswith("exact spherical")


def test_benjamini_hochberg_monotone_adjustment():
    assert _benjamini_hochberg([0.01, 0.04, 0.03]) == pytest.approx([0.03, 0.04, 0.04])


def write_month_file(path, month, latitudes, longitudes, units=SOIL_UNITS, start=0, include_bounds=True):
    with nc.Dataset(path, "w") as dataset:
        dataset.createDimension("time", 1)
        dataset.createDimension("bnds", 2)
        dataset.createDimension("lat", len(latitudes))
        dataset.createDimension("lon", len(longitudes))
        lat = dataset.createVariable("lat", "f4", ("lat",))
        lat.units = "degrees_north"
        lat[:] = latitudes
        lon = dataset.createVariable("lon", "f4", ("lon",))
        lon.units = "degrees_east"
        lon[:] = longitudes
        time = dataset.createVariable("time", "f8", ("time",))
        time.units = "days since 2000-01-01 00:00:00"
        time.calendar = "standard"
        month_start = date(month.year, month.month, 1)
        next_month = date(month.year + (month.month == 12), 1 if month.month == 12 else month.month + 1, 1)
        time[:] = nc.date2num([datetime.combine(month_start, datetime.min.time())], time.units)
        if include_bounds:
            time.bounds = "time_bnds"
            bound_values = nc.date2num([datetime.combine(month_start, datetime.min.time()), datetime.combine(next_month, datetime.min.time())], time.units)
            dataset.createVariable("time_bnds", "f8", ("time", "bnds"))[:] = [bound_values]
        for index, name in enumerate(SOIL_LAYERS):
            field = dataset.createVariable(name, "f4", ("time", "lat", "lon"), fill_value=-9999)
            field.units = units
            field[:] = np.full((1, len(latitudes), len(longitudes)), start + index + 1)


def test_loads_acquisition_pipeline_monthly_exports(tmp_path):
    first, second = monthly_dates(2)
    lat, lon = [-35.125, -34.875], [-61.125, -60.875]
    paths = [tmp_path / "one.nc4", tmp_path / "two.nc4"]
    write_month_file(paths[0], first, lat, lon, start=10)
    write_month_file(paths[1], second, lat, lon, start=10)
    months, loaded_lat, loaded_lon, layers, units = load_monthly_netcdf(paths)
    assert months == [first, second]
    assert loaded_lat == lat and loaded_lon == lon
    assert layers[SOIL_LAYERS[0]].shape == (2, 2, 2)
    assert units[SOIL_LAYERS[0]] == SOIL_UNITS
    result = analyze_monthly_files(paths, minimum_regional_coverage=0.5)
    assert [record["filename"] for record in result["input_files"]] == [path.name for path in paths]
    assert all(len(record["sha256"]) == 64 for record in result["input_files"])


def test_loader_rejects_inconsistent_units_and_grid():
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        first, second = monthly_dates(2)
        lat, lon = [-35.125, -34.875], [-61.125, -60.875]
        bad = root / "bad.nc4"
        no_bounds = root / "no_bounds.nc4"
        write_month_file(no_bounds, first, lat, lon, include_bounds=False)
        with pytest.raises(TrendAnalysisError, match="must reference time bounds"):
            load_monthly_netcdf([no_bounds])
        write_month_file(bad, first, lat, lon, units="m3 m-3")
        with pytest.raises(TrendAnalysisError, match="units"):
            load_monthly_netcdf([bad])
        good = root / "good.nc4"
        changed = root / "changed.nc4"
        write_month_file(good, first, lat, lon)
        write_month_file(changed, second, lat, [-61.125, -60.80])
        with pytest.raises(TrendAnalysisError, match="0.25 degree"):
            load_monthly_netcdf([good, changed])
