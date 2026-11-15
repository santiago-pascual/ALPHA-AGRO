import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adaptEnvironmentalRelationships, loadEnvironmentalRelationships } from "./loadRelationships";
import { environmentalRelationshipsFixture } from "./__fixtures__/environmentalRelationships.fixture";
import { createRelationshipsContract, validateDriverChecksumManifest } from "../../scripts/publicBundle";
import { createHash } from "node:crypto";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("environmental relationships adapter", () => {
  it("accepts the versioned test fixture and preserves monthly support, units, and confidence intervals", () => {
    const result = adaptEnvironmentalRelationships(environmentalRelationshipsFixture);
    expect(result.status).toBe("retrospective_associations");
    expect(result.associations).toHaveLength(105);
    expect(result.contrasts).toHaveLength(35);
    expect(result.associations[0].ci95).toEqual([0.01, 0.2]);
    expect(result.analysis_units.rainfall).toContain("TEST ONLY");
    expect(result.input_manifest.sha256).toHaveLength(64);
  });

  it("rejects incomplete rows, invalid probabilities, and bad source manifest", () => {
    expect(() => adaptEnvironmentalRelationships({ ...environmentalRelationshipsFixture, associations: environmentalRelationshipsFixture.associations.slice(1) })).toThrow("105 associations");
    const invalid = structuredClone(environmentalRelationshipsFixture);
    invalid.associations[0].p_hac = Number.NaN;
    expect(() => adaptEnvironmentalRelationships(invalid)).toThrow("finite number");
    expect(() => adaptEnvironmentalRelationships({ ...environmentalRelationshipsFixture, input_manifest: { ...environmentalRelationshipsFixture.input_manifest, sha256: "bad" } })).toThrow("240-row SHA-256");
  });

  it("adapts the repository's actual 240-month GLDAS relationship output and checksum index", async () => {
    const resultPath = resolve(process.cwd(), "../docs/GLDAS_RELATIONSHIPS_RESULTS.json");
    const checksumPath = resolve(process.cwd(), "../docs/GLDAS_DRIVER_SHA256.csv");
    const resultBytes = await readFile(resultPath);
    const checksumBytes = await readFile(checksumPath);
    const rows = validateDriverChecksumManifest(checksumBytes, checksumPath);
    const contract = createRelationshipsContract(JSON.parse(resultBytes.toString("utf8")), checksumPath, sha256(checksumBytes), rows);
    const adapted = adaptEnvironmentalRelationships(contract);
    expect(adapted.associations).toHaveLength(105);
    expect(adapted.contrasts).toHaveLength(35);
    expect(adapted.input_manifest.sha256).toBe(sha256(checksumBytes));
  });
});

describe("loadEnvironmentalRelationships", () => {
  it("requests the repository-subpath-compatible data location", async () => {
    vi.stubEnv("BASE_URL", "/quant-alpha-agro/");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => environmentalRelationshipsFixture });
    vi.stubGlobal("fetch", fetchMock);
    const data = await loadEnvironmentalRelationships();
    expect(fetchMock).toHaveBeenCalledWith("/quant-alpha-agro/data/environmental_relationships_v1.json", { headers: { Accept: "application/json" } });
    expect(data.associations).toHaveLength(105);
  });

  it("does not substitute another dataset when the artifact is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(loadEnvironmentalRelationships()).rejects.toThrow("No approved environmental_relationships_v1.json is available");
  });
});
