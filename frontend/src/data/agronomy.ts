import type { ForecastIssueRequest } from "./forecast";
import type { CoordinatePoint } from "./location";
import type { ForecastTarget } from "../types/forecast";

export type CropId = "soybean" | "maize" | "wheat";
export type GrowthStage = "planning" | "vegetative" | "reproductive" | "maturation";
export type WaterManagement = "rainfed" | "irrigated";

export type CropConfiguration = {
  crop: CropId;
  growthStage: GrowthStage;
  waterManagement: WaterManagement;
};

export const DEFAULT_CROP_CONFIGURATION: CropConfiguration = {
  crop: "soybean",
  growthStage: "planning",
  waterManagement: "rainfed",
};

export const CROP_IDS: readonly CropId[] = ["soybean", "maize", "wheat"];
export const GROWTH_STAGES: readonly GrowthStage[] = ["planning", "vegetative", "reproductive", "maturation"];
export const WATER_MANAGEMENT: readonly WaterManagement[] = ["rainfed", "irrigated"];

export type AgronomicEvidence = {
  crop: CropId;
  status: "insufficient_evidence";
  relevantIndicators: readonly string[];
  evidenceSource: null;
  geographicApplicability: null;
  confidenceLimitations: string;
  irrigationAssumptions: string;
};

// Deliberately empty of thresholds and recommendations until a traceable source
// with Pampas applicability is reviewed and encoded.
export const CROP_REQUIREMENTS: Record<CropId, AgronomicEvidence> = {
  soybean: { crop: "soybean", status: "insufficient_evidence", relevantIndicators: [], evidenceSource: null, geographicApplicability: null, confidenceLimitations: "No reviewed crop-specific requirement dataset is available.", irrigationAssumptions: "No irrigation amount or schedule is inferred." },
  maize: { crop: "maize", status: "insufficient_evidence", relevantIndicators: [], evidenceSource: null, geographicApplicability: null, confidenceLimitations: "No reviewed crop-specific requirement dataset is available.", irrigationAssumptions: "No irrigation amount or schedule is inferred." },
  wheat: { crop: "wheat", status: "insufficient_evidence", relevantIndicators: [], evidenceSource: null, geographicApplicability: null, confidenceLimitations: "No reviewed crop-specific requirement dataset is available.", irrigationAssumptions: "No irrigation amount or schedule is inferred." },
};

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
  if (!CROP_IDS.includes(cropContext.crop) || !GROWTH_STAGES.includes(cropContext.growthStage) || !WATER_MANAGEMENT.includes(cropContext.waterManagement)) {
    throw new Error("Choose a supported crop, growth stage, and water-management context.");
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
  if (typeof row.crop !== "string" || !CROP_IDS.includes(row.crop as CropId)
    || typeof row.growthStage !== "string" || !GROWTH_STAGES.includes(row.growthStage as GrowthStage)
    || typeof row.waterManagement !== "string" || !WATER_MANAGEMENT.includes(row.waterManagement as WaterManagement)) return undefined;
  return { crop: row.crop as CropId, growthStage: row.growthStage as GrowthStage, waterManagement: row.waterManagement as WaterManagement };
}
