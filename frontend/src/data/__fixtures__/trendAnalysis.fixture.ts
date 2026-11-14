import type { TrendAnalysisJson } from "../../types";

/** Schema-valid synthetic fixture for automated tests only. These are not observations. */
export const trendAnalysisFixture: TrendAnalysisJson = {
  schema_version: "1.0",
  dataset: "GLDAS Noah v2.1 monthly regional exports (TEST FIXTURE)",
  variable: "soil_water_storage_0_100_cm",
  units: "mm water equivalent (numerically equal to kg m-2)",
  months: { start: "2006-01-01", end: "2006-02-01", count: 2, cadence: "complete calendar months" },
  spatial_grid: {
    latitude_count: 1,
    longitude_count: 1,
    cell_count: 1,
    resolution_degrees: 0.25,
    area_weighting: "test fixture area weighting",
    boundary_rule: "test fixture boundary rule",
  },
  quality: {
    regional_valid_area_fraction_min: 0.9,
    regional_valid_area_fraction_mean: 0.95,
    missing_profile_fraction: 0.05,
  },
  regional_monthly_series: [
    { month: "2006-01-01", soil_water_0_100_mm: 210, valid_area_fraction: 1 },
    { month: "2006-02-01", soil_water_0_100_mm: null, valid_area_fraction: 0.9 },
  ],
  regional_monthly_anomalies: [
    { month: "2006-01-01", anomaly_mm: -3 },
    { month: "2006-02-01", anomaly_mm: null },
  ],
  regional_trend: {
    valid_months: 1,
    linear_hac_slope_per_decade: -4.2,
    linear_hac_ci95_per_decade: [-18, 9.6],
    linear_hac_p_value: 0.42,
    sen_slope_per_decade: -2.1,
    seasonal_mann_kendall_tau: -0.1,
    seasonal_mann_kendall_p_independence_assumption: 0.5,
    hac_max_lag_months: 1,
  },
  spatial_trends_on_cell_seasonal_anomalies: {
    eligible_cells: 1,
    cells: [{
      latitude: -34,
      longitude: -60,
      valid_months: 2,
      linear_hac_slope_per_decade: -4.2,
      linear_hac_ci95_per_decade: [-18, 9.6],
      linear_hac_p_value: 0.42,
      linear_hac_bh_q_value: 0.42,
      significant_after_bh: false,
    }],
  },
  input_files: [
    { filename: "TEST-FIXTURE-2006-01.nc4", sha256: "a".repeat(64) },
    { filename: "TEST-FIXTURE-2006-02.nc4", sha256: "b".repeat(64) },
  ],
  limitations: ["Synthetic test fixture only; not NASA observations."],
};
