/** Typed view of config/forecast_v1.schema.json. Optional values remain optional. */
export type ForecastTarget = "storage" | "anomaly" | "low_moisture";
export type ForecastStatus = "retrospective_simulation" | "experimental" | "operationally_eligible";

export type ForecastArtifact = {
  schema_version: "forecast_v1";
  status: ForecastStatus;
  issue_time: string;
  target_month: string;
  horizon_months: 1 | 2 | 3;
  scope: { id: string; bounds_west_south_east_north: [number, number, number, number] };
  target: ForecastTarget;
  model: { name: string; version: string };
  input_observation_cutoff: string;
  availability: {
    policy: string;
    publication_evidence: Record<string, unknown> | null;
    operationally_eligible: boolean;
    input_months: string[];
  };
  value: number;
  units: "mm" | "probability";
  predictive_interval: { level: number; lower: number; upper: number; method: string } | null;
  calibration: {
    start: string;
    end: string;
    n_months: number;
    labels_available_by: string;
    metrics: Record<string, number | null>;
  };
  quality_flags: string[];
  source: { collection: string; doi: string; input_panel_sha256: string };
};
