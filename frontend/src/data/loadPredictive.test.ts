import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptPredictiveEvaluation, loadPredictiveEvaluation } from "./loadPredictive";
import { predictiveEvaluationFixture } from "./__fixtures__/predictiveEvaluation.fixture";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("adaptPredictiveEvaluation", () => {
  it("accepts the versioned retrospective schema and preserves support, scores, intervals, and provenance", () => {
    const result = adaptPredictiveEvaluation(predictiveEvaluationFixture);
    expect(result.schema_version).toBe("predictive_evaluation_v1");
    expect(result.results).toHaveLength(4);
    expect(result.results[0].models[1].holdout.metrics.rmse).toBe(1002);
    expect(result.results[0].models[1].uncertainty.metric_difference_interval_95).toEqual([990, 1000]);
    expect(result.provenance.input_panel_sha256).toHaveLength(64);
  });

  it("rejects unsupported versions, missing spatial/regional results, nonfinite values and wrong classification metrics", () => {
    expect(() => adaptPredictiveEvaluation({ ...predictiveEvaluationFixture, schema_version: "0.9" })).toThrow("Unsupported predictive evaluation schema");
    expect(() => adaptPredictiveEvaluation({ ...predictiveEvaluationFixture, results: [predictiveEvaluationFixture.results[0]] })).toThrow("regional and spatial evaluations");
    const broken = structuredClone(predictiveEvaluationFixture);
    (broken.results[0].models[0].holdout.metrics as { rmse: number }).rmse = Number.NaN;
    expect(() => adaptPredictiveEvaluation(broken)).toThrow("finite number");
    expect(() => adaptPredictiveEvaluation({ ...predictiveEvaluationFixture, results: [{ ...predictiveEvaluationFixture.results[2], primary_metric: "rmse" }] })).toThrow("target and primary metric");
  });

  it("accepts a selected baseline and preserves source-declared holdout comparisons", () => {
    const input = structuredClone(predictiveEvaluationFixture);
    const row = input.results[0] as typeof input.results[number] & { selected_model?: string; descriptive_holdout_model?: string };
    row.models[0].selected_before_holdout = true;
    row.models[1].selected_before_holdout = false;
    row.selected_model = "persistence";
    row.descriptive_holdout_model = "xgboost";
    const result = adaptPredictiveEvaluation(input).results[0];
    expect(result.selected_model).toBe("persistence");
    expect(result.descriptive_holdout_model).toBe("xgboost");
    expect(result.models[0].selected_before_holdout).toBe(true);
  });

  it("rejects source-level selection fields that conflict with model flags", () => {
    const row = { ...predictiveEvaluationFixture.results[0], selected_model: "persistence" };
    expect(() => adaptPredictiveEvaluation({ ...predictiveEvaluationFixture, results: [row, ...predictiveEvaluationFixture.results.slice(1)] })).toThrow("selected_model must match");
  });
});

describe("loadPredictiveEvaluation", () => {
  it("fetches the documented path and validates its JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => predictiveEvaluationFixture });
    vi.stubGlobal("fetch", fetchMock);
    const result = await loadPredictiveEvaluation();
    expect(fetchMock).toHaveBeenCalledWith("/data/predictive_evaluation_v1.json", { headers: { Accept: "application/json" } });
    expect(result.status).toBe("retrospective_evaluation");
  });

  it("keeps a missing artifact as an explicit error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(loadPredictiveEvaluation()).rejects.toThrow("no model scores to display");
  });

  it("prefixes the evaluation URL with the GitHub Pages repository base", async () => {
    vi.stubEnv("BASE_URL", "/quant-alpha-agro/");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => predictiveEvaluationFixture });
    vi.stubGlobal("fetch", fetchMock);
    await loadPredictiveEvaluation();
    expect(fetchMock).toHaveBeenCalledWith("/quant-alpha-agro/data/predictive_evaluation_v1.json", { headers: { Accept: "application/json" } });
  });
});
