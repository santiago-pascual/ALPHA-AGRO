export type ArchivedCell = {
  latitude: number;
  longitude: number;
  observation_day_utc: string;
  historical_storage_mm: number;
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function archivedCell(value: unknown): value is ArchivedCell {
  if (!object(value)) return false;
  const { latitude, longitude, observation_day_utc, historical_storage_mm } = value;
  return typeof latitude === "number" && Number.isInteger((latitude + 37.875) * 4) &&
    latitude >= -37.875 && latitude <= -30.125 &&
    typeof longitude === "number" && Number.isInteger((longitude + 63.875) * 4) &&
    longitude >= -63.875 && longitude <= -57.125 &&
    typeof observation_day_utc === "string" && /^\d{4}-\d{2}-\d{2}$/.test(observation_day_utc) &&
    Number.isFinite(Date.parse(observation_day_utc)) &&
    Date.parse(observation_day_utc) + 86_400_000 <= Date.now() &&
    typeof historical_storage_mm === "number" && historical_storage_mm >= 0 && historical_storage_mm <= 1000.01;
}

export function readWaterRisk(value: unknown): ArchivedCell[] {
  if (!object(value) || value.schema_version !== "water_risk_v1" ||
      value.status !== "insufficient_evidence" || value.data_kind !== "nasa_archive" ||
      !object(value.source) || value.source.collection !== "C1342986035-GES_DISC" ||
      value.source.version !== "2.1" || !Array.isArray(value.cells) ||
      value.cells.length > 896 || !value.cells.every(archivedCell)) {
    throw new Error("Invalid or unsupported water-risk archive");
  }
  const distinct = new Set(value.cells.map((cell) => `${cell.latitude},${cell.longitude}`));
  if (distinct.size !== value.cells.length) throw new Error("Duplicate archived cells");
  return value.cells;
}
