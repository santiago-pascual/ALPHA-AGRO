import type { Phase8ForecastBundle } from "../types/phase8";
import type { Phase9Cell, Phase9ForecastContext, Phase9Interpretation, Phase9Load, Phase9MonthlyReference, Phase9ObservedContext } from "../types/phase9";

const obj = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const digest = (value: unknown): value is string => typeof value === "string" && /^[\da-f]{64}$/i.test(value);
const key = (cellId: string, month: string | number) => `${cellId}|${month}`;
const months = ["2026-12", "2027-01", "2027-02"] as const;
const expectedColumns = {
  cells: ["cell_id", "latitude", "longitude", "soil_water_valid"],
  monthly_reference_statistics: ["cell_id", "calendar_month", "n_years", "mean_mm", "sd_mm", "p10_mm", "p20_mm", "p50_mm", "p80_mm", "p90_mm", "low_moisture_count", "low_moisture_frequency"],
  latest_observed_context: ["cell_id", "observation_month", "value_mm", "reference_calendar_month", "reference_n_years", "reference_mean_mm", "anomaly_mm", "empirical_percentile", "condition_code"],
  forecast_context: ["cell_id", "target_month", "horizon_months", "status", "forecast_mm", "units", "reference_mean_mm", "reference_p20_mm", "reference_p50_mm", "reference_p80_mm", "forecast_central_anomaly_mm", "forecast_anomaly_status", "probability_below_p20", "probability_status"],
} as const;

