# Phase 8: bounded GLDAS 2026 integration and forecast handoff

Checked 2026-11-15 UTC on `feature/dual-track-forecasting`. This extends the full-grid retrospective work with a locally verified seven-month input extension. It does not modify the notebook frontend or the original 2006–2025 panels.

## What was integrated

The input set was exactly the seven GLDAS Noah v2.1 monthly main-product granules for 2026-01 through 2026-07. Each source file was hash-recorded in the ignored local integration manifest. NASA CMR granule IDs and provider insert/update times are preserved there. ProviderDates/CMR update timestamps and NetCDF creation history are not first-public-access evidence. All seven files were present locally and verified before the forecast issue timestamp; no historical 240-file archive was downloaded as part of this bounded extension.

The target remains GLDAS 0–100 cm soil-water storage in mm: `SoilMoi0_10cm_inst + SoilMoi10_40cm_inst + SoilMoi40_100cm_inst`. The extension validates the expected monthly temporal metadata, dimensions, units, fill values, cell methods, layer physical bounds and driver conversions, and extracts values at the exact 896-cell historical grid. The preliminary regional Parquet was used only as a cross-check: all 15,680 cell/month values agree with the raw NetCDF derived target to a maximum absolute difference of 0.0000229 mm; mask agreement is exact. Spatial-to-regional consistency and the historical regional reproduction also passed. The original 2006–2025 files were checksum-checked before and after and left unchanged.

The extended ignored local panels are:

- `data/exports/phase8_2026/monthly_panel.parquet` — 221,312 rows (247 months × 896 grid cells).
- `data/exports/phase8_2026/regional_panel.parquet` — 247 monthly rows.
- `data/exports/phase8_2026/MANIFEST.json` and `validation_report.json` — provenance, hashes, checks and validation summaries.

Soil-water valid support is 867/896 cells (29 cells retain the historical mask). Driver masks also match the established variable-specific support; no new mask disagreement was found. The 2026 monthly same-calendar-month medians differ from 2006–2025 by −18.38, −37.73, −13.67, +46.54, +36.61, +33.98 and +33.27 mm from January to July respectively. These are descriptive distribution flags, not proof of a climate shift or errors; out-of-historical-range counts are documented in the validation report.

## Forecast artifacts and status

Generated local, ignored artifacts are in `data/analysis/phase8_2026_bounded/`:

- `forecast_v1_h1.json` for 2026-12.
- `forecast_v1_h2.json` for 2027-01.
- `forecast_v1.json` for 2027-02 (horizon 3; legacy single-record name).
- `phase8_forecast_bundle_v1.json` for regional and spatial records together.

The bundle validates against `config/phase8_forecast_bundle_v1.schema.json`. Its issue time is 2026-11-15T21:34:16.541853Z; latest input observation month is 2026-07 (observation period ended 2026-08-01), 106 days before issue. It is a current experimental issue after local file verification, not a historical hindcast. Operational eligibility is false because first-public source availability times and prospective 2026 outcome skill have not been verified. Keep the UI explicitly in experimental/research mode and do not label it live, certified, or skillful.

| Horizon | Target | Regional storage | Retrospective holdout RMSE | MAE | Bias | Skill vs persistence | 90% interval |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 month | Dec 2026 | 182.76 mm | 28.99 mm | 23.74 mm | −4.14 mm | 0.591 | 112.29–253.23 mm |
| 2 months | Jan 2027 | 180.47 mm | 28.99 mm | 23.74 mm | −3.98 mm | 0.605 | 104.68–256.26 mm |
| 3 months | Feb 2027 | 188.47 mm | 28.95 mm | 23.81 mm | −3.83 mm | 0.605 | 112.67–264.26 mm |

Selection evidence is unchanged: seasonal climatology was selected in all 18 Phase 5B comparisons. All forecasts equal the corresponding seasonal climatological normal, so anomalies are zero by construction; this is a baseline outlook and not evidence of dynamic forecast skill. Scores are the prior untouched 2024–2025 chronological regional holdout (24 months per horizon), reproduced from existing Phase 5B/Phase 7 outputs. They are retrospective. The 90% intervals use a fixed chronological 2022–2023 absolute-residual calibration window (19 months) and are truncated to physical storage bounds [0, 1000] mm. Their observed historical coverage was 100% regionally in the holdout; this is not prospective calibration or a future guarantee.

The bundle has 896 grid records per horizon, of which 867 are valid under the established mask. Spatial holdout across 20,808 cell-months per horizon yielded RMSE 44.83/44.80/44.76 mm, MAE 36.28/36.27/36.26 mm, bias −4.14/−3.98/−3.83 mm and skill vs persistence 0.484/0.496/0.491 for horizons 1/2/3. Area-weighted historical coverage after physical bounding was 95.40%/95.69%/95.95%. Spatial intervals use pooled cell-month calibration and are marginal, not per-cell or simultaneous guarantees. GLDAS resolution is 0.25 degrees; never imply field-scale precision.

This measures modeled soil-water storage only. It does not predict yield, prove crop damage, or measure long-term land degradation. No crop-specific action recommendation is warranted absent crop stage, soil and management information plus relevant validation.

## Frontend handoff

Consume `phase8_forecast_bundle_v1.json` only behind an explicit experimental/research label. For location lookup, select the nearest eligible GLDAS cell by latitude/longitude from each horizon's `spatial_forecasts[].cells[]`; require `valid: true`, and show the cell ID and 0.25-degree resolution. Keep the returned grid-cell value and interval distinct from the regional summary. Display issue time, latest observation month, target month, units, interval level, model (`seasonal_climatology`), retrospective metrics and `operationally_eligible: false`. Do not average masked cells or interpolate to a field-scale value. Existing notebook frontend was not changed.

## Reproduction and verification

Use the supplied Python 3.12 environment, not Python 3.15:

```powershell
& 'D:\Datos\Downloads\GLDAS_2026_WORK\.venv\Scripts\python.exe' -m gldas.predictive.phase8_2026 --help
& 'D:\Datos\Downloads\GLDAS_2026_WORK\.venv\Scripts\python.exe' -m pytest -q
```

The exact integration and forecast commands, all source hashes, CMR IDs, and validation fields are recorded in the ignored local manifest/report and bundle. Large panels, source NetCDF files, manifests with local paths, and forecast bundles remain untracked local artifacts; they must not be committed.

## Remaining evidence for operational status

1. Establish first-public availability or record an actual authorized acquisition timestamp for each future issue-time input; catalog update and file creation timestamps are insufficient.
2. Obtain monthly GLDAS updates with reproducible source hashes and re-run the extension and schema checks without altering the historical panels.
3. Accumulate prospective outcomes and test calibration/skill for the intended issue schedule. Until then, preserve the climatology result as a benchmark outlook, not a demonstrated dynamic forecast.
4. Separately acquire a sufficiently long verified SMAP/meteorological panel before claiming validated 14/28-day capability.
