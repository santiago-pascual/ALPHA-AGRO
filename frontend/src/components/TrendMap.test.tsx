import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mapMock = vi.hoisted(() => ({ handlers: null as null | { click?: (event: { latlng: { lat: number; lng: number } }) => void }, flyTo: vi.fn(), getZoom: vi.fn(() => 4) }));
vi.mock("react-leaflet", async () => {
  const React = await import("react");
  return {
  useMap: () => ({ flyTo: mapMock.flyTo, getZoom: mapMock.getZoom }),
  useMapEvents: (handlers: typeof mapMock.handlers) => { mapMock.handlers = handlers; return null; },
  Circle: () => null,
  MapContainer: (props: { children?: React.ReactNode; className?: string; center?: unknown; zoom?: number }) => React.createElement("div", { className: props.className, "data-testid": "leaflet-map", "data-center": JSON.stringify(props.center), "data-zoom": props.zoom }, props.children),
  Marker: () => null,
  Popup: () => null,
  Rectangle: () => React.createElement("i", { "data-testid": "trend-cell" }),
  ScaleControl: () => null,
  TileLayer: (props: { url?: string; attribution?: string }) => React.createElement("i", { "data-testid": "tile-layer", "data-url": props.url, "data-attribution": props.attribution }),
  Tooltip: () => null,
  };
});
vi.mock("leaflet", () => ({ divIcon: () => ({}) }));

import { FIELD_SELECTION_GRID_DEFAULT_VISIBLE, MapClickHandler, SelectedLocationMapSync, TrendMap } from "./TrendMap";
import { trendAnalysisFixture } from "../data/__fixtures__/trendAnalysis.fixture";
import { adaptTrendAnalysis } from "../data/loadTrend";
import { I18nProvider } from "../i18n";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  mapMock.handlers = null;
  mapMock.flyTo.mockClear();
  mapMock.getZoom.mockClear();
  document.body.innerHTML = "";
});

describe("Leaflet location click handler", () => {
  it("converts Leaflet click events to latitude/longitude without changing coordinate order", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onSelect = vi.fn();
    root = createRoot(container);
    act(() => root?.render(<MapClickHandler onSelect={onSelect} />));
    act(() => mapMock.handlers?.click?.({ latlng: { lat: -34.25, lng: -60.5 } }));
    expect(onSelect).toHaveBeenCalledWith({ latitude: -34.25, longitude: -60.5 });
  });

  it("does not request a selection callback when selection is not enabled", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<MapClickHandler />));
    expect(() => mapMock.handlers?.click?.({ latlng: { lat: -34, lng: -60 } })).not.toThrow();
  });
});

describe("farmer field map layers", () => {
  it("starts with the scientific grid hidden and keeps the road basemap available across Argentina", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const dataset = adaptTrendAnalysis(trendAnalysisFixture);
    act(() => root?.render(<I18nProvider><TrendMap dataset={dataset} region="all" onRegionChange={() => undefined} selectionMode /></I18nProvider>));

    expect(FIELD_SELECTION_GRID_DEFAULT_VISIBLE).toBe(false);
    expect(container.querySelectorAll('[data-testid="trend-cell"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="tile-layer"]')?.getAttribute("data-url")).toContain("tile.openstreetmap.org");
    expect(container.querySelector('[data-testid="tile-layer"]')?.getAttribute("data-attribution")).toContain("OpenStreetMap");
    expect(container.querySelector(".field-selection-map")).not.toBeNull();
    expect(container.textContent).toContain("Satellite imagery is unavailable");
  });

  it("shows cell overlays only when the advanced grid control is enabled", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const dataset = adaptTrendAnalysis(trendAnalysisFixture);
    act(() => root?.render(<I18nProvider><TrendMap dataset={dataset} region="all" onRegionChange={() => undefined} selectionMode /></I18nProvider>));
    const grid = container.querySelector<HTMLInputElement>(".scientific-grid-toggle input");
    expect(grid?.checked).toBe(false);
    act(() => grid?.click());
    expect(container.querySelectorAll('[data-testid="trend-cell"]')).toHaveLength(dataset.cells.length);
  });

  it("recenters on manually searched and saved locations without changing map-picked zoom", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<I18nProvider><SelectedLocationMapSync enabled location={{ latitude: -31.4, longitude: -64.2, source: "manual", accuracyMeters: null }} /></I18nProvider>));
    expect(mapMock.flyTo).toHaveBeenCalledWith([-31.4, -64.2], 8, { animate: false });
    act(() => root?.render(<I18nProvider><SelectedLocationMapSync enabled location={{ latitude: -32, longitude: -63, source: "map", accuracyMeters: null }} /></I18nProvider>));
    expect(mapMock.flyTo).toHaveBeenCalledTimes(1);
  });
});
