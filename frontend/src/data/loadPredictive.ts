import type {
  EvaluationFold,
  EvaluationMetrics,
  EvaluationModelResult,
  EvaluationPeriod,
  EvaluationScope,
  EvaluationTarget,
  PredictiveEvaluation,
  PredictiveEvaluationSeries,
  ScoreName,
} from "../types/predictive";

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Invalid predictive evaluation: expected object at ${path}.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid predictive evaluation: expected text at ${path}.`);
  return value;
}
function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid predictive evaluation: expected finite number at ${path}.`);
  return value;
}
function nullable(value: unknown, path: string): number | null {
  return value === null ? null : finite(value, path);
}
function period(value: unknown, path: string): EvaluationPeriod {
  const row = object(value, path);
  const start = string(row.start, `${path}.start`);
  const end = string(row.end, `${path}.end`);
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) throw new Error(`Invalid predictive evaluation: expected ordered YYYY-MM period at ${path}.`);
  return { start, end };
}
function interval(value: unknown, path: string): [number | null, number | null] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`Invalid predictive evaluation: expected two-value interval at ${path}.`);
  const left = nullable(value[0], `${path}[0]`);
  const right = nullable(value[1], `${path}[1]`);
  if (left !== null && right !== null && left > right) throw new Error(`Invalid predictive evaluation: interval bounds are reversed at ${path}.`);
  return [left, right];
}
function metrics(value: unknown, path: string): EvaluationMetrics {
  const row = object(value, path);
  const parsed: EvaluationMetrics = {};
  for (const key of ["rmse", "mae", "brier", "skill_vs_persistence", "skill_vs_climatology"] as const) {
    if (key in row) parsed[key] = nullable(row[key], `${path}.${key}`);
  }
  for (const key of ["score_difference_vs_persistence_95_block_interval", "score_difference_vs_climatology_95_block_interval"] as const) {
    if (key in row) parsed[key] = interval(row[key], `${path}.${key}`);
  }
  return parsed;
}
function fold(value: unknown, path: string): EvaluationFold {
  const row = object(value, path);
  const nRows = finite(row.n_rows, `${path}.n_rows`);
  const nMonths = finite(row.n_months, `${path}.n_months`);
  if (!Number.isInteger(nRows) || nRows <= 0 || !Number.isInteger(nMonths) || nMonths <= 0) throw new Error(`Invalid predictive evaluation: row/month counts must be positive integers at ${path}.`);
  return { id: string(row.id, `${path}.id`), period: period(row.period, `${path}.period`), n_rows: nRows, n_months: nMonths, metrics: metrics(row.metrics, `${path}.metrics`) };
}
function model(value: unknown, path: string): EvaluationModelResult {
  const row = object(value, path);
  const role = row.role;
  if (role !== "baseline" && role !== "candidate") throw new Error(`Invalid predictive evaluation: unsupported model role at ${path}.role.`);
  if (typeof row.selected_before_holdout !== "boolean") throw new Error(`Invalid predictive evaluation: expected boolean at ${path}.selected_before_holdout.`);
  const wf = object(row.walk_forward, `${path}.walk_forward`);
  if (!Array.isArray(wf.folds) || wf.folds.length === 0) throw new Error(`Invalid predictive evaluation: walk-forward folds are required at ${path}.walk_forward.folds.`);
  const skill = object(row.skill_scores, `${path}.skill_scores`);
  const uncertainty = object(row.uncertainty, `${path}.uncertainty`);
  const comparison = uncertainty.comparison_baseline;
  if (comparison !== null && comparison !== "persistence" && comparison !== "climatology") throw new Error(`Invalid predictive evaluation: unsupported uncertainty baseline at ${path}.uncertainty.comparison_baseline.`);
  return {
    model: string(row.model, `${path}.model`), role, selected_before_holdout: row.selected_before_holdout,
    walk_forward: { folds: wf.folds.map((item, index) => fold(item, `${path}.walk_forward.folds[${index}]`)) },
    holdout: fold(row.holdout, `${path}.holdout`),
    skill_scores: {
      ...(skill.vs_persistence === undefined ? {} : { vs_persistence: nullable(skill.vs_persistence, `${path}.skill_scores.vs_persistence`) }),
      ...(skill.vs_climatology === undefined ? {} : { vs_climatology: nullable(skill.vs_climatology, `${path}.skill_scores.vs_climatology`) }),
    },
    uncertainty: { metric_difference_interval_95: interval(uncertainty.metric_difference_interval_95, `${path}.uncertainty.metric_difference_interval_95`), comparison_baseline: comparison, method: string(uncertainty.method, `${path}.uncertainty.method`) },
  };
}
function series(value: unknown, index: number): PredictiveEvaluationSeries {
  const path = `results[${index}]`;
  const row = object(value, path);
  const scope = row.scope as EvaluationScope;
  const target = row.target as EvaluationTarget;
  const horizon = finite(row.horizon_months, `${path}.horizon_months`);
  const metric = row.primary_metric as ScoreName;
  if (scope !== "regional" && scope !== "spatial") throw new Error(`Invalid predictive evaluation: unsupported scope at ${path}.scope.`);
  if (!["storage", "anomaly", "low_moisture"].includes(target)) throw new Error(`Invalid predictive evaluation: unsupported target at ${path}.target.`);
  if (![1, 2, 3].includes(horizon)) throw new Error(`Invalid predictive evaluation: horizon must be 1, 2, or 3 at ${path}.horizon_months.`);
  if (!["rmse", "mae", "brier"].includes(metric)) throw new Error(`Invalid predictive evaluation: unsupported primary metric at ${path}.primary_metric.`);
  if ((target === "low_moisture") !== (metric === "brier")) throw new Error(`Invalid predictive evaluation: target and primary metric do not match at ${path}.primary_metric.`);
  const targetDefinition = object(row.target_definition, `${path}.target_definition`);
  if (!Array.isArray(row.models) || row.models.length < 2) throw new Error(`Invalid predictive evaluation: model and baseline results are required at ${path}.models.`);
  const models = row.models.map((item, i) => model(item, `${path}.models[${i}]`));
  if (new Set(models.map((item) => item.model)).size !== models.length || !models.some((item) => item.role === "baseline")) throw new Error(`Invalid predictive evaluation: models must be unique and include a baseline at ${path}.models.`);
  const selectedModels = models.filter((item) => item.selected_before_holdout);
  if (selectedModels.length !== 1) throw new Error(`Invalid predictive evaluation: exactly one model (baseline or candidate) must be selected before holdout at ${path}.models.`);
  const selectedModel = row.selected_model === undefined ? selectedModels[0].model : string(row.selected_model, `${path}.selected_model`);
  if (selectedModel !== selectedModels[0].model) throw new Error(`Invalid predictive evaluation: selected_model must match the model marked selected_before_holdout at ${path}.selected_model.`);
  const descriptiveHoldoutModel = row.descriptive_holdout_model === undefined ? undefined : string(row.descriptive_holdout_model, `${path}.descriptive_holdout_model`);
  if (descriptiveHoldoutModel !== undefined && !models.some((item) => item.model === descriptiveHoldoutModel)) throw new Error(`Invalid predictive evaluation: descriptive_holdout_model must identify a listed model at ${path}.descriptive_holdout_model.`);
  return { scope, scope_definition: string(row.scope_definition, `${path}.scope_definition`), horizon_months: horizon as 1 | 2 | 3, target, target_definition: { method: string(targetDefinition.method, `${path}.target_definition.method`), units: string(targetDefinition.units, `${path}.target_definition.units`), ...(targetDefinition.threshold === undefined ? {} : { threshold: string(targetDefinition.threshold, `${path}.target_definition.threshold`) }) }, primary_metric: metric, models, selected_model: selectedModel, ...(descriptiveHoldoutModel === undefined ? {} : { descriptive_holdout_model: descriptiveHoldoutModel }) };
}

