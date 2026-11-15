import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { readSpatialHindcast, SpatialHindcast } from "./SpatialHindcast";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("rejects operational or incomplete spatial inputs", () => {
  expect(() => readSpatialHindcast({ operationally_eligible: true })).toThrow("retrospective");
  expect(() => readSpatialHindcast(null)).toThrow("Unexpected");
});

it("shows an explicit missing-data state with no forecast estimates", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<I18nProvider><SpatialHindcast /></I18nProvider>); });
    expect(host.textContent).toContain("Historical Spatial Hindcast");
    expect(host.textContent).toContain("No validated spatial hindcast is available");
    expect(host.querySelector(".phase7-map")).toBeNull();
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
