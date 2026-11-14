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

function fraction(value: unknown, path: string): number {
  const result = finiteNumber(value, path);
  if (result < 0 || result > 1) {
    throw new Error("Invalid trend analysis: expected fraction from 0 to 1 at " + path);
  }
  return result;
}

function monthStart(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^\d{4}-\d{2}-01$/.test(result) || Number.isNaN(Date.parse(result + "T00:00:00Z"))) {
    throw new Error("Invalid trend analysis: expected first-of-month ISO date at " + path);
  }
  return result;
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
  const inputFiles = root.input_files;

  if (
    !Array.isArray(seriesRows) ||
    !Array.isArray(anomalyRows) ||
    !Array.isArray(spatial.cells) ||
    !Array.isArray(inputFiles)
  ) {
    throw new Error("Invalid trend analysis: monthly series, spatial cells, and input provenance are required.");
  }

  const anomalies = new Map<string, number | null>();
  for (const item of anomalyRows) {
    const row = record(item, "regional_monthly_anomalies[]");
    anomalies.set(
      monthStart(row.month, "regional_monthly_anomalies[].month"),
      nullableNumber(row.anomaly_mm, "regional_monthly_anomalies[].anomaly_mm"),
    );
  }

  const series = seriesRows.map((item): DashboardDataset["series"][number] => {
    const row = record(item, "regional_monthly_series[]");
    const month = monthStart(row.month, "regional_monthly_series[].month");
    return {
      month,
      storageMm: nullableNumber(
        row.soil_water_0_100_mm,
        "regional_monthly_series[].soil_water_0_100_mm",
      ),
      anomalyMm: anomalies.get(month) ?? null,
      coverage: fraction(
        row.valid_area_fraction,
        "regional_monthly_series[].valid_area_fraction",
      ),
    };
  });

  const start = monthStart(months.start, "months.start");
  const end = monthStart(months.end, "months.end");
  const count = finiteNumber(months.count, "months.count");
  if (
    series.length !== count ||
    series[0]?.month !== start ||
    series[series.length - 1]?.month !== end ||
    anomalyRows.length !== series.length
  ) {
    throw new Error("Invalid trend analysis: month bounds/count do not match monthly observations.");
  }
  for (let index = 1; index < series.length; index += 1) {
    const previous = new Date(series[index - 1].month + "T00:00:00Z");
    previous.setUTCMonth(previous.getUTCMonth() + 1);
    if (series[index].month !== previous.toISOString().slice(0, 10)) {
      throw new Error("Invalid trend analysis: monthly observations are not contiguous.");
    }
  }

  const files = inputFiles.map((item, index) => {
    const row = record(item, "input_files[" + index + "]");
    const filename = text(row.filename, "input_files[].filename");
    const sha256 = text(row.sha256, "input_files[].sha256");
    if (!/^[\da-f]{64}$/i.test(sha256)) {
      throw new Error("Invalid trend analysis: expected SHA-256 digest at input_files[].sha256");
    }
    return { filename, sha256 };
  });
  if (files.length === 0) {
    throw new Error("Invalid trend analysis: input file provenance is empty.");
  }
  const eligibleCells = finiteNumber(spatial.eligible_cells, "spatial trends.eligible_cells");
  const gridCells = finiteNumber(grid.cell_count, "spatial_grid.cell_count");
  const latitudeCount = finiteNumber(grid.latitude_count, "spatial_grid.latitude_count");
  const longitudeCount = finiteNumber(grid.longitude_count, "spatial_grid.longitude_count");
  if (eligibleCells !== spatial.cells.length || eligibleCells > gridCells) {
    throw new Error("Invalid trend analysis: eligible cell count does not match spatial cells.");
  }
  if (latitudeCount * longitudeCount !== gridCells) {
    throw new Error("Invalid trend analysis: spatial grid dimensions do not match cell count.");
  }
  if (files.length !== count) {
    throw new Error("Invalid trend analysis: input file provenance count does not match month count.");
  }

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
    start,
    end,
    months: count,
    gridCells,
    latitudeCount,
    longitudeCount,
    eligibleCells,
    resolutionDegrees: finiteNumber(grid.resolution_degrees, "spatial_grid.resolution_degrees"),
    areaWeighting: text(grid.area_weighting, "spatial_grid.area_weighting"),
    boundaryRule: text(grid.boundary_rule, "spatial_grid.boundary_rule"),
    inputFiles: files,
    meanCoverage: fraction(
      quality.regional_valid_area_fraction_mean,
      "quality.regional_valid_area_fraction_mean",
    ),
    minimumCoverage: fraction(
      quality.regional_valid_area_fraction_min,
      "quality.regional_valid_area_fraction_min",
    ),
    missingProfileFraction: fraction(
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
