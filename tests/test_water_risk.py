"""Synthetic fixtures exercise the gates without asserting NASA forecast skill."""
from datetime import date, datetime, timezone
import json
from pathlib import Path

from jsonschema import validate, ValidationError as SchemaError
import numpy as np
import pandas as pd
import pytest

from gldas import water_archive
from gldas.water_evaluation import HORIZONS, aligned, cell_results, evaluate, references
from gldas.water_risk import SCHEMA_PATH, decision_view


def test_eight_slots_required_and_missing_cell_stays_missing(tmp_path, monkeypatch):
    def replay(path):
        stamp = path.name.split(".")[1][1:] + path.name.split(".")[2]
        moment = datetime.strptime(stamp, "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
        profile = np.full(water_archive.SHAPE, float(moment.hour))
        if moment.hour == 9:
            profile[0, 0] = np.nan
        return profile, {"source": {"start": moment.isoformat()}, "sha256": str(moment.hour)}

    monkeypatch.setattr(water_archive, "replay", replay)
    day = date(2020, 1, 1)
    for hour in range(0, 21, 3):
        (tmp_path / f"GLDAS_NOAH025_3H.A20200101.{hour:02d}00.021.nc4").mkdir()
    grid, complete, _ = water_archive.daily(tmp_path, day, day)
    assert not complete and np.isnan(grid).all()
    (tmp_path / "GLDAS_NOAH025_3H.A20200101.2100.021.nc4").mkdir()
    grid, complete, hashes = water_archive.daily(tmp_path, day, day)
    assert complete == ["2020-01-01"] and len(hashes) == 8
    assert grid[0, 0, 1] == 10.5 and np.isnan(grid[0, 0, 0])


@pytest.mark.parametrize("horizon", HORIZONS)
def test_issue_alignment_and_availability(horizon):
    days = pd.date_range("2020-01-01", periods=200)
    values = np.arange(len(days), dtype=float)
    lag = 11
    x, y, event, _, _, _, issue, available = aligned(
        days, values, np.zeros(12), np.full(12, 70), np.full(12, .2), horizon, lag
    )
    assert (y == horizon).all()
    assert issue[0] == days[40] and x[0, 0] == values[28]
    assert available[0] == issue[0] + pd.Timedelta(days=horizon + lag)
    np.testing.assert_array_equal(event, x[:, 0] + lag + horizon < 70)


def test_climatology_needs_three_distinct_years():
    days = pd.date_range("2019-01-01", "2021-01-31")
    center, threshold, frequency = references(np.ones(len(days)), days)
    assert center[0] == threshold[0] == 1 and frequency[0] == 0
    assert np.isnan(center[1:]).all()


def test_holdout_cannot_change_fitted_models_or_intervals():
    days = pd.date_range("2015-01-01", "2023-12-31")
    rng = np.random.default_rng(1729)
    water = 220 + 15*np.sin(np.arange(len(days)) * 2*np.pi/365.25) + rng.normal(0, 4, len(days))
    cutoff, pre, hold = map(pd.Timestamp, ["2017-12-31", "2020-01-01", "2022-01-01"])
    other = water.copy()
    other[days >= hold] += 150
    options = {"training_reference_cutoff": cutoff + pd.Timedelta(days=121)}
    a = cell_results(days, water, 28, 120, days[0], cutoff, pre, hold, **options)
    b = cell_results(days, other, 28, 120, days[0], cutoff, pre, hold, **options)
    assert a is not None and b is not None
    early = a["issues"] < hold + pd.Timedelta(days=120)
    np.testing.assert_allclose(a["predictions"][early], b["predictions"][early])
    np.testing.assert_allclose(a["probabilities"][early], b["probabilities"][early])
    np.testing.assert_allclose(a["calibration_errors"], b["calibration_errors"])
    result = evaluate(water[:, None, None], days[0], 120, days[0], cutoff, pre, hold, [-34])
    for h in ("14", "28"):
        assert result["horizons_days"][h]["status"] == "scored"
        assert 0 <= result["horizons_days"][h]["models"]["ridge"]["brier"] <= 1


def test_view_never_turns_archived_data_into_current_conditions():
    grid = np.full((1, *water_archive.SHAPE), np.nan)
    grid[0, 0, 0] = 220
    view = decision_view(grid, ["2020-01-01"], ["f"*64], date(2020, 1, 1),
                         datetime(2026, 11, 15, tzinfo=timezone.utc))
    schema = json.loads(SCHEMA_PATH.read_text())
    validate(view, schema)
    assert view["status"] == "insufficient_evidence"
    assert view["cells"][0]["historical_storage_mm"] == 220
    assert all(product["current_storage_mm"] is None for product in view["products"])
    view["products"][0]["below_normal_probability"] = .3
    with pytest.raises(SchemaError):
        validate(view, schema)
    fixture = SCHEMA_PATH.parents[1] / "docs/water_risk_v1.fixture.json"
    payload = json.loads(Path(fixture).read_text())
    assert payload["data_kind"] == "fixture"
    validate(payload, schema)
