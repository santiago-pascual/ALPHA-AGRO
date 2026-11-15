import type {
  EnvironmentalAssociation,
  EnvironmentalContrast,
  EnvironmentalRelationships,
  EnvironmentalVariable,
  RelationshipRegion,
} from "../types/relationships";

const variables: EnvironmentalVariable[] = ["rainfall", "evapotranspiration", "air_temperature", "surface_runoff", "subsurface_runoff"];
const regions: RelationshipRegion[] = ["full", "north", "south"];
const units: EnvironmentalVariable[] = variables;

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Invalid environmental relationships: expected object at ${path}.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid environmental relationships: expected text at ${path}.`);
  return value;
}
function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid environmental relationships: expected finite number at ${path}.`);
  return value;
}
function bounded(value: unknown, min: number, max: number, path: string): number {
  const parsed = finite(value, path);
  if (parsed < min || parsed > max) throw new Error(`Invalid environmental relationships: expected value in [${min}, ${max}] at ${path}.`);
  return parsed;
}
function interval(value: unknown, min: number, max: number, path: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`Invalid environmental relationships: expected 95% interval at ${path}.`);
  const left = bounded(value[0], min, max, `${path}[0]`);
  const right = bounded(value[1], min, max, `${path}[1]`);
  if (left > right) throw new Error(`Invalid environmental relationships: interval bounds reversed at ${path}.`);
  return [left, right];
}
function association(value: unknown, index: number): EnvironmentalAssociation {
  const path = `associations[${index}]`;
  const row = object(value, path);
  if (!variables.includes(row.variable as EnvironmentalVariable) || !regions.includes(row.region as RelationshipRegion)) throw new Error(`Invalid environmental relationships: unsupported variable or region at ${path}.`);
  const lag = finite(row.lag, `${path}.lag`);
  const n = finite(row.n, `${path}.n`);
  if (!Number.isInteger(lag) || lag < 0 || lag > 6 || n !== 240 - lag) throw new Error(`Invalid environmental relationships: invalid lag/sample count at ${path}.`);
  return {
    variable: row.variable as EnvironmentalVariable,
    region: row.region as RelationshipRegion,
    lag,
    n,
    r: bounded(row.r, -1, 1, `${path}.r`),
    ci95: interval(row.ci95, -1, 1, `${path}.ci95`),
    p_hac: bounded(row.p_hac, 0, 1, `${path}.p_hac`),
    q_hac: bounded(row.q_hac, 0, 1, `${path}.q_hac`),
  };
}
function contrast(value: unknown, index: number): EnvironmentalContrast {
  const path = `contrasts[${index}]`;
  const row = object(value, path);
  if (!variables.includes(row.variable as EnvironmentalVariable)) throw new Error(`Invalid environmental relationships: unsupported variable at ${path}.`);
  const lag = finite(row.lag, `${path}.lag`);
  const n = finite(row.n, `${path}.n`);
  if (!Number.isInteger(lag) || lag < 0 || lag > 6 || n !== 240 - lag) throw new Error(`Invalid environmental relationships: invalid lag/sample count at ${path}.`);
  return { variable: row.variable as EnvironmentalVariable, lag, n, north_minus_south_r: bounded(row.north_minus_south_r, -2, 2, `${path}.north_minus_south_r`), ci95: interval(row.ci95, -2, 2, `${path}.ci95`) };
}

export function adaptEnvironmentalRelationships(input: unknown): EnvironmentalRelationships {
  const root = object(input, "root");
  if (root.schema_version !== "environmental_relationships_v1" || root.status !== "retrospective_associations") throw new Error("Unsupported environmental relationships schema or status.");
  const period = object(root.observation_period, "observation_period");
  if (period.start !== "2006-01-01" || period.end !== "2025-12-31" || period.months !== 240) throw new Error("Invalid environmental relationships: expected continuous January 2006–December 2025 period.");
  const sourceProduct = text(root.source_product, "source_product");
  const sourceVersion = text(root.source_version, "source_version");
  const sourceDoi = text(root.source_doi, "source_doi");
  if (!sourceProduct.includes("NASA") || !sourceDoi.includes("10.5067/SXAVCZFAQLNO")) throw new Error("Invalid environmental relationships: NASA GLDAS source provenance is required.");
  const coverage = object(root.minimum_joint_coverage, "minimum_joint_coverage") as Record<RelationshipRegion, unknown>;
  const parsedCoverage = Object.fromEntries(regions.map((region) => [region, bounded(coverage[region], 0, 1, `minimum_joint_coverage.${region}`)])) as Record<RelationshipRegion, number>;
  const unitsObject = object(root.analysis_units, "analysis_units");
  const parsedUnits = Object.fromEntries(units.map((name) => [name, text(unitsObject[name], `analysis_units.${name}`)])) as Record<EnvironmentalVariable, string>;
  const manifest = object(root.input_manifest, "input_manifest");
  const rows = finite(manifest.rows, "input_manifest.rows");
  if (rows !== 240 || typeof manifest.sha256 !== "string" || !/^[\da-f]{64}$/i.test(manifest.sha256)) throw new Error("Invalid environmental relationships: 240-row SHA-256 input manifest is required.");
  const associationsRaw = root.associations;
  const contrastsRaw = root.contrasts;
  if (!Array.isArray(associationsRaw) || !Array.isArray(contrastsRaw)) throw new Error("Invalid environmental relationships: associations and contrasts are required.");
  const associations = associationsRaw.map(association);
  const contrasts = contrastsRaw.map(contrast);
  if (associations.length !== 105 || contrasts.length !== 35) throw new Error("Invalid environmental relationships: expected all 105 associations and 35 regional contrasts.");
  const keys = associations.map((row) => `${row.variable}|${row.region}|${row.lag}`);
  if (new Set(keys).size !== 105) throw new Error("Invalid environmental relationships: duplicate or incomplete association coverage.");
  const contrastKeys = contrasts.map((row) => `${row.variable}|${row.lag}`);
  if (new Set(contrastKeys).size !== 35) throw new Error("Invalid environmental relationships: duplicate or incomplete contrast coverage.");
  const maskCount = finite(root.distinct_joint_masks, "distinct_joint_masks");
  if (!Number.isInteger(maskCount) || maskCount < 1) throw new Error("Invalid environmental relationships: invalid joint mask count.");
  return {
    schema_version: "environmental_relationships_v1",
    status: "retrospective_associations",
    source_product: sourceProduct,
    source_version: sourceVersion,
    source_doi: sourceDoi,
    response_variable: text(root.response_variable, "response_variable"),
    observation_period: { start: "2006-01-01", end: "2025-12-31", months: 240 },
    analysis_units: parsedUnits,
    minimum_joint_coverage: parsedCoverage,
    distinct_joint_masks: maskCount,
    input_manifest: { filename: text(manifest.filename, "input_manifest.filename"), sha256: manifest.sha256, rows },
    method: text(root.method, "method"),
    associations,
    contrasts,
  };
}

export async function loadEnvironmentalRelationships(path = `${import.meta.env.BASE_URL}data/environmental_relationships_v1.json`) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 404 ? "No approved environmental_relationships_v1.json is available. Relationship results are not included." : `Could not load environmental relationships (HTTP ${response.status}).`);
  return adaptEnvironmentalRelationships(await response.json() as unknown);
}
