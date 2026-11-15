import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptPhase8ForecastBundle } from "../data/phase8Forecast";
import { phase8ForecastFixture } from "../data/__fixtures__/phase8Forecast.fixture";
import { Phase8Outlook } from "./Phase8Outlook";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => { if (root) act(() => root?.unmount()); root = undefined; document.body.innerHTML = ""; });
const localArtifactPath = resolve(process.cwd(), "public/data/phase8_forecast_bundle_v1.json");
function render(state: Parameters<typeof Phase8Outlook>[0]["state"] = { status: "ready", bundle: adaptPhase8ForecastBundle(structuredClone(phase8ForecastFixture)) }, selectedLocation: { latitude: number; longitude: number } | null = null) {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  const onHorizonChange = vi.fn();
  act(() => root?.render(<Phase8Outlook state={state} horizon={1} onHorizonChange={onHorizonChange} selectedLocation={selectedLocation} onRetry={vi.fn()} language="en" formatDate={(value) => value.slice(0, 10)} formatNumber={(value, options) => new Intl.NumberFormat("en-US", options).format(value)} />));
  return { container, onHorizonChange };
}

describe("Phase 8 Research / Experimental Outlook", () => {
  it("labels the series experimental and never calls it operational", () => {
    const { container } = render();
    expect(container.textContent).toContain("EXPERIMENTAL · NOT OPERATIONAL");
    expect(container.textContent).toContain("101 mm");
    expect(container.textContent).toContain("90% predictive interval");
    expect(container.textContent).toContain("operationally_eligible = false");
    expect(container.textContent).not.toContain("Validated forecast");
  });
  it("keeps missing values unavailable and does not fill masked spatial cells", () => {
    const bundle = adaptPhase8ForecastBundle(structuredClone(phase8ForecastFixture));
    const { container } = render({ status: "missing", message: "Missing TEST ONLY artifact." });
    expect(container.textContent).toContain("Experimental artifact not installed");
    expect(container.textContent).toContain("phase8_forecast_bundle_v1.json");
    expect(container.textContent).not.toContain("101 mm");
    expect(bundle.spatial_forecasts.forecasts[0].cells[895].value).toBeNull();
  });
  it("shows selected cell values only for valid in-coverage grid centers", () => {
    const bundle = adaptPhase8ForecastBundle(structuredClone(phase8ForecastFixture));
    const masked = bundle.spatial_forecasts.forecasts[0].cells[895];
    const { container } = render({ status: "ready", bundle }, { latitude: masked.latitude, longitude: masked.longitude });
    const cellButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("My GLDAS cell"));
    act(() => cellButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("nearest GLDAS cell is masked");
    expect(container.querySelector(".phase8-value")?.textContent).toBe("—");
    const valid = bundle.spatial_forecasts.forecasts[0].cells[0];
    act(() => root?.unmount()); root = undefined; document.body.innerHTML = "";
    const validRender = render({ status: "ready", bundle }, { latitude: valid.latitude, longitude: valid.longitude });
    const validCellButton = Array.from(validRender.container.querySelectorAll("button")).find((button) => button.textContent?.includes("My GLDAS cell"));
    act(() => validCellButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(validRender.container.querySelector(".phase8-value")?.textContent).toBe("101 mm");
  });
  it("switches horizons through the accessible controls", () => {
    const { container, onHorizonChange } = render();
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("Horizon 2"));
    expect(button).toBeTruthy();
    act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onHorizonChange).toHaveBeenCalledWith(2);
  });
  it("shows Spanish experimental and operational status copy", () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    act(() => root?.render(<Phase8Outlook state={{ status: "ready", bundle: adaptPhase8ForecastBundle(structuredClone(phase8ForecastFixture)) }} horizon={1} onHorizonChange={vi.fn()} selectedLocation={null} onRetry={vi.fn()} language="es" formatDate={(value) => value.slice(0, 10)} formatNumber={(value, options) => new Intl.NumberFormat("es-AR", options).format(value)} />));
    expect(container.textContent).toContain("EXPERIMENTAL · NO OPERATIVO");
    expect(container.textContent?.toLowerCase()).toContain("no es un pronóstico operativo");
  });
  it.skipIf(!existsSync(localArtifactPath))("renders the validated local NASA artifact values only in the experimental outlook", () => {
    const bundle = adaptPhase8ForecastBundle(JSON.parse(readFileSync(localArtifactPath, "utf8")) as unknown);
    const { container } = render({ status: "ready", bundle });
    const displayedValue = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(bundle.regional_forecasts[0].value);
    expect(container.textContent).toContain("EXPERIMENTAL · NOT OPERATIONAL");
    expect(container.textContent).toContain(`${displayedValue} mm`);
    expect(container.textContent).toContain("182.8 mm");
    expect(container.textContent).toContain("operationally_eligible = false");
  });
});
