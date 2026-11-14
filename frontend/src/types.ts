export type DataMode = "demo" | "real";

export type MonthlyObservation = {
  month: string;
  storageMm: number | null;
  anomalyMm: number | null;
  coverage: number;
};

export type TrendCell = {
  latitude: number;
  longitude: number;
  validMonths: number;
  slopePerDecade: number | null;
  ci95: [number, number] | null;
  pValue: number | null;
  qValue: number | null;
  significant: boolean;
};

export type InputFileProvenance = {
  filename: string;
  sha256: string;
};

export type DashboardDataset = {
  mode: DataMode;
  source: string;
  variable: string;
  units: string;
  start: string;
  end: string;
  months: number;
  gridCells: number;
  latitudeCount: number;
  longitudeCount: number;
  eligibleCells: number;
  resolutionDegrees: number;
  areaWeighting: string;
  boundaryRule: string;
  inputFiles: InputFileProvenance[];
  meanCoverage: number;
  minimumCoverage: number;
  missingProfileFraction: number;
  regionalTrend: {
    slopePerDecade: number | null;
    ci95: [number, number] | null;
    pValue: number | null;
    seasonalSenSlopePerDecade: number | null;
    seasonalKendallTau: number | null;
  };
  series: MonthlyObservation[];
  cells: TrendCell[];
  limitations: string[];
};

export type TrendAnalysisJson = {
  schema_version: string;
  dataset: string;
  variable: string;
  units: string;
  months: {
    start: string;
    end: string;
    count: number;
    cadence: string;
  };
  spatial_grid: {
    latitude_count: number;
    longitude_count: number;
    cell_count: number;
    resolution_degrees: number;
    area_weighting: string;
    boundary_rule: string;
  };
  quality: {
    regional_valid_area_fraction_min: number;
    regional_valid_area_fraction_mean: number;
    missing_profile_fraction: number;
  };
  regional_monthly_series: Array<{
    month: string;
    soil_water_0_100_mm: number | null;
    valid_area_fraction: number;
  }>;
  regional_monthly_anomalies: Array<{
    month: string;
    anomaly_mm: number | null;
  }>;
  regional_trend: {
    valid_months: number;
    linear_hac_slope_per_decade: number | null;
    linear_hac_ci95_per_decade: [number, number] | null;
    linear_hac_p_value: number | null;
    sen_slope_per_decade: number | null;
    seasonal_mann_kendall_tau: number | null;
    seasonal_mann_kendall_p_independence_assumption: number | null;
    hac_max_lag_months: number | null;
  };
  spatial_trends_on_cell_seasonal_anomalies: {
    eligible_cells: number;
    cells: Array<{
      latitude: number;
      longitude: number;
      valid_months: number;
      linear_hac_slope_per_decade: number | null;
      linear_hac_ci95_per_decade: [number, number] | null;
      linear_hac_p_value: number | null;
      linear_hac_bh_q_value: number | null;
      significant_after_bh: boolean;
    }>;
  };
  input_files: InputFileProvenance[];
  limitations: string[];
};
