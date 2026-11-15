import pandas as pd

from gldas.predictive.interpretation import build_interpretation


def fixture():
    rows = []
    for year in range(2006, 2026):
        for month in range(1, 13):
            rows.append({"month": f"{year}-{month:02d}-01T00:00:00Z", "cell_id": "cell-a",
                         "latitude": -34.0, "longitude": -60.0,
                         "soil_water_mm": float(year - 2000 + month), "soil_water_valid": True})
            rows.append({"month": f"{year}-{month:02d}-01T00:00:00Z", "cell_id": "cell-mask",
                         "latitude": -34.25, "longitude": -60.0,
                         "soil_water_mm": float("nan"), "soil_water_valid": False})
    rows += [{"month": "2026-07-01T00:00:00Z", "cell_id": "cell-a", "latitude": -34.0,
              "longitude": -60.0, "soil_water_mm": 100.0, "soil_water_valid": True},
             {"month": "2026-07-01T00:00:00Z", "cell_id": "cell-mask", "latitude": -34.25,
              "longitude": -60.0, "soil_water_mm": float("nan"), "soil_water_valid": False}]
    forecasts = {"status": "experimental", "model": {"name": "seasonal_climatology"},
        "spatial_forecasts": {"forecasts": [{"target_month": "2026-12", "horizon_months": 1,
          "cells": [{"cell_id": "cell-a", "valid": True, "value": 27.5},
                    {"cell_id": "cell-mask", "valid": False, "value": None}]}]}}
    return pd.DataFrame(rows), forecasts


def records(section):
    return [dict(zip(section["columns"], row)) for row in section["rows"]]


def test_reference_percentiles_anomaly_and_threshold_frequency():
    panel, forecasts = fixture()
    result = build_interpretation(panel, forecasts, "a" * 64)
    assert next(r for r in result["cells"]["rows"] if r[0] == "cell-mask")[3] is False
    ref = next(x for x in records(result["monthly_reference_statistics"]) if x["cell_id"] == "cell-a" and x["calendar_month"] == 12)
    assert ref["n_years"] == 20
    assert ref["p20_mm"] < ref["p50_mm"] < ref["p80_mm"]
    assert ref["low_moisture_frequency"] == ref["low_moisture_count"] / 20
    observed = dict(zip(result["latest_observed_context"]["columns"], result["latest_observed_context"]["records"][0]))
    assert observed["observation_month"] == "2026-07"
    assert observed["anomaly_mm"] == 100 - next(x["mean_mm"] for x in records(result["monthly_reference_statistics"]) if x["cell_id"] == "cell-a" and x["calendar_month"] == 7)


def test_future_years_do_not_change_historical_reference():
    panel, forecasts = fixture()
    before = build_interpretation(panel, forecasts, "a" * 64)["monthly_reference_statistics"]
    panel.loc[panel.month.str.startswith("2026"), "soil_water_mm"] = 99999
    after = build_interpretation(panel, forecasts, "b" * 64)["monthly_reference_statistics"]
    assert before == after


def test_mask_is_preserved_and_probability_is_unavailable():
    panel, forecasts = fixture()
    result = build_interpretation(panel, forecasts, "a" * 64)
    masked = next(x for x in records(result["monthly_reference_statistics"]) if x["cell_id"] == "cell-mask")
    assert masked["n_years"] == 0 and masked["p20_mm"] is None
    forecast = dict(zip(result["forecast_context"]["columns"], next(r for r in result["forecast_context"]["records"] if r[0] == "cell-a")))
    assert forecast["forecast_central_anomaly_mm"] == 0
    assert forecast["probability_below_p20"] is None
    assert forecast["probability_status"] == "unavailable_not_defensibly_calibrated"
    masked_forecast = dict(zip(result["forecast_context"]["columns"], next(r for r in result["forecast_context"]["records"] if r[0] == "cell-mask")))
    assert masked_forecast["status"] == "unavailable_masked_or_no_reference"


def test_duplicate_cell_month_rejected():
    panel, forecasts = fixture()
    panel = pd.concat([panel, panel.iloc[[0]]], ignore_index=True)
    try:
        build_interpretation(panel, forecasts, "a" * 64)
    except ValueError as exc:
        assert "duplicate" in str(exc)
    else:
        raise AssertionError("duplicate cell/month should be rejected")
