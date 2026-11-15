import { describe, expect, it, vi } from "vitest";
import { adaptPredictiveEvaluation, loadPredictiveEvaluation } from "./loadPredictive";
import { predictiveEvaluationFixture } from "./__fixtures__/predictiveEvaluation.fixture";

describe("adaptPredictiveEvaluation", () => {
  it("accepts the versioned retrospective schema and preserves support, scores, intervals, and provenance", () => {
    const result = adaptPredictiveEvaluation(predictiveEvaluationFixture);
    expect(result.schema_version).toBe("predictive_evaluation_v1");
    expect(result.results).toHaveLength(4);
    expect(result.results[0].models[1].holdout.metrics.rmse).toBe(1002);
    expect(result.results[0].models[1].uncertainty.metric_difference_interval_95).toEqual([990, 1000]);
    expect(result.provenance.input_panel_sha256).toHaveLength(64);
  });

  it("accepts a selected baseline independently of the descriptive holdout winner", () => {
    const baselineSelected = structuredClone(predictiveEvaluationFixture);
    const series = baselineSelected.results[0];
    series.models[0].selected_before_holdout = true;
    series.models[1].selected_before_holdout = false;
    series.models[1].holdout.metrics.rmse = 900;
    const declared = { ...series, selected_model: "persistence", descriptive_holdout_model: "xgboost" };
    const artifact = { ...baselineSelected, results: [declared, ...baselineSelected.results.slice(1)] };
    expect(adaptPredictiveEvaluation(artifact).results[0]).toMatchObject({
      selected_model: "persistence", descriptive_holdout_model: "xgboost",
    });
    declared.selected_model = "xgboost";
    expect(() => adaptPredictiveEvaluation(artifact)).toThrow("pre-holdout selection mismatch");
  });

  it("rejects unsupported versions, missing spatial/regional results, nonfinite values and wrong classification metrics", () => {
    expect(() => adaptPredictiveEvaluation({ ...predictiveEvaluationFixture, schema_version: "0.9" })).toThrow("Unsupported predictive evaluation schema");
    expect(() => adaptPredictiveEvaluation({ ...predictiveEvaluationFixture, results: [predictiveEvaluationFixture.results[0]] })).toThrow("regional and spatial evaluations");
    const broken = structuredClone(predictiveEvaluationFixture);
    (broken.results[0].models[0].holdout.metrics as { rmse: number }).rmse = Number.NaN;
    expect(() => adaptPredictiveEvaluation(broken)).toThrow("finite number");
    expect(() => adaptPredictiveEvaluation({ ...predictiveEvaluationFixture, results: [{ ...predictiveEvaluationFixture.results[2], primary_metric: "rmse" }] })).toThrow("target and primary metric");
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
});
