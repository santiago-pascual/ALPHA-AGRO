import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { trendAnalysisFixture } from "./data/__fixtures__/trendAnalysis.fixture";

vi.mock("./components/TrendMap", () => ({ TrendMap: () => null }));

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

async function openRealDataMode() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<App />);
  });
  const realDataButton = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("REAL DATA"),
  );
  if (!realDataButton) throw new Error("REAL DATA control not found.");
  await act(async () => {
    realDataButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return container;
}

describe("dashboard real-data integration", () => {
  it("renders schema fixture values, source provenance, and historical-only status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => trendAnalysisFixture,
    }));

    const container = await openRealDataMode();

    expect(container.textContent).toContain("TEST FIXTURE");
    expect(container.textContent).toContain("REGIONAL STORAGE TREND");
    expect(container.textContent).toContain("HISTORICAL ANALYSIS · NO OPERATIONAL FORECAST");
    expect(container.textContent).toContain("mm/dec");
    expect(container.textContent).not.toContain("<small>");
    expect(container.textContent).not.toContain("Fictitious demonstration values.");

    const methodsButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Methods & data"),
    );
    if (!methodsButton) throw new Error("Methods & data navigation control not found.");
    await act(async () => {
      methodsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("Loaded validated historical analysis");
    expect(container.textContent).toContain("2 files with SHA-256 provenance");
    expect(container.textContent).toContain("TEST-FIXTURE-2006-01.nc4");
  });

  it("keeps the dashboard empty when validated JSON is absent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const container = await openRealDataMode();

    expect(container.textContent).toContain("No validated trend_analysis.json was found");
    expect(container.textContent).toContain("DEMO values are hidden");
    expect(container.textContent).not.toContain("Fictitious demonstration values.");
  });
});
