import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { adaptTrendAnalysis } from "../src/data/loadTrend";
import { adaptPredictiveEvaluation } from "../src/data/loadPredictive";
import { adaptEnvironmentalRelationships } from "../src/data/loadRelationships";

export const approvedArtifactNames = ["trend_analysis.json", "environmental_relationships_v1.json", "predictive_evaluation_v1.json"] as const;

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes: Uint8Array, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite JSON number.");
      return value;
    });
  } catch (error) {
    throw new Error(`${label} is not valid finite JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${label} must contain a JSON object.`);
  return parsed as Record<string, unknown>;
}

function validatePublicTrend(input: Record<string, unknown>) {
  const data = adaptTrendAnalysis(input);
  if (data.start !== "2006-01-01" || data.end !== "2025-12-01" || data.months !== 240) throw new Error("Trend artifact must contain every month from January 2006 through December 2025.");
  if (data.inputFiles.length !== 240 || data.cells.length !== data.eligibleCells || data.gridCells < data.eligibleCells) throw new Error("Trend artifact must include all monthly source checksums and consistent eligible spatial cells.");
  if (!data.source.includes("GLDAS Noah v2.1")) throw new Error("Trend artifact source must identify GLDAS Noah v2.1.");
}

export function validateDriverChecksumManifest(bytes: Uint8Array, fileLabel: string) {
  const lines = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim().split(/\r?\n/);
  if (lines[0] !== "month,cmr_granule_id,method,bytes,sha256" || lines.length !== 241) throw new Error(`${fileLabel} must be the 240-month driver checksum manifest with its documented header.`);
  const months = new Set<string>();
  for (const [index, line] of lines.slice(1).entries()) {
    const columns = line.split(",");
    if (columns.length !== 5 || !/^\d{4}-\d{2}$/.test(columns[0]) || !columns[1].trim() || !columns[2].trim() || !/^\d+$/.test(columns[3]) || !/^[\da-f]{64}$/i.test(columns[4])) throw new Error(`${fileLabel} has an invalid checksum row ${index + 2}.`);
    months.add(columns[0]);
  }
  for (let year = 2006; year <= 2025; year += 1) for (let month = 1; month <= 12; month += 1) if (!months.has(`${year}-${String(month).padStart(2, "0")}`)) throw new Error(`${fileLabel} is missing a monthly input checksum.`);
  return months.size;
}

export function createRelationshipsContract(source: Record<string, unknown>, checksumManifestName: string, checksumManifestHash: string, checksumRows: number) {
  if (source.schema_version !== "1.0" || source.start !== "2006-01-01" || source.end !== "2025-12-31" || source.months !== 240 || typeof source.source !== "string" || !source.source.includes("NASA GES DISC") || !source.source.includes("10.5067/SXAVCZFAQLNO")) throw new Error("Relationship results must be schema 1.0 NASA GLDAS output for January 2006–December 2025.");
  if (checksumRows !== 240) throw new Error("Relationship source checksum manifest does not cover all 240 months.");
  const units = source.analysis_units;
  const coverage = source.minimum_joint_coverage;
  if (typeof units !== "object" || units === null || typeof coverage !== "object" || coverage === null) throw new Error("Relationship output is missing units or joint coverage.");
  if (!Array.isArray(source.associations) || source.associations.length !== 105 || !Array.isArray(source.contrasts) || source.contrasts.length !== 35) throw new Error("Relationship output must contain all 105 associations and 35 regional contrasts.");
  return {
    schema_version: "environmental_relationships_v1",
    status: "retrospective_associations",
    source_product: "NASA GES DISC · GLDAS Noah v2.1 monthly",
    source_version: "2.1",
    source_doi: "https://doi.org/10.5067/SXAVCZFAQLNO",
    response_variable: source.response,
    observation_period: { start: "2006-01-01", end: "2025-12-31", months: 240 },
    analysis_units: units,
    minimum_joint_coverage: coverage,
    distinct_joint_masks: source.distinct_joint_masks,
    input_manifest: { filename: basename(checksumManifestName), sha256: checksumManifestHash, rows: checksumRows },
    method: "Lagged associations of seasonally adjusted and detrended GLDAS variables; 12-month HAC p-values, Benjamini–Hochberg q-values across the tested associations, and pointwise 24-month circular moving-block bootstrap intervals (1,999 draws). These shared-model associations do not establish causality.",
    associations: source.associations,
    contrasts: source.contrasts,
  };
}

export type ExportPublicBundleOptions = {
  trendPath: string;
  relationshipsPath: string;
  driverManifestPath: string;
  predictivePath: string;
  outputPath: string;
  approvedForPublication?: boolean;
};