export function adaptPredictiveEvaluation(input: unknown): PredictiveEvaluation {
  const root = object(input, "root");
  if (root.schema_version !== "predictive_evaluation_v1") throw new Error("Unsupported predictive evaluation schema. Expected predictive_evaluation_v1.");
  if (root.status !== "retrospective_evaluation") throw new Error("Invalid predictive evaluation: only retrospective_evaluation artifacts are supported.");
  const provenance = object(root.provenance, "provenance");
  const evaluation = object(root.evaluation, "evaluation");
  const sourceCount = finite(provenance.source_file_count, "provenance.source_file_count");
  const resolution = finite(provenance.grid_resolution_degrees, "provenance.grid_resolution_degrees");
  const eligibleCells = finite(provenance.eligible_cell_count, "provenance.eligible_cell_count");
  if (!Number.isInteger(sourceCount) || sourceCount < 1 || !Number.isInteger(eligibleCells) || eligibleCells < 1 || resolution <= 0) throw new Error("Invalid predictive evaluation: source and grid counts/resolution must be positive.");
  const releaseLag = provenance.release_lag_months === null ? null : finite(provenance.release_lag_months, "provenance.release_lag_months");
  const holdoutMonths = finite(evaluation.holdout_month_count, "evaluation.holdout_month_count");
  if (!Number.isInteger(holdoutMonths) || holdoutMonths < 1) throw new Error("Invalid predictive evaluation: holdout_month_count must be a positive integer.");
  if (typeof provenance.input_panel_sha256 !== "string" || !/^[\da-f]{64}$/i.test(provenance.input_panel_sha256) || typeof provenance.source_manifest_sha256 !== "string" || !/^[\da-f]{64}$/i.test(provenance.source_manifest_sha256)) throw new Error("Invalid predictive evaluation: provenance SHA-256 fields are required.");
  if (typeof evaluation.limitations !== "object" || !Array.isArray(evaluation.limitations) || !evaluation.limitations.every((item) => typeof item === "string")) throw new Error("Invalid predictive evaluation: limitations must be a string array.");
  if (!Array.isArray(root.results) || root.results.length === 0) throw new Error("Invalid predictive evaluation: results are empty.");
  const results = root.results.map(series);
  if (new Set(results.map((item) => `${item.scope}|${item.horizon_months}|${item.target}`)).size !== results.length) throw new Error("Invalid predictive evaluation: duplicate scope/horizon/target result.");
  const scopes = new Set(results.map((item) => item.scope));
  if (!scopes.has("regional") || !scopes.has("spatial")) throw new Error("Invalid predictive evaluation: regional and spatial evaluations are both required.");
  return {
    schema_version: "predictive_evaluation_v1", status: "retrospective_evaluation",
    provenance: {
      source_product: string(provenance.source_product, "provenance.source_product"), source_version: string(provenance.source_version, "provenance.source_version"), source_doi: string(provenance.source_doi, "provenance.source_doi"), input_panel_sha256: provenance.input_panel_sha256, source_manifest_sha256: provenance.source_manifest_sha256, source_file_count: sourceCount, availability_policy: string(provenance.availability_policy, "provenance.availability_policy"), release_lag_months: releaseLag, geography: string(provenance.geography, "provenance.geography"), grid_resolution_degrees: resolution, eligible_cell_count: eligibleCells, evaluation_period: period(provenance.evaluation_period, "provenance.evaluation_period"),
    },
    evaluation: { method: string(evaluation.method, "evaluation.method"), selection_method: string(evaluation.selection_method, "evaluation.selection_method"), issue_time_rule: string(evaluation.issue_time_rule, "evaluation.issue_time_rule"), release_rule: string(evaluation.release_rule, "evaluation.release_rule"), holdout_period: period(evaluation.holdout_period, "evaluation.holdout_period"), holdout_month_count: holdoutMonths, spatial_fold_rule: string(evaluation.spatial_fold_rule, "evaluation.spatial_fold_rule"), limitations: evaluation.limitations }, results,
  };
}

export async function loadPredictiveEvaluation(path = `${import.meta.env.BASE_URL}data/predictive_evaluation_v1.json`): Promise<PredictiveEvaluation> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "No predictive_evaluation_v1.json is available. The dashboard has no model scores to display." : `Could not load predictive evaluation (HTTP ${response.status}).`);
  return adaptPredictiveEvaluation(await response.json() as unknown);
}
