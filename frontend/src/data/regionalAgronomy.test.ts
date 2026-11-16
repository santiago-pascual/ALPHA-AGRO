import { describe, expect, it } from "vitest";
import { assessCropStageSeason, pampasMapGroup, pampasMapGroups, seasonalCropOptions, waterSignalForCrop } from "./regionalAgronomy";

describe("regional crop season context", () => {
  it("uses the Observatory's broad north/south display grouping", () => {
    expect(pampasMapGroup(-33.9)).toBe("north");
    expect(pampasMapGroup(-34.1)).toBe("south");
    expect(pampasMapGroups(-37, -63)).toEqual(["south", "west"]);
    expect(pampasMapGroups(-33, -58)).toEqual(["north", "east"]);
  });

  it("compares planning with published broad sowing months and avoids inferring later phenology", () => {
    expect(assessCropStageSeason("soybean", "planning", 11, -37)).toBe("inside-window");
    expect(assessCropStageSeason("wheat", "planning", 11, -37)).toBe("outside-window");
    expect(assessCropStageSeason("soybean", "reproductive", 11, -37)).toBe("stage-not-inferable");
    expect(assessCropStageSeason("citrus", "fruit_development", 11, -37)).toBe("no-source");
  });

  it("offers only crops whose broad regional sowing window matches the date", () => {
    expect(seasonalCropOptions(11, 15, -37)).toEqual(["soybean"]);
    expect(seasonalCropOptions(11, 25, -37)).toEqual(["soybean", "maize"]);
    expect(seasonalCropOptions(6, 10, -33)).toEqual(["wheat"]);
  });

  it("describes high and low water anomalies without labeling crop outcomes", () => {
    expect(waterSignalForCrop("below_reference_p20")).toBe("below-reference");
    expect(waterSignalForCrop("above_reference_p80")).toBe("above-reference");
    expect(waterSignalForCrop("within_reference_p20_p80")).toBe("within-reference");
    expect(waterSignalForCrop(null)).toBe("unavailable");
  });
});
