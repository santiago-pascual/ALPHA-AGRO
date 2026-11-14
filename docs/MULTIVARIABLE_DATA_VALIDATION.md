# GLDAS multivariable data validation

## February 2020 gate

The NASA GES DISC OPeNDAP request retrieved **77,585 bytes in 2.39 seconds** for the five driver fields and coordinates. It used collection `C1342986036-GES_DISC`, GLDAS Noah v2.1 main production, granule `G1709252645-GES_DISC`. The reference was the existing SHA-256-verified full February granule (24,978,395 bytes). The regional export was 99.69% smaller. [NASA product](https://doi.org/10.5067/SXAVCZFAQLNO)

For all five variables, valid values and masks were exactly equal, with a maximum absolute difference of **0**. Dimensions were `(time, lat, lon)` with shape `(1, 32, 28)`. The 0.25° native grid matched in ascending order over 38–30°S and 64–57°W. Decoded time bounds matched February 1–March 1, 2020 UTC. Both `_FillValue` and `missing_value` were −9999 in the pilot. All five variable attributes specified `time: mean`.

| Field | Native units | Valid / 896 | Conversion for analysis |
| --- | --- | ---: | --- |
| `Rainf_f_tavg` (total precipitation forcing) | kg m⁻² s⁻¹ | 877 | Multiply by seconds in month for mm/month |
| `Evap_tavg` | kg m⁻² s⁻¹ | 867 | Multiply by seconds in month for mm/month |
| `Tair_f_inst` (air-temperature forcing) | K | 877 | Subtract 273.15 for °C |
| `Qs_acc` (surface runoff) | kg m⁻² | 867 | Multiply mean 3-hour accumulation by 8 × days in month |
| `Qsb_acc` (subsurface runoff) | kg m⁻² | 867 | Multiply mean 3-hour accumulation by 8 × days in month |

Use water equivalent at 1,000 kg/m³. The monthly product averages three-hourly fields, including the shorter accumulations. Temperature is a monthly average of instantaneous forcing samples. [NASA GLDAS version 2 guide, section 4.2](https://hydro1.gesdisc.eosdis.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/doc/README_GLDAS2.pdf)

## Reproduction

Use the existing environment, the verified soil-water exports and their provenance files, and the January and February full granules in `data/phase1/raw/`. Reuse the existing Earthdata credential setup for retrieval. [Handoff](HANDOFF.md#earthdata-authentication) · [Reference checksums](DATA_MANIFEST.md)

```powershell
.\.venv\Scripts\python.exe -m gldas.multivariable
.\.venv\Scripts\python.exe -m gldas.multivariable --months 240
.\.venv\Scripts\python.exe -m gldas.relationships
```

The first command validates the one-month gate. The second checks it again, then resumes by validating the size, checksum, schema, and provenance of saved monthly exports. It reads the granule IDs from the existing audited soil-water manifests. January 2020 uses a crop of the validated local full granule. Each new month is published with its manifest in one atomic directory rename. Requests are sequential, with bounded retries and per-request time and size limits. The February pilot projected approximately 18.54 MB across 239 NASA responses including the pilot, with no paid API or storage service. Raw NetCDF files remain under ignored `data/phase1/multivariable-opendap/`. Use a fresh output directory via `--output` when repeating the offline analysis.

The preprocessing uses only cells with all three soil-water layers and all five drivers valid in the same month. It applies spherical cell area weights and requires at least 80% joint area coverage for the study box and each half. Coverage is recorded monthly. Missing values remain masked and no values are imputed. The soil-water archive and first-phase results are unchanged.

All 240 months passed continuity, provenance, and integrity checks. The 239 OPeNDAP response bodies totaled **18,586,940 bytes**, with a local crop supplying the remaining month. The full regional archive is 18,654,041 bytes. These totals exclude headers and any interrupted request bytes. The preprocessing found one constant joint mask across all months. Full per-month manifests are local, and the tracked [checksum index](GLDAS_DRIVER_SHA256.csv) records month, NASA granule ID, retrieval method, bytes and SHA-256.
