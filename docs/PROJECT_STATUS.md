# Project status

Updated November 14, 2026. Phase 1 is at GLDAS sample acquisition and validation. The study uses soybean in Argentina's Pampas, with a provisional west/south/east/north box of `-64 -38 -57 -30` and a historical trend period of 2006–2025.

- **Verified monthly checkpoint.** January 2020 GLDAS Noah v2.1 was imported, checked against catalog metadata, and subset to 896 native grid cells. Each soil-water layer has 867 valid and 29 masked cells. A rerun reproduced the subset byte for byte. Six tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md).
- **Verified three-hourly checkpoint.** Earthdata HTTPS downloaded all eight January 1, 2020 UTC slots. Each Pampas subset has 896 cells and 867 valid values per soil-water layer. Checksums, temporal bounds, grid and units passed verification. All 27 tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md#three-hourly-validation).
- **Next scientific milestone.** Verify a two-month pilot and benchmark spatial subsetting before building the 2006–2025 regional soil-water series. Report coverage, trend magnitude, uncertainty, and significance with attention to seasonality and autocorrelation. Prediction horizons of 7, 14, and 28 days remain research candidates.

Resume from [HANDOFF.md](HANDOFF.md). See [DECISION_LOG.md](DECISION_LOG.md), [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md), and [DATA_MANIFEST.md](DATA_MANIFEST.md) for evidence and provenance.
