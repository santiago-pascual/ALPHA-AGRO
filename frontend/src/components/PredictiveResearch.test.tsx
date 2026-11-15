import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PredictiveResearchPage } from "./PredictiveResearch";
import { predictiveEvaluationFixture } from "../data/__fixtures__/predictiveEvaluation.fixture";
import { I18nProvider } from "../i18n";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("PredictiveResearchPage", () => {
  it("keeps forecasts disabled and shows the validated historical selection controls without demo scores", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => predictiveEvaluationFixture }));
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root?.render(<I18nProvider><PredictiveResearchPage /></I18nProvider>); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("TEST ONLY — SYNTHETIC FIXTURE");
    expect(container.textContent).toContain("Predictive research");
    expect(container.textContent).toContain("Pre-holdout selection");
    expect(container.textContent).toContain("descriptive lowest score");
    expect(container.textContent).toContain("Historical holdout predictions are not live forecasts.");
    expect(container.textContent).toContain("Forecast artifacts and operational eligibility are handled separately.");
    expect(container.textContent).not.toContain("Forecast unavailable");
    expect(container.textContent).toContain("999");
    const target = container.querySelector("select[aria-label='Target']") ?? container.querySelectorAll("select")[2];
    await act(async () => { (target as HTMLSelectElement).value = "low_moisture"; target?.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("Brier score");
  });

  it("shows an explicit missing-data state and never falls back to a demo fixture", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root?.render(<I18nProvider><PredictiveResearchPage /></I18nProvider>); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("Historical evaluation unavailable");
    expect(container.textContent).toContain("predictive_evaluation_v1.json");
    expect(container.textContent).not.toContain("999");
  });
});
