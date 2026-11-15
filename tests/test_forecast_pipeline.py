from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from gldas.availability.registry import load_registry
from gldas.predictive.export_evaluation import MODELS, normalize
from gldas.predictive.forecast import (
    available_rows, instant, issue_month, partition, requested_rows, require_operational,
    retrospective, uncertainty,
)
from test_predictive import synthetic_panel


def test_horizon_and_publication_cutoffs():
    target = instant("2025-12-01T00:00:00Z")
    issue = issue_month(target, 2)
    assert issue.isoformat() == "2025-10-31T23:59:59.999999999+00:00"
    panel = synthetic_panel(months=312, cells=1, release_lag=5)
    eligible = available_rows(panel, issue)
    assert eligible["month"].max() == instant("2025-05-01T00:00:00Z")
    late = panel["month"].eq(eligible["month"].max())
    panel.loc[late, "available_at"] = instant("2025-11-01T00:00:00Z")
    assert available_rows(panel, issue)["month"].max() == instant("2025-04-01T00:00:00Z")
    with pytest.raises(ValueError, match="UTC"):
        instant("2025-10-31")


def test_operational_gate_withholds_unverified_inputs():
    with pytest.raises(ValueError, match="Operational forecast withheld"):
        require_operational(pd.Timestamp(datetime(2026, 11, 15, tzinfo=timezone.utc)), load_registry())


def test_partition_excludes_unavailable_labels():
    panel = synthetic_panel(months=312, cells=1, release_lag=5)
    fit_rows, _, calibration = partition(panel, 3, 6)
    assert fit_rows["target_available_at"].max() < instant("2021-11-01T00:00:00Z")
    assert calibration.max() == instant("2023-05-01T00:00:00Z")
    assert fit_rows["target_month"].max() < calibration.min()


@pytest.mark.parametrize("target", ["storage", "anomaly", "low_moisture"])
def test_retrospective_status_interval_and_score(target):
    panel = synthetic_panel(months=312, cells=1, release_lag=5)
    issue = instant("2025-10-31T23:59:59.999999999Z")
    forecast = retrospective(panel, issue, horizon=2, target=target)
    assert forecast["status"] == "retrospective_simulation"
    assert forecast["target_month"] == "2025-12"
    assert forecast["model"]["name"] == "seasonal_climatology"
    assert forecast["availability"]["publication_evidence"] is None
    assert forecast["availability"]["operationally_eligible"] is False
    assert forecast["out_of_sample"]["metrics"]["n_months"] == 24
    if target == "low_moisture":
        assert 0 <= forecast["value"] <= 1
        assert 0 <= forecast["out_of_sample"]["metrics"]["brier"] <= 1
        assert forecast["predictive_interval"] is None
    else:
        interval = forecast["predictive_interval"]
        assert interval["lower"] <= forecast["value"] <= interval["upper"]
        assert 0 <= forecast["out_of_sample"]["metrics"]["empirical_coverage"] <= 1


def test_future_values_cannot_enter_issue_features():
    panel = synthetic_panel(months=312, cells=1, release_lag=5)
    month = instant("2025-12-01T00:00:00Z")
    original = requested_rows(panel, [month], 2, 6)
    unavailable = panel["available_at"].gt(issue_month(month, 2))
    panel.loc[unavailable, "soil_water_mm"] = 1e6
    pd.testing.assert_frame_equal(original, requested_rows(panel, [month], 2, 6))
    panel["soil_water_valid"] = False
    with pytest.raises(ValueError, match="eligible soil-water"):
        requested_rows(panel, [month], 2, 6)


def test_interval_rejects_unusable_calibration():
    assert uncertainty(np.arange(1, 21), 0.9) == 19
    with pytest.raises(ValueError, match="too small"):
        uncertainty(np.arange(1, 3), 0.9)
    with pytest.raises(ValueError, match="Invalid"):
        uncertainty(np.array([np.nan]))


def test_summary_never_tunes_on_holdout_or_unavailable_fold():
    rows = []
    for i, model in enumerate(MODELS):
        for j, (test, final, score) in enumerate((("2022-08", False, 1+i),
                                                  ("2023-12", False, 100-i*19),
                                                  ("2024-01", True, 20-i))):
            rows.append({"model": model, "fold": {"train_months": ["2015-01"],
                         "test_months": [test], "is_final_holdout": final,
                         "label_availability_cutoff": "2023-11-30T23:59:59+00:00"},
                         "metrics": {"rmse": score, "n_rows": 1, "n_months": 1},
                         "paired_loss_comparisons": {"persistence": {"interval_95": [0.0, 1.0]}}})
    _, results, selected, best = normalize(rows, "storage", 5)
    assert selected == "seasonal_climatology" and best == "xgboost_hmm"
    assert not results[0]["walk_forward"]["folds"][1]["eligible_for_selection"]
