# Data manifest

Paths are repository relative and ignored by Git. All timestamps refer to UTC.

| Artifact | Local path | Size (bytes) | SHA-256 |
| --- | --- | ---: | --- |
| January 2020 GLDAS Noah monthly v2.1 raw | `data/phase1/raw/GLDAS_NOAH025_M.A202001.021.nc4` | 24895215 | `5b60e97e2c61ad08cd3d8dc2733508607824446438803abd83e1a815c0bba523` |
| January 2020 Pampas subset | `data/phase1/subsets/-64.0_-38.0_-57.0_-30.0/GLDAS_NOAH025_M.A202001.021.nc4` | 335666 | `cbc7f89f6ed9d7c3ec2786044c2dae4a39e9b46933180969ca81d664e48f3623` |

The monthly source is CMR collection `C1342986036-GES_DISC`, granule `G1694852901-GES_DISC`, DOI `10.5067/SXAVCZFAQLNO`. The pipeline imported the supplied browser file and recorded its local identity on November 14, 2026. The source covers the half-open interval from January 1 to February 1, 2020. Its pipeline manifest is beside the raw file as `GLDAS_NOAH025_M.A202001.021.nc4.json`. The validation JSON is beside the subset with the same base name. Revalidate any new provider copy if its bytes differ. [NASA HTTPS granule](https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/2020/GLDAS_NOAH025_M.A202001.021.nc4)

The three-hourly collection is `C1342986035-GES_DISC`, DOI `10.5067/E7TYRXPJKWOQ`. Discovery confirmed eight slots on January 1, 2020, from 00:00 through 21:00. Their raw files, checksums and validation reports are pending. [NASA collection](https://search.earthdata.nasa.gov/search/granules?p=C1342986035-GES_DISC)
