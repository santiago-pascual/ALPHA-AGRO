export type Phase9Cell = { cell_id: string; latitude: number; longitude: number; soil_water_valid: boolean };
export type Phase9MonthlyReference = {
  cell_id: string; calendar_month: number; n_years: number; mean_mm: number | null; sd_mm: number | null;
  p10_mm: number | null; p20_mm: number | null; p50_mm: number | null; p80_mm: number | null; p90_mm: number | null;
  low_moisture_count: number | null; low_moisture_frequency: number | null;
};
export type Phase9ObservedContext = {
  cell_id: string; observation_month: "2026-07"; value_mm: number; reference_calendar_month: number;
  reference_n_years: number; reference_mean_mm: number; anomaly_mm: number; empirical_percentile: number;
  condition_code: "below_reference_p20" | "within_reference_p20_p80" | "above_reference_p80";
};
export type Phase9ForecastContext = {
  cell_id: string; target_month: "2026-12" | "2027-01" | "2027-02"; horizon_months: 1 | 2 | 3 | null;
  status: string; forecast_mm: number | null; units: "mm" | null; reference_mean_mm: number | null;
  reference_p20_mm: number | null; reference_p50_mm: number | null; reference_p80_mm: number | null;
  forecast_central_anomaly_mm: number | null; forecast_anomaly_status: string | null;
  probability_below_p20: number | null; probability_status: string;
};
export type Phase9Interpretation = {
  provenance: { product: string; doi: string; target: string; units: string; panel_sha256: string; forecast_bundle_sha256: string };
  reference: { start: string; end: string; sample_size: string; quantile_method: string; low_moisture_definition: string };
  cells: Map<string, Phase9Cell>;
  monthlyReference: Map<string, Phase9MonthlyReference>;
  latestObserved: Map<string, Phase9ObservedContext>;
  forecasts: Map<string, Phase9ForecastContext>;
  glossary: { en: Record<Phase9ObservedContext["condition_code"], string>; es: Record<Phase9ObservedContext["condition_code"], string> };
  forecastInterpretation: { en: string; es: string; probability_reason: string };
  probabilitySummary: { status: string; reason: string };
  agriculturalInterpretation: { en: string; es: string; scope: string; prohibited_inferences: string[] };
  methodology: string[];
  limitations: string[];
};
export type Phase9Load = { status: "loading" } | { status: "ready"; data: Phase9Interpretation } | { status: "missing"; message: string } | { status: "error"; message: string };