export async function exportPublicBundle(options: ExportPublicBundleOptions) {
  const output = resolve(options.outputPath);
  try { await access(output); throw new Error(`Refusing to overwrite existing release directory: ${output}`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

  const sourceReads = await Promise.allSettled([
    readFile(options.trendPath), readFile(options.relationshipsPath), readFile(options.driverManifestPath), readFile(options.predictivePath),
  ]);
  const failedRead = sourceReads.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failedRead) throw failedRead.reason;
  const [trendBytes, relationshipBytes, driverManifestBytes, predictiveBytes] = sourceReads.map((result) => (result as PromiseFulfilledResult<Buffer>).value);
  const trend = parseJson(trendBytes, options.trendPath);
  const relationshipSource = parseJson(relationshipBytes, options.relationshipsPath);
  const predictive = parseJson(predictiveBytes, options.predictivePath);
  validatePublicTrend(trend);
  const driverRows = validateDriverChecksumManifest(driverManifestBytes, options.driverManifestPath);
  const relationships = createRelationshipsContract(relationshipSource, options.driverManifestPath, sha256(driverManifestBytes), driverRows);
  const adaptedRelationships = adaptEnvironmentalRelationships(relationships);
  const adaptedEvaluation = adaptPredictiveEvaluation(predictive);
  const combinations = new Set(adaptedEvaluation.results.map((item) => `${item.scope}|${item.horizon_months}|${item.target}`));
  const expectedCombinations = ["regional", "spatial"].flatMap((scope) => [1, 2, 3].flatMap((horizon) => ["storage", "anomaly", "low_moisture"].map((target) => `${scope}|${horizon}|${target}`)));
  if (expectedCombinations.some((key) => !combinations.has(key))) throw new Error("Predictive artifact must include regional and spatial comparisons for all 1–3 month horizons and storage, anomaly, and low-moisture targets.");
  for (const result of adaptedEvaluation.results) {
    const selected = result.models.find((model) => model.selected_before_holdout);
    if (!selected || selected.uncertainty.metric_difference_interval_95 === null) throw new Error(`Predictive result ${result.scope}/${result.horizon_months}/${result.target} needs its pre-holdout selected model (baseline or candidate) and 95% score-difference interval.`);
  }
  if (adaptedRelationships.associations.length !== 105) throw new Error("Relationship artifact is incomplete.");

  const relationshipOutput = new TextEncoder().encode(`${JSON.stringify(relationships, null, 2)}\n`);
  const artifactBytes = new Map<string, Uint8Array>([
    [approvedArtifactNames[0], trendBytes],
    [approvedArtifactNames[1], relationshipOutput],
    [approvedArtifactNames[2], predictiveBytes],
  ]);
  const artifactManifest = approvedArtifactNames.map((filename) => ({ filename, bytes: artifactBytes.get(filename)!.byteLength, sha256: sha256(artifactBytes.get(filename)!), schema_version: filename === "trend_analysis.json" ? "1.0" : filename === "environmental_relationships_v1.json" ? "environmental_relationships_v1" : "predictive_evaluation_v1" }));
  const manifest = {
    schema_version: "public_data_bundle_v1",
    publication_approval: options.approvedForPublication === true ? "approved_for_public_release" : "pending_publication_approval",
    generator: "Alpha Agro frontend public bundle exporter v1",
    artifacts: artifactManifest,
    source_provenance: [
      { artifact: "trend_analysis.json", source_file: basename(options.trendPath), source_sha256: sha256(trendBytes), source_product: "NASA GES DISC · GLDAS Noah v2.1 monthly", source_doi: "https://doi.org/10.5067/SXAVCZFAQLNO", input_file_count: adaptedTrendInputCount(trend) },
      { artifact: "environmental_relationships_v1.json", source_file: basename(options.relationshipsPath), source_sha256: sha256(relationshipBytes), source_product: relationshipSource.source, driver_manifest: basename(options.driverManifestPath), driver_manifest_sha256: sha256(driverManifestBytes), monthly_input_count: driverRows },
      { artifact: "predictive_evaluation_v1.json", source_file: basename(options.predictivePath), source_sha256: sha256(predictiveBytes), source_product: adaptedEvaluation.provenance.source_product, source_version: adaptedEvaluation.provenance.source_version, input_panel_sha256: adaptedEvaluation.provenance.input_panel_sha256, source_manifest_sha256: adaptedEvaluation.provenance.source_manifest_sha256 },
    ],
  };
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);

  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  const staging = join(parent, `.alpha-agro-release-${process.pid}-${Date.now()}`);
  await mkdir(staging);
  try {
    for (const [filename, bytes] of artifactBytes) await writeFile(join(staging, filename), bytes, { flag: "wx" });
    await writeFile(join(staging, "public_data_manifest_v1.json"), manifestBytes, { flag: "wx" });
    await rename(staging, output);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return manifest;
}

function adaptedTrendInputCount(input: Record<string, unknown>) {
  const files = input.input_files;
  return Array.isArray(files) ? files.length : 0;
}

export async function prepareApprovedPublicData(bundlePath: string, publicDataPath: string) {
  const bundle = resolve(bundlePath);
  const publicData = resolve(publicDataPath);
  const manifestBytes = await readFile(join(bundle, "public_data_manifest_v1.json"));
  const manifest = parseJson(manifestBytes, "public_data_manifest_v1.json");
  if (manifest.schema_version !== "public_data_bundle_v1" || manifest.publication_approval !== "approved_for_public_release") throw new Error("Public data bundle is not approved for publication.");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== approvedArtifactNames.length) throw new Error("Public data bundle must list exactly the three approved scientific artifacts.");
  if (!Array.isArray(manifest.source_provenance) || manifest.source_provenance.length !== approvedArtifactNames.length) throw new Error("Public data bundle source provenance is incomplete.");
  const provenanceByName = new Map<string, Record<string, unknown>>();
  for (const source of manifest.source_provenance) {
    if (typeof source !== "object" || source === null) throw new Error("Invalid scientific source provenance entry.");
    const entry = source as Record<string, unknown>;
    if (typeof entry.artifact !== "string" || !approvedArtifactNames.includes(entry.artifact as typeof approvedArtifactNames[number]) || provenanceByName.has(entry.artifact)) throw new Error("Public data bundle contains an unapproved or duplicate source provenance entry.");
    if (typeof entry.source_file !== "string" || typeof entry.source_sha256 !== "string" || !/^[\da-f]{64}$/i.test(entry.source_sha256)) throw new Error(`Public data bundle has incomplete source checksum provenance for ${entry.artifact}.`);
    provenanceByName.set(entry.artifact, entry);
  }
  const trendSource = provenanceByName.get("trend_analysis.json");
  const relationshipSource = provenanceByName.get("environmental_relationships_v1.json");
  const evaluationSource = provenanceByName.get("predictive_evaluation_v1.json");
  if (!trendSource || typeof trendSource.source_product !== "string" || !trendSource.source_product.includes("NASA GES DISC") || trendSource.source_doi !== "https://doi.org/10.5067/SXAVCZFAQLNO" || trendSource.input_file_count !== 240) throw new Error("Trend source provenance must identify NASA GLDAS, DOI, and all 240 source inputs.");
  if (!relationshipSource || typeof relationshipSource.source_product !== "string" || !relationshipSource.source_product.includes("NASA GES DISC") || typeof relationshipSource.driver_manifest !== "string" || typeof relationshipSource.driver_manifest_sha256 !== "string" || !/^[\da-f]{64}$/i.test(relationshipSource.driver_manifest_sha256) || relationshipSource.monthly_input_count !== 240) throw new Error("Environmental relationship source provenance must include the 240-month driver checksum manifest.");
  if (!evaluationSource || typeof evaluationSource.source_product !== "string" || typeof evaluationSource.input_panel_sha256 !== "string" || !/^[\da-f]{64}$/i.test(evaluationSource.input_panel_sha256) || typeof evaluationSource.source_manifest_sha256 !== "string" || !/^[\da-f]{64}$/i.test(evaluationSource.source_manifest_sha256)) throw new Error("Predictive evaluation input-panel and source-manifest checksums are required.");
  const listed = new Set<string>();
  const bytesByName = new Map<string, Uint8Array>();
  for (const item of manifest.artifacts) {
    if (typeof item !== "object" || item === null) throw new Error("Invalid release artifact manifest entry.");
    const entry = item as Record<string, unknown>;
    const filename = entry.filename;
    if (typeof filename !== "string" || !approvedArtifactNames.includes(filename as typeof approvedArtifactNames[number]) || listed.has(filename)) throw new Error("Release manifest contains an unapproved or duplicate filename.");
    listed.add(filename);
    const bytes = await readFile(join(bundle, filename));
    if (sha256(bytes) !== entry.sha256 || bytes.byteLength !== entry.bytes) throw new Error(`Release artifact checksum/size mismatch: ${filename}`);
    const payload = parseJson(bytes, filename);
    if (filename === "trend_analysis.json") validatePublicTrend(payload);
    if (filename === "environmental_relationships_v1.json") adaptEnvironmentalRelationships(payload);
    if (filename === "predictive_evaluation_v1.json") adaptPredictiveEvaluation(payload);
    bytesByName.set(filename, bytes);
  }
  if (approvedArtifactNames.some((filename) => !listed.has(filename))) throw new Error("Public data bundle is missing a required scientific artifact.");

  await mkdir(publicData, { recursive: true });
  const allowed = new Set([...approvedArtifactNames, "public_data_manifest_v1.json", ".gitignore"]);
  const { readdir } = await import("node:fs/promises");
  for (const existing of await readdir(publicData)) if (!allowed.has(existing)) throw new Error(`Refusing to include unapproved file in public data directory: ${existing}`);
  const missingFiles: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const filename of approvedArtifactNames) {
    const destination = join(publicData, filename);
    try {
      const existing = await readFile(destination);
      if (sha256(existing) !== sha256(bytesByName.get(filename)!)) throw new Error(`Refusing to overwrite different existing public data: ${filename}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      missingFiles.push({ path: destination, bytes: bytesByName.get(filename)! });
    }
  }
  const manifestPath = join(publicData, "public_data_manifest_v1.json");
  try {
    const current = await readFile(manifestPath);
    if (sha256(current) !== sha256(manifestBytes)) throw new Error("Refusing to overwrite a different existing public data manifest.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    missingFiles.push({ path: manifestPath, bytes: manifestBytes });
  }
  for (const file of missingFiles) await writeFile(file.path, file.bytes, { flag: "wx" });
}
