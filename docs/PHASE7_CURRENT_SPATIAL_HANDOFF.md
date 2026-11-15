# Current data and spatial forecast handoff

Checked on **2026-11-15 UTC** in the `feature/dual-track-forecasting` worktree. This report extends the existing monthly MVP and Phase 7 spatial research; it does not change the notebook frontend.

## Current GLDAS feasibility

The verified Phase 5A panel ends at **2025-12** (240 months). Its five-calendar-month availability field is an explicit retrospective assumption, not a measured GLDAS publication lag. Under that assumption the panel’s latest issue-available observation for the September 2025 demonstration is April 2025.

The public CMR granule search for collection `C1342986036-GES_DISC` returned the 2026 monthly main-product records from January through July, but no August–November monthly records. Their CMR `updated` timestamps were: Jan 2026 `2026-04-24T18:48:08Z`; Feb `2026-06-04T22:27:20Z`; Mar `2026-06-19T19:32:39Z`; Apr `2026-07-22T23:01:52Z`; May `2026-08-14T18:51:26Z`; Jun `2026-09-18T22:45:32Z`; Jul `2026-10-19T18:30:41Z`. These are catalog update timestamps; they do not establish first public data access. The search is reproducible at [CMR granule search](https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id=C1342986036-GES_DISC&temporal=2026-01-01T00%3A00%3A00Z%2C2026-12-01T00%3A00%3A00Z&page_size=100&sort_key=-start_date). NASA documents different latency by GLDAS stream: the main production stream waits for forcing updates, while an Early Product is faster and later replaced. That documentation is an expectation, not an observed timestamp for these granules ([NASA GLDAS product description](https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_3H_2.1/summary)).

A bounded HTTP HEAD against the catalog-listed July granule’s OPeNDAP metadata endpoint on this computer returned **302 to `/login/urs`**. No data bytes were retrieved, and no Earthdata token is present in the configured environment or Windows Credential Manager. This computer therefore cannot verify current GLDAS asset access or first-availability dates. No new NASA data were downloaded.

For a **2026-11-15** issue using the existing code’s 12-month indicator context and the existing five-month *assumption*, the smallest extension is **January–June 2026**: append six monthly soil and driver subsets to the verified panels. June’s assumed `available_at` is 2026-11-01; July’s assumed availability is 2026-12-01 and is after the issue date. This is a planning boundary only. Until the original data-holding PC records an actual successful asset request and its UTC time, neither June nor any other 2026 month is eligible as a verified operational input. The CMR-listed July record is not a reason to move the issue-time cutoff.

The current acquisition modules already enforce small Pampas-only GLDAS subsets and per-file transfer/time limits, but they cannot safely append 2026 as written. The historical runner is bounded to 2006–2025 (`gldas/history.py`: `FIRST`, `LAST`, four-month batches); `gldas.trend_report.audit_inputs` requires exactly the 240 months from 2006 through 2025; and the Phase 5A exporter consumes that strict audit plus fixed soil/driver output directories. Do not use `gldas.history --batches` to attempt this extension: it starts at January 2006. The original PC needs a reviewed range-aware extension runner and audit/export path for January–June 2026, with separate output directories and a copied/extended checksum index; it can reuse `gldas.acquisition.discover`, `history.acquire`, and `multivariable.acquire` after making their output roots explicit. Preserve the existing 2006–2025 files and index. Once six months are acquired and validated, build the 246-month Phase 5A panel to a new path and verify grid/masks, all units, temporal continuity, source granule provenance, and checksums before issuing anything.

The 2026 issue is also not yet operationally supported by the existing model runner: `gldas.predictive.forecast.retrospective` is intentionally limited to the 2024–2025 reserved holdout, and the availability checker fails closed until prospectively validated calibration and issue-time asset evidence exist. Merely producing a number after appending data is not authorization to call it an operational forecast.

## Full-grid historical demonstration

The existing spatial producer ran successfully from the recovered verified monthly panel:

```powershell
& .\.venv\Scripts\python.exe -m gldas.predictive.spatial `
  --input data/exports/phase5a/monthly_panel.parquet `
  --issue-time 2025-09-30T23:59:59.999999999Z `
  --output data/analysis/phase7/spatial_hindcast_2025-09-30.json
