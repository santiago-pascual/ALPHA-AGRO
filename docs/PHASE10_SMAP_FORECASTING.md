# Phase 10 agricultural soil-water forecasting

## Verified data and availability

NASA NSIDC SMAP L4 V008 is collection C3480440870-NSIDC_CPRD, DOI 10.5067/T5RUATAQREF8. It is a 3-hour mean land-model estimate with assimilated satellite brightness temperatures, on the approximately 9 km global EASE-Grid 2.0 (EPSG:6933). The archive starts March 31, 2015. The root-zone field is Geophysical_Data/sm_rootzone, volumetric water in m³/m³ over 0–100 cm. The V008 valid range is 0–0.9 and its fill value is −9999. Root-zone percentile and wetness fields are distinct variables. Masks and range are verified; a valid cell alone does not establish a local assimilation update or in-situ accuracy. The separate analysis-update product is needed to evaluate assimilation support where necessary. [NSIDC product](https://nsidc.org/data/spl4smgp/versions/8) · [NSIDC specification](https://nsidc.org/sites/default/files/documents/technical-reference/smap_l4_sm_psd_v17_for_l4sm_version_8.pdf)

The latest slot found on November 15, 2026 UTC was G4412643531-NSIDC_CPRD, observed November 11 at 21:00 through November 12 at 00:00 UTC. CMR reports a provider insert November 15 at 12:52:53 UTC. The full 150,703,594-byte HDF5 passed local replay. Direct access completed at 13:56:07 UTC, about 3 days 14 hours after window end, and yielded 6,891 usable cells centred inside the provisional study box. The full-file SHA-256 is cad6f1ced6d218795c1cbeaf8ddb2e3cb62ea29791d277a5bc0496058e553565. Catalog insertion and local byte access are dated evidence for this case. Neither is a guarantee of provider-wide latency or a substitute for independently witnessed availability on simulated historical issue dates. The product specification gives a seven-day latency requirement.

## Bounded efficient acquisition

NASA Harmony supports time, bounding-box and variable subsetting for this collection. Its capabilities endpoint reports no concatenation for this collection. The verified January 2, 2020 operation returned eight preserved 3-hourly NetCDF subsets. Harmony reported 1.09 GiB of original input and 508.66 KiB of spatially subset output (520,869 downloaded bytes). The time-range start excludes the prior slot ending at midnight. The panel validates the eight half-hour-centred timestamps, native projected spacing, masks and units, and adopts a complete daily mean only where all eight intervals are valid. Edge cells outside the provisional box are removed. AppEEARS advertises SMAP V008 but rejected the configured Earthdata user bearer with 403. Its documented API uses a separate AppEEARS token. [NASA Harmony](https://harmony.earthdata.nasa.gov/docs) · [NSIDC on AppEEARS](https://nsidc.org/data/user-resources/help-center/how-extract-point-and-area-data-samples-using-appeears) · [AppEEARS authentication](https://github.com/nasa/AppEEARS-Data-Resources/blob/main/guides/How-to-bulk-download-AppEEARS-outputs.md)

The seven-day follow-on job b9db64ac-00a7-4f16-92ca-d36292b49001 returned 56 additional subsets. The combined January 2–9 panel has eight complete UTC days and 6,891 valid native cells on each day. The local panel SHA-256 is c293c661c302c62d7e015e68a9b74e8769276aa5436706b2ad53ee7e873f4ff6.

Run from the Phase 10 checkout with the existing research Python environment. The CLI can use Windows Credential Manager or a hidden --prompt-token. Keep the local archive and dashboard JSON ignored. The source bearer is confined to the provider origin, and expiring signed URLs are used in memory only.

```powershell
$py = '.\.venv\Scripts\python.exe'
$root = 'data/smap/phase10'
& $py -m gldas.smap --granule G4412643531-NSIDC_CPRD --archive $root
& $py -m gldas.smap_dashboard --bundle "$root/G4412643531-NSIDC_CPRD" --output frontend/public/data/agricultural_water_v1.json
& $py -m gldas.smap_harmony submit --start 2020-01-02 --end 2020-01-02
# Replace JOB_ID with the newly submitted job ID and collect after it succeeds.
& $py -m gldas.smap_harmony collect --job JOB_ID --archive "$root/harmony"
& $py -m gldas.smap_panel --archive "$root/harmony" --start 2020-01-02 --end 2020-01-02 --output "$root/pilot_daily.npz"
& $py -m gldas.smap_evaluate --panel "$root/pilot_daily.npz" --output "$root/pilot_evaluation.json" --retrospective-lag-days 7 --reference-start 2020-01-02 --reference-end 2022-12-31 --calibration-start 2024-06-01 --holdout-start 2025-01-01
```

## Target, experiment, and dashboard

At midnight UTC, D is the preceding UTC daily mean. The continuous targets are moisture at D+14 or D+28 and the difference from D, both in m³/m³. Event targets are a target daily mean below the cell's frozen target-month 20th percentile and entry into that state from at or above the reference-day threshold. The independent reference window requires at least 60 valid daily values spanning three distinct years per month and cell. Storage in millimeters and plant-available water are separate quantities. The SMAP values are neither substituted for GLDAS nor merged with it.

Persistence, calendar-month climatology, and fixed Ridge/logistic autoregression are compared. The newest eligible moisture, 3/7/14/28-day changes, trailing seven-day variability and frozen climatology anomaly use only information eligible by issue. A seven-day lag is an explicit archival sensitivity assumption. Time splits cover all cells, the label must be available at the fit or calibration cutoff, and overlapping targets cannot cross that cutoff. Initial models are fixed before the separate calibration window, with 90% empirical residual intervals and holdout coverage/width, and an untouched final holdout. Paired 28-issue-day block draws retain spatial cross-sections. Event reliability bins are diagnostics rather than demonstrated probability calibration. There are no weather features, fit-time hyperparameter selection or XGBoost ranking at this checkpoint. These additions require enough real data and a separately frozen tuning window.

The acquired pilot is below the history gate for both horizons. No 14/28-day score, model winner, calibration or prospective issuance is supported. The integrated dashboard displays the most recent validated SMAP estimate and data age in its own forecast navigation, with an explicit unavailable state and a link to evaluated monthly retrospective research. The JSON v1 contract permits statements about an observation window, whose source includes the file hash and elapsed time, and keeps the forecast issue and model null. The application has no active operational issuance path.

Crops supply context. Soybean suitability depends on local planting windows and maturity groups. Maize scheduling and wheat establishment depend in part on plant-available water, soils and timing. A 9 km estimate warrants comparison with field measurements. Planting date, stage, texture, depth and local management still matter. [INTA soybean and maize context](https://intainforma.inta.gob.ar/presentan-una-herramienta-para-evaluar-el-impacto-de-el-nino-en-los-cultivos/) · [INTA maize](https://intainforma.inta.gob.ar/maiz-tardio-una-pieza-clave-del-sistema-productivo/) · [INTA wheat](https://repositorio.inta.gob.ar/handle/20.500.12123/12025)

The next milestone is a continuous historical point panel across preselected Pampas cells and representative seasons, with a fixed holdout before comparing models. Benchmark AppEEARS point time series with its separate service login before scaling Harmony. If the authorized AppEEARS route is unavailable, resume versioned Harmony batches within NASA service limits. A dated archive of near-issue SMAP releases and a prospective calibration trial are separate prerequisites to showing farmer-facing forecasts.
