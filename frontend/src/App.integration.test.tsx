import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { trendAnalysisFixture } from "./data/__fixtures__/trendAnalysis.fixture";
import { SAVED_FIELDS_KEY } from "./data/fields";
import { adaptTrendAnalysis } from "./data/loadTrend";
import { gridCellId } from "./data/location";

vi.mock("./components/TrendMap", async () => {
  const React = await import("react");
  return {
    TrendMap: (props: { selectionMode?: boolean; onLocationSelect?: (point: { latitude: number; longitude: number }) => void; selectedLocation?: { latitude: number; longitude: number } | null; savedFields?: Array<{ id: string; name: string }> }) => React.createElement(
      "div",
      null,
      props.selectionMode ? React.createElement("button", { onClick: () => props.onLocationSelect?.({ latitude: -34, longitude: -60 }) }, "Select supported map cell") : null,
      props.selectedLocation ? React.createElement("output", null, "Selected location marker persists") : null,
      ...(props.savedFields ?? []).map((field) => React.createElement("output", { key: field.id }, `Saved map marker: ${field.name}`)),
    ),
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = undefined;
  }
  document.body.innerHTML = "";
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

async function openObservatory() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
  });
  const dashboardButton = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Open Observatory"),
  );
  if (!dashboardButton) throw new Error("Explore Observatory control not found.");
  await act(async () => {
    dashboardButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

describe("dashboard real-data integration", () => {
  it("presents the Alpha Agro product identity and credits its team", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<App />);
    });

    expect(container.querySelector(".landing-brand")?.getAttribute("aria-label")).toBe("Alpha Agro home");
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Alpha Agro landing navigation");
    expect(container.textContent).toContain("Alpha Agro");
    expect(container.textContent).toContain("From Earth data");
    expect(container.textContent).toContain("to agricultural insight.");
    expect(container.querySelector("#landing-title")?.textContent).toContain("Advanced Earth intelligence");
    expect(container.textContent).toContain("Marcos Paz");
    expect(container.textContent).toContain("soybean farmer in Marcos Paz");
    expect(container.textContent).toContain("did not complete secondary school");
    expect(container.textContent).toContain("does not yet offer operational forecasts");
    expect(container.textContent).toContain("The future of agriculture should not depend on the size of your farm.");
    expect(container.textContent?.toLowerCase()).toContain("quant alpha");
    expect(container.textContent).toContain("Be An Earth System Trend Detective!");
    expect(container.textContent).toContain("validated scientific artifacts only");
    expect(container.textContent).not.toContain("Fictitious demonstration values.");
    const missionCta = container.querySelector<HTMLButtonElement>(".landing-mission-cta button");
    expect(missionCta?.textContent).toContain("Open Observatory");
    await act(async () => missionCta?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector("h1")?.textContent).toContain("Earth System Observatory");
  });

  it("defaults to English and switches the primary application navigation into Spanish", async () => {
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => { root?.render(<App />); });
    expect(document.documentElement.lang).toBe("en");
    expect(container.querySelector(".landing-nav-cta")?.textContent).toContain("Open Observatory");
    const spanish = container.querySelector<HTMLButtonElement>("button[aria-label='Spanish']");
    await act(async () => { spanish?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(document.documentElement.lang).toBe("es");
    expect(container.querySelector(".landing-nav-cta")?.textContent).toContain("Abrir el Observatorio");
    expect(window.localStorage.getItem("alpha-agro.language.v1")).toBe("es");
    const openObservatory = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Abrir el Observatorio"));
    await act(async () => { openObservatory?.dispatchEvent(new MouseEvent("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelector("h1")?.textContent).toContain("Observatorio del sistema terrestre");
    expect(container.textContent).toContain("PERÍODO DE ANÁLISIS");
    expect(container.textContent).toContain("DATOS REALES NO DISPONIBLES");
  });

  it("guides visitors through the seven scientific demo steps without inventing relationships", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<App />);
    });
    const start = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Start guided demo"));
    if (!start) throw new Error("Guided demo control not found.");
    await act(async () => start.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("STEP 1 OF 7");
    for (let index = 0; index < 3; index += 1) {
      const next = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Next step"));
      if (!next) throw new Error("Next guided demo step not found.");
      await act(async () => next.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    }
    expect(container.textContent).toContain("STEP 4 OF 7");
    expect(container.textContent).toContain("no connected cross-variable result artifact");
  });

  it("renders schema fixture values, source provenance, and historical-only status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => trendAnalysisFixture,
    }));

    const container = await openObservatory();

    expect(container.querySelector("h1")?.textContent).toContain("Earth System Observatory");
    expect(container.textContent).toContain("STUDY REGION: ARGENTINE PAMPAS");
    expect(container.textContent).toContain("TEST FIXTURE");
    expect(container.textContent).toContain("REGIONAL STORAGE TREND");
    expect(container.textContent).toContain("HISTORICAL ANALYSIS · NO OPERATIONAL FORECAST");
    expect(container.textContent).toContain("mm/dec");
    expect(container.textContent).not.toContain("<small>");
    expect(container.textContent).not.toContain("Fictitious demonstration values.");

    const methodsButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("About & data sources"),
    );
    if (!methodsButton) throw new Error("About & data sources navigation control not found.");
    await act(async () => {
      methodsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Loaded validated historical analysis");
    expect(container.textContent).toContain("2 files with SHA-256 provenance");
    expect(container.textContent).toContain("TEST-FIXTURE-2006-01.nc4");
  });

  it("keeps the dashboard empty when validated JSON is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const container = await openObservatory();

    expect(container.textContent).toContain("No validated trend_analysis.json was found");
    expect(container.textContent).toContain("Scientific values remain hidden until a validated artifact is available.");
    expect(container.textContent).not.toContain("REGIONAL STORAGE TREND");
    expect(container.textContent).not.toContain("Fictitious demonstration values.");
  });

  it("navigates to the distinct Forecast workspace without exposing retrospective scores as forecasts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const container = await openObservatory();
    const forecastButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Forecast"));
    if (!forecastButton) throw new Error("Forecast navigation control not found.");
    await act(async () => forecastButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector("h1")?.textContent).toContain("Forecast availability");
    expect(container.querySelector(".forecast-results")).toBeNull();
    const generate = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Generate forecast"));
    if (!generate) throw new Error("Generate forecast action not found.");
    await act(async () => generate.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Select a supported field location first.");
    expect(container.textContent).not.toContain("999");
  });

  it("preserves a supported location while navigating between Forecast and Observatory", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => trendAnalysisFixture }));
    const container = await openObservatory();
    const forecastButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Forecast"));
    if (!forecastButton) throw new Error("Forecast navigation control not found.");
    await act(async () => forecastButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const mapSelect = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Select supported map cell"));
    if (!mapSelect) throw new Error("Forecast map selection control not found.");
    await act(async () => mapSelect.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("SELECTED · MAP");
    const observatoryButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Observatory"));
    if (!observatoryButton) throw new Error("Observatory navigation control not found.");
    await act(async () => observatoryButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Selected location marker persists");
  });

  it("restores saved fields, switches the active field, and explains shared grid support", async () => {
    const data = adaptTrendAnalysis(trendAnalysisFixture);
    const cell = data.cells[0];
    const fields = [
      { id: "field-a", name: "Campo A", latitude: cell.latitude, longitude: cell.longitude, gridCellId: gridCellId(cell), createdAt: "2026-11-15T12:00:00.000Z" },
      { id: "field-b", name: "Campo B", latitude: cell.latitude, longitude: cell.longitude, gridCellId: gridCellId(cell), createdAt: "2026-11-15T12:01:00.000Z" },
    ];
    window.localStorage.setItem(SAVED_FIELDS_KEY, JSON.stringify({ version: 1, fields, activeFieldId: "field-a" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => trendAnalysisFixture }));
    const container = await openObservatory();
    expect(container.textContent).toContain("Saved map marker: Campo A");
    const forecastButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Forecast"));
    if (!forecastButton) throw new Error("Forecast navigation control not found.");
    await act(async () => forecastButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Campo A");
    expect(container.textContent).toContain("These points share one GLDAS model grid cell");
    const second = Array.from(container.querySelectorAll(".saved-field-select")).find((button) => button.textContent?.includes("Campo B"));
    if (!second) throw new Error("Second saved field not found.");
    await act(async () => second.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(JSON.parse(window.localStorage.getItem(SAVED_FIELDS_KEY) ?? "{}").activeFieldId).toBe("field-b");
    expect(container.textContent).toContain("Saved map marker: Campo B");
  });
});
