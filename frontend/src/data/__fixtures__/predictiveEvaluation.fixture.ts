// Synthetic values for adapter and component tests only. Never import into application code.
const fakeScore = (offset: number) => ({ rmse: 999 + offset, mae: 998 + offset });
const fakeBrier = (offset: number) => ({ brier: 999 + offset });
const fold = (id: string, metrics: Record<string, number>) => ({ id, period: { start: "2098-01", end: "2098-12" }, n_rows: 12, n_months: 12, metrics });
const result = (scope: "regional" | "spatial", target: "storage" | "low_moisture") => {
  const classification = target === "low_moisture";
  const metric = classification ? "brier" : "rmse";
  const scores = classification ? fakeBrier : fakeScore;
  return {
    scope,
    scope_definition: scope === "regional" ? "SYNTHETIC TEST region mean" : "SYNTHETIC TEST area-weighted cell scores",
    horizon_months: 1,
    target,
    target_definition: { method: "SYNTHETIC TEST ONLY", units: classification ? "dimensionless" : "mm" },
    primary_metric: metric,
    models: [
      { model: "persistence", role: "baseline", selected_before_holdout: false, walk_forward: { folds: [fold("wf-1", scores(0))] }, holdout: fold("holdout", scores(2)), skill_scores: {}, uncertainty: { metric_difference_interval_95: null, comparison_baseline: null, method: "SYNTHETIC TEST ONLY" } },
      { model: "xgboost", role: "candidate", selected_before_holdout: true, walk_forward: { folds: [fold("wf-1", scores(1))] }, holdout: fold("holdout", scores(3)), skill_scores: { vs_persistence: -0.01 }, uncertainty: { metric_difference_interval_95: [990, 1000], comparison_baseline: "persistence", method: "SYNTHETIC TEST ONLY" } },
    ],
  };
};

export const predictiveEvaluationFixture = {
  schema_version: "predictive_evaluation_v1",
  status: "retrospective_evaluation",
  provenance: {
    source_product: "TEST ONLY — SYNTHETIC FIXTURE", source_version: "fixture", source_doi: "https://example.invalid/test-only",
    input_panel_sha256: "a".repeat(64), source_manifest_sha256: "b".repeat(64), source_file_count: 1,
    availability_policy: "SYNTHETIC TEST ONLY", release_lag_months: null, geography: "TEST ONLY", grid_resolution_degrees: 0.25,
    eligible_cell_count: 1, evaluation_period: { start: "2098-01", end: "2099-12" },
  },
  evaluation: {
    method: "SYNTHETIC TEST ONLY", selection_method: "SYNTHETIC TEST ONLY", issue_time_rule: "SYNTHETIC TEST ONLY", release_rule: "SYNTHETIC TEST ONLY",
    holdout_period: { start: "2098-01", end: "2098-12" }, holdout_month_count: 12, spatial_fold_rule: "SYNTHETIC TEST ONLY", limitations: ["SYNTHETIC TEST ONLY; not a scientific result."],
  },
  results: [result("regional", "storage"), result("spatial", "storage"), result("regional", "low_moisture"), result("spatial", "low_moisture")],
};
