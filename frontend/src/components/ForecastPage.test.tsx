import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptTrendAnalysis } from "../data/loadTrend";
import { trendAnalysisFixture } from "../data/__fixtures__/trendAnalysis.fixture";
import type { SelectedLocation } from "../data/location";
import type { DashboardDataset } from "../types";
import { ForecastPage } from "./ForecastPage";
import { I18nProvider, LanguageSelector } from "../i18n";
import { predictiveEvaluationFixture } from "../data/__fixtures__/predictiveEvaluation.fixture";
import { adaptPredictiveEvaluation } from "../data/loadPredictive";
import { gridCellId, selectedPreHoldoutModel } from "../data/forecast";
import { DEFAULT_CROP_CONFIGURATION, type CropConfiguration } from "../data/agronomy";
import { phase8ForecastFixture } from "../data/__fixtures__/phase8Forecast.fixture";

vi.mock("./TrendMap", async () => {
  const React = await import("react");
  return {
    TrendMap: (props: { selectedLocation?: SelectedLocation | null; onLocationSelect?: (point: { latitude: number; longitude: number }) => void }) => React.createElement(
      "div",
      { "data-testid": "coverage-map" },
      React.createElement("button", { type: "button", onClick: () => props.onLocationSelect?.({ latitude: -34, longitude: -60 }) }, "Map select supported cell"),
      props.selectedLocation ? React.createElement("output", null, "Map marker selected") : null,
    ),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation);
  else Reflect.deleteProperty(navigator, "geolocation");
  vi.unstubAllGlobals();
  localStorage.clear();
});

const testDataset = adaptTrendAnalysis(trendAnalysisFixture);
function TestForecastPage({ dataset = testDataset }: { dataset?: DashboardDataset | null }) {
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [cropConfiguration, setCropConfiguration] = useState<CropConfiguration>(DEFAULT_CROP_CONFIGURATION);
  return <I18nProvider><LanguageSelector /><ForecastPage dataset={dataset} selectedLocation={selectedLocation} onLocationChange={setSelectedLocation} savedFields={[]} activeFieldId={null} storageWarning={null} cropConfiguration={cropConfiguration} onCropConfigurationChange={setCropConfiguration} onFieldSelect={() => undefined} onFieldAdd={() => undefined} onFieldRename={() => undefined} onFieldDelete={() => undefined} onViewHistory={() => undefined} /></I18nProvider>;
}

function renderForecast(dataset?: DashboardDataset | null) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<TestForecastPage dataset={dataset} />));
  return container;
}

