import { describe, expect, it } from "vitest";
import { readWaterRisk } from "./loadWaterRisk";

const archive = {
  schema_version: "water_risk_v1",
  status: "insufficient_evidence",
  data_kind: "nasa_archive",
  source: { collection: "C1342986035-GES_DISC", version: "2.1" },
  cells: [{ latitude: -37.875, longitude: -63.875, observation_day_utc: "2020-01-02", historical_storage_mm: 120 }],
};

describe("water risk archive validation", () => {
  it("exposes archived values on the verified grid", () => {
    expect(readWaterRisk(archive)[0].historical_storage_mm).toBe(120);
  });
  it("withholds fixtures, operational claims, misaligned grid and duplicate cells", () => {
    expect(() => readWaterRisk({ ...archive, data_kind: "fixture" })).toThrow();
    expect(() => readWaterRisk({ ...archive, status: "operational" })).toThrow();
    expect(() => readWaterRisk({ ...archive, cells: [{ ...archive.cells[0], latitude: -37.75 }] })).toThrow();
    expect(() => readWaterRisk({ ...archive, cells: [...archive.cells, ...archive.cells] })).toThrow();
  });
});
