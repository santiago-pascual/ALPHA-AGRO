import type { DashboardDataset } from "../types";
import { coordinateError, findEligibleCell, type CoordinatePoint } from "./location";
import type { PredictiveEvaluation } from "../types/predictive";
import type { ForecastArtifact, ForecastTarget } from "../types/forecast";

export type ForecastIssueRequest = {
  latitude: number; longitude: number; grid_cell_id: string;
  horizon_months: 1 | 2 | 3; target: ForecastTarget; scope: "spatial";
  issue: { mode: "latest_verified_eligible" } | { mode: "date"; value: string };
  model_id: string; artifact_version: "forecast_v1";
};
export type ForecastResolution = { status: "available"; artifact: ForecastArtifact } | { status: "unavailable"; reason: string };
export type ForecastLoad = { status: "loading" } | { status: "ready"; artifact: ForecastArtifact } | { status: "missing"; message: string } | { status: "error"; message: string };

const targets: ForecastTarget[] = ["storage", "anomaly", "low_moisture"];
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const instant = (v: unknown): v is string => {
  if (!text(v) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v)) return false;
  const parsed = new Date(v);
  // JavaScript Date retains milliseconds, while scientific artifacts may carry
  // microsecond or nanosecond UTC timestamps. Validate the calendar second
  // without rejecting valid sub-millisecond precision.
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === v.slice(0, 19);
};

export function gridCellId(point: CoordinatePoint, resolution: number): string {
  void resolution; // Kept in the signature so IDs remain explicitly tied to the validated grid contract.
  return `gldas-noah-v2.1:${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`;
}

export function selectedPreHoldoutModel(evaluation: PredictiveEvaluation | null, horizon: 1 | 2 | 3, target: ForecastTarget): string | null {
  const series = evaluation?.results.find((row) => row.scope === "spatial" && row.horizon_months === horizon && row.target === target);
  return series?.selected_model ?? null;
}

export function buildForecastRequest(input: {
  location: CoordinatePoint | null; dataset: DashboardDataset | null; evaluation: PredictiveEvaluation | null;
  horizon: 1 | 2 | 3; target: ForecastTarget; issue: ForecastIssueRequest["issue"];
}): ForecastIssueRequest {
  const { location, dataset, evaluation, horizon, target, issue } = input;
  if (!location) throw new Error("Select a field location first.");
  const coordinateIssue = coordinateError(location);
  if (coordinateIssue) throw new Error(coordinateIssue);
  if (!dataset) throw new Error("Validated trend coverage is required to identify an eligible GLDAS cell.");
  const cell = findEligibleCell(location, dataset.cells, dataset.resolutionDegrees);
  if (!cell) throw new Error("The selected point is outside the validated eligible-cell mask.");
  const model = selectedPreHoldoutModel(evaluation, horizon, target);
  if (!model) throw new Error("No matching spatial, pre-holdout model selection is available.");
  if (issue.mode === "date" && !instant(issue.value)) throw new Error("Choose a valid explicit UTC issue timestamp.");
  return { latitude: location.latitude, longitude: location.longitude, grid_cell_id: gridCellId(cell, dataset.resolutionDegrees), horizon_months: horizon, target, scope: "spatial", issue, model_id: model, artifact_version: "forecast_v1" };
}

