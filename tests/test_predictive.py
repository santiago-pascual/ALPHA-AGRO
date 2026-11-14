from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from gldas.predictive.contract import read_parquet, validate_frame, write_parquet
from gldas.predictive.evaluation import _target_values, evaluate, expanding_folds
from gldas.predictive.features import make_supervised
from gldas.predictive.hmm import DiagonalGaussianHMM
from gldas.predictive.metrics import classification_metrics, regression_metrics
from gldas.predictive.models import estimator, fit


def synthetic_panel(months: int = 72, cells: int = 2, release_lag: int = 1) -> pd.DataFrame:
    dates = pd.date_range("2000-01-01", periods=months, freq="MS", tz="UTC")
    rows = []
    for index, month in enumerate(dates):
        for cell in range(cells):
            storage = 220 + 18 * np.sin(2 * np.pi * month.month / 12) + 0.2 * index + 2 * cell
            fields = {
                "soil_water_mm": storage,
                "precipitation_mm_month": 60 + 20 * np.sin(index / 4 + cell),
                "evapotranspiration_mm_month": 40 + 5 * np.cos(index / 5),
                "air_temperature_c": 14 + 8 * np.sin(2 * np.pi * month.month / 12),
                "surface_runoff_mm_month": 5 + np.cos(index / 3),
                "subsurface_runoff_mm_month": 7 + np.sin(index / 6),
            }
            rows.append({
                "month": month, "cell_id": f"cell-{cell}", "latitude": -34 + cell * 0.25,
                "longitude": -60.5, **fields,
                "soil_water_valid": True, "precipitation_valid": True,
                "evapotranspiration_valid": True, "air_temperature_valid": True,
                "surface_runoff_valid": True, "subsurface_runoff_valid": True,
                "area_weight": 1.0, "observation_start": month,
                "observation_end": month + pd.offsets.MonthBegin(1),
                "available_at": month + pd.DateOffset(months=release_lag),
                "source_product": "GLDAS Noah v2.1 monthly", "source_version": "2.1",
                "source_doi": "10.5067/SXAVCZFAQLNO", "soil_granule_id": f"soil-{index}",
                "driver_granule_id": f"driver-{index}", "soil_sha256": "a" * 64,
                "driver_sha256": "b" * 64, "availability_policy": f"assumed_release_lag_{release_lag}",
            })
    return pd.DataFrame(rows)


def test_contract_parquet_roundtrip_and_version(tmp_path):
    panel = synthetic_panel(months=24)
    panel["availability_policy"] = "test synthetic only"
    path = write_parquet(panel, tmp_path / "panel.parquet", availability_policy="test synthetic only")
    restored = read_parquet(path)
    assert len(restored) == len(panel)
    assert restored["cell_id"].nunique() == 2
    with pytest.raises(FileExistsError):
        write_parquet(panel, path, availability_policy="test")


def test_contract_rejects_missing_provenance_and_inconsistent_availability():
    panel = synthetic_panel(months=24)
    panel.loc[0, "driver_sha256"] = ""
    with pytest.raises(ValueError, match="driver_sha256"):
        validate_frame(panel)
    panel = synthetic_panel(months=24)
    panel.loc[0, "available_at"] = panel.loc[0, "observation_end"] - pd.Timedelta(days=1)
    with pytest.raises(ValueError, match="availability time"):
        validate_frame(panel)


def test_horizon_alignment_and_released_feature_cutoff():
    panel = synthetic_panel(months=48, release_lag=2)
    supervised, columns = make_supervised(panel, horizon=2, n_lags=3)
    target_month_number = supervised["target_month"].dt.year * 12 + supervised["target_month"].dt.month
    origin_month_number = supervised["origin_month"].dt.year * 12 + supervised["origin_month"].dt.month
    assert (target_month_number - origin_month_number).eq(2).all()
    first_origin = pd.Timestamp("2000-04-01", tz="UTC")
    row = supervised.loc[supervised["origin_month"].eq(first_origin)].iloc[0]
    assert row["soil_water_source_month_lag_0"] == 2  # February is released March 1; March is not.
    assert "precipitation_mm_month_lag_0" in columns


def test_future_record_mutation_cannot_change_earlier_features():
    panel = synthetic_panel(months=48, release_lag=1)
    original, _ = make_supervised(panel, horizon=1, n_lags=4)
    changed = panel.copy()
    future = changed["month"].ge(pd.Timestamp("2001-01-01", tz="UTC"))
    changed.loc[future, "soil_water_mm"] += 10000
    altered, _ = make_supervised(changed, horizon=1, n_lags=4)
    key = pd.Timestamp("2000-12-01", tz="UTC")
    left = original.loc[original["origin_month"].eq(key)].sort_values("cell_id")
    right = altered.loc[altered["origin_month"].eq(key)].sort_values("cell_id")
    feature_columns = [name for name in original if "_lag_" in name]
    np.testing.assert_allclose(left[feature_columns], right[feature_columns], equal_nan=True)


def test_expanding_folds_keep_each_calendar_month_together_and_reserve_holdout():
    panel = synthetic_panel(months=96, cells=3, release_lag=1)
    frame, _ = make_supervised(panel, horizon=1)
    folds, holdout = expanding_folds(frame, initial_train_months=24,
                                     test_window_months=12, holdout_months=12)
    assert folds
    assert holdout.is_final_holdout
    for fold in [*folds, holdout]:
        assert set(fold.train_months).isdisjoint(fold.test_months)
        test_rows = frame.loc[pd.to_datetime(frame["target_month"], utc=True).dt.strftime("%Y-%m").isin(fold.test_months)]
        assert test_rows.groupby("target_month")["cell_id"].nunique().eq(3).all()
    assert set(holdout.test_months).isdisjoint({month for fold in folds for month in fold.test_months})


