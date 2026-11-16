import type { CropId, GrowthStage } from "./agronomy";

export type PampasMapGroup = "north" | "south";

export function pampasMapGroups(latitude: number, longitude: number): Array<PampasMapGroup | "west" | "east"> {
  return [latitude >= -34 ? "north" : "south", longitude < -60.5 ? "west" : "east"];
}

export function pampasMapGroup(latitude: number): PampasMapGroup {
  // Matches the Observatory's descriptive north/south filter. This is not an
  // official agroecological boundary or a crop suitability classification.
  return latitude >= -34 ? "north" : "south";
}

const plantingMonths: Partial<Record<CropId, Partial<Record<PampasMapGroup, readonly number[]>>>> = {
  soybean: { north: [9, 10, 11, 12, 1], south: [10, 11, 12, 1] },
  maize: { north: [9, 10, 11, 12], south: [9, 10, 11, 12] },
  wheat: { north: [5, 6, 7, 8], south: [5, 6, 7, 8] },
};

export type CalendarAssessment = "inside-window" | "outside-window" | "stage-not-inferable" | "no-source";
export type WaterSignal = "below-reference" | "within-reference" | "above-reference" | "unavailable";

export function waterSignalForCrop(condition: "below_reference_p20" | "within_reference_p20_p80" | "above_reference_p80" | null | undefined): WaterSignal {
  if (condition === "below_reference_p20") return "below-reference";
  if (condition === "within_reference_p20_p80") return "within-reference";
  if (condition === "above_reference_p80") return "above-reference";
  return "unavailable";
}

export function assessCropStageSeason(crop: CropId, stage: GrowthStage, month: number, latitude: number): CalendarAssessment {
  if (!plantingMonths[crop]) return "no-source";
  if (stage !== "planning") return "stage-not-inferable";
  const group = pampasMapGroup(latitude);
  return plantingMonths[crop]?.[group]?.includes(month) ? "inside-window" : "outside-window";
}

export function plantingMonthsFor(crop: CropId, latitude: number): readonly number[] | null {
  const months = plantingMonths[crop]?.[pampasMapGroup(latitude)];
  return months ?? null;
}
