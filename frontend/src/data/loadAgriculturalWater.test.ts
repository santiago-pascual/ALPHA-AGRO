import { describe, expect, it } from "vitest";
import { readAgriculturalWater, selectMoisture } from "./loadAgriculturalWater";

const fixture = {
  schema_version: "agricultural_water_v1",
  status: "forecast_unavailable",
  source: { collection: "C3480440870-NSIDC_CPRD", version: "008", observed_start: "2020-01-01T00:00:00Z",
    observed_end: "2020-01-01T03:00:00Z", locally_accessed_at: "2020-01-03T00:00:00Z" },
  grid: { projection: "EPSG:6933", latitude: [-34, -34.08], longitude: [-60.1, -60],
    moisture: [[null, .32], [.4, .36]], valid_cells: 3 },
  forecast: { issue_date: null, model: null },
};

describe("agricultural forecast gate", () => {
  it("loads the model estimate without filling masked or out-of-bounds cells", () => {
    const parsed = readAgriculturalWater(fixture);
    expect(selectMoisture(parsed, -34, -60)?.value).toBe(.32);
    expect(selectMoisture(parsed, -34, -60.1)).toBeUndefined();
    expect(selectMoisture(parsed, -34, -62)).toBeUndefined();
  });

  it("refuses a claimed issue or impossible access ordering", () => {
    expect(() => readAgriculturalWater({ ...fixture, forecast: { ...fixture.forecast, issue_date: "2020-01-01" } })).toThrow();
    expect(() => readAgriculturalWater({ ...fixture, source: { ...fixture.source, locally_accessed_at: "2019-01-01" } })).toThrow();
  });
});
