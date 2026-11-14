import { describe, expect, it } from "vitest";
import { adaptTrendAnalysis } from "./loadTrend";

const payload = {
  schema_version: "1.0",
  dataset: "GLDAS Noah v2.1 monthly regional exports",
  variable: "soil_water_storage_0_100_cm",
  units: "mm water equivalent",
  months: { start: "2006-01-01", end: "2006-02-01", count: 2, cadence: "complete calendar months" },
  spatial_grid: { latitude_count: 1, longitude_count: 1, cell_count: 1, resolution_degrees: 0.25 },
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
    valid_months: 2,
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
  limitations: ["Test fixture only"],
};

describe("adaptTrendAnalysis", () => {
  it("adapts the version 1.0 schema while retaining missing values", () => {
    const result = adaptTrendAnalysis(payload);
    expect(result.mode).toBe("real");
    expect(result.months).toBe(2);
    expect(result.regionalTrend.ci95).toEqual([-18, 9.6]);
    expect(result.series[1].storageMm).toBeNull();
    expect(result.series[0].anomalyMm).toBe(-3);
    expect(result.cells[0].significant).toBe(false);
  });

  it("rejects unsupported schema versions", () => {
    expect(() => adaptTrendAnalysis({ ...payload, schema_version: "2.0" })).toThrow(
      "Unsupported trend analysis schema",
    );
  });

  it("rejects incomplete trend output instead of showing partial results", () => {
    expect(() => adaptTrendAnalysis({ ...payload, regional_trend: {} })).toThrow(
      "expected finite number",
    );
  });
});
