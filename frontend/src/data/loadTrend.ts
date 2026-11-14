import type { DashboardDataset, TrendAnalysisJson, TrendCell } from "../types";

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid trend analysis: expected object at " + path);
  }
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Invalid trend analysis: expected finite number at " + path);
  }
  return value;
}

function nullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  return finiteNumber(value, path);
}

function pair(value: unknown, path: string): [number, number] | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("Invalid trend analysis: expected two-value interval at " + path);
  }
  return [finiteNumber(value[0], path + "[0]"), finiteNumber(value[1], path + "[1]")];
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid trend analysis: expected text at " + path);
  }
  return value;
}

export function adaptTrendAnalysis(input: unknown): DashboardDataset {
  const root = record(input, "root");
  if (root.schema_version !== "1.0") {
    throw new Error("Unsupported trend analysis schema. Expected version 1.0.");
  }
  if (root.variable !== "soil_water_storage_0_100_cm") {
    throw new Error("Unsupported variable. Expected 0–100 cm soil-water storage.");
  }

  const months = record(root.months, "months");
  const grid = record(root.spatial_grid, "spatial_grid");
  const quality = record(root.quality, "quality");
  const trend = record(root.regional_trend, "regional_trend");
  const seriesRows = root.regional_monthly_series;
  const anomalyRows = root.regional_monthly_anomalies;
  const spatial = record(root.spatial_trends_on_cell_seasonal_anomalies, "spatial trends");

  if (!Array.isArray(seriesRows) || !Array.isArray(anomalyRows) || !Array.isArray(spatial.cells)) {
    throw new Error("Invalid trend analysis: monthly series and spatial cells are required.");
  }

  const anomalies = new Map<string, number | null>();
  for (const item of anomalyRows) {
    const row = record(item, "regional_monthly_anomalies[]");
    anomalies.set(
      text(row.month, "regional_monthly_anomalies[].month"),
      nullableNumber(row.anomaly_mm, "regional_monthly_anomalies[].anomaly_mm"),
    );
  }

  const series = seriesRows.map((item): DashboardDataset["series"][number] => {
    const row = record(item, "regional_monthly_series[]");
    const month = text(row.month, "regional_monthly_series[].month");
    return {
      month,
      storageMm: nullableNumber(
        row.soil_water_0_100_mm,
        "regional_monthly_series[].soil_water_0_100_mm",
      ),
      anomalyMm: anomalies.get(month) ?? null,
      coverage: finiteNumber(
        row.valid_area_fraction,
        "regional_monthly_series[].valid_area_fraction",
      ),
    };
  });

  const cells: TrendCell[] = spatial.cells.map((item): TrendCell => {
    const row = record(item, "spatial_trends_on_cell_seasonal_anomalies.cells[]");
    return {
      latitude: finiteNumber(row.latitude, "cell.latitude"),
      longitude: finiteNumber(row.longitude, "cell.longitude"),
      validMonths: finiteNumber(row.valid_months, "cell.valid_months"),
      slopePerDecade: nullableNumber(
        row.linear_hac_slope_per_decade,
        "cell.linear_hac_slope_per_decade",
      ),
      ci95: pair(row.linear_hac_ci95_per_decade, "cell.linear_hac_ci95_per_decade"),
      pValue: nullableNumber(row.linear_hac_p_value, "cell.linear_hac_p_value"),
      qValue: nullableNumber(row.linear_hac_bh_q_value, "cell.linear_hac_bh_q_value"),
      significant: row.significant_after_bh === true,
    };
  });

  const rawLimitations = root.limitations;
  const limitations = Array.isArray(rawLimitations)
    ? rawLimitations.filter((item): item is string => typeof item === "string")
    : [];

  return {
    mode: "real",
    source: text(root.dataset, "dataset"),
    variable: text(root.variable, "variable"),
    units: text(root.units, "units"),
    start: text(months.start, "months.start"),
    end: text(months.end, "months.end"),
    months: finiteNumber(months.count, "months.count"),
    gridCells: finiteNumber(grid.cell_count, "spatial_grid.cell_count"),
    resolutionDegrees: finiteNumber(grid.resolution_degrees, "spatial_grid.resolution_degrees"),
    meanCoverage: finiteNumber(
      quality.regional_valid_area_fraction_mean,
      "quality.regional_valid_area_fraction_mean",
    ),
    minimumCoverage: finiteNumber(
      quality.regional_valid_area_fraction_min,
      "quality.regional_valid_area_fraction_min",
    ),
    missingProfileFraction: finiteNumber(
      quality.missing_profile_fraction,
      "quality.missing_profile_fraction",
    ),
    regionalTrend: {
      slopePerDecade: nullableNumber(
        trend.linear_hac_slope_per_decade,
        "regional_trend.linear_hac_slope_per_decade",
      ),
      ci95: pair(trend.linear_hac_ci95_per_decade, "regional_trend.linear_hac_ci95_per_decade"),
      pValue: nullableNumber(trend.linear_hac_p_value, "regional_trend.linear_hac_p_value"),
      seasonalSenSlopePerDecade: nullableNumber(
        trend.sen_slope_per_decade,
        "regional_trend.sen_slope_per_decade",
      ),
      seasonalKendallTau: nullableNumber(
        trend.seasonal_mann_kendall_tau,
        "regional_trend.seasonal_mann_kendall_tau",
      ),
    },
    series,
    cells,
    limitations,
  };
}

export async function loadValidatedTrend(path = "/data/trend_analysis.json") {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "No validated trend_analysis.json was found. Add the reviewed output under frontend/public/data/."
        : "Could not load trend_analysis.json (HTTP " + response.status + ").",
    );
  }
  const payload = (await response.json()) as TrendAnalysisJson;
  return adaptTrendAnalysis(payload);
}
