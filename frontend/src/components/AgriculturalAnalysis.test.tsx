import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptPhase8ForecastBundle } from "../data/phase8Forecast";
import { phase8ForecastFixture } from "../data/__fixtures__/phase8Forecast.fixture";
import { DEFAULT_CROP_CONFIGURATION } from "../data/agronomy";
import { AgriculturalAnalysis } from "./AgriculturalAnalysis";
import { adaptTrendAnalysis } from "../data/loadTrend";
import { trendAnalysisFixture } from "../data/__fixtures__/trendAnalysis.fixture";
import { adaptLandContext } from "../data/loadLandContext";
import { landContextFixture } from "../data/__fixtures__/landContext.fixture";
import type { Phase9Load, Phase9ObservedContext } from "../types/phase9";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => { if (root) act(() => root?.unmount()); root = undefined; document.body.innerHTML = ""; });
function render(props: Partial<React.ComponentProps<typeof AgriculturalAnalysis>> = {}) {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const bundle = adaptPhase8ForecastBundle(structuredClone(phase8ForecastFixture));
  act(() => root?.render(<AgriculturalAnalysis
    phase8={{ status: "ready", bundle }} phase9={{ status: "missing", message: "TEST ONLY: Phase 9 absent" }}
    location={{ latitude: -37.875, longitude: -63.875 }} crop={DEFAULT_CROP_CONFIGURATION} language="en"
    formatNumber={(value) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} onChooseCrop={vi.fn()} {...props}
  />));
  return container;
}

function observedPhase9(condition: Phase9ObservedContext["condition_code"]): Phase9Load {
  const cellId = "-37.8750,-63.8750";
  const observation: Phase9ObservedContext = { cell_id: cellId, observation_month: "2026-07", value_mm: 80, reference_calendar_month: 7, reference_n_years: 20, reference_mean_mm: 100, anomaly_mm: -20, empirical_percentile: 10, condition_code: condition };
  return { status: "ready", data: {
    provenance: { product: "TEST ONLY", doi: "TEST ONLY", target: "TEST ONLY", units: "mm", panel_sha256: "TEST ONLY", forecast_bundle_sha256: "TEST ONLY" },
    reference: { start: "2006-01", end: "2025-12", sample_size: "TEST ONLY", quantile_method: "TEST ONLY", low_moisture_definition: "TEST ONLY" },
    cells: new Map([[cellId, { cell_id: cellId, latitude: -37.875, longitude: -63.875, soil_water_valid: true }]]), monthlyReference: new Map(),
    latestObserved: new Map([[cellId, observation]]), forecasts: new Map(),
    glossary: { en: { below_reference_p20: "TEST ONLY below", within_reference_p20_p80: "TEST ONLY within", above_reference_p80: "TEST ONLY above" }, es: { below_reference_p20: "TEST ONLY bajo", within_reference_p20_p80: "TEST ONLY dentro", above_reference_p80: "TEST ONLY sobre" } },
    forecastInterpretation: { en: "TEST ONLY", es: "TEST ONLY", probability_reason: "TEST ONLY" }, probabilitySummary: { status: "TEST ONLY", reason: "TEST ONLY" },
    agriculturalInterpretation: { en: "TEST ONLY", es: "TEST ONLY", scope: "TEST ONLY", prohibited_inferences: [] }, methodology: [], limitations: [],
  } };
}

describe("farmer agricultural analysis", () => {
  it("renders validated artifact storage and uncertainty while missing references stay unavailable", () => {
    const container = render();
    expect(container.textContent).toContain("EXPERIMENTAL OUTLOOK");
    expect(container.querySelectorAll(".agricultural-months article")).toHaveLength(3);
    expect(container.textContent).toContain("101 mm");
    expect(container.textContent).toContain("91 mm–111 mm");
    expect(container.textContent).toContain("Historical monthly mean: 101 mm");
    expect(container.textContent).toContain("not expected rainfall or a direct measurement of your field");
    expect(container.textContent).not.toContain("Low-moisture probability");
    expect(container.textContent).not.toContain("good conditions");
  });

  it("withholds outputs for unsupported locations and localizes the unavailable state", () => {
    const container = render({ location: { latitude: 0, longitude: 0 }, language: "es" });
    expect(container.textContent).toContain("Esta ubicación no coincide con una celda científica válida.");
    expect(container.textContent).not.toContain("101 mm");
  });

  it("keeps missing artifacts explicit and lets users inspect a documented regional alternative", () => {
    const chooseCrop = vi.fn();
    const container = render({ onChooseCrop: chooseCrop });
    expect(container.querySelectorAll(".agricultural-alternatives button").length).toBeGreaterThan(0);
    const maize = Array.from(container.querySelectorAll<HTMLButtonElement>(".agricultural-alternatives button")).find((button) => button.textContent === "Maize");
    act(() => maize?.click());
    expect(chooseCrop).toHaveBeenCalledWith("maize");
  });

  it("does not replace missing scientific data with a fixture or demo result", () => {
    const container = render({ phase8: { status: "missing", message: "TEST ONLY" } });
    expect(container.textContent).toContain("Soil-water results are unavailable.");
    expect(container.textContent).not.toContain("101 mm");
  });

  it("describes a non-significant historical slope as inconclusive, never as land degradation", () => {
    const historical = adaptTrendAnalysis(structuredClone(trendAnalysisFixture));
    const container = render({ historical });
    expect(container.textContent).toContain("No clear directional change");
    expect(container.textContent).toContain("-4.2 mm / decade");
    expect(container.textContent).toContain("No downloaded bundle");
    expect(container.textContent).toContain("not a field-specific prediction");
    expect(container.textContent).not.toContain("land degradation detected");
  });

  it("shows sampled productivity and regional yield as exploratory historical context", () => {
    const landContext = adaptLandContext(structuredClone(landContextFixture));
    const container = render({ landContext: { status: "ready", data: landContext } });
    expect(container.textContent).toContain("Annual productivity · grid-cell sample");
    expect(container.textContent).toContain("Sample mean; not an area-weighted Pampas mean.");
    expect(container.textContent).toContain("EXPLORATORY YIELD REFERENCE");
    expect(container.textContent).toContain("not a field estimate or yield model");
    expect(container.textContent).not.toContain("yield forecast");
  });

  it("compares the selected planting stage with the issue-month calendar in the selected Pampas grouping", () => {
    const container = render();
    expect(container.textContent).toContain("Southern Pampas");
    expect(container.textContent).toContain("Planning / planting");
    expect(container.textContent).toContain("overlaps a documented regional sowing window");
    act(() => root?.unmount()); root = undefined; document.body.innerHTML = "";
    const wheat = render({ crop: { ...DEFAULT_CROP_CONFIGURATION, crop: "wheat" } });
    expect(wheat.textContent).toContain("outside the broad regional sowing window");
  });

  it("explains whether high or low observed storage may matter to the crop without claiming crop damage or benefit", () => {
    const lower = render({ phase9: observedPhase9("below_reference_p20") });
    expect(lower.textContent).toContain("A smaller reserve could limit availability");
    expect(lower.textContent).toContain("does not confirm field stress or damage");
    act(() => root?.unmount()); root = undefined; document.body.innerHTML = "";
    const higher = render({ phase9: observedPhase9("above_reference_p80") });
    expect(higher.textContent).toContain("may support availability");
    expect(higher.textContent).toContain("more water is not always better");
  });
});
