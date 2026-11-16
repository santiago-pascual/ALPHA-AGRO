import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adaptPhase8ForecastBundle } from "../data/phase8Forecast";
import { adaptPhase9Interpretation } from "../data/phase9Interpretation";
import { Phase9ContextPanel } from "./Phase9ContextPanel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => { if (root) act(() => root?.unmount()); root = undefined; document.body.innerHTML = ""; });
const p8Path = resolve(process.cwd(), "public/data/phase8_forecast_bundle_v1.json");
const p9Path = resolve(process.cwd(), "public/data/soil_moisture_interpretation_v1.json");
const hasArtifacts = existsSync(p8Path) && existsSync(p9Path);

describe("Phase 9 farmer interpretation", () => {
  it.skipIf(!hasArtifacts)("separates the July observation from the experimental future and withholds null probability", () => {
    const bytes = readFileSync(p8Path);
    const bundle = adaptPhase8ForecastBundle(JSON.parse(bytes.toString("utf8")) as unknown);
    const data = adaptPhase9Interpretation(JSON.parse(readFileSync(p9Path, "utf8")) as unknown, bundle, createHash("sha256").update(bytes).digest("hex"));
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    act(() => root?.render(<Phase9ContextPanel state={{ status: "ready", data }} bundle={bundle} selectedLocation={{ latitude: -35.375, longitude: -59.625 }} horizon={1} language="en" formatNumber={(value, options) => new Intl.NumberFormat("en-US", options).format(value)} />));
    expect(container.textContent).toContain("OBSERVED · JULY 2026");
    expect(container.textContent).toContain("Observed anomaly");
    expect(container.textContent).toContain("Historical P20–P80 range");
    expect(container.textContent).toContain("Low-moisture probability: unavailable");
    expect(container.textContent).toContain("does not establish that future conditions will be normal");
    expect(container.textContent).not.toContain("0% probability");
  });

  it.skipIf(!hasArtifacts)("uses the artifact's Spanish interpretation metadata", () => {
    const bytes = readFileSync(p8Path);
    const bundle = adaptPhase8ForecastBundle(JSON.parse(bytes.toString("utf8")) as unknown);
    const data = adaptPhase9Interpretation(JSON.parse(readFileSync(p9Path, "utf8")) as unknown, bundle, createHash("sha256").update(bytes).digest("hex"));
    const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    act(() => root?.render(<Phase9ContextPanel state={{ status: "ready", data }} bundle={bundle} selectedLocation={{ latitude: -35.375, longitude: -59.625 }} horizon={1} language="es" formatNumber={(value, options) => new Intl.NumberFormat("es-AR", options).format(value)} />));
    expect(container.textContent).toContain("OBSERVADO · JULIO 2026");
    expect(container.textContent).toContain("Anomalía observada");
    expect(container.textContent).toContain("Probabilidad de humedad baja: no disponible");
    expect(container.textContent).toContain("La perspectiva central coincide con la normal estacional histórica; esto no demuestra que las condiciones futuras serán normales.");
  });
});
