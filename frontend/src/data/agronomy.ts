import type { ForecastIssueRequest } from "./forecast";
import type { CoordinatePoint } from "./location";
import type { ForecastTarget } from "../types/forecast";

export type CropId = "soybean" | "maize" | "wheat" | "sunflower" | "barley" | "sorghum" | "sugarcane" | "grapevine" | "citrus" | "yerba_mate";
export type GrowthStage = "planning" | "establishment" | "vegetative" | "reproductive" | "fruit_development" | "maturation" | "harvest" | "dormancy" | "ratoon_recovery";
export type WaterManagement = "rainfed" | "irrigated" | "unknown";

export type CropCatalogEntry = {
  id: CropId;
  name: { en: string; es: string };
  category: "annual" | "perennial";
  stages: readonly GrowthStage[];
  /** Intentionally null until a reliable, region-specific source is reviewed. */
  geographicContext: null;
  agronomicSuitability: "not_assessed";
  availability: "configuration_only";
  evidenceReferences: readonly string[];
};

const annualStages = ["planning", "establishment", "vegetative", "reproductive", "maturation", "harvest"] as const satisfies readonly GrowthStage[];
const perennialStages = ["establishment", "vegetative", "reproductive", "fruit_development", "harvest", "dormancy"] as const satisfies readonly GrowthStage[];

/** Crop names and stages are workflow metadata; no crop suitability is inferred. */
export const CROP_CATALOG: readonly CropCatalogEntry[] = [
  { id: "soybean", name: { en: "Soybean", es: "Soja" }, category: "annual", stages: annualStages, geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "maize", name: { en: "Maize", es: "Maíz" }, category: "annual", stages: annualStages, geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "wheat", name: { en: "Wheat", es: "Trigo" }, category: "annual", stages: annualStages, geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "sunflower", name: { en: "Sunflower", es: "Girasol" }, category: "annual", stages: annualStages, geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "barley", name: { en: "Barley", es: "Cebada" }, category: "annual", stages: annualStages, geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "sorghum", name: { en: "Sorghum", es: "Sorgo" }, category: "annual", stages: annualStages, geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "sugarcane", name: { en: "Sugarcane", es: "Caña de azúcar" }, category: "perennial", stages: ["establishment", "vegetative", "maturation", "harvest", "ratoon_recovery"], geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "grapevine", name: { en: "Grapevine / grapes", es: "Vid / uva" }, category: "perennial", stages: perennialStages, geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "citrus", name: { en: "Citrus", es: "Cítricos / limones" }, category: "perennial", stages: perennialStages, geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
  { id: "yerba_mate", name: { en: "Yerba mate", es: "Yerba mate" }, category: "perennial", stages: ["establishment", "vegetative", "harvest", "dormancy"], geographicContext: null, agronomicSuitability: "not_assessed", availability: "configuration_only", evidenceReferences: [] },
];

export const CROP_IDS: readonly CropId[] = CROP_CATALOG.map(({ id }) => id);
export const GROWTH_STAGES: readonly GrowthStage[] = ["planning", "establishment", "vegetative", "reproductive", "fruit_development", "maturation", "harvest", "dormancy", "ratoon_recovery"];
export const WATER_MANAGEMENT: readonly WaterManagement[] = ["rainfed", "irrigated", "unknown"];

export type CropConfiguration = { crop: CropId; growthStage: GrowthStage; waterManagement: WaterManagement };
export const DEFAULT_CROP_CONFIGURATION: CropConfiguration = { crop: "soybean", growthStage: "planning", waterManagement: "unknown" };

export type AgronomicEvidence = {
  crop: CropId;
  status: "insufficient_evidence";
  relevantIndicators: readonly string[];
  evidenceSource: null;
  geographicApplicability: null;
  confidenceLimitations: string;
  irrigationAssumptions: string;
};

// No reviewed regional requirement sources are available; keep the gap explicit.
export const CROP_REQUIREMENTS = CROP_CATALOG.reduce((requirements, entry) => {
  requirements[entry.id] = {
    crop: entry.id, status: "insufficient_evidence", relevantIndicators: [], evidenceSource: null,
    geographicApplicability: null,
    confidenceLimitations: "No reviewed crop-specific requirement dataset with regional applicability is available.",
    irrigationAssumptions: "No irrigation amount or schedule is inferred.",
  };
  return requirements;
}, {} as Record<CropId, AgronomicEvidence>);

export type FarmerAnalysisRequest = {
  request_version: "farmer_analysis_v1";
  selection: { latitude: number; longitude: number; grid_cell_id: string | null; horizon_months: 1 | 2 | 3; target: ForecastTarget; issue: ForecastIssueRequest["issue"] };
  physical_forecast_request: ForecastIssueRequest | null;
  forecast_request_status: "validated_request" | "awaiting_forecast_eligibility";
  crop_context: CropConfiguration;
  interpretation_status: "insufficient_crop_specific_evidence";
};

/** Crop context is carried for user workflow only; it does not alter the forecast artifact match. */
export function buildFarmerAnalysisRequest(input: { location: CoordinatePoint; gridCellId: string | null; horizon: 1 | 2 | 3; target: ForecastTarget; issue: ForecastIssueRequest["issue"]; cropContext: CropConfiguration; physicalForecastRequest: ForecastIssueRequest | null }): FarmerAnalysisRequest {
  const { location, gridCellId, horizon, target, issue, cropContext, physicalForecastRequest } = input;
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) throw new Error("Choose valid field coordinates before creating an analysis request.");
  const crop = CROP_CATALOG.find((entry) => entry.id === cropContext.crop);
  if (!crop || !crop.stages.includes(cropContext.growthStage) || !WATER_MANAGEMENT.includes(cropContext.waterManagement)) {
    throw new Error("Choose a supported crop, crop-appropriate growth stage, and water-management context.");
  }
  return {
    request_version: "farmer_analysis_v1",
    selection: { latitude: location.latitude, longitude: location.longitude, grid_cell_id: gridCellId, horizon_months: horizon, target, issue },
    physical_forecast_request: physicalForecastRequest,
    forecast_request_status: physicalForecastRequest ? "validated_request" : "awaiting_forecast_eligibility",
    crop_context: cropContext,
    interpretation_status: "insufficient_crop_specific_evidence",
  };
}

export function readCropConfiguration(value: unknown): CropConfiguration | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const crop = CROP_CATALOG.find((entry) => entry.id === row.crop);
  if (!crop || typeof row.growthStage !== "string" || !crop.stages.includes(row.growthStage as GrowthStage)
    || typeof row.waterManagement !== "string" || !WATER_MANAGEMENT.includes(row.waterManagement as WaterManagement)) return undefined;
  return { crop: crop.id, growthStage: row.growthStage as GrowthStage, waterManagement: row.waterManagement as WaterManagement };
}