function clickButton(container: HTMLElement, name: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(name));
  if (!button) throw new Error(`Button not found: ${name}. Buttons: ${Array.from(container.querySelectorAll("button")).map((item) => item.textContent).join(" | ")}`);
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("ForecastPage location selection", () => {
  it("requires an explicit request and keeps unsupported short-term horizons unavailable", () => {
    const container = renderForecast();
    expect(container.querySelector(".forecast-results")).toBeNull();
    expect(container.textContent).toContain("Argentine Pampas");
    const horizon = container.querySelector<HTMLSelectElement>("select[aria-label='Forecast horizon']");
    expect(horizon?.disabled).toBe(false);
    expect(Array.from(horizon?.options ?? []).filter((option) => option.disabled).map((option) => option.value)).toEqual(["14d", "28d"]);
    expect(Array.from(horizon?.options ?? []).filter((option) => !option.disabled).map((option) => option.value)).toEqual(["1", "2", "3"]);
    expect(container.querySelector<HTMLSelectElement>("select[aria-label='Target variable']")?.disabled).toBe(false);
    act(() => {
      if (horizon) { horizon.value = "3"; horizon.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    expect(horizon?.value).toBe("3");
    clickButton(container, "Generate forecast");
    expect(container.querySelector(".forecast-results")).not.toBeNull();
    expect(Array.from(container.querySelectorAll(".location-workspace, .crop-decision:not(.crop-comparison-panel), .forecast-setup, .forecast-results, .crop-comparison-panel")).map((node) => node.classList.contains("location-workspace") ? "location" : node.classList.contains("crop-comparison-panel") ? "comparison" : node.classList.contains("crop-decision") ? "crop" : node.classList.contains("forecast-setup") ? "analysis" : "results")).toEqual(["location", "crop", "analysis", "results", "comparison"]);
    expect(container.textContent).toContain("Select a supported field location first.");
    expect(container.textContent).toContain("No scientifically validated forecast is currently available");
    expect(container.textContent).toContain("forecast_v1.json");
  });

  it("integrates the Phase 8 bundle as a separate experimental outlook, never an operational prediction", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("predictive_evaluation")) return { ok: true, status: 200, json: async () => predictiveEvaluationFixture };
      if (path.includes("phase8_forecast_bundle")) return { ok: true, status: 200, json: async () => phase8ForecastFixture };
      return { ok: false, status: 404, json: async () => ({}) };
    }));
    const container = renderForecast();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("Soil-water outlook");
    expect(container.textContent).toContain("EXPERIMENTAL · NOT OPERATIONAL");
    expect(container.textContent).toContain("101 mm");
    expect(container.textContent).toContain("operationally_eligible = false");
    expect(container.textContent).not.toContain("2026-12 · 1 month · Experimental forecast");
  });

  it("renders only a matching validated artifact after an explicit request", async () => {
    const evaluation = adaptPredictiveEvaluation(predictiveEvaluationFixture);
    const cell = testDataset.cells.find((item) => item.latitude === -34 && item.longitude === -60) ?? testDataset.cells[0];
    const latitude = cell.latitude;
    const longitude = cell.longitude;
    const id = gridCellId({ latitude, longitude }, testDataset.resolutionDegrees);
    const sha = "a".repeat(64);
    const artifact = {
      schema_version: "forecast_v1", status: "operationally_eligible", issue_time: "2025-10-31T23:59:59Z", target_month: "2025-11", horizon_months: 1,
      scope: { id, bounds_west_south_east_north: [longitude - 0.125, latitude - 0.125, longitude + 0.125, latitude + 0.125] },
      target: "storage", model: { name: selectedPreHoldoutModel(evaluation, 1, "storage"), version: "fixture-v1" }, input_observation_cutoff: "2025-09-30T23:59:59Z",
      availability: { policy: "TEST ONLY", publication_evidence: { first_verified_access_at: "2025-10-30T12:00:00Z", asset_id: "fixture", sha256: sha }, operationally_eligible: true, input_months: [{ month: "2025-09", observation_end: "2025-09-30T23:59:59Z", provider_publication_at: "2025-10-20T00:00:00Z", available_at: "2025-10-20T00:00:00Z", availability_is_assumed: false, soil_sha256: sha, driver_sha256: sha }] },
      value: 111, units: "mm", predictive_interval: { level: 0.9, lower: 90, upper: 132, method: "TEST ONLY — synthetic interval" }, calibration: { start: "2022-01", end: "2025-09", n_months: 44, labels_available_by: "2025-10-31T23:59:59Z", metrics: {} }, quality_flags: ["TEST ONLY — SYNTHETIC"], source: { collection: "TEST ONLY", doi: "https://example.invalid/test", input_panel_sha256: sha },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({
      ok: true, status: 200, json: async () => String(input).includes("predictive_evaluation") ? predictiveEvaluationFixture : artifact,
    })));
    const container = renderForecast();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    clickButton(container, "Map select supported cell");
    clickButton(container, "Generate forecast");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("Validated forecast · Selected location");
    expect(container.textContent).toContain("111 mm");
    expect(container.textContent).toContain("90–132 mm");
    expect(container.textContent).toContain("TEST ONLY");
    expect(container.querySelector('.forecast-interval-figure svg[role="img"]')?.getAttribute("aria-label")).toContain("90 percent interval");
    expect(container.textContent).toContain("Historical same-month reference");
    expect(container.textContent).toContain("Latest included observation");
  });

  it("builds a crop-context analysis request without fabricating crop suitability", () => {
    const container = renderForecast();
    clickButton(container, "Map select supported cell");
    const crop = container.querySelector<HTMLSelectElement>("select[aria-label='Crop']")!;
    const stage = container.querySelector<HTMLSelectElement>("select[aria-label='Growth stage']")!;
    const management = container.querySelector<HTMLSelectElement>("select[aria-label='Water management']")!;
    act(() => { crop.value = "maize"; crop.dispatchEvent(new Event("change", { bubbles: true })); });
    act(() => { stage.value = "reproductive"; stage.dispatchEvent(new Event("change", { bubbles: true })); });
    act(() => { management.value = "irrigated"; management.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector(".crop-comparison-panel")).toBeNull();
    clickButton(container, "Generate forecast");
    expect(container.querySelectorAll(".crop-evidence-card")).toHaveLength(10);
    expect(container.textContent).toContain("Sunflower");
    expect(container.textContent).toContain("Yerba mate");
    expect(container.textContent).toContain("No crop suitability ranking");
    expect(container.textContent).toContain("No numeric suitability score or recommendation is produced");
    expect(container.textContent).toContain("No eligible soil-water forecast is available for this selection; historical context is separate.");
    expect(container.textContent).toContain("Maize · Flowering / reproductive · Irrigated");
    expect(container.textContent).toContain("Insufficient evidence for crop-specific interpretation");
    expect(container.textContent).toContain("No scientifically validated forecast is currently available");
  });

  it("withholds an invalid artifact and offers historical analysis separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({
      ok: true, status: 200, json: async () => String(input).includes("predictive_evaluation") ? predictiveEvaluationFixture : { schema_version: "unknown" },
    })));
    const container = renderForecast();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    clickButton(container, "Map select supported cell");
    clickButton(container, "Generate forecast");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("The forecast artifact could not be validated");
    expect(container.textContent).toContain("View historical analysis");
    expect(container.textContent).not.toContain("111 mm");
  });

  it("keeps the forecast request workflow in Spanish when selected", () => {
    localStorage.setItem("alpha-agro.language.v1", "es");
    const container = renderForecast();
    expect(container.querySelector("h1")?.textContent).toContain("Análisis del campo");
    clickButton(container, "Generar pronóstico");
    expect(container.textContent).toContain("ubicación de campo compatible");
    expect(container.textContent).toContain("frontend/public/data/forecast_v1.json");
    expect(container.querySelector<HTMLSelectElement>("select[aria-label='Cultivo']")?.value).toBe("soybean");
    expect(container.querySelector<HTMLSelectElement>("select[aria-label='Etapa del cultivo']")).not.toBeNull();
    expect(container.querySelector<HTMLSelectElement>("select[aria-label='Manejo del agua']")).not.toBeNull();
    expect(container.textContent).toContain("Comparar evidencia por cultivo");
    clickButton(container, "Map select supported cell");
    clickButton(container, "Generar pronóstico");
    expect(container.textContent).toContain("Solicitud de análisis");
    expect(container.textContent).toContain("Soja · Planificación / siembra · Desconocido");
  });

  it("relocalizes an existing validation message when the user switches language", () => {
    localStorage.setItem("alpha-agro.language.v1", "es");
    const container = renderForecast();
    clickButton(container, "Generar pronóstico");
    expect(container.textContent).toContain("Primero elegí una ubicación de campo compatible.");
    const englishButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "EN");
    expect(englishButton?.textContent).toBe("EN");
    act(() => englishButton?.click());
    expect(container.textContent).toContain("Select a supported field location first.");
  });

  it("selects a clicked supported map point and represents the selected marker in the map", () => {
    const container = renderForecast();
    clickButton(container, "Map select supported cell");
    expect(container.textContent).toContain("Selected within a grid cell with an eligible historical trend estimate.");
    expect(container.textContent).toContain("34.0000° S · 60.0000° W");
    expect(container.textContent).toContain("Map marker selected");
    expect(container.textContent).toContain("not GPS precision or satellite soil-moisture observation resolution");
    clickButton(container, "Generate forecast");
    expect(container.textContent).toContain("No scientifically validated forecast is currently available");
    clickButton(container, "Clear location");
    expect(container.textContent).not.toContain("Map marker selected");
  });

  it("accepts valid manual coordinates and rejects out-of-range or unsupported points", () => {
    const container = renderForecast();
    const latitude = container.querySelector<HTMLInputElement>("input[aria-label='Latitude']")!;
    const longitude = container.querySelector<HTMLInputElement>("input[aria-label='Longitude']")!;
    const setValue = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      act(() => {
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    setValue(latitude, "91");
    setValue(longitude, "-60");
    clickButton(container, "Use coordinates");
    expect(container.textContent).toContain("Latitude must be between");
    expect(container.textContent).not.toContain("Map marker selected");

    setValue(latitude, "0");
    setValue(longitude, "0");
    clickButton(container, "Use coordinates");
    expect(container.textContent).toContain("outside cells with eligible historical trend estimates");
    expect(container.textContent).toContain("Map marker selected");
    clickButton(container, "Generate forecast");
    expect(container.textContent).toContain("outside the validated Pampas grid cells");
    expect(container.textContent).toContain("No scientifically validated forecast is currently available");

    setValue(latitude, "-34");
    setValue(longitude, "-60");
    clickButton(container, "Use coordinates");
    expect(container.textContent).toContain("34.0000° S · 60.0000° W");
    expect(container.textContent).toContain("SELECTED · MANUAL");
  });

  it("requests browser location only after explicit button activation and reports permission denial", () => {
    let onError: ((error: GeolocationPositionError) => void) | undefined;
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: (value: GeolocationPositionError) => void, _options?: PositionOptions) => { onError = error; });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    const container = renderForecast();
    expect(getCurrentPosition).not.toHaveBeenCalled();

    clickButton(container, "Use my location");
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
    act(() => onError?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError));
    expect(container.textContent).toContain("Location permission was denied");
  });

  it.each([
    [2, "device could not determine a location"],
    [3, "request timed out"],
  ])("explains browser geolocation error code %s", (code, message) => {
    let onError: ((error: GeolocationPositionError) => void) | undefined;
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: (value: GeolocationPositionError) => void) => { onError = error; });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    const container = renderForecast();
    clickButton(container, "Use my location");
    act(() => onError?.({ code, message: "geolocation error", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError));
    expect(container.textContent).toContain(message);
  });

  it("reports browsers without geolocation and unavailable scientific coverage", () => {
    const noGeo = renderForecast();
    Reflect.deleteProperty(navigator, "geolocation");
    clickButton(noGeo, "Use my location");
    expect(noGeo.textContent).toContain("Browser geolocation is unavailable");

    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
    const missingCoverage = renderForecast(null);
    expect(missingCoverage.textContent).toContain("Validated coverage mask unavailable");
    expect(missingCoverage.textContent).toContain("A guessed boundary is not used");
  });

  it("displays positioning accuracy distinctly from grid spacing on successful GPS selection", () => {
    let onSuccess: ((position: GeolocationPosition) => void) | undefined;
    const getCurrentPosition = vi.fn((success: PositionCallback) => { onSuccess = success; });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    const container = renderForecast();
    clickButton(container, "Use my location");
    act(() => onSuccess?.({
      coords: { latitude: -34, longitude: -60, accuracy: 8 } as GeolocationCoordinates,
      timestamp: Date.now(),
    } as GeolocationPosition));
    expect(container.textContent).toContain("GPS-reported horizontal accuracy ±8 m");
    expect(container.textContent).toContain("0.25° — GLDAS grid spacing is model-grid support");
  });

  it("accepts coordinate search without geocoding locality text", () => {
    const container = renderForecast();
    const search = container.querySelector<HTMLInputElement>("#field-location-search")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => { setter?.call(search, "-34, -60"); search.dispatchEvent(new Event("input", { bubbles: true })); });
    clickButton(container, "Search");
    expect(container.textContent).toContain("34.0000° S · 60.0000° W");
    act(() => { setter?.call(search, "Marcos Paz, Buenos Aires"); search.dispatchEvent(new Event("input", { bubbles: true })); });
    clickButton(container, "Search");
    expect(container.textContent).toContain("Locality and address search are not connected");
    expect(container.textContent).toContain("34.0000° S · 60.0000° W");
  });

  it("offers crop-specific stage options and an explicit unknown irrigation state", () => {
    const container = renderForecast();
    const crop = container.querySelector<HTMLSelectElement>("select[aria-label='Crop']")!;
    act(() => { crop.value = "citrus"; crop.dispatchEvent(new Event("change", { bubbles: true })); });
    const stage = container.querySelector<HTMLSelectElement>("select[aria-label='Growth stage']")!;
    expect(Array.from(stage.options).map((option) => option.value)).toContain("fruit_development");
    expect(Array.from(stage.options).map((option) => option.value)).not.toContain("planning");
    const irrigation = container.querySelector<HTMLSelectElement>("select[aria-label='Water management']")!;
    expect(Array.from(irrigation.options).map((option) => option.value)).toContain("unknown");
  });

  it("lets farmers select comparison alternatives without producing a ranking", () => {
    const container = renderForecast();
    clickButton(container, "Map select supported cell");
    clickButton(container, "Generate forecast");
    expect(container.querySelectorAll(".crop-evidence-card")).toHaveLength(10);
    const sunflower = Array.from(container.querySelectorAll<HTMLLabelElement>(".crop-comparison-selector label")).find((label) => label.textContent?.includes("Sunflower"))?.querySelector("input");
    act(() => sunflower?.click());
    expect(container.querySelectorAll(".crop-evidence-card")).toHaveLength(9);
    expect(container.textContent).toContain("No crop suitability ranking");
    expect(container.textContent).toContain("No numeric suitability score or recommendation is produced");
  });
});