export function adaptForecastArtifact(input: unknown): ForecastArtifact {
  if (!object(input) || input.schema_version !== "forecast_v1") throw new Error("Expected forecast_v1 object.");
  const row = input;
  if (!(["retrospective_simulation", "experimental", "operationally_eligible"] as unknown[]).includes(row.status)) throw new Error("Unsupported forecast status.");
  if (!instant(row.issue_time) || !instant(row.input_observation_cutoff)) throw new Error("Issue time and observation cutoff must be valid UTC timestamps.");
  if (!text(row.target_month) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.target_month)) throw new Error("Target month must use YYYY-MM.");
  if (![1, 2, 3].includes(Number(row.horizon_months)) || !targets.includes(row.target as ForecastTarget)) throw new Error("Unsupported horizon or target.");
  if (!object(row.scope) || !text(row.scope.id) || !Array.isArray(row.scope.bounds_west_south_east_north) || row.scope.bounds_west_south_east_north.length !== 4 || !row.scope.bounds_west_south_east_north.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("Invalid forecast scope.");
  const [west, south, east, north] = row.scope.bounds_west_south_east_north as number[];
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) throw new Error("Forecast geographic bounds are invalid.");
  if (!object(row.model) || !text(row.model.name) || !text(row.model.version)) throw new Error("Invalid model identity.");
  if (!object(row.availability) || typeof row.availability.operationally_eligible !== "boolean" || !text(row.availability.policy) || !Array.isArray(row.availability.input_months) || !row.availability.input_months.length) throw new Error("Invalid availability record.");
  const inputMonths = row.availability.input_months.map((inputMonth, index) => {
    if (!object(inputMonth) || !text(inputMonth.month) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(inputMonth.month) || !instant(inputMonth.observation_end) || !instant(inputMonth.available_at) || typeof inputMonth.availability_is_assumed !== "boolean" || (inputMonth.provider_publication_at !== null && !instant(inputMonth.provider_publication_at)) || !/^[\da-f]{64}$/i.test(String(inputMonth.soil_sha256 ?? "")) || !/^[\da-f]{64}$/i.test(String(inputMonth.driver_sha256 ?? ""))) throw new Error(`Invalid input availability vintage at index ${index}.`);
    return { month: inputMonth.month, observation_end: inputMonth.observation_end, provider_publication_at: inputMonth.provider_publication_at, available_at: inputMonth.available_at, availability_is_assumed: inputMonth.availability_is_assumed, soil_sha256: inputMonth.soil_sha256 as string, driver_sha256: inputMonth.driver_sha256 as string };
  });
  if (!object(row.calibration) || !text(row.calibration.start) || !text(row.calibration.end) || !Number.isInteger(row.calibration.n_months) || !instant(row.calibration.labels_available_by) || !object(row.calibration.metrics)) throw new Error("Invalid calibration record.");
  if (!object(row.source) || !text(row.source.collection) || !text(row.source.doi) || !/^[\da-f]{64}$/i.test(String(row.source.input_panel_sha256))) throw new Error("Invalid source provenance.");
  if (!Array.isArray(row.quality_flags) || !row.quality_flags.every(text)) throw new Error("Invalid quality flags.");
  if (typeof row.value !== "number" || !Number.isFinite(row.value)) throw new Error("Forecast value must be finite.");
  const isProbability = row.target === "low_moisture";
  if ((isProbability && (row.units !== "probability" || row.value < 0 || row.value > 1 || row.predictive_interval !== null)) || (!isProbability && row.units !== "mm")) throw new Error("Forecast value or units do not match target.");
  let predictiveInterval: ForecastArtifact["predictive_interval"] = null;
  if (!isProbability) {
    const pi = row.predictive_interval;
    if (!object(pi) || typeof pi.level !== "number" || pi.level <= 0 || pi.level >= 1 || typeof pi.lower !== "number" || !Number.isFinite(pi.lower) || typeof pi.upper !== "number" || !Number.isFinite(pi.upper) || pi.lower > pi.upper || !text(pi.method)) throw new Error("A valid predictive interval is required for continuous targets.");
    predictiveInterval = { level: pi.level, lower: pi.lower, upper: pi.upper, method: pi.method };
  }
  return { schema_version: "forecast_v1", status: row.status as ForecastArtifact["status"], issue_time: row.issue_time, target_month: row.target_month, horizon_months: Number(row.horizon_months) as 1 | 2 | 3, scope: { id: row.scope.id, bounds_west_south_east_north: row.scope.bounds_west_south_east_north as [number, number, number, number] }, target: row.target as ForecastTarget, model: { name: row.model.name, version: row.model.version }, input_observation_cutoff: row.input_observation_cutoff, availability: { policy: row.availability.policy, publication_evidence: object(row.availability.publication_evidence) ? row.availability.publication_evidence : null, operationally_eligible: row.availability.operationally_eligible, input_months: inputMonths }, value: row.value, units: row.units as "mm" | "probability", predictive_interval: predictiveInterval, calibration: row.calibration as ForecastArtifact["calibration"], quality_flags: row.quality_flags as string[], source: row.source as ForecastArtifact["source"] };
}

