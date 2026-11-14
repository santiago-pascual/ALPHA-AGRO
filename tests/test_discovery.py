from datetime import date

import numpy as np
import pytest

from gldas.discovery import aggregate, block_indices, lagged_relationships, seasonal_sen, trend


def test_weighted_coverage_withholds_when_required():
    storage = np.array([[[20., 40.]], [[20., np.nan]]])
    weights = np.array([[1., 3.]])
    means, coverage = aggregate(storage, weights, weights > 0, threshold=0.5)
    np.testing.assert_allclose(means, [35., np.nan])
    np.testing.assert_allclose(coverage, [1., 0.25])


def test_trend_keeps_the_calendar_when_extreme_months_are_removed():
    time = np.arange(120)
    values = time / 10 + 5 * np.sin(time * np.pi / 6)
    values[[2, 30, 51]] = np.nan
    result = trend(values)
    assert result["n"] == 117
    assert result["slope"] == pytest.approx(12)


def test_seasonal_sen_and_aligned_blocks():
    time = np.arange(48)
    values = time / 10 + 5 * np.sin(time * np.pi / 6)
    result = seasonal_sen(values, np.random.default_rng(13))
    assert result["slope"] == pytest.approx(12)
    assert result["ci95"] == pytest.approx([12, 12])
    samples = block_indices(48, np.random.default_rng(13), stride=12)
    assert ((samples % 12) == (time % 12)).all()


def test_relationship_recovers_driver_lead_and_rejects_gappy_calendar():
    dates = [date(y, m, 1) for y in range(2006, 2026) for m in range(1, 13)]
    rng = np.random.default_rng(18)
    driver = rng.normal(size=240)
    soil = np.r_[0, driver[:-1] * 3] + rng.normal(scale=0.1, size=240)
    rows = lagged_relationships(dates, soil, {"rain": driver})
    assert [(row["lag"], row["n"]) for row in rows] == [(0, 240), (1, 239), (3, 237)]
    assert rows[1]["slope"] == pytest.approx(3, abs=0.05)
    assert rows[1]["q"] < 0.05
    assert all(row["q"] >= row["p"] for row in rows)
    with pytest.raises(ValueError, match="consecutive"):
        lagged_relationships(dates[1:], soil, {"rain": driver})
