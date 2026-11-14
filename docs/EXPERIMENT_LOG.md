# Experiment log

| Date (ART) | Check | Result |
| --- | --- | --- |
| 2026-11-14 | CMR GLDAS Noah monthly v2.1 from 2006-01 through 2025-12 | All 240 expected monthly keys found in catalog metadata. |
| 2026-11-14 | January 2020 monthly granule import and validation | Passed on the supplied NASA file. Native 0.25° grid. The cutout has 32 × 28 cells and 867 valid values per soil layer. Time bounds are January 1 to February 1 UTC. |
| 2026-11-14 | Monthly rerun and automated tests | Subset SHA-256 matched across reruns. All six tests passed. |
| 2026-11-14 | January 1, 2020 GLDAS Noah three-hourly batch | Authenticated download and validation passed for all eight UTC slots. Raw and subset hashes matched. The seven checked fields have the same coordinates, units and masks as the monthly sample. All 27 tests passed. |
| 2026-11-14 | Earthdata access preflight | No configured token or local Earthdata credential file detected. The browser profile required login. Prior unauthenticated data probe returned HTTP 303. |

| 2026-11-14 | January–February 2020 monthly pilot | Reused January and downloaded February through authenticated HTTPS. Both raw and subset hashes matched, grid and masks agreed, and February bounds covered 29 days. All 27 tests passed. |
| 2026-11-14 | Constrained February OPeNDAP request | Unauthenticated HTTP 302, zero response body bytes, 1.04 seconds. No NetCDF export or numerical comparison was available. The comparison code passed a local same-file control. |
| 2026-11-14 | Historical monthly catalog and first batch | 240 unique consecutive v2.1 granules passed pinned discovery. The first four months of 2006 resolved, then stopped before transfer because the shell lacked a credential. |
| 2026-11-14 | Authenticated February OPeNDAP | HTTP 200, 58,258 bytes in 2.46 seconds. Exact comparison against the local cutout passed for decoded times and bounds, grid, units, masks and all retained values. |
| 2026-11-14 | Historical OPeNDAP batch 1 | January–April 2006 passed catalog and file validation. Recomputed hashes matched, and each export has 867 valid and 29 masked values per layer. The four files total 232,879 bytes. |
| 2026-11-14 | Full historical acquisition audit | 240 exports passed schema, provenance and checksum checks. Monthly intervals are continuous, with 240 distinct granule IDs and the same 867 joint valid cells throughout. Total export size is 13,919,667 bytes. |
| 2026-11-14 | Historical soil-water trends, 2006–2025 | The seasonal OLS estimate was −2.83 mm per decade. Its 95% HAC interval was −23.69 to +18.03 mm per decade. Two offline runs produced identical JSON and figures. [Results](REAL_DATA_RESULTS.md) |

See [acquisition evidence](PHASE_1_ACQUISITION_REPORT.md) and [local artifact identity](DATA_MANIFEST.md).