export function resolveForecast(request: ForecastIssueRequest, artifact: ForecastArtifact, now = new Date()): ForecastResolution {
  const bounds = artifact.scope.bounds_west_south_east_north;
  if (artifact.status !== "operationally_eligible" || !artifact.availability.operationally_eligible || !object(artifact.availability.publication_evidence)) return { status: "unavailable", reason: "Artifact is retrospective or experimental, or lacks verified operational publication evidence." };
  if (artifact.scope.id !== request.grid_cell_id || request.longitude < bounds[0] || request.latitude < bounds[1] || request.longitude > bounds[2] || request.latitude > bounds[3]) return { status: "unavailable", reason: "Forecast geographic support does not match the selected eligible grid cell." };
  if (artifact.horizon_months !== request.horizon_months || artifact.target !== request.target) return { status: "unavailable", reason: "Artifact horizon or target does not match the selected request." };
  if (artifact.model.name !== request.model_id) return { status: "unavailable", reason: "Artifact model does not match the model selected before holdout." };
  if (request.issue.mode === "date" && artifact.issue_time !== request.issue.value) return { status: "unavailable", reason: "Artifact issue time does not match the requested UTC issue time." };
  const issue = Date.parse(artifact.issue_time);
  if (issue > now.getTime() || Date.parse(artifact.input_observation_cutoff) > issue || Date.parse(artifact.calibration.labels_available_by) > issue) return { status: "unavailable", reason: "Issue time, observation cutoff, or calibration labels are temporally inconsistent." };
  const issueDate = new Date(issue);
  const month = new Date(Date.UTC(issueDate.getUTCFullYear(), issueDate.getUTCMonth() + request.horizon_months, 1)).toISOString().slice(0, 7);
  if (artifact.target_month !== month) return { status: "unavailable", reason: "Target month does not match issue month and selected horizon." };
  const evidence = artifact.availability.publication_evidence;
  if (!instant(evidence.first_verified_access_at) || Date.parse(evidence.first_verified_access_at) > issue || !text(evidence.asset_id) || !/^[\da-f]{64}$/i.test(String(evidence.sha256 ?? ""))) return { status: "unavailable", reason: "Publication evidence must include an asset identifier, verified access timestamp no later than issue time, and SHA-256." };
  if (artifact.availability.input_months.some((row) => row.availability_is_assumed || !row.provider_publication_at || Date.parse(row.provider_publication_at) > issue || Date.parse(row.available_at) > issue || Date.parse(row.observation_end) > Date.parse(artifact.input_observation_cutoff))) return { status: "unavailable", reason: "Every input month must have verified provider publication and usable availability by issue time, with observations no later than the declared cutoff." };
  return { status: "available", artifact };
}

export async function loadForecastArtifact(path = `${import.meta.env.BASE_URL}data/forecast_v1.json`): Promise<ForecastLoad> {
  try {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (response.status === 404) return { status: "missing", message: "forecast_v1.json is not installed. No predictions are available." };
    if (!response.ok) return { status: "error", message: `Could not load forecast artifact (HTTP ${response.status}).` };
    return { status: "ready", artifact: adaptForecastArtifact(await response.json() as unknown) };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Could not read forecast artifact." }; }
}
