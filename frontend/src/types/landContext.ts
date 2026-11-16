export type LandContext = {
  schema_version: "alpha_agro_land_context_v1";
  generated_at_utc: string;
  scope_note: string;
  productivity: {
    product: "MOD17A3HGF.061";
    band: "Npp_500m";
    units: "kg_C/m^2/year";
    sample_design: string;
    quality_note: string;
    api_payload_sha256: string;
    years: Array<{ year: number; mean_kg_c_m2: number | null; n_cells: number }>;
    sample_cells: Array<{ cell_id: string; latitude: number; longitude: number }>;
  };
  yield_context: {
    dataset: string;
    geography: string[];
    aggregation: string;
    campaigns: string[];
    csv_sha256: string;
    csv_url: string;
    interpretation: string;
    crops: Record<"soybean" | "maize" | "wheat", {
      annual: Array<{ campaign: string; yield_kg_ha: number; harvested_area_ha: number; province_count: number }>;
      exploratory_baseline_kg_ha: number | null;
      recent_campaign_range_kg_ha: [number, number] | null;
      baseline_campaigns: string[];
    }>;
  };
};

export type LandContextLoad = { status: "loading" } | { status: "ready"; data: LandContext } | { status: "missing"; message: string } | { status: "error"; message: string };
