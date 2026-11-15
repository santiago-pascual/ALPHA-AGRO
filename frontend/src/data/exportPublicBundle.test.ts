import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportPublicBundle, prepareApprovedPublicData } from "../../scripts/publicBundle";
import { trendAnalysisFixture } from "./__fixtures__/trendAnalysis.fixture";
import { environmentalRelationshipsFixture } from "./__fixtures__/environmentalRelationships.fixture";
import { predictiveEvaluationFixture } from "./__fixtures__/predictiveEvaluation.fixture";

const temporaryDirectories: string[] = [];
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const monthStart = (index: number) => {
  const date = new Date(Date.UTC(2006, index, 1));
  return date.toISOString().slice(0, 10);
};

async function fixtureDirectory() {
  const root = await mkdtemp(join(tmpdir(), "alpha-agro-public-bundle-test-"));
  temporaryDirectories.push(root);
  const inputs = join(root, "inputs");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(inputs));

  const trend = structuredClone(trendAnalysisFixture);
  trend.dataset = "TEST ONLY — NASA GLDAS Noah v2.1 fixture";
  trend.months = { start: "2006-01-01", end: "2025-12-01", count: 240, cadence: "complete calendar months" };
  trend.quality = { regional_valid_area_fraction_min: 0.9, regional_valid_area_fraction_mean: 0.95, missing_profile_fraction: 0.05 };
  trend.regional_monthly_series = Array.from({ length: 240 }, (_, index) => ({ month: monthStart(index), soil_water_0_100_mm: 200 + (index % 12), valid_area_fraction: 0.95 }));
  trend.regional_monthly_anomalies = Array.from({ length: 240 }, (_, index) => ({ month: monthStart(index), anomaly_mm: (index % 12) - 6 }));
  trend.spatial_trends_on_cell_seasonal_anomalies.cells[0].valid_months = 240;
  trend.input_files = Array.from({ length: 240 }, (_, index) => ({ filename: `TEST-ONLY-${monthStart(index).slice(0, 7)}.nc4`, sha256: hash(`test input ${index}`) }));

  const relationships = {
    schema_version: "1.0",
    source: "TEST ONLY — NASA GES DISC · GLDAS Noah v2.1 monthly · DOI 10.5067/SXAVCZFAQLNO",
    response: "TEST ONLY — synthetic 0–100 cm soil water",
    start: "2006-01-01",
    end: "2025-12-31",
    months: 240,
    analysis_units: Object.fromEntries(Object.entries(environmentalRelationshipsFixture.analysis_units).map(([key, value]) => [key, value])),
    minimum_joint_coverage: { full: 0.9, north: 0.9, south: 0.9 },
    distinct_joint_masks: 1,
    associations: environmentalRelationshipsFixture.associations.map((row) => ({ ...row })),
    contrasts: environmentalRelationshipsFixture.contrasts.map((row) => ({ ...row })),
  };
  const predictive = structuredClone(predictiveEvaluationFixture) as unknown as { provenance: { source_product: string }; results: Record<string, unknown>[] };
  predictive.provenance.source_product = "TEST ONLY — synthetic GLDAS evaluation";
  predictive.results = [];
  for (const scope of ["regional", "spatial"] as const) {
    for (const horizon of [1, 2, 3] as const) {
      for (const target of ["storage", "anomaly", "low_moisture"] as const) {
        const template = structuredClone(predictiveEvaluationFixture.results.find((row) => row.scope === scope && row.target === (target === "anomaly" ? "storage" : target))!) as unknown as Record<string, unknown>;
        template.horizon_months = horizon;
        template.target = target;
        const targetDefinition = template.target_definition as Record<string, unknown>;
        targetDefinition.method = "TEST ONLY — synthetic fixture";
        targetDefinition.units = target === "low_moisture" ? "TEST ONLY dimensionless" : "TEST ONLY mm";
        predictive.results.push(template);
      }
    }
  }
  const inputsData: Record<string, string> = {
    "trend_analysis.json": JSON.stringify(trend),
    "relationships.json": JSON.stringify(relationships),
    "predictive.json": JSON.stringify(predictive),
    "driver_checksums.csv": ["month,cmr_granule_id,method,bytes,sha256", ...Array.from({ length: 240 }, (_, index) => `${monthStart(index).slice(0, 7)},TEST-${index},fixture,1,${hash(`driver ${index}`)}`)].join("\n") + "\n",
  };
  for (const [filename, content] of Object.entries(inputsData)) await writeFile(join(inputs, filename), content);
  return { root, inputs };
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("public release bundle exporter", () => {
  it("creates a checksummed, pending-by-default bundle and will not stage it publicly", async () => {
    const { root, inputs } = await fixtureDirectory();
    const output = join(root, "release-data");
    const manifest = await exportPublicBundle({
      trendPath: join(inputs, "trend_analysis.json"),
      relationshipsPath: join(inputs, "relationships.json"),
      driverManifestPath: join(inputs, "driver_checksums.csv"),
      predictivePath: join(inputs, "predictive.json"),
      outputPath: output,
    });
    expect(manifest.publication_approval).toBe("pending_publication_approval");
    expect(manifest.artifacts).toHaveLength(3);
    await expect(prepareApprovedPublicData(output, join(root, "public", "data"))).rejects.toThrow("not approved for publication");
    expect(await readdir(output)).toContain("environmental_relationships_v1.json");
    const relationshipOutput = JSON.parse(await readFile(join(output, "environmental_relationships_v1.json"), "utf8"));
    expect(relationshipOutput.associations).toHaveLength(105);
    expect(relationshipOutput.input_manifest.rows).toBe(240);
  });

  it("stages only approved artifacts and refuses to overwrite different data", async () => {
    const { root, inputs } = await fixtureDirectory();
    const output = join(root, "approved-release");
    await exportPublicBundle({ trendPath: join(inputs, "trend_analysis.json"), relationshipsPath: join(inputs, "relationships.json"), driverManifestPath: join(inputs, "driver_checksums.csv"), predictivePath: join(inputs, "predictive.json"), outputPath: output, approvedForPublication: true });
    const publicData = join(root, "public", "data");
    await prepareApprovedPublicData(output, publicData);
    expect((await readdir(publicData)).sort()).toEqual(["environmental_relationships_v1.json", "predictive_evaluation_v1.json", "public_data_manifest_v1.json", "trend_analysis.json"]);
    await writeFile(join(publicData, "predictive_evaluation_v1.json"), "different");
    await expect(prepareApprovedPublicData(output, publicData)).rejects.toThrow("Refusing to overwrite different existing public data");
  });

  it("requires the complete schema-valid dataset and leaves no bundle when validation fails", async () => {
    const { root, inputs } = await fixtureDirectory();
    const output = join(root, "incomplete-release");
    await expect(exportPublicBundle({ trendPath: join(inputs, "trend_analysis.json"), relationshipsPath: join(inputs, "relationships.json"), driverManifestPath: join(inputs, "driver_checksums.csv"), predictivePath: join(inputs, "missing.json"), outputPath: output })).rejects.toThrow();
    await expect(readdir(output)).rejects.toThrow();
  });
});
