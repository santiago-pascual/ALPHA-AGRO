import type { DashboardDataset, MonthlyObservation } from "../types";
import type { ForecastArtifact } from "../types/forecast";

export type HistoricalForecastContext = {
  latestObservation: MonthlyObservation | null;
  seasonalStorageReferenceMm: number | null;
  seasonalReferenceCount: number;
};

function observationMonthEnd(month: string): number {
  const [year, monthNumber] = month.slice(0, 7).split("-").map(Number);
  return Date.UTC(year, monthNumber, 0, 23, 59, 59);
}

/** Uses only the artifact's observation cutoff; values remain explicitly regional/descriptive. */
export function historicalContextForForecast(dataset: DashboardDataset | null, artifact: ForecastArtifact): HistoricalForecastContext {
  if (!dataset) return { latestObservation: null, seasonalStorageReferenceMm: null, seasonalReferenceCount: 0 };
  const cutoff = Date.parse(artifact.input_observation_cutoff);
  if (!Number.isFinite(cutoff)) return { latestObservation: null, seasonalStorageReferenceMm: null, seasonalReferenceCount: 0 };
  const available = dataset.series.filter((row) => observationMonthEnd(row.month) <= cutoff);
  const latestObservation = [...available].reverse().find((row) => row.storageMm !== null && Number.isFinite(row.storageMm)) ?? null;
  const targetCalendarMonth = Number(artifact.target_month.slice(5, 7));
  const reference = available.filter((row) => Number(row.month.slice(5, 7)) === targetCalendarMonth && row.storageMm !== null && Number.isFinite(row.storageMm));
  return {
    latestObservation,
    seasonalStorageReferenceMm: reference.length ? reference.reduce((sum, row) => sum + row.storageMm!, 0) / reference.length : null,
    seasonalReferenceCount: reference.length,
  };
}
