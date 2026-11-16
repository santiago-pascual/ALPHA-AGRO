import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptPhase8ForecastBundle } from "../data/phase8Forecast";
import { phase8ForecastFixture } from "../data/__fixtures__/phase8Forecast.fixture";
import { DEFAULT_CROP_CONFIGURATION } from "../data/agronomy";
import { AgriculturalAnalysis } from "./AgriculturalAnalysis";

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
});
