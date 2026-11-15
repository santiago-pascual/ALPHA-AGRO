import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptTrendAnalysis } from "../data/loadTrend";
import { trendAnalysisFixture } from "../data/__fixtures__/trendAnalysis.fixture";
import type { SelectedLocation } from "../data/location";
import type { DashboardDataset } from "../types";
import { ForecastPage } from "./ForecastPage";

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
});

const testDataset = adaptTrendAnalysis(trendAnalysisFixture);
function TestForecastPage({ dataset = testDataset }: { dataset?: DashboardDataset | null }) {
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  return <ForecastPage dataset={dataset} selectedLocation={selectedLocation} onLocationChange={setSelectedLocation} />;
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
  if (!button) throw new Error(`Button not found: ${name}`);
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("ForecastPage location selection", () => {
  it("keeps forecasts gated while allowing horizon and target selection", () => {
    const container = renderForecast();
    expect(container.textContent).toContain("Forecast result withheld");
    expect(container.textContent).toContain("frontend/public/data/forecast_v1.json");
    expect(container.textContent).toContain("Argentine Pampas");
    expect(container.textContent).toContain("14- and 28-day water outlook");
    expect(container.textContent).toContain("1-, 2- and 3-month outlook");
    expect(container.textContent).toContain("selected in all 18 configurations");
    expect(container.textContent).toContain("does not meet the history requirement");
    expect(container.textContent).not.toContain("predicted value");
    const horizon = container.querySelector<HTMLSelectElement>("select[aria-label='Forecast horizon']");
    expect(horizon?.disabled).toBe(false);
    expect(Array.from(horizon?.options ?? []).map((option) => option.textContent)).toEqual([
      "1 month ahead", "2 months ahead", "3 months ahead",
    ]);
    expect(container.querySelector<HTMLSelectElement>("select[aria-label='Forecast target']")?.disabled).toBe(false);
    act(() => {
      if (horizon) { horizon.value = "3"; horizon.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    expect(horizon?.value).toBe("3");
    expect(container.textContent).toContain("Forecast result withheld");
  });

  it("selects a clicked supported map point and represents the selected marker in the map", () => {
    const container = renderForecast();
    clickButton(container, "Map select supported cell");
    expect(container.textContent).toContain("Selected within a grid cell with an eligible historical trend estimate.");
    expect(container.textContent).toContain("34.0000° S · 60.0000° W");
    expect(container.textContent).toContain("Historical GLDAS trend for the selected grid cell");
    expect(container.textContent).toContain("does not measure current field conditions");
    expect(container.textContent).toContain("Map marker selected");
    expect(container.textContent).toContain("GPS precision or a satellite soil-moisture observation resolution");
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
    expect(container.textContent).not.toContain("Map marker selected");

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
    expect(container.textContent).toContain("0.25° grid spacing is model-grid support");
  });
});
