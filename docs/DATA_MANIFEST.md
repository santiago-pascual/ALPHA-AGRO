# Data manifest

Paths are repository relative and ignored by Git. All timestamps refer to UTC.

| Artifact | Local path | Size (bytes) | SHA-256 |
| --- | --- | ---: | --- |
| January 2020 GLDAS Noah monthly v2.1 raw | `data/phase1/raw/GLDAS_NOAH025_M.A202001.021.nc4` | 24895215 | `5b60e97e2c61ad08cd3d8dc2733508607824446438803abd83e1a815c0bba523` |
| January 2020 Pampas subset | `data/phase1/subsets/-64.0_-38.0_-57.0_-30.0/GLDAS_NOAH025_M.A202001.021.nc4` | 335666 | `cbc7f89f6ed9d7c3ec2786044c2dae4a39e9b46933180969ca81d664e48f3623` |
| February 2020 GLDAS Noah monthly v2.1 raw | `data/phase1/raw/GLDAS_NOAH025_M.A202002.021.nc4` | 24978395 | `852e5f7eeab1c9017f632cef8bf07be6d8d9d365bd52d28b7b75b636b1f94602` |
| February 2020 Pampas subset | `data/phase1/subsets/-64.0_-38.0_-57.0_-30.0/GLDAS_NOAH025_M.A202002.021.nc4` | 335375 | `9e8844157634db4445154e327b90bc315f3b9948878305bd1591f763df92ea0c` |

The monthly source is CMR collection `C1342986036-GES_DISC`, granule `G1694852901-GES_DISC`, DOI `10.5067/SXAVCZFAQLNO`. The pipeline imported the supplied browser file and recorded its local identity on November 14, 2026. The source covers the half-open interval from January 1 to February 1, 2020. Its pipeline manifest is beside the raw file as `GLDAS_NOAH025_M.A202001.021.nc4.json`. The validation JSON is beside the subset with the same base name. Revalidate any new provider copy if its bytes differ. [NASA HTTPS granule](https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/2020/GLDAS_NOAH025_M.A202001.021.nc4)

February used the same monthly collection and DOI. Granule `G1709252645-GES_DISC` was acquired through authenticated HTTPS. Its decoded interval is February 1 to March 1, 2020 UTC. [NASA CMR granule metadata](https://cmr.earthdata.nasa.gov/search/granules.umm_json?concept_id=G1709252645-GES_DISC)

The 2006–2025 acquisition has 240 verified monthly OPeNDAP exports with distinct v2.1 granule IDs. The February pilot export below duplicates a month in that period and matched the locally generated February cutout.

| Artifact | Local path | Size (bytes) | SHA-256 |
| --- | --- | ---: | --- |
| February OPeNDAP provider export | `data/phase1/benchmark/GLDAS_NOAH025_M.A202002.021.opendap.nc4` | 58258 | `10f95842f3ba813d6cbf01e4840b18cd9695c0d38fa6f2127faea22a885bf91d` |

The historical exports total 13,919,667 bytes and are stored with their per-month JSON manifests under ignored `data/phase1/historical-opendap/`. The [full checksum index](GLDAS_MONTHLY_SHA256.csv) records month, CMR granule ID, bytes and SHA-256 for all 240 files. The table below preserves the first batch checkpoint.

| Month | CMR granule | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| 2006-01 | G1413723949-GES_DISC | 58216 | `c803fd1a624fd1d52361784c9102cfb59564830aa93244af6d420937a265cb05` |
| 2006-02 | G1413724007-GES_DISC | 58224 | `6d0343469f6dd5d3aaee7f8b76d185d501fae2f02024169aebc5d4c23401907e` |
| 2006-03 | G1413723999-GES_DISC | 58220 | `769248d6d43c7fa272feddca5ec71f87a98f410ba31bf8b678ba8e5a4a08b9ac` |
| 2006-04 | G1413723971-GES_DISC | 58219 | `8246cedb364016bb54601574a79ab73eed6d37c80f73442511ea85d79aa8b716` |

## Three-hourly GLDAS Noah v2.1

Collection `C1342986035-GES_DISC`, DOI `10.5067/E7TYRXPJKWOQ`. Authenticated HTTPS acquisition and validation passed. Raw files and adjacent provenance JSON files are in `data/phase1/raw/`. Subsets and reports are in `data/phase1/subsets/-64.0_-38.0_-57.0_-30.0/`. [NASA collection](https://search.earthdata.nasa.gov/search/granules?p=C1342986035-GES_DISC)

| UTC label on 2020-01-01 | CMR granule | Bytes | Raw SHA-256 |
| --- | --- | ---: | --- |
| 00:00 | `G1694846018-GES_DISC` | 18998102 | `16cc0c89c7f7682ae35f66f0f7bf48d9509ddc38d90e70639b06976021ca16de` |
| 03:00 | `G1694846023-GES_DISC` | 18853061 | `a31fb9b3244b9091e4a46055074bf6dc25f680b03da3a18c32611fcb88b9fd6b` |
| 06:00 | `G1694846031-GES_DISC` | 19185913 | `1298eb11622ca953dd5257c8c5b6986d390a3ebc2988eb24b9a8efaf1321fe93` |
| 09:00 | `G1694846038-GES_DISC` | 19381986 | `64257de94ad0cecade230e89ab244bfbecd3657ccaafe34419bcfb08267f2403` |
| 12:00 | `G1694846043-GES_DISC` | 19394680 | `3a895f1d3a0dcf5234facb4245aefe97ec8310832cc50b300527e7e2f109ba04` |
| 15:00 | `G1694846054-GES_DISC` | 19214008 | `11db2b945b47fdc235a40c0a366bff45ee74af7b70b936cb989da383a1fddae4` |
| 18:00 | `G1694846061-GES_DISC` | 19265204 | `d75f27a3d8ebea629e2468d813abc9970518045a44fb855bba5aa3ca304624a7` |
| 21:00 | `G1694846068-GES_DISC` | 18901118 | `55d1c0e4b62306e997b9068ddea1516a77d19721dcd1955a30328ad49e8f6a1e` |
