import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const mapMock = vi.hoisted(() => ({ handlers: null as null | { click?: (event: { latlng: { lat: number; lng: number } }) => void } }));
vi.mock("react-leaflet", () => ({
  useMapEvents: (handlers: typeof mapMock.handlers) => { mapMock.handlers = handlers; return null; },
  Circle: () => null,
  MapContainer: () => null,
  Marker: () => null,
  Popup: () => null,
  Rectangle: () => null,
  ScaleControl: () => null,
  TileLayer: () => null,
  Tooltip: () => null,
}));
vi.mock("leaflet", () => ({ divIcon: () => ({}) }));

import { MapClickHandler } from "./TrendMap";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  mapMock.handlers = null;
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
