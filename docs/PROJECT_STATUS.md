# Project status

Updated November 14, 2026. Phase 1 is at GLDAS sample acquisition and validation. The study uses soybean in Argentina's Pampas, with a provisional west/south/east/north box of `-64 -38 -57 -30` and a historical trend period of 2006–2025.

- **Verified monthly pilot.** The pipeline reused January 2020 and downloaded February through authenticated GES DISC HTTPS. Both subsets have the same grid, schema and masks. Hashes matched and February covered all 29 days. All 27 tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md#two-month-pilot).
- **Verified three-hourly checkpoint.** Earthdata HTTPS downloaded all eight January 1, 2020 UTC slots. Each Pampas subset has 896 cells and 867 valid values per soil-water layer. Checksums, temporal bounds, grid and units passed verification. All 27 tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md#three-hourly-validation).
- **Historical acquisition complete.** All 240 GLDAS Noah v2.1 regional OPeNDAP exports passed file and provenance checks. Monthly intervals are continuous from January 2006 through December 2025. The same 867 of 896 cells have all three soil-water layers in every month. See the [manifest](DATA_MANIFEST.md).
- **Next milestone.** Build the area-weighted 0–100 cm monthly soil-water series and estimate its historical trend, accounting for seasonality and temporal dependence. [Scientific plan](SCIENTIFIC_PLAN.md)

Resume from [HANDOFF.md](HANDOFF.md). See [DECISION_LOG.md](DECISION_LOG.md), [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md), and [DATA_MANIFEST.md](DATA_MANIFEST.md) for evidence and provenance.
