# Experiment log

| Date (ART) | Check | Result |
| --- | --- | --- |
| 2026-11-14 | CMR GLDAS Noah monthly v2.1 from 2006-01 through 2025-12 | All 240 expected monthly keys found in catalog metadata. |
| 2026-11-14 | January 2020 monthly granule import and validation | Passed on the supplied NASA file. Native 0.25° grid. The cutout has 32 × 28 cells and 867 valid values per soil layer. Time bounds are January 1 to February 1 UTC. |
| 2026-11-14 | Monthly rerun and automated tests | Subset SHA-256 matched across reruns. All six tests passed. |
| 2026-11-14 | January 1, 2020 GLDAS Noah three-hourly batch | Authenticated download and validation passed for all eight UTC slots. Raw and subset hashes matched. The seven checked fields have the same coordinates, units and masks as the monthly sample. All 27 tests passed. |
| 2026-11-14 | Earthdata access preflight | No configured token or local Earthdata credential file detected. The browser profile required login. Prior unauthenticated data probe returned HTTP 303. |

See [acquisition evidence](PHASE_1_ACQUISITION_REPORT.md) and [local artifact identity](DATA_MANIFEST.md).
