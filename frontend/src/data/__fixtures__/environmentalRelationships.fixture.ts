// TEST ONLY — synthetic values. Never import this fixture from application runtime code.
const variables = ["rainfall", "evapotranspiration", "air_temperature", "surface_runoff", "subsurface_runoff"] as const;
const regions = ["full", "north", "south"] as const;

export const environmentalRelationshipsFixture = {
  schema_version: "environmental_relationships_v1",
  status: "retrospective_associations",
  source_product: "TEST ONLY — NASA GLDAS fixture",
  source_version: "TEST ONLY",
  source_doi: "https://doi.org/10.5067/SXAVCZFAQLNO",
  response_variable: "TEST ONLY — synthetic 0–100 cm soil-water response",
  observation_period: { start: "2006-01-01", end: "2025-12-31", months: 240 },
  analysis_units: {
    rainfall: "TEST ONLY mm/month",
    evapotranspiration: "TEST ONLY mm/month",
    air_temperature: "TEST ONLY degC",
    surface_runoff: "TEST ONLY mm/month",
    subsurface_runoff: "TEST ONLY mm/month",
  },
  minimum_joint_coverage: { full: 0.9, north: 0.9, south: 0.9 },
  distinct_joint_masks: 1,
  input_manifest: { filename: "TEST ONLY checksum manifest", sha256: "a".repeat(64), rows: 240 },
  method: "TEST ONLY — deterministic values for adapter tests; not observations or study results.",
  associations: variables.flatMap((variable) => regions.flatMap((region) => Array.from({ length: 7 }, (_, lag) => ({
    variable,
    region,
    lag,
    n: 240 - lag,
    r: 0.1,
    ci95: [0.01, 0.2],
    p_hac: 0.5,
    q_hac: 0.7,
  })))),
  contrasts: variables.flatMap((variable) => Array.from({ length: 7 }, (_, lag) => ({
    variable,
    lag,
    n: 240 - lag,
    north_minus_south_r: 0.01,
    ci95: [-0.1, 0.1],
  }))),
};
