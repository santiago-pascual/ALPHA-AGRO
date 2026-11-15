import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptPhase8ForecastBundle, loadPhase8ForecastBundle, matchPhase8Cell, resolvePhase8Metric } from "./phase8Forecast";
import { phase8ForecastFixture } from "./__fixtures__/phase8Forecast.fixture";

const localArtifactPath = resolve(process.cwd(), "public/data/phase8_forecast_bundle_v1.json");
const validBundle = () => adaptPhase8ForecastBundle(structuredClone(phase8ForecastFixture));
afterEach(() => vi.unstubAllGlobals());

describe("Phase 8 experimental forecast bundle adapter", () => {
  it("validates the complete test-only bundle, all horizons, provenance, uncertainty, and non-operational status", () => {
    const bundle = validBundle();
    expect(bundle.status).toBe("experimental");
    expect(bundle.operationally_eligible).toBe(false);
    expect(bundle.latest_available_observation_month).toBe("2026-07");
    expect(bundle.regional_forecasts.map(({ target_month }) => target_month)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(bundle.spatial_forecasts.forecasts.every(({ cells }) => cells.length === 896 && cells.filter((cell) => cell.valid).length === 867)).toBe(true);
    expect(bundle.regional_forecasts[0].predictive_interval?.level).toBe(0.9);
  });

  it("rejects unsupported schema versions, operational claims, and missing provenance", () => {
    expect(() => adaptPhase8ForecastBundle({ ...phase8ForecastFixture, schema_version: "forecast_v1" })).toThrow("phase8_forecast_bundle_v1");
    expect(() => adaptPhase8ForecastBundle({ ...phase8ForecastFixture, operationally_eligible: true })).toThrow("non-operational");
    const missingHash = structuredClone(phase8ForecastFixture);
    missingHash.source_dataset.historical_panel_sha256 = "not-a-checksum";
    expect(() => adaptPhase8ForecastBundle(missingHash)).toThrow("SHA-256");
  });

  it("rejects unsupported horizon periods, incomplete spatial records, and inconsistent regional values", () => {
    const wrongMonth = structuredClone(phase8ForecastFixture) as unknown as { regional_forecasts: Array<Record<string, unknown>> };
    wrongMonth.regional_forecasts[0].target_month = "2027-03";
    expect(() => adaptPhase8ForecastBundle(wrongMonth)).toThrow();
    const missingCells = structuredClone(phase8ForecastFixture);
    missingCells.spatial_forecasts.forecasts[0].cells.pop();
    expect(() => adaptPhase8ForecastBundle(missingCells)).toThrow("896 grid records");
    const inconsistent = structuredClone(phase8ForecastFixture);
    inconsistent.spatial_forecasts.forecasts[0].regional_spatial_weighted_mean_mm += 1;
    expect(() => adaptPhase8ForecastBundle(inconsistent)).toThrow("Regional and spatial estimates disagree");
  });

  it("retains masked cells as missing and matches only the nearest valid scientific cell", () => {
    const bundle = validBundle();
    const spatial = bundle.spatial_forecasts.forecasts[0];
    const validCell = spatial.cells[0];
    const maskedCell = spatial.cells[895];
    expect(matchPhase8Cell({ latitude: validCell.latitude, longitude: validCell.longitude }, spatial).status).toBe("matched");
    expect(matchPhase8Cell({ latitude: maskedCell.latitude, longitude: maskedCell.longitude }, spatial)).toMatchObject({ status: "masked", cell: { valid: false, value: null } });
    expect(matchPhase8Cell({ latitude: 0, longitude: 0 }, spatial).status).toBe("outside");
    expect(matchPhase8Cell(null, spatial).status).toBe("outside");
  });

  it("returns only storage for Phase 8 and never reuses millimeters as anomaly or probability", () => {
    const bundle = validBundle();
    expect(resolvePhase8Metric(bundle, 1, "regional", null, "storage")).toMatchObject({ status: "available", value: 101, units: "mm", support: "regional" });
    expect(resolvePhase8Metric(bundle, 1, "regional", null, "anomaly")).toMatchObject({ status: "unavailable" });
    expect(resolvePhase8Metric(bundle, 1, "regional", null, "low_moisture")).toMatchObject({ status: "unavailable" });
    expect(resolvePhase8Metric(bundle, 1, "spatial", null, "storage")).toMatchObject({ status: "unavailable" });
    const validCell = bundle.spatial_forecasts.forecasts[0].cells[0];
    expect(resolvePhase8Metric(bundle, 1, "spatial", { latitude: validCell.latitude, longitude: validCell.longitude }, "storage")).toMatchObject({ status: "available", units: "mm", support: "spatial" });
    expect(resolvePhase8Metric(bundle, 1, "spatial", { latitude: validCell.latitude, longitude: validCell.longitude }, "anomaly")).toMatchObject({ status: "unavailable" });
  });

  it("returns explicit missing and error states without falling back to another artifact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    expect(await loadPhase8ForecastBundle()).toMatchObject({ status: "missing" });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ schema_version: "invalid" }) })));
    expect(await loadPhase8ForecastBundle()).toMatchObject({ status: "error" });
  });

  it.skipIf(!existsSync(localArtifactPath))("validates the locally transferred NASA artifact when installed (ignored, never a committed fixture)", () => {
    const bundle = adaptPhase8ForecastBundle(JSON.parse(readFileSync(localArtifactPath, "utf8")) as unknown);
    expect(bundle.status).toBe("experimental");
    expect(bundle.operationally_eligible).toBe(false);
    expect(bundle.spatial_forecasts.eligible_cells).toBe(867);
    expect(bundle.regional_forecasts).toHaveLength(3);
  });
});
