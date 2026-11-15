export type EvaluationScope = "regional" | "spatial";
export type EvaluationTarget = "storage" | "anomaly" | "low_moisture";
export type ScoreName = "rmse" | "mae" | "brier";

export interface EvaluationMetrics {
  rmse?: number | null;
  mae?: number | null;
  brier?: number | null;
  skill_vs_persistence?: number | null;
  skill_vs_climatology?: number | null;
  score_difference_vs_persistence_95_block_interval?: [number | null, number | null] | null;
  score_difference_vs_climatology_95_block_interval?: [number | null, number | null] | null;
  [key: string]: number | [number | null, number | null] | null | undefined;
}

export interface EvaluationPeriod {
  start: string;
  end: string;
}

export interface EvaluationFold {
  id: string;
  period: EvaluationPeriod;
  n_rows: number;
  n_months: number;
  metrics: EvaluationMetrics;
}

export interface EvaluationModelResult {
  model: string;
  role: "baseline" | "candidate";
  selected_before_holdout: boolean;
  walk_forward: { folds: EvaluationFold[] };
  holdout: EvaluationFold;
  skill_scores: {
    vs_persistence?: number | null;
    vs_climatology?: number | null;
  };
  uncertainty: {
    metric_difference_interval_95: [number | null, number | null] | null;
    comparison_baseline: "persistence" | "climatology" | null;
    method: string;
  };
}

export interface PredictiveEvaluationSeries {
  scope: EvaluationScope;
  scope_definition: string;
  horizon_months: 1 | 2 | 3;
  target: EvaluationTarget;
  target_definition: { method: string; units: string; threshold?: string };
  primary_metric: ScoreName;
  models: EvaluationModelResult[];
  /** Optional source-level identifiers; older contract producers can omit these. */
  selected_model?: string;
  descriptive_holdout_model?: string;
}

export interface PredictiveEvaluation {
  schema_version: "predictive_evaluation_v1";
  status: "retrospective_evaluation";
  provenance: {
    source_product: string;
    source_version: string;
    source_doi: string;
    input_panel_sha256: string;
    source_manifest_sha256: string;
    source_file_count: number;
    availability_policy: string;
    release_lag_months: number | null;
    geography: string;
    grid_resolution_degrees: number;
    eligible_cell_count: number;
    evaluation_period: EvaluationPeriod;
  };
  evaluation: {
    method: string;
    selection_method: string;
    issue_time_rule: string;
    release_rule: string;
    holdout_period: EvaluationPeriod;
    holdout_month_count: number;
    spatial_fold_rule: string;
    limitations: string[];
  };
  results: PredictiveEvaluationSeries[];
}
