export type AgriculturalWater = {
  source: { observed_end: string };
  grid: { latitude: number[]; longitude: number[]; moisture: (number | null)[][] };
};

function record(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function coordinates(values: unknown, min: number, max: number, direction: number): values is number[] {
  return Array.isArray(values) && values.length > 0 && values.length < 200 &&
    values.every((value, i) => typeof value === "number" && value >= min && value <= max &&
      (i === 0 || direction * (value - values[i - 1]) > 0));
}

export function readAgriculturalWater(input: unknown): AgriculturalWater {
  if (!record(input) || input.schema_version !== "agricultural_water_v1" || input.status !== "forecast_unavailable" ||
      !record(input.source) || input.source.collection !== "C3480440870-NSIDC_CPRD" || input.source.version !== "008" ||
      typeof input.source.observed_start !== "string" || typeof input.source.observed_end !== "string" ||
      typeof input.source.locally_accessed_at !== "string" || !record(input.forecast) ||
      input.forecast.issue_date !== null || input.forecast.model !== null || !record(input.grid)) {
    throw new Error("Unsupported SMAP estimates");
  }
  const start = Date.parse(input.source.observed_start);
  const end = Date.parse(input.source.observed_end);
  const accessed = Date.parse(input.source.locally_accessed_at);
  const { latitude, longitude, moisture } = input.grid;
  if (end - start !== 10_800_000 || !(end <= accessed && accessed <= Date.now()) ||
      input.grid.projection !== "EPSG:6933" ||
      !coordinates(latitude, -38, -30, -1) || !coordinates(longitude, -64, -57, 1) ||
      !Array.isArray(moisture) || moisture.length !== latitude.length ||
      !moisture.every((row) => Array.isArray(row) && row.length === longitude.length &&
        row.every((value) => value === null || (typeof value === "number" && value >= 0 && value <= .9))) ||
      moisture.flat().filter((value) => value !== null).length !== input.grid.valid_cells ||
      input.grid.valid_cells === 0) {
    throw new Error("Invalid SMAP grid or observation timing");
  }
  return { source: { observed_end: input.source.observed_end }, grid: { latitude, longitude, moisture } };
}

function closest(axis: number[], value: number) {
  return axis.reduce((best, candidate, i) => Math.abs(candidate - value) < Math.abs(axis[best] - value) ? i : best, 0);
}

export function selectMoisture(data: AgriculturalWater, lat: number, lon: number) {
  if (!(lat >= -38 && lat <= -30 && lon >= -64 && lon <= -57)) return undefined;
  const grid = data.grid;
  const y = closest(grid.latitude, lat);
  const x = closest(grid.longitude, lon);
  const value = grid.moisture[y][x];
  const distance = 111.2 * Math.hypot(grid.latitude[y] - lat, (grid.longitude[x] - lon) * Math.cos(lat * Math.PI / 180));
  return value !== null && distance <= 7 ? { value, latitude: grid.latitude[y], longitude: grid.longitude[x] } : undefined;
}
