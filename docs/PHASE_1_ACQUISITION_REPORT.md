# Phase 1 GLDAS acquisition report

## November 14, 2026 status

| Check | Evidence |
| --- | --- |
| Event gate | The workspace clock read 08:41 ART on first inspection. Competition data access and code are gated until 09:00 ART by the repository instructions. |
| Catalog discovery | Public NASA CMR metadata is reachable. The monthly selection matches all 240 month keys in 2006–2025. |
| Sample identified | January 2020 GLDAS Noah monthly 2.1, CMR granule `G1694852901-GES_DISC`, one NetCDF-4 granule of about 24 MB per CMR. CMR period is January 1 through January 31, 2020 UTC. |
| Authentication | The initial runtime check found no Earthdata token, username/password environment variables or user-profile netrc. An authenticated granule response has not been verified. |
| Local sample validated | Opened after 09:00 ART. The supplied file has 24,895,215 bytes and SHA-256 `5b60e97e2c61ad08cd3d8dc2733508607824446438803abd83e1a815c0bba523`. The official catalog identifies the same filename and period. The hash establishes local byte identity across copies, and a provider checksum was not available from the inspected metadata. |
| Pipeline implementation | The monthly local-file path and checksum-verified rerun passed against the supplied file. An unauthenticated HEAD against the official granule returned HTTP 303. CMR resolved all eight three-hourly slots on January 1, 2020. No authenticated terminal transfer or three-hourly schema check has been completed. |

[Official sample granule](https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/2020/GLDAS_NOAH025_M.A202001.021.nc4) · [CMR granule metadata](https://cmr.earthdata.nasa.gov/search/granules.umm_json?concept_id=G1694852901-GES_DISC)

## Measured validation

The NetCDF-4 file contains 40 variables and dimensions `time=1`, `bnds=2`, `lat=600`, and `lon=1440`. Latitude and longitude are ascending on the native 0.25° grid. The decoded UTC label is 2020-01-01 00:00 with bounds from January 1 00:00 to February 1 00:00. The seven checked variables use `cell_methods = "time: mean"`. The provisional cutout contains 32 × 28 grid centres, spanning 37.875°S to 30.125°S and 63.875°W to 57.125°W.

| Field | Valid / total | Masked | Range in native units |
| --- | ---: | ---: | --- |
| `SoilMoi0_10cm_inst` | 867 / 896 | 29 | 13.085–39.961 kg/m² |
| `SoilMoi10_40cm_inst` | 867 / 896 | 29 | 25.008–120.755 kg/m² |
| `SoilMoi40_100cm_inst` | 867 / 896 | 29 | 28.642–245.779 kg/m² |
| `SoilMoi100_200cm_inst` | 867 / 896 | 29 | 158.342–426.514 kg/m² |
| `RootMoist_inst` | 867 / 896 | 29 | 39.957–473.392 kg/m² |
| `Rainf_f_tavg` | 877 / 896 | 19 | 2.074×10⁻⁵–6.545×10⁻⁵ kg/m²/s |
| `Tair_f_inst` | 877 / 896 | 19 | 293.379–301.949 K |

The science fields checked encode fill and missing values as −9999. The selected fields had no unmasked non-finite values and no referenced ancillary QA variables. This is a format and plausibility check. The geographic causes of masking and the accuracy of the model have not been established.

## Reproduce the sample

From the repository root with the README environment installed, import the official browser download. Adjust the file path if you saved the granule elsewhere.

```powershell
.\.venv\Scripts\python.exe -m gldas --product monthly --start 2020-01-01 --end 2020-01-31 --local-file "$env:USERPROFILE\Downloads\GLDAS_NOAH025_M.A202001.021.nc4"
.\.venv\Scripts\python.exe -m pytest -q
```

The CLI uses inclusive UTC dates, accepts bounds as west, south, east, north, and defaults to the provisional Pampas rectangle. Monthly requests must align to full calendar months. Original bytes and a SHA-256 provenance manifest are written under ignored `data/phase1/raw/`. The cutout and machine-readable validation report are written under `data/phase1/subsets/-64.0_-38.0_-57.0_-30.0/`. Rerun the same date command without `--local-file` to reuse the checksum-verified raw file. Keep output on a local filesystem that supports hard links for raw publication.

## Authenticated download check

To verify programmatic access, generate an Earthdata user token and enter it at the hidden prompt in an interactive terminal. Authorize the GES DISC app with Earthdata Login if required. The CLI also accepts `EARTHDATA_TOKEN` in its process environment. A fresh output directory forces a real transfer instead of reusing the validated local sample. [Earthdata account guidance](https://urs.earthdata.nasa.gov/documentation/what_do_i_need_to_know) · [Earthdata token guidance](https://urs.earthdata.nasa.gov/documentation/for_users/user_token)

```powershell
.\.venv\Scripts\python.exe -m gldas --product monthly --start 2020-01-01 --end 2020-01-31 --prompt-token --output data/phase1-direct
.\.venv\Scripts\python.exe -m gldas --product 3hourly --start 2020-01-01 --end 2020-01-01 --prompt-token
```

Any redirect from the direct endpoint is treated as requiring manual attention. If authenticated direct HTTPS still redirects, check GES DISC authorization and the token-compatible Earthdata download route. Browser import remains available for one granule at a time. Inspect the first actual three-hourly file for fields, grid and time semantics before increasing its batch size.

## Pipeline acceptance criteria

Six automated tests passed, covering the batch limit, source URL restriction, retry classification, preservation and checksum verification, and validation of fill values and units. The default limit is eight files per request, and a request cannot exceed 200. Only the supplied monthly granule was processed in this run.

## Next scientific milestone

After validating monthly and three-hourly samples, acquire the version-pinned monthly series in controlled batches and verify all expected months after download. Produce a reproducible 2006–2025 seasonal soil-water trend with coverage diagnostics, magnitude and uncertainty. Compare the result across predeclared Pampas subregions before extending to prediction or cross-product analysis.
