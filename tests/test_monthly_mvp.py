import json

import pytest

from gldas.acquisition import checksum
from gldas.predictive.monthly_mvp import selected_regional_storage_models


def evaluation_template(panel_digest, manifest_digest):
    return {
        "schema_version": "predictive_evaluation_v1",
        "status": "retrospective_evaluation",
        "provenance": {
            "source_runs": {"regional": {"panel_sha256": panel_digest}},
            "source_manifest_sha256": manifest_digest,
            "availability_policy": "assumed_release_lag_5_calendar_months",
            "release_lag_months": 5,
        },
        "evaluation": {"holdout_period": {"start": "2024-01", "end": "2025-12"}},
        "results": [
            {"scope": "regional", "horizon_months": horizon, "target": "storage",
             "selected_model": "seasonal_climatology",
             "models": [{"model": "seasonal_climatology", "selected_before_holdout": True}]}
            for horizon in (1, 2, 3)
        ],
    }


def test_monthly_mvp_selection_requires_matching_provenance_and_preholdout_winners(tmp_path):
    panel = tmp_path / "regional_panel.parquet"
    panel.write_bytes(b"validated-panel-placeholder")
    panel_digest = checksum(panel)
    manifest = tmp_path / "MANIFEST.json"
    manifest.write_text(json.dumps({
        "availability_policy": "assumed_release_lag_5_calendar_months",
        "files": {panel.name: {"sha256": panel_digest}},
    }), encoding="utf-8")
    evaluation = evaluation_template(panel_digest, checksum(manifest))

    assert selected_regional_storage_models(evaluation, panel, manifest) == {
        1: "seasonal_climatology", 2: "seasonal_climatology", 3: "seasonal_climatology",
    }

    evaluation["provenance"]["source_runs"]["regional"]["panel_sha256"] = "0" * 64
    with pytest.raises(ValueError, match="checksums do not agree"):
        selected_regional_storage_models(evaluation, panel, manifest)


def test_monthly_mvp_selection_rejects_ambiguous_or_holdout_only_selection(tmp_path):
    panel = tmp_path / "regional_panel.parquet"
    panel.write_bytes(b"panel")
    panel_digest = checksum(panel)
    manifest = tmp_path / "MANIFEST.json"
    manifest.write_text(json.dumps({
        "availability_policy": "assumed_release_lag_5_calendar_months",
        "files": {panel.name: {"sha256": panel_digest}},
    }), encoding="utf-8")
    evaluation = evaluation_template(panel_digest, checksum(manifest))
    evaluation["results"][0]["models"].append({"model": "xgboost", "selected_before_holdout": True})
    with pytest.raises(ValueError, match="Invalid pre-holdout selection"):
        selected_regional_storage_models(evaluation, panel, manifest)
