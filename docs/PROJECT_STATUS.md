# Project status

Updated November 14, 2026. Phase 1 is at GLDAS sample acquisition and validation. The study uses soybean in Argentina's Pampas, with a provisional west/south/east/north box of `-64 -38 -57 -30` and a historical trend period of 2006–2025.

- **Verified monthly checkpoint.** January 2020 GLDAS Noah v2.1 was imported, checked against catalog metadata, and subset to 896 native grid cells. Each soil-water layer has 867 valid and 29 masked cells. A rerun reproduced the subset byte for byte. Six tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md).
- **Pending three-hourly checkpoint.** CMR lists all eight January 1, 2020 UTC slots. The authenticated redirect contained the expected filename and a query string. The CLI now accepts the observed CloudFront host and expected granule filename while keeping the query opaque and the token on NASA hosts. A live download and file validation are pending.
- **Next scientific milestone.** After checking the three-hourly files, verify a small monthly batch and then build the 2006–2025 regional soil-water series. Report coverage, trend magnitude, uncertainty, and significance with attention to seasonality and autocorrelation. Prediction horizons of 7, 14, and 28 days remain research candidates.

Resume from [HANDOFF.md](HANDOFF.md). See [DECISION_LOG.md](DECISION_LOG.md), [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md), and [DATA_MANIFEST.md](DATA_MANIFEST.md) for evidence and provenance.