function table(value: unknown, columns: readonly string[], path: string): Record<string, unknown>[] {
  if (!obj(value) || JSON.stringify(value.columns) !== JSON.stringify(columns) || !Array.isArray(value.rows ?? value.records)) throw new Error(`${path} columns or records do not match the supported schema.`);
  const rows = (value.rows ?? value.records) as unknown[];
  return rows.map((row, index) => {
    if (!Array.isArray(row) || row.length !== columns.length) throw new Error(`${path}[${index}] has the wrong column count.`);
    return Object.fromEntries(columns.map((column, columnIndex) => [column, row[columnIndex]]));
  });
}
function requiredNumber(value: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (!finite(value) || value < min || value > max) throw new Error(`${path} must be a finite value in range.`);
  return value;
}
function nullableFinite(value: unknown, path: string, min = -Infinity, max = Infinity): number | null {
  if (value === null) return null;
  return requiredNumber(value, path, min, max);
}
function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!obj(value)) throw new Error(`${path} must be an object.`);
  return value;
}
function decodeReference(row: Record<string, unknown>, index: number): Phase9MonthlyReference {
  const path = `monthly_reference_statistics[${index}]`;
  const n = requiredNumber(row.n_years, `${path}.n_years`, 0, 20);
  if (!Number.isInteger(n)) throw new Error(`${path}.n_years must be an integer.`);
  const values = ["mean_mm", "sd_mm", "p10_mm", "p20_mm", "p50_mm", "p80_mm", "p90_mm", "low_moisture_count", "low_moisture_frequency"] as const;
  const decoded = Object.fromEntries(values.map((field) => [field, nullableFinite(row[field], `${path}.${field}`, field === "low_moisture_frequency" ? 0 : 0, field === "low_moisture_frequency" ? 1 : Infinity)])) as Record<(typeof values)[number], number | null>;
  if (!text(row.cell_id) || !Number.isInteger(row.calendar_month) || requiredNumber(row.calendar_month, `${path}.calendar_month`, 1, 12) !== Math.floor(row.calendar_month as number)) throw new Error(`${path} has an invalid cell or calendar month.`);
  if (n === 0 ? values.some((field) => decoded[field] !== null) : values.slice(0, 7).some((field) => decoded[field] === null)) throw new Error(`${path} has inconsistent missing-value statistics.`);
  if (n > 0 && !((decoded.p10_mm as number) <= (decoded.p20_mm as number) && (decoded.p20_mm as number) <= (decoded.p50_mm as number) && (decoded.p50_mm as number) <= (decoded.p80_mm as number) && (decoded.p80_mm as number) <= (decoded.p90_mm as number))) throw new Error(`${path} percentiles are not ordered.`);
  return { cell_id: row.cell_id, calendar_month: row.calendar_month as number, n_years: n, ...decoded };
}
function decodeObserved(row: Record<string, unknown>, index: number, glossaries: unknown): Phase9ObservedContext {
  const path = `latest_observed_context[${index}]`;
  const code = row.condition_code;
  if (!text(row.cell_id) || row.observation_month !== "2026-07" || !["below_reference_p20", "within_reference_p20_p80", "above_reference_p80"].includes(String(code))) throw new Error(`${path} has an unsupported observation month or interpretation code.`);
  const value = asRecord(glossaries, "interpretation_glossary");
  const en = asRecord(value.en, "interpretation_glossary.en");
  const es = asRecord(value.es, "interpretation_glossary.es");
  if (!text(en[String(code)]) || !text(es[String(code)])) throw new Error(`${path} is missing bilingual interpretation metadata.`);
  const observed = requiredNumber(row.value_mm, `${path}.value_mm`, 0, 1000);
  const mean = requiredNumber(row.reference_mean_mm, `${path}.reference_mean_mm`, 0, 1000);
  const anomaly = requiredNumber(row.anomaly_mm, `${path}.anomaly_mm`);
  if (Math.abs(observed - mean - anomaly) > 1e-6) throw new Error(`${path}.anomaly_mm does not equal observed storage minus its reference mean.`);
  return { cell_id: row.cell_id, observation_month: "2026-07", value_mm: observed, reference_calendar_month: requiredNumber(row.reference_calendar_month, `${path}.reference_calendar_month`, 1, 12), reference_n_years: requiredNumber(row.reference_n_years, `${path}.reference_n_years`, 1, 20), reference_mean_mm: mean, anomaly_mm: anomaly, empirical_percentile: requiredNumber(row.empirical_percentile, `${path}.empirical_percentile`, 0, 100), condition_code: code as Phase9ObservedContext["condition_code"] };
}
function decodeForecast(row: Record<string, unknown>, index: number): Phase9ForecastContext {
  const path = `forecast_context[${index}]`;
  const targetMonth = row.target_month;
  if (!text(row.cell_id) || !months.includes(targetMonth as typeof months[number])) throw new Error(`${path} has an unsupported cell or target month.`);
  const masked = row.status === "unavailable_masked_or_no_reference";
  const values = ["forecast_mm", "reference_mean_mm", "reference_p20_mm", "reference_p50_mm", "reference_p80_mm", "forecast_central_anomaly_mm", "probability_below_p20"] as const;
  const decoded = Object.fromEntries(values.map((field) => [field, nullableFinite(row[field], `${path}.${field}`, field === "forecast_central_anomaly_mm" ? -1000 : 0, field === "probability_below_p20" ? 1 : 1000)])) as Record<(typeof values)[number], number | null>;
  if (masked) {
    if (row.horizon_months !== null || values.some((field) => decoded[field] !== null)) throw new Error(`${path} masked values must remain null.`);
  } else {
    const horizon = months.indexOf(targetMonth as typeof months[number]) + 1;
    if (row.status !== "experimental_climatological_outlook" || row.horizon_months !== horizon || row.units !== "mm" || values.slice(0, 5).some((field) => decoded[field] === null)) throw new Error(`${path} has invalid experimental forecast fields.`);
    if (decoded.probability_below_p20 !== null || row.probability_status !== "unavailable_not_defensibly_calibrated") throw new Error(`${path} must not expose unvalidated low-moisture probabilities.`);
  }
  return { cell_id: row.cell_id, target_month: targetMonth as Phase9ForecastContext["target_month"], horizon_months: (row.horizon_months === null ? null : requiredNumber(row.horizon_months, `${path}.horizon_months`, 1, 3)) as Phase9ForecastContext["horizon_months"], status: String(row.status), units: row.units as "mm" | null, probability_status: String(row.probability_status), forecast_anomaly_status: row.forecast_anomaly_status as string | null, ...decoded };
}

