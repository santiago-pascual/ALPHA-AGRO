# Project status

Updated November 14, 2026. Phase 1 is at GLDAS sample acquisition and validation. The study uses soybean in Argentina's Pampas, with a provisional west/south/east/north box of `-64 -38 -57 -30` and a historical trend period of 2006–2025.

- **Verified monthly pilot.** The pipeline reused January 2020 and downloaded February through authenticated GES DISC HTTPS. Both subsets have the same grid, schema and masks. Hashes matched and February covered all 29 days. All 27 tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md#two-month-pilot).
- **Verified three-hourly checkpoint.** Earthdata HTTPS downloaded all eight January 1, 2020 UTC slots. Each Pampas subset has 896 cells and 867 valid values per soil-water layer. Checksums, temporal bounds, grid and units passed verification. All 27 tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md#three-hourly-validation).
- **Historical acquisition.** All 240 consecutive monthly v2.1 granules passed catalog discovery. Two months have verified local files. The authenticated February OPeNDAP benchmark passed exact comparison and returned 58,258 bytes in 2.46 seconds, 99.77% smaller than the full granule. OPeNDAP is the selected route. The [handoff](HANDOFF.md) has the command for the first four-month batch.

Resume from [HANDOFF.md](HANDOFF.md). See [DECISION_LOG.md](DECISION_LOG.md), [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md), and [DATA_MANIFEST.md](DATA_MANIFEST.md) for evidence and provenance.
