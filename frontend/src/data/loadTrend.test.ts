import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adaptTrendAnalysis, loadValidatedTrend } from "./loadTrend";
import { trendAnalysisFixture } from "./__fixtures__/trendAnalysis.fixture";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("adaptTrendAnalysis", () => {
  it("adapts the version 1.0 schema while retaining missing values and provenance", () => {
    const result = adaptTrendAnalysis(trendAnalysisFixture);
    expect(result.mode).toBe("real");
    expect(result.months).toBe(2);
    expect(result.regionalTrend.ci95).toEqual([-18, 9.6]);
    expect(result.series[1].storageMm).toBeNull();
    expect(result.series[0].anomalyMm).toBe(-3);
    expect(result.cells[0].significant).toBe(false);
    expect(result.inputFiles[0].filename).toBe("TEST-FIXTURE-2006-01.nc4");
    expect(result.inputFiles[0].sha256).toHaveLength(64);
    expect(result.latitudeCount * result.longitudeCount).toBe(result.gridCells);
  });

  it("rejects unsupported schema versions", () => {
    expect(() => adaptTrendAnalysis({ ...trendAnalysisFixture, schema_version: "2.0" })).toThrow(
      "Unsupported trend analysis schema",
    );
  });

  it("rejects incomplete trend output instead of showing partial results", () => {
    expect(() => adaptTrendAnalysis({ ...trendAnalysisFixture, regional_trend: {} })).toThrow(
      "expected finite number",
    );
  });

  it("rejects invalid coverage, gaps, and absent provenance", () => {
    expect(() => adaptTrendAnalysis({
      ...trendAnalysisFixture,
      quality: { ...trendAnalysisFixture.quality, regional_valid_area_fraction_mean: 1.1 },
    })).toThrow("expected fraction");
    expect(() => adaptTrendAnalysis({
      ...trendAnalysisFixture,
      input_files: [],
    })).toThrow("input file provenance is empty");
    expect(() => adaptTrendAnalysis({
      ...trendAnalysisFixture,
      regional_monthly_series: [
        trendAnalysisFixture.regional_monthly_series[0],
        { ...trendAnalysisFixture.regional_monthly_series[1], month: "2006-03-01" },
      ],
    })).toThrow("month bounds/count");
  });
});

const localRealArtifact = resolve(process.cwd(), "public/data/trend_analysis.json");
describe("optional local real artifact", () => {
  it.skipIf(!existsSync(localRealArtifact))("passes the unchanged adapter against the local validated NASA JSON when present", () => {
    const payload = JSON.parse(readFileSync(localRealArtifact, "utf8")) as unknown;
    const dataset = adaptTrendAnalysis(payload);
    expect(dataset.mode).toBe("real");
    expect(dataset.months).toBe(dataset.series.length);
    expect(dataset.inputFiles.length).toBeGreaterThan(0);
  });
});

describe("loadValidatedTrend", () => {
  it("requests the documented public data path and adapts the JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => trendAnalysisFixture,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadValidatedTrend();

    expect(fetchMock).toHaveBeenCalledWith("/data/trend_analysis.json", {
      headers: { Accept: "application/json" },
    });
    expect(result.mode).toBe("real");
    expect(result.source).toContain("GLDAS Noah v2.1");
  });

  it("keeps a missing real file as an error without substituting demo data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(loadValidatedTrend()).rejects.toThrow("No validated trend_analysis.json was found");
  });

  it("prefixes public JSON paths with the GitHub Pages repository base", async () => {
    vi.stubEnv("BASE_URL", "/quant-alpha-agro/");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => trendAnalysisFixture });
    vi.stubGlobal("fetch", fetchMock);
    await loadValidatedTrend();
    expect(fetchMock).toHaveBeenCalledWith("/quant-alpha-agro/data/trend_analysis.json", { headers: { Accept: "application/json" } });
  });
});
