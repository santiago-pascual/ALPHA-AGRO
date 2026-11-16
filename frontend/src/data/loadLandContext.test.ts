import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptLandContext, loadLandContext } from "./loadLandContext";
import { landContextFixture } from "./__fixtures__/landContext.fixture";

describe("land context artifact adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts the versioned NASA productivity and public yield-context contract", () => {
    const value = adaptLandContext(structuredClone(landContextFixture));
    expect(value.productivity.years).toHaveLength(2);
    expect(value.yield_context.crops.soybean.exploratory_baseline_kg_ha).toBe(2000);
  });

  it("rejects non-finite values and missing provenance", () => {
    const nonFinite = structuredClone(landContextFixture);
    nonFinite.productivity.years[0].mean_kg_c_m2 = Number.NaN;
    expect(() => adaptLandContext(nonFinite)).toThrow(/Invalid NPP annual row/);
    const noHash = structuredClone(landContextFixture);
    noHash.yield_context.csv_sha256 = "missing";
    expect(() => adaptLandContext(noHash)).toThrow(/Yield context fields or provenance/);
  });

  it("keeps missing and invalid network artifacts explicit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ status: 404 }).mockResolvedValueOnce({ ok: true, json: async () => ({ schema_version: "unknown" }) }));
    expect(await loadLandContext("/missing.json")).toMatchObject({ status: "missing" });
    expect(await loadLandContext("/invalid.json")).toMatchObject({ status: "error" });
  });

  it.skipIf(!existsSync(resolve(process.cwd(), "public/data/agricultural_context_v1.json")))("validates the local downloaded public-source bundle when present", () => {
    const file = resolve(process.cwd(), "public/data/agricultural_context_v1.json");
    const data = adaptLandContext(JSON.parse(readFileSync(file, "utf8")) as unknown);
    expect(data.productivity.sample_cells).toHaveLength(5);
    expect(data.yield_context.crops.soybean.annual.length).toBeGreaterThan(0);
  });
});
