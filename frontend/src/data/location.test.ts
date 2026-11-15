import { describe, expect, it } from "vitest";
import { coordinateError, findEligibleCell } from "./location";
import type { TrendCell } from "../types";

const eligibleCells: TrendCell[] = [
  { latitude: -34, longitude: -60, validMonths: 240, slopePerDecade: null, ci95: null, pValue: null, qValue: null, significant: false },
  { latitude: -34, longitude: -59.75, validMonths: 240, slopePerDecade: null, ci95: null, pValue: null, qValue: null, significant: false },
];

describe("field coordinate coverage", () => {
  it("accepts finite latitude and longitude only within geographic ranges", () => {
    expect(coordinateError({ latitude: -34, longitude: -60 })).toBeNull();
    expect(coordinateError({ latitude: 90.01, longitude: 0 })).toContain("Latitude");
    expect(coordinateError({ latitude: 0, longitude: -180.01 })).toContain("Longitude");
    expect(coordinateError({ latitude: Number.NaN, longitude: 0 })).toContain("finite");
    expect(coordinateError({ latitude: 0, longitude: Number.POSITIVE_INFINITY })).toContain("finite");
  });

  it("uses the artifact grid-cell boundaries and supports exact outer edges", () => {
    expect(findEligibleCell({ latitude: -34.125, longitude: -60.125 }, eligibleCells, 0.25)).toBe(eligibleCells[0]);
    expect(findEligibleCell({ latitude: -33.875, longitude: -60 }, eligibleCells, 0.25)).toBe(eligibleCells[0]);
    expect(findEligibleCell({ latitude: -34, longitude: -59.625 }, eligibleCells, 0.25)).toBe(eligibleCells[1]);
  });

  it("rejects points outside or in gaps in the eligible-cell mask even inside its overall extent", () => {
    expect(findEligibleCell({ latitude: -34, longitude: -59.5 }, eligibleCells, 0.25)).toBeNull();
    expect(findEligibleCell({ latitude: -34.126, longitude: -60 }, eligibleCells, 0.25)).toBeNull();
  });

  it("fails closed when grid spacing is invalid", () => {
    expect(findEligibleCell({ latitude: -34, longitude: -60 }, eligibleCells, 0)).toBeNull();
    expect(findEligibleCell({ latitude: -34, longitude: -60 }, eligibleCells, Number.NaN)).toBeNull();
  });
});