/** Decode and validate the compact Phase 9 tables, then bind every forecast to its Phase 8 cell/month. */
export function adaptPhase9Interpretation(input: unknown, phase8: Phase8ForecastBundle, actualPhase8Sha256: string): Phase9Interpretation {
  const root = asRecord(input, "interpretation artifact");
  if (root.schema_version !== "soil_moisture_interpretation_v1" || root.status !== "historical_context_and_experimental_outlook") throw new Error("Unsupported Phase 9 interpretation schema or status.");
  const provenance = asRecord(root.provenance, "provenance");
  if (provenance.product !== phase8.source_dataset.product || provenance.doi !== phase8.source_dataset.doi || provenance.units !== "mm" || !digest(provenance.panel_sha256) || !digest(provenance.forecast_bundle_sha256) || provenance.forecast_bundle_sha256.toLowerCase() !== actualPhase8Sha256.toLowerCase()) throw new Error("Phase 9 provenance does not match the loaded Phase 8 source or checksum.");
  if (provenance.target !== "0–100 cm soil-water storage" || phase8.target.units !== "mm") throw new Error("Phase 9 target does not match the Phase 8 soil-water storage units and depth.");
  const reference = asRecord(root.reference, "reference");
  if (reference.start !== "2006-01" || reference.end !== "2025-12" || !text(reference.sample_size) || !text(reference.quantile_method) || !text(reference.low_moisture_definition)) throw new Error("Phase 9 historical reference metadata is invalid.");
  const cellsRows = table(root.cells, expectedColumns.cells, "cells");
  const cells = new Map<string, Phase9Cell>();
  for (const [index, row] of cellsRows.entries()) {
    if (!text(row.cell_id) || !finite(row.latitude) || !finite(row.longitude) || typeof row.soil_water_valid !== "boolean" || row.cell_id !== `${row.latitude.toFixed(4)},${row.longitude.toFixed(4)}` || cells.has(row.cell_id)) throw new Error(`cells[${index}] has invalid or duplicate grid identity.`);
    cells.set(row.cell_id, { cell_id: row.cell_id, latitude: row.latitude, longitude: row.longitude, soil_water_valid: row.soil_water_valid });
  }
  if (cells.size !== 896) throw new Error("Phase 9 must contain all 896 supported grid cells.");
  const phase8Mask = new Map(phase8.spatial_forecasts.forecasts[0].cells.map((cell) => [cell.cell_id, cell.valid]));
  if ([...cells.values()].some((cell) => phase8Mask.get(cell.cell_id) !== cell.soil_water_valid) || [...phase8Mask.keys()].some((id) => !cells.has(id))) throw new Error("Phase 9 cell mask does not exactly match Phase 8.");
  const refRows = table(root.monthly_reference_statistics, expectedColumns.monthly_reference_statistics, "monthly_reference_statistics");
  if (refRows.length !== 896 * 12) throw new Error("Phase 9 requires 12 monthly reference rows for every grid cell.");
  const monthlyReference = new Map<string, Phase9MonthlyReference>();
  refRows.forEach((row, index) => { const decoded = decodeReference(row, index); const cell = cells.get(decoded.cell_id); if (!cell || (cell.soil_water_valid ? decoded.n_years !== 20 : decoded.n_years !== 0) || monthlyReference.has(key(decoded.cell_id, decoded.calendar_month))) throw new Error(`monthly_reference_statistics[${index}] does not match the Phase 9 mask or unique key.`); monthlyReference.set(key(decoded.cell_id, decoded.calendar_month), decoded); });
  const glossary = asRecord(root.interpretation_glossary, "interpretation_glossary");
  const glossaryEn = asRecord(glossary.en, "interpretation_glossary.en") as Phase9Interpretation["glossary"]["en"];
  const glossaryEs = asRecord(glossary.es, "interpretation_glossary.es") as Phase9Interpretation["glossary"]["es"];
  const latest = asRecord(root.latest_observed_context, "latest_observed_context");
  if (latest.observation_month !== "2026-07" || !Array.isArray(latest.reference_period) || latest.reference_period[0] !== "2006-01" || latest.reference_period[1] !== "2025-12") throw new Error("Phase 9 latest observed context must describe July 2026 against the 2006–2025 reference.");
  const observedRows = table(latest, expectedColumns.latest_observed_context, "latest_observed_context");
  const latestObserved = new Map<string, Phase9ObservedContext>();
  observedRows.forEach((row, index) => { const decoded = decodeObserved(row, index, glossary); const cell = cells.get(decoded.cell_id); if (!cell?.soil_water_valid || latestObserved.has(decoded.cell_id) || monthlyReference.get(key(decoded.cell_id, decoded.reference_calendar_month))?.n_years !== decoded.reference_n_years) throw new Error(`latest_observed_context[${index}] does not match a valid cell and its reference.`); latestObserved.set(decoded.cell_id, decoded); });
  if (latestObserved.size !== 867) throw new Error("Phase 9 July observations must cover the 867 valid cells only.");
  const forecastRoot = asRecord(root.forecast_context, "forecast_context");
  if (forecastRoot.source_bundle_status !== "experimental" || forecastRoot.model !== "seasonal_climatology") throw new Error("Phase 9 future context must remain experimental seasonal climatology.");
  const forecastRows = table(forecastRoot, expectedColumns.forecast_context, "forecast_context");
  if (forecastRows.length !== 896 * 3) throw new Error("Phase 9 requires three month records for all 896 cells.");
  const forecasts = new Map<string, Phase9ForecastContext>();
  forecastRows.forEach((row, index) => {
    const decoded = decodeForecast(row, index);
    const cell = cells.get(decoded.cell_id);
    const monthIndex = months.indexOf(decoded.target_month);
    const p8Horizon = phase8.spatial_forecasts.forecasts[monthIndex];
    const p8Cell = p8Horizon?.cells.find((item) => item.cell_id === decoded.cell_id);
    const monthReference = monthlyReference.get(key(decoded.cell_id, Number(decoded.target_month.slice(5, 7))));
    const phase8Mismatch = !p8Cell || p8Cell.valid !== cell?.soil_water_valid || (cell?.soil_water_valid
      ? decoded.horizon_months !== monthIndex + 1 || !reference || !monthReference || !p8Cell.valid || decoded.forecast_mm === null || Math.abs((p8Cell.value ?? NaN) - decoded.forecast_mm) > 1e-6 || Math.abs((decoded.reference_mean_mm ?? NaN) - (monthReference.mean_mm ?? NaN)) > 1e-6 || Math.abs((decoded.reference_p20_mm ?? NaN) - (monthReference.p20_mm ?? NaN)) > 1e-6 || Math.abs((decoded.reference_p50_mm ?? NaN) - (monthReference.p50_mm ?? NaN)) > 1e-6 || Math.abs((decoded.reference_p80_mm ?? NaN) - (monthReference.p80_mm ?? NaN)) > 1e-6
      : decoded.status !== "unavailable_masked_or_no_reference");
    if (!cell || forecasts.has(key(decoded.cell_id, decoded.target_month)) || phase8Mismatch) throw new Error(`forecast_context[${index}] does not match a Phase 8 cell/month value or mask.`);
    forecasts.set(key(decoded.cell_id, decoded.target_month), decoded);
  });
  const forecastInterpretation = asRecord(root.forecast_interpretation, "forecast_interpretation");
  const probabilitySummary = asRecord(root.probability_summary, "probability_summary");
  const agricultural = asRecord(root.agricultural_interpretation, "agricultural_interpretation");
  if (!text(forecastInterpretation.en) || !text(forecastInterpretation.es) || !text(forecastInterpretation.probability_reason) || probabilitySummary.status !== "unavailable" || !text(probabilitySummary.reason) || !text(agricultural.en) || !text(agricultural.es) || !text(agricultural.scope) || !Array.isArray(agricultural.prohibited_inferences) || !agricultural.prohibited_inferences.every(text) || !Array.isArray(root.methodology) || !root.methodology.every(text) || !Array.isArray(root.limitations) || !root.limitations.every(text)) throw new Error("Phase 9 interpretation, probability limitation, or agricultural metadata is incomplete.");
  return { provenance: provenance as Phase9Interpretation["provenance"], reference: reference as Phase9Interpretation["reference"], cells, monthlyReference, latestObserved, forecasts, glossary: { en: glossaryEn, es: glossaryEs }, forecastInterpretation: forecastInterpretation as Phase9Interpretation["forecastInterpretation"], probabilitySummary: probabilitySummary as Phase9Interpretation["probabilitySummary"], agriculturalInterpretation: agricultural as Phase9Interpretation["agriculturalInterpretation"], methodology: root.methodology as string[], limitations: root.limitations as string[] };
}

export function phase9ForCellMonth(data: Phase9Interpretation, cellId: string, targetMonth: Phase9ForecastContext["target_month"]) {
  const forecast = data.forecasts.get(key(cellId, targetMonth));
  const reference = data.monthlyReference.get(key(cellId, Number(targetMonth.slice(5, 7))));
  return { cell: data.cells.get(cellId) ?? null, reference: reference ?? null, observation: data.latestObserved.get(cellId) ?? null, forecast: forecast ?? null };
}

export async function loadPhase9Interpretation(phase8: Phase8ForecastBundle, phase8Sha256: string | undefined, path = `${import.meta.env.BASE_URL}data/soil_moisture_interpretation_v1.json`): Promise<Phase9Load> {
  try {
    if (!phase8Sha256) return { status: "error", message: "The Phase 8 file checksum could not be verified; Phase 9 interpretation is withheld." };
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (response.status === 404) return { status: "missing", message: "soil_moisture_interpretation_v1.json is not installed." };
    if (!response.ok) return { status: "error", message: `Could not load Phase 9 interpretation (HTTP ${response.status}).` };
    return { status: "ready", data: adaptPhase9Interpretation(await response.json() as unknown, phase8, phase8Sha256) };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Could not validate Phase 9 interpretation." }; }
}
