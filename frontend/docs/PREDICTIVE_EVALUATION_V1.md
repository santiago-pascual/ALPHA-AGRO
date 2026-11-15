# Predictive evaluation artifact contract

The Predictive Research page reads `frontend/public/data/predictive_evaluation_v1.json`. The artifact is local/ignored and must be generated from validated panel and evaluation outputs on the data-holding PC. The frontend does not calculate missing evaluations or fall back to its trend DEMO data.

## Required contract

Root fields are `schema_version: "predictive_evaluation_v1"`, `status: "retrospective_evaluation"`, `provenance`, `evaluation`, and non-empty `results`.

`provenance` is the source product/version/DOI; SHA-256 of the exact evaluation input panel and source-file manifest; source-file count; availability policy and release lag (or null if not applicable); geographic support; grid resolution; eligible cell count; and the YYYY-MM evaluation period. The hashes must be 64-character hex digests.

`evaluation` records the method, pre-holdout model selection method, issue-time and feature-release rules, holdout period and month count, spatial fold rule, and a string array of limitations. This must describe chronological walk-forward evaluation plus a contiguous untouched final holdout. Keep the assumed five-month release lag identified as an assumption; do not describe it as measured operational availability.

Each item in `results` is unique by `scope + horizon_months + target` and contains:

- `scope`: `regional` or `spatial`; `scope_definition` states the aggregation and geographic support. Regional scores must evaluate predictions against the regional monthly target; spatial scores must describe the area-weighted cell panel. Do not derive one from the other in the frontend.
- `horizon_months`: 1, 2, or 3; `target`: `storage`, `anomaly`, or `low_moisture`.
- `target_definition`: the training-only method, units, and (when applicable) threshold definition. Low-moisture must be identified as the training-only cell/calendar-month weighted 20th percentile, not an agricultural drought label.
- `primary_metric`: `rmse` or `mae` for storage/anomaly; `brier` for low-moisture probability. Units are mm for storage/anomaly and dimensionless for Brier.
- `models`: unique model rows including at least one baseline (`seasonal_climatology` and/or `persistence`) and candidate models. Exactly one model, including a baseline, must have `selected_before_holdout: true`; that selection must use walk-forward data only. The frontend separately calculates the descriptive lowest-score model on holdout and labels it as a descriptive winner, never a selected model.

Model rows contain `role`, `selected_before_holdout`, `walk_forward.folds`, `holdout`, `skill_scores`, and `uncertainty`. Every fold and holdout block has an `id`, `{start,end}` YYYY-MM period, positive integer `n_rows` and `n_months`, and a `metrics` object. Regression metrics may contain `rmse`, `mae`, `skill_vs_persistence`, and `skill_vs_climatology`; classification may contain `brier` and corresponding skills. Supply only calculated finite values; use null/omit when unavailable. Scores are area-weighted consistently with the evaluated support.

`skill_scores` carries only validated `vs_persistence` and/or `vs_climatology` values. `uncertainty.metric_difference_interval_95` is a two-number interval or null, `comparison_baseline` is `persistence`, `climatology`, or null, and `method` names the paired interval method. The interval is the uncertainty of model-minus-baseline score difference (negative favors the model), not a predictive interval. For the current evaluator, map the corresponding 95% circular month-block interval. Never relabel it as forecast uncertainty.

Example shape (deliberately not populated with scores):

```json
{
  "schema_version": "predictive_evaluation_v1",
  "status": "retrospective_evaluation",
  "provenance": {
    "source_product": "NASA GLDAS Noah",
    "source_version": "2.1",
    "source_doi": "https://doi.org/10.5067/SXAVCZFAQLNO",
    "input_panel_sha256": "<64 hex chars>",
    "source_manifest_sha256": "<64 hex chars>",
    "source_file_count": 240,
    "availability_policy": "assumed_release_lag",
    "release_lag_months": 5,
    "geography": "Argentine Pampas study grid",
    "grid_resolution_degrees": 0.25,
    "eligible_cell_count": "<integer from validated panel>",
    "evaluation_period": { "start": "2006-01", "end": "2025-12" }
  },
  "evaluation": {
    "method": "expanding-window walk-forward plus untouched final holdout",
    "selection_method": "<pre-holdout selection from walk-forward results only>",
    "issue_time_rule": "<as implemented>",
    "release_rule": "available_at <= issue_time",
    "holdout_period": { "start": "<YYYY-MM>", "end": "<YYYY-MM>" },
    "holdout_month_count": "<positive integer>",
    "spatial_fold_rule": "all cells in a target month share the same fold",
    "limitations": ["<specific evaluation limitations>"]
  },
  "results": [{
    "scope": "regional",
    "scope_definition": "<regional aggregation and support>",
    "horizon_months": 1,
    "target": "storage",
    "target_definition": { "method": "<training-only definition>", "units": "mm" },
    "primary_metric": "rmse",
    "models": [{
      "model": "persistence",
      "role": "baseline",
      "selected_before_holdout": false,
      "walk_forward": { "folds": [{ "id": "wf-1", "period": { "start": "<YYYY-MM>", "end": "<YYYY-MM>" }, "n_rows": "<positive integer>", "n_months": "<positive integer>", "metrics": { "rmse": "<finite score>" } }] },
      "holdout": { "id": "final-holdout", "period": { "start": "<YYYY-MM>", "end": "<YYYY-MM>" }, "n_rows": "<positive integer>", "n_months": "<positive integer>", "metrics": { "rmse": "<finite score>" } },
      "skill_scores": {},
      "uncertainty": { "metric_difference_interval_95": null, "comparison_baseline": null, "method": "<method or unavailable reason>" }
    }]
  }]
}
```

The example shows one row for readability; a usable artifact must include regional and spatial records for each evaluated horizon/target, with matching baseline/candidate coverage. Use JSON numbers/nulls, not the explanatory placeholder strings above. All values must come from the validated evaluation, never from this example or the test fixture.

## Export and installation

Generate this artifact with `python -m gldas.predictive.export_evaluation` using both validated Phase 5B JSON files and the Phase 5A panel directory. See the [forecast pipeline runbook](../../docs/PHASE6_FORECAST_PIPELINE.md). Each series includes both `selected_model` and `descriptive_holdout_model` plus the selection-eligible training/test windows. The frontend ignores the artifact under `public/data/`. Archived forecast artifacts do not qualify for a live forecast display.
