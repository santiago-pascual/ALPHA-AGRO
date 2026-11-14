import type { DashboardDataset, MonthlyObservation, TrendCell } from "../types";

const START_YEAR = 2006;
const MONTH_COUNT = 240;
const GRID_ROWS = 32;
const GRID_COLUMNS = 28;

const demoSeries: MonthlyObservation[] = Array.from({ length: MONTH_COUNT }, (_, index) => {
  const year = START_YEAR + Math.floor(index / 12);
  const month = (index % 12) + 1;
  const seasonal = Math.cos(((month - 7) / 12) * Math.PI * 2) * 24;
  const slowCycle = Math.sin(index / 21) * 11 + Math.cos(index / 47) * 8;
  const illustrativeDrift = -0.055 * index;
  const anomaly = seasonal * 0.34 + slowCycle + illustrativeDrift;

  return {
    month: year + "-" + String(month).padStart(2, "0") + "-01",
    storageMm: 218 + seasonal + slowCycle + illustrativeDrift,
    anomalyMm: anomaly,
    coverage: 0.91 + ((index * 7) % 9) / 100,
  };
});

const demoCells: TrendCell[] = Array.from(
  { length: GRID_ROWS * GRID_COLUMNS },
  (_, index) => {
    const row = Math.floor(index / GRID_COLUMNS);
    const column = index % GRID_COLUMNS;
    const latitude = -37.875 + row * 0.25;
    const longitude = -63.875 + column * 0.25;
    const slope =
      18 * Math.sin(row * 0.31) * Math.cos(column * 0.22) +
      7 * Math.sin((row + column) * 0.17) -
      1.8;

    return {
      latitude,
      longitude,
      validMonths: 240,
      slopePerDecade: slope,
      ci95: [slope - 19, slope + 19],
      pValue: 0.18 + (index % 7) * 0.035,
      qValue: 0.61 + (index % 5) * 0.04,
      significant: false,
    };
  },
);

export const demoDataset: DashboardDataset = {
  mode: "demo",
  source: "Synthetic demonstration data",
  variable: "soil_water_storage_0_100_cm",
  units: "mm water equivalent",
  start: "2006-01-01",
  end: "2025-12-01",
  months: 240,
  gridCells: GRID_ROWS * GRID_COLUMNS,
  resolutionDegrees: 0.25,
  meanCoverage: 0.967,
  minimumCoverage: 0.914,
  missingProfileFraction: 0.033,
  latitudeCount: GRID_ROWS,
  longitudeCount: GRID_COLUMNS,
  eligibleCells: GRID_ROWS * GRID_COLUMNS,
  areaWeighting: "Synthetic demonstration metadata only",
  boundaryRule: "Synthetic demonstration grid; not a validated geographic footprint",
  inputFiles: [],
  regionalTrend: {
    slopePerDecade: -7.6,
    ci95: [-24.8, 9.6],
    pValue: 0.39,
    seasonalSenSlopePerDecade: -5.2,
    seasonalKendallTau: -0.06,
  },
  series: demoSeries,
  cells: demoCells,
  limitations: [
    "Every displayed value and grid cell in DEMO mode is synthetic and fictitious.",
    "This demonstration does not contain NASA observations or validated regional findings.",
    "Soil-water trends do not establish crop stress, yield effects, or crop damage.",
  ],
};
