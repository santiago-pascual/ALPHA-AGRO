# Soil-water risk at 14 and 28 days

## Verified NASA source

| Stream | Identity and coverage | Availability observed on November 15, 2026 UTC |
| --- | --- | --- |
| GLDAS Noah main production v2.1 | GLDAS_NOAH025_3H, C1342986035-GES_DISC, DOI 10.5067/E7TYRXPJKWOQ. Catalog start January 1, 2000. | Latest catalog slot July 31, 2026, 21:00 UTC. NASA documents typical latency of approximately 3–4 months. |
| GLDAS Noah early production v2.1 | GLDAS_NOAH025_3H_EP, C1700900626-GES_DISC. Catalog start December 1, 2019. The early stream uses different precipitation forcing. | Latest catalog slot October 15, 2026, 21:00 UTC. NASA documents typical latency of about 1.5 months. Bytes for this stream were not tested. |

[NASA GLDAS user guide](https://hydro1.gesdisc.eosdis.nasa.gov/data/GLDAS/GLDAS_NOAH025_3H.2.1/doc/README_GLDAS2.pdf) · [NASA main production DOI](https://doi.org/10.5067/E7TYRXPJKWOQ) · [NASA early production CMR record](https://cmr.earthdata.nasa.gov/search/concepts/C1700900626-GES_DISC.html)

The native Noah grid is 0.25° and covers 60°S to 90°N. The verified regional subset uses 32 × 28 centers in the provisional Pampas study box (38–30°S and 64–57°W). The three instantaneous layers used here are 0–10, 10–40 and 40–100 cm. They are layer-integrated mass per area in kg/m² and sum to depth in millimeters of water equivalent. NASA also supplies a 100–200 cm layer, which is outside the defined target. The daily input is an explicit aggregation of the three-hourly Noah archive; daily Catchment products use a different model and were excluded.

Authenticated NASA OPeNDAP returned 16 complete regional assets for January 2–3, 2020, with 920,490 bytes total. Replay validated the exact timestamps, layer units and grid, and retained 867 cells on each complete day. The first and final local retrievals finished at 13:19:27 and 13:19:53 UTC on November 15, 2026. The archive contains the provider-response bytes, source collection and slot, local download time, SHA-256, and the DAP constraint. Catalog times are observation times. There are no verified provider publication times for this pilot, and two sampled days cannot verify continuity across the catalog's full time range.

## Targets and evaluation

At a simulated issue time of midnight UTC, D is the UTC date of the previous complete daily window. Each daily mean uses the eight instantaneous profiles sampled at 00:00, 03:00, …, 21:00 UTC. All eight slots and all three layers must be valid for a cell. The two separately evaluated horizons h are 14 and 28 days.

- Storage change is S(D+h) minus S(D), in mm. Negative change means depletion of stored water in the model's 0–100 cm profile.
- The low-storage event is S(D+h) strictly below the cell's 20th percentile for the target's UTC calendar month. The fixed reference period must supply at least 60 days across three distinct years for that cell and month. This threshold and the monthly median are fitted solely from the specified reference period.

Availability is simulated explicitly. A daily value becomes eligible at its UTC window end plus a user-supplied lag. The 120-day example is a sensitivity assumption for archived final GLDAS. It is not a verified issue-time availability guarantee. Features use the latest eligible day and earlier days 7, 14 and 28 days apart, plus target-month terms. Both label days must be eligible by fitting or calibration time. The reference, model fit, pre-holdout interval calibration and final holdout are chronological and disjoint by their use; the holdout's later inputs can enter features only after their assumed release. The estimators remain frozen and the program does not rank models for promotion.

The persistence baseline predicts zero change and uses the latest released storage compared with the target-month threshold for a 0/1 event baseline. Seasonal climatology uses the difference of the two calendar-month medians and the empirical reference frequency for the target month. The third model is fixed regularization Ridge for change and logistic autoregression for events. Each is fitted per cell. XGBoost was deferred until enough real training records exist. No weather inputs were used.

A full run reports common-support cell-level sample counts, area-weighted MAE, RMSE, bias, baseline skill, Brier score and reliability bins. Paired percentile intervals use 28-issue-day blocks over shared dates, retaining the spatial cross-section. Dates with missing support can make these blocks span more than 28 calendar days. The intervals describe pointwise performance uncertainty and do not adjust for multiple comparisons. Separately, nominal 90% prediction interval widths are estimated from pre-holdout absolute residuals per cell and coverage is checked on the holdout. Event reliability bins are diagnostics only. These archived data do not establish prospective calibration.

The two-day NASA pilot fails the evaluation history gate for both horizons. There are no real model skill, interval coverage or probability calibration results. Synthetic tests exercise the evaluation and the holdout isolation.

## Reproduce on Windows

Run from this feature checkout. If the environment is in the original checkout, point the Python variable there instead.

```powershell
$py = '.\.venv\Scripts\python.exe'
$archive = 'data/water-risk/vintages'
& $py -m gldas.water_risk acquire --archive $archive --start 2020-01-02 --end 2020-01-03
& $py -m gldas.water_risk export-view --archive $archive --start 2020-01-02 --end 2020-01-03 --output data/water-risk/water_risk_v1.json
& $py -m gldas.water_risk evaluate --archive $archive --start 2020-01-02 --end 2020-01-03 --retrospective-lag-days 120 --reference-start 2020-01-02 --reference-end 2022-12-31 --calibration-start 2025-01-01 --holdout-start 2026-01-01 --output data/water-risk/retrospective_pilot.json
```

For the pilot already acquired on the main PC, point the archive variable to the original checkout's data/water-risk/vintages directory. Use a NASA Earthdata Login token with GES DISC application authorization, available to the existing credential helper. Add --prompt-token to use a hidden PowerShell prompt. The downloader requests at most seven days per call, replays previously saved assets, and preserves validated bytes outside Git. The output commands use exclusive file creation to preserve previous runs.

## Frontend handoff

The [JSON Schema](../config/water_risk_v1.schema.json) validates the frontend export. The [fixture](water_risk_v1.fixture.json) declares data_kind=fixture and is rejected by the live reader. Version 1 exposes archived storage and freshness and requires the current/forecast/probability fields to be null. Copy the generated water_risk_v1.json into frontend/public/data/ on a local deployment, run the existing frontend, and open /water-risk.html. Serve this page alongside the existing dashboard. Its location, crop and horizon inputs are independent of the other frontend branch. The crop selector provides context only and cannot trigger a planting recommendation. The assessment refers to a grid cell, not a particular field or crop. Depletion does not indicate soil degradation, damage or yield loss.

## Next scientific gate

Build a longer, version-pinned regional reference, training and holdout panel before interpreting skill. At the pilot size of about 57.5 kB per asset, five years would require roughly 14,600 asset requests and 0.84 GB of NetCDF response bytes. A bounded probe of the legacy THREDDS aggregation endpoint returned HTTP 410 and supplied no scientific bytes. Before launching individual requests, verify whether a current provider-supported batch or daily subset is viable and fix the validation and holdout dates. [GES DISC discussion of the aggregation service](https://forum.earthdata.nasa.gov/viewtopic.php?t=6928)

Separately verify a fresh root-zone input and its publication history, for example NASA SMAP L4 V008, plus a dated meteorological forecast for the lead window if used. Determine physical and statistical compatibility against overlapping records before combining sources. [NASA SMAP L4 product DOI](https://doi.org/10.5067/T5RUATAQREF8)

Any planting caution would also require local soil information, crop-specific planting windows and independently validated agronomic rules. Keep prospective issuance gated by dated evidence and a forward trial. Historical findings, monthly hindcasts and prospective safeguards remain in place.
