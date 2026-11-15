import type { ForecastArtifact } from "./forecast";

export type Phase8Month = "2026-12" | "2027-01" | "2027-02";
export type Phase8Metric = number | null | number[];
export type Phase8Cell = {
  cell_id: string;
  latitude: number;
  longitude: number;
  area_m2: number;
  valid: boolean;
  value: number | null;
  units: "mm" | null;
  predictive_interval: { level: 0.9; lower: number; upper: number; method: string } | null;
  climatological_reference_mm: number | null;
  anomaly_mm: number | null;
};
export type Phase8SpatialForecast = {
  horizon_months: 1 | 2 | 3;
  target_month: Phase8Month;
  target: "storage";
  units: "mm";
  model: "seasonal_climatology";
  forecast_method: string;
  latest_available_observation_month: "2026-07";
  calibration: { start: string; end: string; n_months: number; weighted_abs_residual_radius_mm: number; nominal_level: 0.9; interval_physical_bounds_mm: [0, 1000]; per_cell_guarantee: false };
  holdout: { period: [string, string]; metrics: Record<string, Phase8Metric>; validation_source: string; historical_hindcast_reference_sha256: string };
  regional_spatial_weighted_mean_mm: number;
  cells: Phase8Cell[];
};
export type Phase8ForecastBundle = {
  schema_version: "phase8_forecast_bundle_v1";
  status: "experimental";
  classification: string;
  operationally_eligible: false;
  issue_time: string;
  source_dataset: {
    product: string; collection: string; doi: string; historical_first_month: "2006-01"; historical_last_month: "2025-12";
    extension_first_month: "2026-01"; extension_last_month: "2026-07"; spatial_grid_degrees: 0.25;
    historical_panel_sha256: string; extended_spatial_panel_sha256: string; extended_regional_panel_sha256: string;
    extension_manifest_sha256: string; phase5b_evaluation_sha256: string;
  };
  model: { name: "seasonal_climatology"; version: string; selection_evidence: string };
  target: { name: string; variable: "soil_water_mm"; units: "mm"; definition: string };
  latest_available_observation_month: "2026-07";
  input_observation_cutoff: string;
  availability: { policy: string; local_verified_at: string; provider_first_publication_time_verified: false; latency_days: number; near_real_time: false };
  temporal_convention: { issue_month: "2026-11"; horizon_semantics: string; target_months: readonly ["2026-12", "2027-01", "2027-02"] };
  regional_forecasts: Phase8RegionalForecast[];
  spatial_forecasts: {
    grid_cells: 896; eligible_cells: 867; masked_cells: 29; spatial_resolution_degrees: 0.25; uncertainty_note: string;
    forecasts: Phase8SpatialForecast[];
  };
  validation: { status: string; chronological_holdout: Record<string, unknown>; training_target_cutoffs_by_horizon: Record<string, unknown>; calibration_cutoffs_by_horizon: Record<string, unknown>; no_future_target_data_used: true; regional_spatial_consistency: Record<string, unknown> | string };
  limitations: string[];
};
export type Phase8RegionalForecast = ForecastArtifact & {
  status: "experimental";
  target: "storage";
  horizon_months: 1 | 2 | 3;
  target_period: { start: string; end_exclusive: string };
  latest_available_observation_month: "2026-07";
  climatological_reference_mm: number;
  anomaly_mm: 0;
  training: { first_target: string; last_target: string; label_cutoff: string };
  out_of_sample: { period: [string, string]; metrics: Record<string, Phase8Metric>; evaluation_source: string };
};
