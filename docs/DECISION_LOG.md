# Research decisions

| Date (ART) | Decision | Rationale |
| --- | --- | --- |
| 2026-11-14 | Use the provisional Pampas box and soybean as the first use case. Target 2006–2025 for trends. | The box gives a reproducible acquisition window. Regional and crop inference require documented spatial support. |
| 2026-11-14 | Pin GLDAS Noah v2.1 monthly and three-hourly main streams. | The monthly series supports historical trends. Three-hourly samples establish the cadence for daily conditions. Both products use the same underlying simulation. |
| 2026-11-14 | Preserve source bytes and publish geographic derivatives separately. | Checksums identify the local input, and the source remains available for revalidation. |
| 2026-11-14 | Keep the scientific checkpoint on `feature/research`. | A shared branch carries reproducible code and evidence between computers while the team reviews integration. |
| 2026-11-14 | Start the next authenticated check with one UTC day. | Eight granules are enough to test cadence and encoding before scaling. A seasonally low soil-water percentile remains a hydrological candidate, with prediction work downstream of validation. |
| 2026-11-14 | Use authenticated HTTPS as the historical fallback. | The February OPeNDAP probe returned no data. Require an authenticated matching export and measured transfer before adopting spatial subsetting. |
| 2026-11-14 | Use NASA OPeNDAP for the monthly 0–100 cm soil-water inputs. | The authenticated February export matched the local cutout exactly for the three layers, coordinates and decoded times. Whole-granule HTTPS remains available for fallback and additional variables. |
| 2026-11-14 | Resume historical retrieval in four-month batches within one authenticated run. | The first four exports passed continuity, schema and checksum checks. The batch runner retains completed months for restart. |
| 2026-11-14 | Use the common valid-cell mask for the historical 0–100 cm series. | The same 867 grid cells contain all three layers across all 240 months. |
| 2026-11-14 | Use 12 monthly HAC lags for the primary interval and report sensitivity at 6 and 24 lags. | Regression residuals show serial dependence. The interval spans zero at all three lag settings. |
| 2026-11-14 | Fix second-phase periods, boundaries, and dependence checks before computing results. | Sensitivity results remain interpretable with a known first-phase estimate. [Design](SCIENTIFIC_DISCOVERY_DESIGN.md) |
| 2026-11-14 | Validate a five-field February export before extending the archive. Use common support, lags 0–6, and a fixed north–south split at 34°S. | The full local granule tests extraction equivalence. The fixed analysis rules limit opportunistic comparisons. [Validation](MULTIVARIABLE_DATA_VALIDATION.md) |
