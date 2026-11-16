import type { LandContext, LandContextLoad } from "../types/landContext";

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const digest = (value: unknown) => typeof value === "string" && /^[\da-f]{64}$/i.test(value);

export function adaptLandContext(input: unknown): LandContext {
  if (!object(input) || input.schema_version !== "alpha_agro_land_context_v1" || typeof input.generated_at_utc !== "string" || typeof input.scope_note !== "string") throw new Error("Unsupported or incomplete land context artifact.");
  const productivity = input.productivity;
  const yieldContext = input.yield_context;
  if (!object(productivity) || productivity.product !== "MOD17A3HGF.061" || productivity.band !== "Npp_500m" || productivity.units !== "kg_C/m^2/year" || !Array.isArray(productivity.years) || !Array.isArray(productivity.sample_cells) || typeof productivity.sample_design !== "string" || typeof productivity.quality_note !== "string" || !digest(productivity.api_payload_sha256)) throw new Error("MODIS NPP fields or provenance do not match the supported contract.");
  const years = productivity.years.map((raw, index) => {
    if (!object(raw) || !Number.isInteger(raw.year) || !finite(raw.n_cells) || raw.n_cells < 0 || !(raw.mean_kg_c_m2 === null || (finite(raw.mean_kg_c_m2) && raw.mean_kg_c_m2 >= 0))) throw new Error(`Invalid NPP annual row ${index}.`);
    return { year: raw.year as number, n_cells: raw.n_cells, mean_kg_c_m2: raw.mean_kg_c_m2 as number | null };
  });
  if (years.some((row, index) => index > 0 && row.year <= years[index - 1].year)) throw new Error("NPP years must be strictly increasing.");
  const cells = productivity.sample_cells.map((raw, index) => {
    if (!object(raw) || typeof raw.cell_id !== "string" || !finite(raw.latitude) || Math.abs(raw.latitude) > 90 || !finite(raw.longitude) || Math.abs(raw.longitude) > 180) throw new Error(`Invalid NPP sample cell ${index}.`);
    return { cell_id: raw.cell_id, latitude: raw.latitude, longitude: raw.longitude };
  });
  if (cells.length < 3) throw new Error("At least three spatially sampled cells are required for the NPP context.");
  if (!object(yieldContext) || !object(yieldContext.crops) || !Array.isArray(yieldContext.geography) || !Array.isArray(yieldContext.campaigns) || typeof yieldContext.dataset !== "string" || typeof yieldContext.aggregation !== "string" || typeof yieldContext.interpretation !== "string" || typeof yieldContext.csv_url !== "string" || !digest(yieldContext.csv_sha256)) throw new Error("Yield context fields or provenance are incomplete.");
  const crops = {} as LandContext["yield_context"]["crops"];
  for (const crop of ["soybean", "maize", "wheat"] as const) {
    const raw = yieldContext.crops[crop];
    if (!object(raw) || !Array.isArray(raw.annual) || !(raw.exploratory_baseline_kg_ha === null || finite(raw.exploratory_baseline_kg_ha)) || !(raw.recent_campaign_range_kg_ha === null || (Array.isArray(raw.recent_campaign_range_kg_ha) && raw.recent_campaign_range_kg_ha.length === 2 && raw.recent_campaign_range_kg_ha.every(finite))) || !Array.isArray(raw.baseline_campaigns)) throw new Error(`Invalid yield series for ${crop}.`);
    const annual = raw.annual.map((row, index) => {
      if (!object(row) || typeof row.campaign !== "string" || !finite(row.yield_kg_ha) || row.yield_kg_ha < 0 || !finite(row.harvested_area_ha) || row.harvested_area_ha <= 0 || !finite(row.province_count) || !Number.isInteger(row.province_count)) throw new Error(`Invalid ${crop} campaign ${index}.`);
      return { campaign: row.campaign, yield_kg_ha: row.yield_kg_ha, harvested_area_ha: row.harvested_area_ha, province_count: row.province_count };
    });
    crops[crop] = { annual, exploratory_baseline_kg_ha: raw.exploratory_baseline_kg_ha as number | null, recent_campaign_range_kg_ha: raw.recent_campaign_range_kg_ha as [number, number] | null, baseline_campaigns: raw.baseline_campaigns.filter((item): item is string => typeof item === "string") };
  }
  return {
    schema_version: "alpha_agro_land_context_v1", generated_at_utc: input.generated_at_utc, scope_note: input.scope_note,
    productivity: { product: "MOD17A3HGF.061", band: "Npp_500m", units: "kg_C/m^2/year", sample_design: productivity.sample_design, quality_note: productivity.quality_note, api_payload_sha256: productivity.api_payload_sha256 as string, years, sample_cells: cells },
    yield_context: { dataset: yieldContext.dataset, geography: yieldContext.geography.filter((item): item is string => typeof item === "string"), aggregation: yieldContext.aggregation, campaigns: yieldContext.campaigns.filter((item): item is string => typeof item === "string"), csv_sha256: yieldContext.csv_sha256 as string, csv_url: yieldContext.csv_url, interpretation: yieldContext.interpretation, crops },
  };
}

export async function loadLandContext(path = `${import.meta.env.BASE_URL}data/agricultural_context_v1.json`): Promise<LandContextLoad> {
  try {
    const response = await fetch(path, { headers: { Accept: "application/json" } });
    if (response.status === 404) return { status: "missing", message: "Run frontend/scripts/build_land_context.py to create the local public-data bundle." };
    if (!response.ok) return { status: "error", message: `Could not load land context (HTTP ${response.status}).` };
    return { status: "ready", data: adaptLandContext(await response.json() as unknown) };
  } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Could not validate land context." }; }
}
