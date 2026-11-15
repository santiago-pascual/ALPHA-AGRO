# Phase 6 forecast pipeline

Phase 5B evaluated archived GLDAS monthly products on a reserved January 2024–December 2025 holdout. Seasonal climatology was selected for all 18 configurations using only complete walk-forward windows whose labels were available by the first holdout issue. Lower descriptive holdout scores did not change that selection. See [Phase 5B results](PREDICTIVE_REAL_DATA_RESULTS.md) and the [frontend evaluation contract](../frontend/docs/PREDICTIVE_EVALUATION_V1.md).

## As-of contract and scope

The regional runner distinguishes the observed month and its exclusive end, provider publication time, availability time, issue time, and forecast target month. Feature observations must have ended and be available by the UTC issue time. Archived GLDAS has no recorded provider publication time from the original vintages. For explicit research runs the default availability is observation month start plus five calendar months. The artifact records that assumption, the eligible input months, and their soil and driver checksums. It leaves publication evidence null.

The [availability registry](PHASE6_DATA_AVAILABILITY.md) checks actual first-success evidence at an issue time. A catalog date or a documented latency alone cannot verify access. Operational requests always fail closed in this implementation. Even a positive availability audit would need exact matching content vintages, prospective model and calibration validation, and independent observational checks before enabling operational status.

The registry supports seasonal climatology, persistence, autoregressive Ridge, XGBoost, and XGBoost with filtered Gaussian HMM features. The default stays climatology. Alternate models are explicit experimental overrides using available dependencies and fitted training data built within the run. HMM fitting and input scaling use only eligible training history, with forward probabilities for subsequent months. There is no persisted operational model artifact. The new runner supports the regional series; the Phase 5B spatial evaluation remains a separate historical product.

## Calibration and interpretation

For each horizon, the runner fits a frozen model before the first January 2022 calibration issue. It uses labels available by that issue date only. Calibration uses the 2022–2023 targets whose labels were available at the first reserved holdout issue. January 2024–December 2025 is separate from fitting and calibration. The CLI emits a retrospective example only for a target within that fixed holdout. Advance targets require a different validation design and current inputs.

Storage and anomalies use a 90% nominal absolute-residual interval from the eligible calibration sample. The JSON reports empirical coverage and width on held-out targets. Serial dependence and the short calibration sample limit coverage guarantees. Low-moisture outputs use model probabilities plus Brier, reliability bins and calibration fit diagnostics on both calibration and held-out predictions. The runner does not recalibrate probabilities from this small set. Low moisture is defined by a training soil-water percentile. The prediction interval concerns an outcome; the Phase 5B paired score interval concerns a performance difference.

## Verified example

Climatology for December 2025, issued retrospectively at the end of October 2025, yielded 182.76 mm with a nominal 90% interval of 106.97–258.55 mm. The calibration sample contains 18 months, and 24 of 24 reserved targets fell within their intervals. The interval width is 151.59 mm. The same issue and target yielded a raw low-moisture event probability of 0.267 and a holdout Brier score of 0.14679. These scores describe the frozen-fit Phase 6 experiment and differ from the Phase 5B expanding-window experiment.

## Reproduce

The original checkout holds the local inputs and installed environment. Run from the Phase 6 worktree on the same PC. Use new output locations for additional runs. Neither NASA downloads nor Earthdata credentials are required.

```powershell
$base = Join-Path (Split-Path -Parent (Get-Location).Path) 'Quant Alpha Agro NASA Space Apps'
$py = Join-Path $base '.venv/Scripts/python.exe'
$panel = Join-Path $base 'data/exports/phase5a'
$analysis = Join-Path $base 'data/analysis/phase5a'
$out = Join-Path $base 'data/analysis/phase6-reproduction'
$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
$env:MKL_NUM_THREADS = '1'
& $py -m gldas.predictive evaluate --input "$panel/regional_panel.parquet" --output "$out/regional.json" --initial-train-months 120 --test-window-months 12 --holdout-months 24 --horizons 1 2 3 --targets storage anomaly low_moisture
& $py -m gldas.predictive evaluate --input "$panel/monthly_panel.parquet" --output "$out/spatial.json" --initial-train-months 120 --test-window-months 12 --holdout-months 24 --horizons 1 2 3 --targets storage anomaly low_moisture
& $py -m gldas.predictive.export_evaluation --regional "$analysis/regional.json" --spatial "$analysis/spatial.json" --panel-dir $panel --output "$out/predictive_evaluation_v1.json"
& $py -m gldas.predictive.forecast --mode retrospective --input "$panel/regional_panel.parquet" --issue-time 2025-10-31T23:59:59.999999999Z --horizon 2 --target storage --output "$out/forecast_v1.json"
& $py -m gldas.predictive.forecast --mode retrospective --input "$panel/regional_panel.parquet" --issue-time 2025-10-31T23:59:59.999999999Z --horizon 2 --target low_moisture --output "$out/forecast_event_v1.json"
```

The evaluation exporter can also consume the newly regenerated files in `$out`. Install only `predictive_evaluation_v1.json` under `frontend/public/data/` to display historical evaluation. Keep the [forecast JSON schema](../config/forecast_v1.schema.json) separate from the historical evaluation contract. Generated JSON and raw input files are local and ignored. Do not treat a retrospective example as a current user forecast.

Next experiment: archive exact first-success timestamps and immutable vintages for a bounded Pampas input stack. Freeze issue-time snapshots and evaluate a seasonal baseline and one challenger prospectively, including probability and interval calibration.
