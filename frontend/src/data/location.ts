import type { TrendCell } from "../types";

export type CoordinatePoint = { latitude: number; longitude: number };
export type LocationSource = "gps" | "map" | "manual";
export type SelectedLocation = CoordinatePoint & {
  source: LocationSource;
  accuracyMeters: number | null;
};

export function coordinateError({ latitude, longitude }: CoordinatePoint): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return "Enter finite latitude and longitude values.";
  }
  if (latitude < -90 || latitude > 90) return "Latitude must be between −90° and 90°.";
  if (longitude < -180 || longitude > 180) return "Longitude must be between −180° and 180°.";
  return null;
}

/**
 * Returns the validated analysis cell whose native grid footprint contains the point.
 * The footprint is derived from cell centres and the artifact's declared grid spacing;
 * no regional bounding rectangle is used as a substitute for the eligible-cell mask.
 */
export function findEligibleCell(
  point: CoordinatePoint,
  cells: TrendCell[],
  resolutionDegrees: number,
): TrendCell | null {
  if (coordinateError(point) || !Number.isFinite(resolutionDegrees) || resolutionDegrees <= 0) return null;
  const halfCell = resolutionDegrees / 2;
  const epsilon = resolutionDegrees * 1e-8;
  return cells.find((cell) =>
    Math.abs(point.latitude - cell.latitude) <= halfCell + epsilon &&
    Math.abs(point.longitude - cell.longitude) <= halfCell + epsilon,
  ) ?? null;
}

/** Stable UI identifier based on a validated GLDAS cell centre, not a parcel boundary. */
export function gridCellId(point: CoordinatePoint): string {
  return `gldas-noah-v2.1:${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`;
}

export function formatCoordinate(value: number, axis: "latitude" | "longitude") {
  const direction = axis === "latitude" ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E");
  return `${Math.abs(value).toFixed(4)}° ${direction}`;
}
