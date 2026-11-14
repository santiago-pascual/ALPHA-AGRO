# Project status

Phase 1 has completed its first GLDAS historical trend analysis. The study uses a provisional west/south/east/north box of `-64 -38 -57 -30` in the Pampas and a historical trend period of 2006–2025.

- **Verified monthly pilot.** The pipeline reused January 2020 and downloaded February through authenticated GES DISC HTTPS. Both subsets have the same grid, schema and masks. Hashes matched and February covered all 29 days. All 27 tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md#two-month-pilot).
- **Verified three-hourly checkpoint.** Earthdata HTTPS downloaded all eight January 1, 2020 UTC slots. Each Pampas subset has 896 cells and 867 valid values per soil-water layer. Checksums, temporal bounds, grid and units passed verification. All 27 tests passed. See the [acquisition report](PHASE_1_ACQUISITION_REPORT.md#three-hourly-validation).
- **Historical acquisition complete.** All 240 GLDAS Noah v2.1 regional OPeNDAP exports passed file and provenance checks. Monthly intervals are continuous from January 2006 through December 2025. The same 867 of 896 cells have all three soil-water layers in every month. See the [manifest](DATA_MANIFEST.md).
- **First historical results.** The regional 0–100 cm trend was −2.83 mm per decade (95% HAC interval −23.69 to +18.03). No individual cell passed the 5% false discovery rate threshold. [Real-data results](REAL_DATA_RESULTS.md)
- **Second-phase findings.** Regional sensitivity intervals span zero. Anomalies persisted over successive months. The northern and southern point estimates differ, with wide uncertainty. [Scientific discovery results](SCIENTIFIC_DISCOVERY_RESULTS.md)
- **Next milestone.** Benchmark regional exports for rainfall, evapotranspiration, temperature, and runoff. [Acquisition plan](SCIENTIFIC_DISCOVERY_RESULTS.md#earth-system-relationships)

Resume from [HANDOFF.md](HANDOFF.md). See [DECISION_LOG.md](DECISION_LOG.md), [EXPERIMENT_LOG.md](EXPERIMENT_LOG.md), and [DATA_MANIFEST.md](DATA_MANIFEST.md) for evidence and provenance.
