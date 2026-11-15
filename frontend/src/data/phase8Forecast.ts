import { adaptForecastArtifact } from "./forecast";
import type { CoordinatePoint } from "./location";
import type { Phase8Cell, Phase8ForecastBundle, Phase8Metric, Phase8RegionalForecast, Phase8SpatialForecast } from "../types/phase8";

export type Phase8BundleLoad = { status: "loading" } | { status: "ready"; bundle: Phase8ForecastBundle } | { status: "missing"; message: string } | { status: "error"; message: string };
export type Phase8CellMatch = { status: "matched"; cell: Phase8Cell; distanceKm: number } | { status: "masked"; cell: Phase8Cell } | { status: "outside" };
const obj = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const sha256 = (value: unknown): value is string => typeof value === "string" && /^[\da-f]{64}$/i.test(value);
const month = (value: unknown): value is string => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const instant = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value));
const targetMonths = ["2026-12", "2027-01", "2027-02"] as const;
const targetStarts = ["2026-12-01", "2027-01-01", "2027-02-01"] as const;
const targetEnds = ["2027-01-01", "2027-02-01", "2027-03-01"] as const;
function record(value: unknown, path: string): Record<string, unknown> {
  if (!obj(value)) throw new Error(`${path} must be an object.`);
  return value;
}
function number(value: unknown, path: string, min?: number, max?: number): number {
  if (!finite(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) throw new Error(`${path} must be a finite number within its supported bounds.`);
  return value;
}
function validateMetrics(value: unknown, path: string): Record<string, Phase8Metric> {
  const metrics = record(value, path);
  for (const [key, metric] of Object.entries(metrics)) {
    if (metric !== null && !finite(metric) && !(Array.isArray(metric) && metric.every(finite))) throw new Error(`${path}.${key} must contain finite numeric metrics.`);
  }
  return metrics as Record<string, Phase8Metric>;
}
function validateCell(value: unknown, index: number): Phase8Cell {
  const path = `spatial_forecasts.forecasts[].cells[${index}]`;
  const row = record(value, path);
  const latitude = number(row.latitude, `${path}.latitude`, -38, -30);
  const longitude = number(row.longitude, `${path}.longitude`, -64, -57);
  const area = number(row.area_m2, `${path}.area_m2`, Number.MIN_VALUE);
  if (!nonempty(row.cell_id) || typeof row.valid !== "boolean") throw new Error(`${path} requires cell_id and valid.`);
  if (row.valid) {
    const valueMm = number(row.value, `${path}.value`, 0, 1000);
    if (row.units !== "mm" || !obj(row.predictive_interval) || row.climatological_reference_mm === null || row.anomaly_mm === null) throw new Error(`${path} valid cells require mm values, uncertainty, climatology, and anomaly.`);
    const interval = row.predictive_interval;
    if (interval.level !== 0.9 || !finite(interval.lower) || !finite(interval.upper) || interval.lower < 0 || interval.upper > 1000 || interval.lower > valueMm || interval.upper < valueMm || interval.lower > interval.upper || !nonempty(interval.method)) throw new Error(`${path}.predictive_interval is invalid.`);
    const climatology = number(row.climatological_reference_mm, `${path}.climatological_reference_mm`, 0, 1000);
    const anomaly = number(row.anomaly_mm, `${path}.anomaly_mm`);
    return { cell_id: row.cell_id, latitude, longitude, area_m2: area, valid: true, value: valueMm, units: "mm", predictive_interval: { level: 0.9, lower: interval.lower, upper: interval.upper, method: interval.method }, climatological_reference_mm: climatology, anomaly_mm: anomaly };
  }
  if (row.value !== null || row.units !== null || row.predictive_interval !== null || row.climatological_reference_mm !== null || row.anomaly_mm !== null) throw new Error(`${path} masked cells must keep all scientific values null.`);
  return { cell_id: row.cell_id, latitude, longitude, area_m2: area, valid: false, value: null, units: null, predictive_interval: null, climatological_reference_mm: null, anomaly_mm: null };
}
function validateSpatial(value: unknown, index: number): Phase8SpatialForecast {
  const path = `spatial_forecasts.forecasts[${index}]`;
  const row = record(value, path);
  const horizon = index + 1;
  if (row.horizon_months !== horizon || row.target_month !== targetMonths[index] || row.target !== "storage" || row.units !== "mm" || row.model !== "seasonal_climatology" || row.latest_available_observation_month !== "2026-07") throw new Error(`${path} does not match the expected Phase 8 horizon, target, units, model, or observation period.`);
  if (!nonempty(row.forecast_method)) throw new Error(`${path}.forecast_method is required.`);
  const calibration = record(row.calibration, `${path}.calibration`);
  if (!month(calibration.start) || !month(calibration.end) || !Number.isInteger(calibration.n_months) || (calibration.n_months as number) < 1 || calibration.nominal_level !== 0.9 || calibration.per_cell_guarantee !== false || !Array.isArray(calibration.interval_physical_bounds_mm) || calibration.interval_physical_bounds_mm[0] !== 0 || calibration.interval_physical_bounds_mm[1] !== 1000) throw new Error(`${path}.calibration is invalid.`);
  number(calibration.weighted_abs_residual_radius_mm, `${path}.calibration.weighted_abs_residual_radius_mm`, 0);
  const holdout = record(row.holdout, `${path}.holdout`);
  if (!Array.isArray(holdout.period) || holdout.period.length !== 2 || !month(holdout.period[0]) || !month(holdout.period[1]) || !nonempty(holdout.validation_source) || !sha256(holdout.historical_hindcast_reference_sha256)) throw new Error(`${path}.holdout is invalid.`);
  const metrics = validateMetrics(holdout.metrics, `${path}.holdout.metrics`);
  if (!Array.isArray(row.cells) || row.cells.length !== 896) throw new Error(`${path}.cells must contain all 896 grid records.`);
  const cells = row.cells.map(validateCell);
  if (new Set(cells.map((cell) => cell.cell_id)).size !== 896) throw new Error(`${path}.cells contains duplicate cell IDs.`);
  if (new Set(cells.map((cell) => `${cell.latitude.toFixed(6)},${cell.longitude.toFixed(6)}`)).size !== 896 || cells.some((cell) => Math.abs((cell.latitude + 0.125) / 0.25 - Math.round((cell.latitude + 0.125) / 0.25)) > 1e-6 || Math.abs((cell.longitude + 0.125) / 0.25 - Math.round((cell.longitude + 0.125) / 0.25)) > 1e-6)) throw new Error(`${path}.cells must have unique centers on the documented 0.25-degree GLDAS grid.`);
  if (cells.some((cell) => cell.cell_id !== `${cell.latitude.toFixed(4)},${cell.longitude.toFixed(4)}`)) throw new Error(`${path}.cells IDs must agree with their GLDAS coordinate centers.`);
  const validCount = cells.filter((cell) => cell.valid).length;
  if (validCount !== 867) throw new Error(`${path}.cells must retain the validated 867-cell support mask.`);
  return {
    horizon_months: horizon as 1 | 2 | 3, target_month: targetMonths[index], target: "storage", units: "mm", model: "seasonal_climatology", forecast_method: row.forecast_method,
    latest_available_observation_month: "2026-07", calibration: { start: calibration.start, end: calibration.end, n_months: calibration.n_months as number, weighted_abs_residual_radius_mm: calibration.weighted_abs_residual_radius_mm as number, nominal_level: 0.9, interval_physical_bounds_mm: [0, 1000], per_cell_guarantee: false },
    holdout: { period: holdout.period as [string, string], metrics, validation_source: holdout.validation_source, historical_hindcast_reference_sha256: holdout.historical_hindcast_reference_sha256 },
    regional_spatial_weighted_mean_mm: number(row.regional_spatial_weighted_mean_mm, `${path}.regional_spatial_weighted_mean_mm`, 0, 1000), cells,
  };
}

/** Validates the complete Phase 8 bundle contract before returning any forecast values. */
export function adaptPhase8ForecastBundle(input: unknown): Phase8ForecastBundle {
  const row = record(input, "bundle");
  if (row.schema_version !== "phase8_forecast_bundle_v1" || row.status !== "experimental" || row.operationally_eligible !== false) throw new Error("Only a non-operational phase8_forecast_bundle_v1 experimental artifact is supported.");
  if (!nonempty(row.classification) || !instant(row.issue_time) || !instant(row.input_observation_cutoff) || !row.issue_time.startsWith("2026-11-15T") || row.input_observation_cutoff !== "2026-08-01T00:00:00Z" || Date.parse(row.input_observation_cutoff) > Date.parse(row.issue_time)) throw new Error("Phase 8 issue classification, UTC issue time, or latest-observation cutoff are invalid.");
  const source = record(row.source_dataset, "source_dataset");
  const hashKeys = ["historical_panel_sha256", "extended_spatial_panel_sha256", "extended_regional_panel_sha256", "extension_manifest_sha256", "phase5b_evaluation_sha256"] as const;
  if (source.product !== "GLDAS Noah v2.1 monthly" || source.collection !== "C1342986036-GES_DISC" || source.doi !== "10.5067/SXAVCZFAQLNO" || hashKeys.some((key) => !sha256(source[key]))) throw new Error("Expected the documented NASA GLDAS Noah v2.1 product, collection, DOI, and all five provenance SHA-256 digests.");
  if (source.historical_first_month !== "2006-01" || source.historical_last_month !== "2025-12" || source.extension_first_month !== "2026-01" || source.extension_last_month !== "2026-07" || source.spatial_grid_degrees !== 0.25) throw new Error("The source coverage, period, or grid resolution differs from the documented Phase 8 dataset.");
  const model = record(row.model, "model");
  if (model.name !== "seasonal_climatology" || !nonempty(model.version) || !nonempty(model.selection_evidence)) throw new Error("Phase 8 must identify the pre-holdout seasonal-climatology selection.");
  const target = record(row.target, "target");
  if (target.name !== "GLDAS Noah 0–100 cm soil-water storage" || target.variable !== "soil_water_mm" || target.units !== "mm" || !nonempty(target.definition) || !target.definition.startsWith("sum of SoilMoi0_10cm_inst + SoilMoi10_40cm_inst + SoilMoi40_100cm_inst") || !target.definition.includes("not RootMoist_inst")) throw new Error("Phase 8 target must sum the documented GLDAS 0–100 cm storage layers in millimeters.");
  if (row.latest_available_observation_month !== "2026-07") throw new Error("Expected the latest verified input month to be July 2026.");
  const availability = record(row.availability, "availability");
  if (!nonempty(availability.policy) || !instant(availability.local_verified_at) || Date.parse(availability.local_verified_at) > Date.parse(row.issue_time) || availability.provider_first_publication_time_verified !== false || availability.near_real_time !== false || !Number.isInteger(availability.latency_days) || (availability.latency_days as number) < 0) throw new Error("Availability must retain local verification before issue time, latency, and unverified-publication flags.");
  const temporal = record(row.temporal_convention, "temporal_convention");
  if (temporal.issue_month !== "2026-11" || !nonempty(temporal.horizon_semantics) || JSON.stringify(temporal.target_months) !== JSON.stringify(targetMonths)) throw new Error("Phase 8 target months must be December 2026 through February 2027.");
  if (!Array.isArray(row.regional_forecasts) || row.regional_forecasts.length !== 3) throw new Error("Exactly three regional forecast horizons are required.");
  const regional: Phase8RegionalForecast[] = row.regional_forecasts.map((item, index) => {
    const adapted = adaptForecastArtifact(item);
    const raw = record(item, `regional_forecasts[${index}]`);
    const h = index + 1;
    if (adapted.status !== "experimental" || adapted.issue_time !== row.issue_time || adapted.input_observation_cutoff !== row.input_observation_cutoff || adapted.target !== "storage" || adapted.units !== "mm" || adapted.horizon_months !== h || adapted.target_month !== targetMonths[index] || adapted.model.name !== "seasonal_climatology" || adapted.model.version !== model.version || adapted.availability.operationally_eligible !== false || !adapted.predictive_interval || adapted.predictive_interval.level !== 0.9 || adapted.predictive_interval.lower < 0 || adapted.predictive_interval.upper > 1000) throw new Error(`regional_forecasts[${index}] is not a matching bounded experimental storage outlook.`);
    number(adapted.value, `regional_forecasts[${index}].value`, 0, 1000);
    const period = record(raw.target_period, `regional_forecasts[${index}].target_period`);
    const regionalModel = record(raw.model, `regional_forecasts[${index}].model`);
    const training = record(raw.training, `regional_forecasts[${index}].training`);
    const outOfSample = record(raw.out_of_sample, `regional_forecasts[${index}].out_of_sample`);
    const forecastSource = record(raw.source, `regional_forecasts[${index}].source`);
    const forecastAvailability = record(raw.availability, `regional_forecasts[${index}].availability`);
    const expectedInputMonths = Array.from({ length: 12 }, (_, monthIndex) => {
      const date = new Date(Date.UTC(2025, 7 + monthIndex, 1));
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    });
    const inputMonths = Array.isArray(forecastAvailability.input_months) ? forecastAvailability.input_months : [];
    const inputMonthsValid = inputMonths.length === expectedInputMonths.length && inputMonths.every((inputMonth, monthIndex) => {
      if (!obj(inputMonth)) return false;
      const observedEnd = Date.parse(String(inputMonth.observation_end));
      const availableAt = Date.parse(String(inputMonth.available_at));
      const expectedAssumption = monthIndex < 5;
      return inputMonth.month === expectedInputMonths[monthIndex] && inputMonth.availability_is_assumed === expectedAssumption && inputMonth.provider_publication_at === null && Number.isFinite(observedEnd) && observedEnd <= Date.parse(row.input_observation_cutoff as string) && Number.isFinite(availableAt) && availableAt <= Date.parse(row.issue_time as string) && sha256(inputMonth.soil_sha256) && sha256(inputMonth.driver_sha256) && (monthIndex < 5 ? inputMonth.local_file_verified_at == null : instant(inputMonth.local_file_verified_at) && Date.parse(inputMonth.local_file_verified_at) <= Date.parse(row.issue_time as string));
    });
    if (!nonempty(period.start) || !nonempty(period.end_exclusive) || period.start !== targetStarts[index] || period.end_exclusive !== targetEnds[index] || raw.latest_available_observation_month !== "2026-07" || !finite(raw.climatological_reference_mm) || raw.climatological_reference_mm !== adapted.value || raw.anomaly_mm !== 0 || regionalModel.selected_before_holdout !== true || !sha256(regionalModel.selection_source_sha256) || !nonempty(regionalModel.selection_evidence) || !month(training.first_target) || !month(training.last_target) || !instant(training.label_cutoff) || !Array.isArray(outOfSample.period) || outOfSample.period.length !== 2 || outOfSample.period[0] !== "2024-01" || outOfSample.period[1] !== "2025-12" || !nonempty(outOfSample.evaluation_source) || !inputMonthsValid || forecastAvailability.source_publication_time_verified !== false || forecastAvailability.publication_evidence !== null || forecastSource.collection !== source.collection || forecastSource.doi !== source.doi || forecastSource.input_panel_sha256 !== source.extended_regional_panel_sha256 || forecastSource.spatial_panel_sha256 !== source.extended_spatial_panel_sha256 || forecastSource.evaluation_sha256 !== source.phase5b_evaluation_sha256 || forecastSource.extension_manifest_sha256 !== source.extension_manifest_sha256 || !sha256(forecastSource.historical_hindcast_reference_sha256)) throw new Error(`regional_forecasts[${index}] contains invalid period, baseline, pre-holdout selection, source provenance, availability vintages, or retrospective evaluation metadata.`);
    const metrics = validateMetrics(outOfSample.metrics, `regional_forecasts[${index}].out_of_sample.metrics`);
    return { ...adapted, status: "experimental", target: "storage", horizon_months: h as 1 | 2 | 3, target_period: { start: period.start, end_exclusive: period.end_exclusive }, latest_available_observation_month: "2026-07", climatological_reference_mm: raw.climatological_reference_mm, anomaly_mm: 0, training: { first_target: training.first_target, last_target: training.last_target, label_cutoff: training.label_cutoff }, out_of_sample: { period: outOfSample.period as [string, string], metrics, evaluation_source: outOfSample.evaluation_source } };
  });
  const spatialRoot = record(row.spatial_forecasts, "spatial_forecasts");
  if (spatialRoot.grid_cells !== 896 || spatialRoot.eligible_cells !== 867 || spatialRoot.masked_cells !== 29 || spatialRoot.spatial_resolution_degrees !== 0.25 || !nonempty(spatialRoot.uncertainty_note) || !Array.isArray(spatialRoot.forecasts) || spatialRoot.forecasts.length !== 3) throw new Error("Spatial grid support must be 896 cells: 867 eligible and 29 masked at 0.25 degrees.");
  const spatial = spatialRoot.forecasts.map(validateSpatial);
  for (let i = 0; i < 3; i++) {
    if (Math.abs(spatial[i].regional_spatial_weighted_mean_mm - regional[i].value) > 1e-6) throw new Error(`Regional and spatial estimates disagree at horizon ${i + 1}.`);
    if (spatial[i].cells.some((cell, cellIndex) => cell.cell_id !== spatial[0].cells[cellIndex].cell_id || cell.valid !== spatial[0].cells[cellIndex].valid || cell.latitude !== spatial[0].cells[cellIndex].latitude || cell.longitude !== spatial[0].cells[cellIndex].longitude)) throw new Error("Grid identity and missing-data mask must be consistent across horizons.");
  }
  const validation = record(row.validation, "validation");
  const chronologicalHoldout = record(validation.chronological_holdout, "validation.chronological_holdout");
  const trainingCutoffs = record(validation.training_target_cutoffs_by_horizon, "validation.training_target_cutoffs_by_horizon");
  const calibrationCutoffs = record(validation.calibration_cutoffs_by_horizon, "validation.calibration_cutoffs_by_horizon");
  const regionalSpatialConsistency = obj(validation.regional_spatial_consistency) ? validation.regional_spatial_consistency : nonempty(validation.regional_spatial_consistency) ? validation.regional_spatial_consistency : null;
  const validCutoffMaps = [trainingCutoffs, calibrationCutoffs].every((cutoffs) => ["1", "2", "3"].every((horizon) => instant(cutoffs[horizon])));
  const orderedCutoffs = validCutoffMaps && ["1", "2", "3"].every((horizon) => Date.parse(trainingCutoffs[horizon] as string) < Date.parse(calibrationCutoffs[horizon] as string) && Date.parse(calibrationCutoffs[horizon] as string) < Date.parse("2024-01-01T00:00:00Z"));
  if (!nonempty(validation.status) || chronologicalHoldout.start !== "2024-01" || chronologicalHoldout.end !== "2025-12" || chronologicalHoldout.reserved_for_selection !== false || chronologicalHoldout.is_retrospective !== true || !validCutoffMaps || !orderedCutoffs || validation.no_future_target_data_used !== true || regionalSpatialConsistency === null) throw new Error("Chronological holdout, pre-holdout cutoff order, no-selection, and no-future-target evidence are required.");
  if (!Array.isArray(row.limitations) || !row.limitations.length || !row.limitations.every(nonempty)) throw new Error("The bundle must include its scientific limitations.");
  return {
    schema_version: "phase8_forecast_bundle_v1", status: "experimental", classification: row.classification, operationally_eligible: false, issue_time: row.issue_time,
    source_dataset: { product: source.product, collection: source.collection, doi: source.doi, historical_first_month: "2006-01", historical_last_month: "2025-12", extension_first_month: "2026-01", extension_last_month: "2026-07", spatial_grid_degrees: 0.25, historical_panel_sha256: source.historical_panel_sha256 as string, extended_spatial_panel_sha256: source.extended_spatial_panel_sha256 as string, extended_regional_panel_sha256: source.extended_regional_panel_sha256 as string, extension_manifest_sha256: source.extension_manifest_sha256 as string, phase5b_evaluation_sha256: source.phase5b_evaluation_sha256 as string },
    model: { name: "seasonal_climatology", version: model.version, selection_evidence: model.selection_evidence }, target: { name: target.name, variable: "soil_water_mm", units: "mm", definition: target.definition }, latest_available_observation_month: "2026-07", input_observation_cutoff: row.input_observation_cutoff,
    availability: { policy: availability.policy, local_verified_at: availability.local_verified_at, provider_first_publication_time_verified: false, latency_days: availability.latency_days as number, near_real_time: false }, temporal_convention: { issue_month: "2026-11", horizon_semantics: temporal.horizon_semantics, target_months: targetMonths }, regional_forecasts: regional,
    spatial_forecasts: { grid_cells: 896, eligible_cells: 867, masked_cells: 29, spatial_resolution_degrees: 0.25, uncertainty_note: spatialRoot.uncertainty_note, forecasts: spatial },
    validation: { status: validation.status, chronological_holdout: chronologicalHoldout, training_target_cutoffs_by_horizon: trainingCutoffs, calibration_cutoffs_by_horizon: calibrationCutoffs, no_future_target_data_used: true, regional_spatial_consistency: regionalSpatialConsistency }, limitations: row.limitations,
  };
}

export function phase8ForecastForHorizon(bundle: Phase8ForecastBundle, horizon: 1 | 2 | 3) {
  return { regional: bundle.regional_forecasts[horizon - 1], spatial: bundle.spatial_forecasts.forecasts[horizon - 1] };
}

/** Nearest center only; a masked nearest cell stays unavailable and is never replaced/interpolated. */
export function matchPhase8Cell(point: CoordinatePoint | null, forecast: Phase8SpatialForecast, resolution = 0.25): Phase8CellMatch {
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) return { status: "outside" };
  const toRadians = (deg: number) => deg * Math.PI / 180;
  const distance = (cell: Phase8Cell) => {
    const lat1 = toRadians(point.latitude); const lat2 = toRadians(cell.latitude);
    const dLat = lat2 - lat1; const dLon = toRadians(cell.longitude - point.longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  let nearest = forecast.cells[0];
  let distanceKm = distance(nearest);
  for (const cell of forecast.cells.slice(1)) { const candidate = distance(cell); if (candidate < distanceKm) { nearest = cell; distanceKm = candidate; } }
  const maxCellCenterDistanceKm = (resolution / 2) * 111.32 * Math.sqrt(1 + Math.cos(toRadians(point.latitude)) ** 2);
  if (distanceKm > maxCellCenterDistanceKm + 0.01) return { status: "outside" };
  return nearest.valid ? { status: "matched", cell: nearest, distanceKm } : { status: "masked", cell: nearest };
}

export async function loadPhase8ForecastBundle(path = `${import.meta.env.BASE_URL}data/phase8_forecast_bundle_v1.json`): Promise<Phase8BundleLoad> {
  try {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (response.status === 404) return { status: "missing", message: "phase8_forecast_bundle_v1.json is not installed. Experimental outlook values are unavailable." };
    if (!response.ok) return { status: "error", message: `Could not load Phase 8 bundle (HTTP ${response.status}).` };
    return { status: "ready", bundle: adaptPhase8ForecastBundle(await response.json() as unknown) };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Could not read the Phase 8 bundle." }; }
}
