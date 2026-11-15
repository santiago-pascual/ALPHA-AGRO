import numpy as np
import pandas as pd
import pytest

from gldas.predictive.agricultural import moisture_indicators
from gldas.predictive.forecast import instant
from gldas.predictive.spatial import build_hindcasts, weighted_radius
from test_predictive import synthetic_panel


def test_generic_indicators_preserve_missing_and_stop_at_gaps():
    assert moisture_indicators([(30, -1), (29, -5), (28, 0)]) == {
        "anomaly_mm": -1.0, "below_normal": True, "consecutive_below_normal_months": 2}
    assert moisture_indicators([(30, -1), (28, -5)])["consecutive_below_normal_months"] == 1
    assert moisture_indicators([(30, None)])["below_normal"] is None
    assert moisture_indicators([(30, 0)])["consecutive_below_normal_months"] == 0


def test_weighted_residual_interval_is_not_cell_count_weighted():
    assert weighted_radius([2, 9], [99, 1]) == 2
    with pytest.raises(ValueError, match="positive area"):
        weighted_radius([2, 9], [1, 0])


def test_grid_hindcast_uses_preissue_mask_and_chronological_calibration():
    panel = synthetic_panel(months=312, cells=3, release_lag=5)
    panel["availability_policy"] = "assumed_release_lag_5_calendar_months"
    issue = instant("2025-09-30T23:59:59.999999999Z")
    latest = panel.loc[panel["available_at"].le(issue), "month"].max()
    masked = panel["month"].eq(latest) & panel["cell_id"].eq("cell-2")
    panel.loc[masked, "soil_water_valid"] = False
    panel.loc[masked, "soil_water_mm"] = np.nan
    results = build_hindcasts(panel, issue, "a"*64, horizons=(3,), targets=("storage", "low_moisture"))
    assert results["status"] == "retrospective_simulation" and not results["operationally_eligible"]
    storage, event = results["results"]
    assert storage["target_month"] == "2025-12"
    assert storage["last_observation_month"] == "2025-04"
    assert storage["calibration"]["months"] == 17
    assert not storage["calibration"]["per_cell_guarantee"]
    assert storage["holdout"]["metrics"]["n_months"] == 24
    assert [c["cell_id"] for c in storage["cells"]] == ["cell-0", "cell-1", "cell-2"]
    c = next(c for c in storage["cells"] if c["cell_id"] == "cell-2")
    assert not c["valid"] and c["value"] is None and c["interval"] is None
    assert 0 <= event["holdout"]["metrics"]["brier"] <= 1
    assert event["calibration"]["calibrated"] is False
    changed = panel.copy()
    future = changed["month"].gt(latest) & changed["soil_water_valid"]
    changed.loc[future, "soil_water_mm"] += 100
    second = build_hindcasts(changed, issue, "b"*64, horizons=(3,), targets=("storage", "low_moisture"))
    assert [x["cells"] for x in results["results"]] == [x["cells"] for x in second["results"]]
    assert pd.Timestamp(storage["availability"]["available_at"]) <= issue
