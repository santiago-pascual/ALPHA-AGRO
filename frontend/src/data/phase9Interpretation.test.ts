import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptPhase8ForecastBundle } from "./phase8Forecast";
import { adaptPhase9Interpretation, loadPhase9Interpretation, phase9ForCellMonth } from "./phase9Interpretation";

const phase8Path = resolve(process.cwd(), "public/data/phase8_forecast_bundle_v1.json");
const phase9Path = resolve(process.cwd(), "public/data/soil_moisture_interpretation_v1.json");
const hasArtifacts = existsSync(phase8Path) && existsSync(phase9Path);
afterEach(() => vi.unstubAllGlobals());

describe("Phase 9 interpretation adapter", () => {
  it.skipIf(!hasArtifacts)("decodes the real columnar tables and joins valid cell/month records to Phase 8", () => {
    const phase8Bytes = readFileSync(phase8Path);
    const phase8 = adaptPhase8ForecastBundle(JSON.parse(phase8Bytes.toString("utf8")) as unknown);
    const phase9 = adaptPhase9Interpretation(JSON.parse(readFileSync(phase9Path, "utf8")) as unknown, phase8, createHash("sha256").update(phase8Bytes).digest("hex"));
    expect(phase9.cells.size).toBe(896);
    expect(phase9.monthlyReference.size).toBe(896 * 12);
    expect(phase9.latestObserved.size).toBe(867);
    expect(phase9.forecasts.size).toBe(896 * 3);
    expect(phase9.probabilitySummary.status).toBe("unavailable");

    const sample = phase9ForCellMonth(phase9, "-35.3750,-59.6250", "2026-12");
    expect(sample.observation?.observation_month).toBe("2026-07");
    expect(sample.reference).toMatchObject({ calendar_month: 12, n_years: 20 });
    expect(sample.forecast).toMatchObject({ status: "experimental_climatological_outlook", forecast_mm: 183.85889905293786, probability_below_p20: null });
    expect(sample.forecast?.forecast_anomaly_status).toBe("zero_by_seasonal_climatology_construction");
  });

  it.skipIf(!hasArtifacts)("rejects Phase 8 checksum or cell/month join mismatches", () => {
    const bytes = readFileSync(phase8Path);
    const p8 = adaptPhase8ForecastBundle(JSON.parse(bytes.toString("utf8")) as unknown);
    const rawP9 = JSON.parse(readFileSync(phase9Path, "utf8")) as Record<string, unknown>;
    const checksum = createHash("sha256").update(bytes).digest("hex");
    expect(() => adaptPhase9Interpretation(rawP9, p8, "0".repeat(64))).toThrow("checksum");

    const changedP9 = structuredClone(rawP9);
    const context = changedP9.forecast_context as { columns: string[]; records: unknown[][] };
    const valueIndex = context.columns.indexOf("forecast_mm");
    context.records[0][valueIndex] = 999;
    expect(() => adaptPhase9Interpretation(changedP9, p8, checksum)).toThrow("cell/month value or mask");
  });

  it.skipIf(!hasArtifacts)("loads the actual Phase 9 JSON through its explicit public-data path", async () => {
    const phase8Bytes = readFileSync(phase8Path);
    const phase8 = adaptPhase8ForecastBundle(JSON.parse(phase8Bytes.toString("utf8")) as unknown);
    const phase8Sha = createHash("sha256").update(phase8Bytes).digest("hex");
    const phase9Text = readFileSync(phase9Path, "utf8");
    vi.stubGlobal("fetch", vi.fn(async (path: string) => path === "/data/phase9.json" ? new Response(phase9Text, { status: 200 }) : new Response(null, { status: 404 })));
    const loaded = await loadPhase9Interpretation(phase8, phase8Sha, "/data/phase9.json");
    expect(loaded.status).toBe("ready");
    if (loaded.status === "ready") expect(loaded.data.forecasts.size).toBe(896 * 3);
  });
});
