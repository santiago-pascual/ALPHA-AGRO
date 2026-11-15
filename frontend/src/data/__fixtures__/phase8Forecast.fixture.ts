/** TEST ONLY: wholly synthetic structure and numbers for deterministic adapter/UI tests. Never used by the app. */
const hash = "a".repeat(64);
const targetMonths = ["2026-12", "2027-01", "2027-02"] as const;
const targetStarts = ["2026-12-01", "2027-01-01", "2027-02-01"] as const;
const targetEnds = ["2027-01-01", "2027-02-01", "2027-03-01"] as const;
const horizons = [1, 2, 3] as const;
const issue = "2026-11-15T21:34:16.541853Z";
const issueCutoff = "2026-08-01T00:00:00Z";
const inputMonths = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 7 + index, 1));
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const observedEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
  const assumed = index < 5;
  const availableAt = assumed ? new Date(Date.UTC(2026, index, 1)).toISOString() : issue;
  return { month, observation_end: observedEnd, provider_publication_at: null, available_at: availableAt, availability_is_assumed: assumed, soil_sha256: hash, driver_sha256: hash, local_file_verified_at: assumed ? null : issue };
});

function regional(horizon: 1 | 2 | 3) {
  const index = horizon - 1;
  const value = 100 + horizon;
  return {
    schema_version: "forecast_v1", status: "experimental", issue_time: issue, target_month: targetMonths[index], target_period: { start: targetStarts[index], end_exclusive: targetEnds[index] }, horizon_months: horizon,
    scope: { id: "TEST ONLY synthetic region", bounds_west_south_east_north: [-64, -38, -57, -30], support: "TEST ONLY" }, target: "storage",
    model: { name: "seasonal_climatology", version: "TEST ONLY", selected_before_holdout: true, selection_source_sha256: hash, selection_evidence: "TEST ONLY fixture" },
    input_observation_cutoff: issueCutoff, latest_available_observation_month: "2026-07",
    availability: { policy: "TEST ONLY", publication_evidence: null, operationally_eligible: false, source_publication_time_verified: false, local_file_verified_at: issue, latency_days_from_latest_observation_end: 106, input_months: inputMonths },
    value, units: "mm", predictive_interval: { level: 0.9, lower: value - 10, upper: value + 10, method: "TEST ONLY synthetic interval" }, climatological_reference_mm: value, anomaly_mm: 0,
    training: { first_target: "2006-07", last_target: "2021-07", label_cutoff: "2021-12-31T23:59:59.999999999Z" },
    calibration: { start: "2022-01", end: "2023-07", labels_available_by: "2023-12-31T23:59:59.999999999Z", n_months: 19, metrics: { absolute_residual_radius_mm: 10 } },
    out_of_sample: { period: ["2024-01", "2025-12"], metrics: { n_rows: 24, rmse: 28, mae: 22, rmse_difference_vs_persistence_95_block_interval: [-5, 2] }, evaluation_source: "TEST ONLY retrospective fixture" },
    quality_flags: ["TEST ONLY synthetic fixture"], source: { collection: "C1342986036-GES_DISC", doi: "10.5067/SXAVCZFAQLNO", input_panel_sha256: hash, spatial_panel_sha256: hash, evaluation_sha256: hash, extension_manifest_sha256: hash, historical_hindcast_reference_sha256: hash },
  };
}
const cells = Array.from({ length: 896 }, (_, index) => {
  const latitude = -37.875 + Math.floor(index / 28) * 0.25;
  const longitude = -63.875 + (index % 28) * 0.25;
  const valid = index < 867;
  const value = valid ? 100 : null;
  return { cell_id: `${latitude.toFixed(4)},${longitude.toFixed(4)}`, latitude, longitude, area_m2: 1, valid, value, units: valid ? "mm" : null, predictive_interval: valid ? { level: 0.9, lower: 90, upper: 110, method: "TEST ONLY synthetic interval" } : null, climatological_reference_mm: value, anomaly_mm: valid ? 0 : null };
});

export const phase8ForecastFixture = {
  schema_version: "phase8_forecast_bundle_v1", status: "experimental", classification: "TEST ONLY synthetic fixture", operationally_eligible: false, issue_time: issue,
  source_dataset: { product: "GLDAS Noah v2.1 monthly", collection: "C1342986036-GES_DISC", doi: "10.5067/SXAVCZFAQLNO", historical_first_month: "2006-01", historical_last_month: "2025-12", extension_first_month: "2026-01", extension_last_month: "2026-07", spatial_grid_degrees: 0.25, historical_panel_sha256: hash, extended_spatial_panel_sha256: hash, extended_regional_panel_sha256: hash, extension_manifest_sha256: hash, phase5b_evaluation_sha256: hash },
  model: { name: "seasonal_climatology", version: "TEST ONLY", selection_evidence: "TEST ONLY" }, target: { name: "GLDAS Noah 0–100 cm soil-water storage", variable: "soil_water_mm", units: "mm", definition: "sum of SoilMoi0_10cm_inst + SoilMoi10_40cm_inst + SoilMoi40_100cm_inst; not RootMoist_inst (TEST ONLY)" }, latest_available_observation_month: "2026-07", input_observation_cutoff: issueCutoff,
  availability: { policy: "TEST ONLY", local_verified_at: issue, provider_first_publication_time_verified: false, latency_days: 106, near_real_time: false },
  temporal_convention: { issue_month: "2026-11", horizon_semantics: "TEST ONLY", target_months: targetMonths },
  regional_forecasts: horizons.map(regional),
  spatial_forecasts: { grid_cells: 896, eligible_cells: 867, masked_cells: 29, spatial_resolution_degrees: 0.25, uncertainty_note: "TEST ONLY synthetic calibration note", forecasts: horizons.map((horizon, index) => ({ horizon_months: horizon, target_month: targetMonths[index], target: "storage", units: "mm", model: "seasonal_climatology", forecast_method: "TEST ONLY", latest_available_observation_month: "2026-07", calibration: { start: "2022-01", end: "2023-07", n_months: 19, weighted_abs_residual_radius_mm: 10, nominal_level: 0.9, interval_physical_bounds_mm: [0, 1000], per_cell_guarantee: false }, holdout: { period: ["2024-01", "2025-12"], metrics: { rmse: 30, mae: 23 }, validation_source: "TEST ONLY", historical_hindcast_reference_sha256: hash }, regional_spatial_weighted_mean_mm: 100 + horizon, cells: cells.map((cell) => cell.valid ? { ...cell, value: 100 + horizon, climatological_reference_mm: 100 + horizon, predictive_interval: { level: 0.9, lower: 90 + horizon, upper: 110 + horizon, method: "TEST ONLY synthetic interval" } } : cell) })) },
  validation: { status: "TEST ONLY", chronological_holdout: { start: "2024-01", end: "2025-12", reserved_for_selection: false, is_retrospective: true }, training_target_cutoffs_by_horizon: { "1": "2021-12-31T23:59:59.999999999Z", "2": "2021-11-30T23:59:59.999999999Z", "3": "2021-10-31T23:59:59.999999999Z" }, calibration_cutoffs_by_horizon: { "1": "2023-12-31T23:59:59.999999999Z", "2": "2023-11-30T23:59:59.999999999Z", "3": "2023-10-31T23:59:59.999999999Z" }, no_future_target_data_used: true, regional_spatial_consistency: "TEST ONLY" }, limitations: ["TEST ONLY synthetic fixture; not scientific output."]
};
