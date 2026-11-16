// Synthetic contract fixture for tests only. Never shipped as application data.
export const landContextFixture = {
  schema_version: "alpha_agro_land_context_v1",
  generated_at_utc: "2026-01-01T00:00:00Z",
  scope_note: "TEST ONLY synthetic exploratory fixture.",
  productivity: {
    product: "MOD17A3HGF.061",
    band: "Npp_500m",
    units: "kg_C/m^2/year",
    scale_factor: 0.0001,
    years: [
      { year: 2023, mean_kg_c_m2: 0.61, n_cells: 5 },
      { year: 2024, mean_kg_c_m2: 0.64, n_cells: 5 },
    ],
    sample_cells: [
      { cell_id: "a", latitude: -35, longitude: -61 },
      { cell_id: "b", latitude: -36, longitude: -60 },
      { cell_id: "c", latitude: -37, longitude: -59 },
    ],
    cell_observations: [],
    sample_design: "TEST ONLY, three synthetic points.",
    quality_note: "TEST ONLY, quality flags unavailable.",
    api_payload_sha256: "a".repeat(64),
  },
  yield_context: {
    dataset: "TEST ONLY synthetic crop context",
    geography: ["TEST ONLY"],
    aggregation: "TEST ONLY",
    campaigns: ["2022/2023"],
    crops: Object.fromEntries(["soybean", "maize", "wheat"].map((crop) => [crop, {
      annual: [{ campaign: "2022/2023", yield_kg_ha: 2000, harvested_area_ha: 1000, province_count: 5 }],
      exploratory_baseline_kg_ha: 2000,
      recent_campaign_range_kg_ha: [1800, 2200],
      baseline_campaigns: ["2022/2023"],
    }])),
    csv_sha256: "b".repeat(64),
    csv_url: "https://example.invalid/test-only.csv",
    interpretation: "TEST ONLY, not a prediction.",
  },
  provenance: { trend_input_sha256: "c".repeat(64), npp_api: "https://example.invalid", yield_catalog: "https://example.invalid" },
};
