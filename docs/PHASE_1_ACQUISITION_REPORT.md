# Phase 1 GLDAS acquisition report

## November 14, 2026 status

| Check | Evidence |
| --- | --- |
| Event gate | The workspace clock read 08:41 ART on first inspection. Competition data access and code are gated until 09:00 ART by the repository instructions. |
| Catalog discovery | Public NASA CMR metadata is reachable. The monthly selection matches all 240 month keys in 2006–2025. |
| Sample identified | January 2020 GLDAS Noah monthly 2.1, CMR granule `G1694852901-GES_DISC`, one NetCDF-4 granule of about 24 MB per CMR. CMR period is January 1 through January 31, 2020 UTC. |
| Authentication | An interactive PowerShell run using the hidden Earthdata token prompt successfully downloaded all eight three-hourly granules through GES DISC. |
| Local sample validated | Opened after 09:00 ART. The supplied file has 24,895,215 bytes and SHA-256 `5b60e97e2c61ad08cd3d8dc2733508607824446438803abd83e1a815c0bba523`. The official catalog identifies the same filename and period. The hash establishes local byte identity across copies, and a provider checksum was not available from the inspected metadata. |
| Pipeline implementation | The monthly local-file path and checksum-verified rerun passed against the supplied file. The authenticated three-hourly import, subset export and schema checks passed for all eight catalog slots. |

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

The CLI allows a bounded sign-in exchange between the GES DISC data host and Earthdata Login. If Earthdata returns a login page or denies access, authorize the archive in the browser with the account that issued the token. Browser import remains available for one granule at a time. Inspect the first actual three-hourly file for fields, grid and time semantics before increasing its batch size. [NASA GESDISC DATA ARCHIVE authorization](https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ)

## Three-hourly validation

All eight January 1, 2020 granule labels from 00:00 to 21:00 UTC were verified against NASA CMR and decoded from the files. The raw files total 153,194,072 bytes. The raw and subset SHA-256 hashes were recomputed and matched their manifests and reports. The source schema was consistent across the batch, with 40 variables and dimensions `time=1`, `bnds=2`, `lat=600` and `lon=1440`.

The eight subsets share the monthly sample's coordinates, units and per-field masks for all seven checked fields. Each soil storage field has 867 valid cells and 29 masked cells per slot. Rainfall and temperature forcing each have 877 valid cells and 19 masked cells per slot. All seven fields use −9999 for fill and missing values, and none references an ancillary QA field. These checks establish file integrity and schema consistency for this sample.

The three-hourly soil-water and air-temperature fields are instantaneous. Rainfall forcing is a mean rate over the preceding three hours. The first time bounds are December 31 at 21:00 to January 1 at 00:00 UTC. The final bounds are January 1 at 18:00 to 21:00 UTC. For a January 1 UTC rainfall total, multiply each interval mean rate by 10,800 seconds and sum the eight intervals ending from January 1 at 03:00 to January 2 at 00:00. The monthly fields are averages over January. One three-hourly day provides a schema and mask comparison and cannot reproduce the monthly values.

## Pipeline checks

All 27 automated tests passed. They cover the batch limit, source URL and redirect restrictions, credential handling, retries, preservation and checksums, fill values and units. The default limit is eight files per request, and a request cannot exceed 200.

## Next scientific milestone

Run the [two-month pilot](HANDOFF.md#reproduce-on-windows), benchmark spatial subsetting, then acquire the version-pinned monthly series in controlled batches and verify all expected months. Produce a reproducible 2006–2025 seasonal soil-water trend with coverage diagnostics, magnitude, uncertainty and statistical significance. Compare the result across predeclared Pampas subregions before extending to prediction or cross-product analysis.