def test_training_only_target_transform_ignores_holdout_values():
    panel = synthetic_panel(months=48)
    supervised, _ = make_supervised(panel, horizon=1)
    cutoff = pd.Timestamp("2002-01-01", tz="UTC")
    train = supervised.loc[supervised["target_month"].lt(cutoff)]
    test = supervised.loc[supervised["target_month"].ge(cutoff)].copy()
    _, _, info_before = _target_values(train, test, "anomaly")
    test["target_soil_water_mm"] += 10000
    _, _, info_after = _target_values(train, test, "anomaly")
    assert info_before["_cell_month_climatology"] == info_after["_cell_month_climatology"]
    _, _, event_info_before = _target_values(train, supervised.loc[supervised["target_month"].ge(cutoff)], "low_moisture")
    _, _, event_info = _target_values(train, test, "low_moisture")
    assert event_info["interpretation"] == "not verified agricultural drought"
    assert event_info_before["_cell_month_threshold_mm"] == event_info["_cell_month_threshold_mm"]


def test_hmm_filter_is_prefix_invariant_and_reproducible():
    rng = np.random.default_rng(721)
    states = np.repeat([0, 1, 2, 1], [18, 14, 16, 12])
    means = np.array([[-1.5, 0.2], [0.2, -0.8], [1.7, 1.0]])
    x = means[states] + rng.normal(0, 0.28, size=(len(states), 2))
    first = DiagonalGaussianHMM(3, random_state=19, max_iter=40).fit(x)
    second = DiagonalGaussianHMM(3, random_state=19, max_iter=40).fit(x)
    prefix = first.filter(x[:31])
    full = first.filter(x)
    np.testing.assert_allclose(prefix, full[:31], atol=1e-12)
    np.testing.assert_allclose(first.filter(x), second.filter(x), atol=1e-12)
    assert first.bic < np.inf
    assert np.allclose(full.sum(axis=1), 1)


def test_ridge_transform_is_training_only_and_xgboost_interface_runs():
    x = pd.DataFrame({"feature": [0.0, 1.0, np.nan, 3.0]})
    model = estimator("ridge")
    model.fit(x.iloc[:3], np.array([0.0, 1.0, 2.0]))
    fitted_median = model.named_steps["simpleimputer"].statistics_[0]
    model.predict(pd.DataFrame({"feature": [100000.0]}))
    assert fitted_median == 0.5
    tree = estimator("xgboost", params={"max_depth": 1, "n_estimators": 5})
    tree.fit(pd.DataFrame({"x": np.arange(30)}), np.arange(30.0))
    assert tree.predict(pd.DataFrame({"x": [3, 4]})).shape == (2,)


def test_regression_and_probability_metrics_are_finite():
    panel = synthetic_panel(months=24)
    frame, _ = make_supervised(panel, horizon=1)
    test = frame.tail(24).reset_index(drop=True)
    y = test["target_soil_water_mm"].to_numpy()
    result = regression_metrics(test, y, y + 1, y + 2)
    assert result["rmse"] == pytest.approx(1.0)
    assert result["bias"] == pytest.approx(1.0)
    classifier = classification_metrics(test, np.arange(len(test)) % 2, np.full(len(test), 0.5))
    assert classifier["brier"] == pytest.approx(0.25)
    assert len(classifier["calibration_bins"]) == 1


def test_end_to_end_walk_forward_and_untouched_holdout_on_fixture():
    result = evaluate(synthetic_panel(months=72, cells=2), horizons=(1,), targets=("anomaly", "low_moisture"),
                      initial_train_months=24, test_window_months=24, holdout_months=12,
                      model_families=("ridge",))
    assert result["results"]
    assert any(row["fold"]["is_final_holdout"] for row in result["results"])
    assert all(row.get("metrics", {}).get("n_rows", 0) > 0 for row in result["results"])
    event_rows = [row for row in result["results"] if row["target"] == "low_moisture"]
    assert event_rows and all("brier" in row.get("metrics", {}) for row in event_rows)


def test_hmm_augmented_xgboost_uses_causal_filtered_features():
    from gldas.predictive.evaluation import _feature_values

    panel = synthetic_panel(months=60, cells=1)
    supervised, features = make_supervised(panel, horizon=1, n_lags=2)
    cutoff = pd.Timestamp("2002-06-01", tz="UTC")
    train = supervised.loc[supervised["target_month"].lt(cutoff)]
    test = supervised.loc[supervised["target_month"].ge(cutoff)]
    combined = pd.concat([train, test], ignore_index=True)
    origin_months = set(pd.to_datetime(train["origin_month"], utc=True).unique())
    augmented, columns, metadata = _feature_values(combined, features, "xgboost_hmm", origin_months)
    state_columns = [name for name in columns if name.startswith("hmm_filtered_state_")]
    assert metadata["selected_states_by_training_bic"] in (2, 3)
    assert metadata["future_smoothing_used"] is False
    sums = augmented[state_columns].sum(axis=1)
    available = augmented[state_columns].notna().all(axis=1)
    assert available.any()
    assert np.allclose(sums[available], 1.0)
    model = estimator("xgboost", params={"max_depth": 1, "n_estimators": 5})
    fit(model, augmented.iloc[:len(train)][columns], train["target_soil_water_mm"].to_numpy())
    assert model.predict(augmented.iloc[len(train):][columns]).shape[0] == len(test)
