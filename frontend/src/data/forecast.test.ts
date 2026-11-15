import { describe, expect, it } from "vitest";
import { adaptTrendAnalysis } from "./loadTrend";
import { adaptPredictiveEvaluation } from "./loadPredictive";
import { trendAnalysisFixture } from "./__fixtures__/trendAnalysis.fixture";
import { predictiveEvaluationFixture } from "./__fixtures__/predictiveEvaluation.fixture";
import type { ForecastArtifact, ForecastTarget } from "../types/forecast";
import { adaptForecastArtifact, buildForecastRequest, gridCellId, resolveForecast, selectedPreHoldoutModel } from "./forecast";

const dataset = adaptTrendAnalysis(trendAnalysisFixture);
const rawEvaluation = structuredClone(predictiveEvaluationFixture) as unknown as { results: Record<string, unknown>[] };
const initialRows = [...rawEvaluation.results];
rawEvaluation.results = [];
for (const horizon of [1, 2, 3]) {
  for (const original of initialRows) {
    const row: Record<string, unknown> = { ...original, horizon_months: horizon };
    rawEvaluation.results.push(row);
    if (row.target === "storage") rawEvaluation.results.push({ ...row, target: "anomaly", target_definition: { method: "SYNTHETIC TEST ONLY", units: "mm" } });
  }
}
const evaluation = adaptPredictiveEvaluation({ ...predictiveEvaluationFixture, results: rawEvaluation.results });
const cell = dataset.cells[0];
const location = { latitude: cell.latitude, longitude: cell.longitude };
const hash = "a".repeat(64);
function artifact(target: ForecastTarget = "storage", status: ForecastArtifact["status"] = "operationally_eligible", horizon: 1 | 2 | 3 = 1): ForecastArtifact {
  const targetMonth = new Date(Date.UTC(2025, 9 + horizon, 1)).toISOString().slice(0, 7);
  return {
    schema_version: "forecast_v1", status, issue_time: "2025-10-31T23:59:59Z", target_month: targetMonth, horizon_months: horizon,
    scope: { id: gridCellId(cell, dataset.resolutionDegrees), bounds_west_south_east_north: [cell.longitude - .125, cell.latitude - .125, cell.longitude + .125, cell.latitude + .125] },
    target, model: { name: selectedPreHoldoutModel(evaluation, horizon, target)!, version: "test-only" }, input_observation_cutoff: "2025-09-30T23:59:59Z",
    availability: { policy: "test-only verified evidence", publication_evidence: { first_verified_access_at: "2025-10-30T12:00:00Z", asset_id: "fixture-asset", sha256: hash }, operationally_eligible: true, input_months: [{ month: "2025-09", observation_end: "2025-09-30T23:59:59Z", provider_publication_at: "2025-10-20T00:00:00Z", available_at: "2025-10-20T00:00:00Z", availability_is_assumed: false, soil_sha256: hash, driver_sha256: hash }] },
    value: target === "low_moisture" ? .25 : 100, units: target === "low_moisture" ? "probability" : "mm", predictive_interval: target === "low_moisture" ? null : { level: .9, lower: 80, upper: 120, method: "TEST ONLY" },
    calibration: { start: "2022-01", end: "2025-09", n_months: 44, labels_available_by: "2025-10-31T23:59:59Z", metrics: {} }, quality_flags: ["TEST ONLY — SYNTHETIC"], source: { collection: "TEST ONLY", doi: "10.5067/test", input_panel_sha256: hash },
  };
}

describe("forecast request and resolution", () => {
  it.each([1, 2, 3] as const)("uses pre-holdout selected model across every target at %s month horizon", (horizon) => {
    ( ["storage", "anomaly", "low_moisture"] as ForecastTarget[]).forEach((target) => {
      const model = selectedPreHoldoutModel(evaluation, horizon, target);
      expect(model).toBeTruthy();
      const request = buildForecastRequest({ location, dataset, evaluation, horizon, target, issue: { mode: "latest_verified_eligible" } });
      expect(request.model_id).toBe(model);
      expect(resolveForecast(request, adaptForecastArtifact(artifact(target, "operationally_eligible", horizon))).status).toBe("available");
    });
  });
  it("rejects missing, invalid, and unsupported locations", () => {
    const base = { evaluation, horizon: 1 as const, target: "storage" as const, issue: { mode: "latest_verified_eligible" as const } };
    expect(() => buildForecastRequest({ ...base, location: null, dataset })).toThrow("Select a field");
    expect(() => buildForecastRequest({ ...base, location: { latitude: 91, longitude: 0 }, dataset })).toThrow("Latitude");
    expect(() => buildForecastRequest({ ...base, location: { latitude: 0, longitude: 0 }, dataset })).toThrow("outside");
  });
  it("withholds retrospective/experimental records and mismatched request dimensions", () => {
    const request = buildForecastRequest({ location, dataset, evaluation, horizon: 1, target: "storage", issue: { mode: "latest_verified_eligible" } });
    expect(resolveForecast(request, artifact("storage", "retrospective_simulation")).status).toBe("unavailable");
    expect(resolveForecast(request, artifact("storage", "experimental")).status).toBe("unavailable");
    expect(resolveForecast({ ...request, horizon_months: 2 }, artifact()).status).toBe("unavailable");
    expect(resolveForecast({ ...request, model_id: "holdout_winner" }, artifact()).status).toBe("unavailable");
  });
  it("requires exact issue time when requested and verifies target month/cutoff/evidence", () => {
    const request = buildForecastRequest({ location, dataset, evaluation, horizon: 1, target: "storage", issue: { mode: "date", value: "2025-10-31T23:59:59Z" } });
    expect(resolveForecast(request, artifact(), new Date("2025-11-01T00:00:00Z")).status).toBe("available");
    expect(resolveForecast({ ...request, issue: { mode: "date", value: "2025-10-31T22:00:00Z" } }, artifact()).status).toBe("unavailable");
    expect(resolveForecast(request, { ...artifact(), target_month: "2026-01" }).status).toBe("unavailable");
    expect(resolveForecast(request, { ...artifact(), input_observation_cutoff: "2025-11-01T00:00:00Z" }).status).toBe("unavailable");
    expect(resolveForecast(request, { ...artifact(), availability: { ...artifact().availability, publication_evidence: null } }).status).toBe("unavailable");
  });
  it("keeps probability and continuous-value units and uncertainty distinct", () => {
    expect(artifact("low_moisture").units).toBe("probability");
    const malformed = { ...artifact("low_moisture"), value: 1.2 };
    expect(() => adaptForecastArtifact(malformed)).toThrow("units");
    expect(() => adaptForecastArtifact({ ...artifact(), units: "probability" })).toThrow("units");
    expect(resolveForecast(buildForecastRequest({ location, dataset, evaluation, horizon: 1, target: "storage", issue: { mode: "latest_verified_eligible" } }), { ...artifact(), availability: { ...artifact().availability, input_months: [{ ...artifact().availability.input_months[0], availability_is_assumed: true }] } }).status).toBe("unavailable");
  });
});
