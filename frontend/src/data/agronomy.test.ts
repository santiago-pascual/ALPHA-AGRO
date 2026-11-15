import { describe, expect, it } from "vitest";
import { buildFarmerAnalysisRequest, CROP_CATALOG, CROP_IDS, CROP_REQUIREMENTS, DEFAULT_CROP_CONFIGURATION, readCropConfiguration } from "./agronomy";
import { historicalContextForForecast } from "./farmerAnalysis";
import { adaptTrendAnalysis } from "./loadTrend";
import { trendAnalysisFixture } from "./__fixtures__/trendAnalysis.fixture";
import type { ForecastArtifact } from "../types/forecast";
import type { ForecastIssueRequest } from "./forecast";

const dataset = adaptTrendAnalysis(trendAnalysisFixture);
const physicalForecast: ForecastIssueRequest = {
  latitude: -34, longitude: -60, grid_cell_id: "gldas-noah-v2.1:-34.0000:-60.0000", horizon_months: 1,
  target: "storage", scope: "spatial", issue: { mode: "latest_verified_eligible" }, model_id: "seasonal_climatology", artifact_version: "forecast_v1",
};

describe("farmer crop context", () => {
  it("keeps the physical forecast unchanged and marks crop interpretation unsupported", () => {
    const result = buildFarmerAnalysisRequest({ location: { latitude: -34, longitude: -60 }, gridCellId: physicalForecast.grid_cell_id, horizon: 1, target: "storage", issue: physicalForecast.issue, cropContext: { crop: "maize", growthStage: "reproductive", waterManagement: "irrigated" }, physicalForecastRequest: physicalForecast });
    expect(result).toMatchObject({ request_version: "farmer_analysis_v1", physical_forecast_request: physicalForecast, forecast_request_status: "validated_request", selection: { latitude: -34, longitude: -60, grid_cell_id: physicalForecast.grid_cell_id }, crop_context: { crop: "maize", growthStage: "reproductive", waterManagement: "irrigated" }, interpretation_status: "insufficient_crop_specific_evidence" });
    const awaiting = buildFarmerAnalysisRequest({ location: { latitude: -34, longitude: -60 }, gridCellId: physicalForecast.grid_cell_id, horizon: 1, target: "storage", issue: physicalForecast.issue, cropContext: DEFAULT_CROP_CONFIGURATION, physicalForecastRequest: null });
    expect(awaiting).toMatchObject({ physical_forecast_request: null, forecast_request_status: "awaiting_forecast_eligibility" });
  });

  it("does not provide numeric agronomic thresholds or source-free recommendations", () => {
    expect(CROP_IDS).toEqual(["soybean", "maize", "wheat", "sunflower", "barley", "sorghum", "sugarcane", "grapevine", "citrus", "yerba_mate"]);
    for (const crop of CROP_IDS) {
      expect(CROP_REQUIREMENTS[crop]).toMatchObject({ status: "insufficient_evidence", relevantIndicators: [], evidenceSource: null, geographicApplicability: null });
    }
    expect(DEFAULT_CROP_CONFIGURATION).toMatchObject({ crop: "soybean", growthStage: "planning", waterManagement: "unknown" });
  });

  it("keeps crop stages specific to annual or perennial configuration and preserves uncertainty", () => {
    const annual = CROP_CATALOG.find((crop) => crop.id === "wheat")!;
    const perennial = CROP_CATALOG.find((crop) => crop.id === "citrus")!;
    expect(annual.stages).toContain("planning");
    expect(perennial.stages).toContain("fruit_development");
    expect(perennial.stages).not.toContain("planning");
    expect(perennial.geographicContext).toBeNull();
    expect(perennial.evidenceReferences).toEqual([]);
    expect(readCropConfiguration({ crop: "citrus", growthStage: "planning", waterManagement: "irrigated" })).toBeUndefined();
    expect(readCropConfiguration({ crop: "citrus", growthStage: "fruit_development", waterManagement: "unknown" })).toEqual({ crop: "citrus", growthStage: "fruit_development", waterManagement: "unknown" });
  });

  it("limits the latest observation and same-month reference to the artifact cutoff", () => {
    const artifact = { input_observation_cutoff: "2006-01-31T23:59:59Z", target_month: "2006-01" } as ForecastArtifact;
    const context = historicalContextForForecast(dataset, artifact);
    expect(context.latestObservation?.month).toBe("2006-01-01");
    expect(context.seasonalReferenceCount).toBe(1);
    expect(context.seasonalStorageReferenceMm).toBeGreaterThan(0);
    const beforeFirstMonth = historicalContextForForecast(dataset, { ...artifact, input_observation_cutoff: "2005-12-31T23:59:59Z" });
    expect(beforeFirstMonth.latestObservation).toBeNull();
  });
});
