import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { trendAnalysisFixture } from "./data/__fixtures__/trendAnalysis.fixture";

vi.mock("./components/TrendMap", async () => {
  const React = await import("react");
  return {
    TrendMap: (props: { selectionMode?: boolean; onLocationSelect?: (point: { latitude: number; longitude: number }) => void; selectedLocation?: { latitude: number; longitude: number } | null }) => React.createElement(
      "div",
      null,
      props.selectionMode ? React.createElement("button", { onClick: () => props.onLocationSelect?.({ latitude: -34, longitude: -60 }) }, "Select supported map cell") : null,
      props.selectedLocation ? React.createElement("output", null, "Selected location marker persists") : null,
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
    button.textContent?.includes("Explore Observatory"),
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
    expect(container.textContent?.toLowerCase()).toContain("quant alpha");
    expect(container.textContent).toContain("Be An Earth System Trend Detective!");
    expect(container.textContent).toContain("validated scientific artifacts only");
    expect(container.textContent).not.toContain("Fictitious demonstration values.");
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
    expect(container.textContent).toContain("NOT OPERATIONALLY ELIGIBLE");
    expect(container.textContent).toContain("not current forecasts");
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
});
