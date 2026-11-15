# Phase 7 spatial forecasting

The `gldas.predictive.spatial` module produces calendar-month climatology hindcasts of 0–100 cm modeled storage, its training-period anomaly, and training-defined low-moisture event probability. The model remains the preselected seasonal climatology at each horizon. The run uses the validated soil-water and driver Parquet contract and the same causal release lag as the historical Phase 5B work. Prediction masks come from issued inputs and fitted cell support. Holdout scoring records missing targets through the existing feature-engineering masks. No target values are used to compute a cell estimate for its issue.

The panel contains 896 cells at native 0.25° resolution, of which 867 support valid storage targets. All cells share calendar training/calibration/test cutoffs. Training ends before the first 2022 calibration issue. Calibration targets must be available by the first 2024 holdout issue. January 2024 to December 2025 stays reserved for diagnostics. No random spatial row split or independent-site claim is used. The last available observation month in the example is April 2025, under the assumed 5-calendar-month archive policy.

| Horizon | Storage RMSE (mm) | Storage MAE (mm) | Nominal 90% interval width (mm) | Test area-weighted coverage | Low-moisture Brier |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 44.826903 | 36.284992 | 176.74 | 95.40% | 0.136190 |
| 2 | 44.803809 | 36.268950 | 178.61 | 95.69% | 0.132596 |
| 3 | 44.761939 | 36.259642 | 180.44 | 95.95% | 0.131311 |

Under climatology the predicted anomaly is zero. The storage and anomaly errors are equivalent after subtracting the same cell-month mean. The low-moisture threshold is a training-only weighted cell/calendar-month 20th percentile; predicted frequencies remain uncalibrated and the JSON carries held-out Brier and reliability diagnostics. Continuous outcomes use the area-weighted 90th percentile of absolute errors on the earlier calibration period. Observed 24-month coverage is marginal across the grid. Spatial and temporal dependence, broad intervals and short calibration prevent per-cell or simultaneous guarantees. These are predictive intervals, separate from the performance-difference intervals in Phase 5B.

## Reproduce and display

Run from the Phase 7 worktree with the existing original archive. The development preview in the Phase 6 worktree can continue separately.

```powershell
$base = Join-Path (Split-Path -Parent (Get-Location).Path) 'Quant Alpha Agro NASA Space Apps'
$py = Join-Path $base '.venv/Scripts/python.exe'
$panel = Join-Path $base 'data/exports/phase5a/monthly_panel.parquet'
$out = Join-Path $base 'data/analysis/phase7-reproduction'
$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
$env:MKL_NUM_THREADS = '1'
& $py -m gldas.predictive.spatial --input $panel --issue-time 2025-09-30T23:59:59.999999999Z --pilot-cells 12 --output "$out/spatial_pilot.json"
& $py -m gldas.predictive.spatial --input $panel --issue-time 2025-09-30T23:59:59.999999999Z --output "$out/spatial_hindcast_v1.json"
```

The [artifact schema](../config/spatial_hindcast_v1.schema.json) accepts pilot output for scientific checks. The frontend requires the full native grid and validates alignment, masks, issue/target timing, probabilities and interval bounds. Install only the full-grid `spatial_hindcast_v1.json` under ignored `frontend/public/data/`; access **Predictive research** → **Historical Spatial Hindcast — Experimental**. A missing/invalid artifact displays an explicit empty state. The grid overview aggregates cell outputs using their weights. It is distinct from the separately fitted regional model, and an area-weighted event probability is a mean of cell probabilities. No operational forecast is exposed.