```

The complete schema-valid JSON is packaged as [`spatial_hindcast_2025-09-30.json.gz`](../artifacts/phase7/spatial_hindcast_2025-09-30.json.gz). The compressed file is 256,162 bytes (SHA-256 `85d82eee6add0a1c603ad17cfb7684adb48a1b331973ce32dd371f7b65ecec27`); it expands to 2,205,473 bytes (SHA-256 `a4dba86843d98b2fda0ce870f951b18165851daaf68048a66bf4645d3f7fd3ac`) and validates against `config/spatial_hindcast_v1.schema.json`. It contains all 9 combinations of 1/2/3-month horizon and storage/anomaly/low-moisture target on the 896-cell grid. It is a **spatial_hindcast_v1 historical research artifact**, not an operational `forecast_v1` record.

Each horizon targets October, November, or December 2025 from the issue time above. The latest issue-available observation is April 2025 under the assumed lag. The forecast producer selected the already established seasonal climatology. Storage results are:

| Horizon | Holdout MAE (mm) | RMSE (mm) | Bias (mm) | RMSE skill vs persistence | Nominal 90% interval width | Holdout coverage |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 month | 36.285 | 44.827 | −4.139 | 0.484 | 176.74 mm | 95.40% |
| 2 months | 36.269 | 44.804 | −3.979 | 0.496 | 178.61 mm | 95.69% |
| 3 months | 36.260 | 44.762 | −3.825 | 0.491 | 180.44 mm | 95.95% |

The 24-month January 2024–December 2025 holdout has 20,808 cell-month rows and the calibration windows have 19, 18 and 17 months by horizon. Nominal intervals use pooled, area-weighted absolute calibration residuals; they are marginal grid coverage, not cell-specific or simultaneous guarantees. Forecast values are issued only for the **867 valid cells**; 29 of 896 cells remain masked. This output evaluates a seasonal baseline against persistence; it does not demonstrate dynamic forecasting skill. It preserves the previous 18-configuration result: seasonal climatology was selected in all 18 model comparisons. Spatial dependence, two years of holdout, archive revisions, and assumed publication timing limit inference.

The grid is **0.25 degrees**, approximately tens of kilometres across at Pampas latitudes. Treat each value as a coarse modeled grid-cell estimate, not a farm- or field-scale measurement. The model-defined low-moisture category is not verified agricultural drought, and none of these soil-water conditions is a measure of long-term land degradation.

## Notebook integration handoff

The current frontend coordinate helper is `frontend/src/data/location.ts::findEligibleCell`. Given a selected point, use the validated eligible-cell list and `resolutionDegrees=0.25`; accept a cell only when the selected coordinate falls inside its grid bounds and the cell is valid. Its ID follows `gldas-noah-v2.1:<latitude to 4 decimals>:<longitude to 4 decimals>`. A point outside the mask must return “no eligible cell,” not a nearest-cell extrapolation. Show the cell center, 0.25-degree resolution, target month, horizon, interval bounds, issue time, latest observation, model, holdout metrics, and the assumed availability caveat.

This handoff package must be shown only in an explicitly labeled **historical demonstration** view. Keep `status=retrospective_simulation` and `operationally_eligible=false`. Do not install it at the operational `forecast_v1.json` path or present it as “current.” The existing frontend forecast resolver expects a single selected-cell `forecast_v1` artifact and rejects non-operational records; do not weaken that gate. For a later current display, the original PC needs verified issue-time assets, a separately reviewed 2026 append and panel, temporal validation of the exact serving procedure, calibrated uncertainty, and an explicit current `forecast_v1` producer. No frontend files were changed.

## Checks completed on this computer

- Recreated the ignored `.venv` using pinned `requirements-dev.txt` and `requirements-ml.txt` on Python 3.15.2; pandas, NumPy, PyArrow, JSON Schema, and XGBoost import successfully.
- Regenerated all 9 full-grid comparisons from the local Phase 5A monthly panel; the artifact passed JSON Schema validation with zero errors.
- Ran the complete Python suite: **121 passed, 4 subtests passed**.
- No recent GLDAS granule bytes were retrieved; no current operational forecast was generated.
- Frontend files were not modified. The generated 2.2 MB JSON remains in ignored `data/analysis/phase7/`; a deterministic gzip copy is provided in `artifacts/phase7/` for transfer.
