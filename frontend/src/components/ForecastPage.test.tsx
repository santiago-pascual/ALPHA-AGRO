import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ForecastPage } from "./ForecastPage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

describe("ForecastPage", () => {
  it("keeps unsupported prospective outputs unavailable and exposes only monthly horizon options", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<ForecastPage />));

    expect(container.textContent).toContain("NOT OPERATIONALLY ELIGIBLE");
    expect(container.textContent).toContain("No prospective result is connected");
    expect(container.textContent).toContain("frontend/public/data/forecast_v1.json");
    expect(container.textContent).toContain("Argentine Pampas");
    expect(container.textContent).not.toContain("predicted value");
    const horizon = container.querySelector<HTMLSelectElement>("select[aria-label='Forecast horizon']");
    expect(horizon?.disabled).toBe(true);
    expect(Array.from(horizon?.options ?? []).map((option) => option.textContent)).toEqual([
      "1 month ahead", "2 months ahead", "3 months ahead",
    ]);
    expect(container.querySelector<HTMLSelectElement>("select[aria-label='Forecast target']")?.disabled).toBe(true);
  });
});
