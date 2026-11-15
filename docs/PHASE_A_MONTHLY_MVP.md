# Phase A monthly forecasting MVP

## Status

The monthly pipeline now regenerates a one-record `forecast_v1` JSON for each 1-, 2-, and 3-month horizon. The checked-in code produces **historical out-of-sample demonstrations**, not current operational forecasts. Every output is tagged `retrospective_simulation`, sets operational eligibility false, identifies its historical issue time and latest available observation, and carries panel, manifest, and evaluation SHA-256 values.

The recovered Phase 5A panels and Phase 5B results were restored under ignored `data/`. Both panels passed the Parquet contract validator. The Phase 5B summary exporter reproduced the recovered `predictive_evaluation_v1.json` semantically exactly. It contains 18 scope × horizon × target comparisons; seasonal climatology was selected using eligible pre-holdout walk-forward loss in all 18. Holdout rankings remain descriptive and were not used to select the forecasts.

The recovered JSON contains the six evaluated families (seasonal climatology, persistence, autoregressive Ridge, Ridge, XGBoost, and XGBoost with filtered HMM features) and 972 fold records including final holdouts. As an example baseline comparison for the continuous storage target, the final-holdout RMSEs (mm) are:

| Horizon | Regional climatology | Regional persistence | Spatial climatology | Spatial persistence |
| ---: | ---: | ---: | ---: | ---: |
| 1 month | 29.84 | 70.88 | 45.04 | 86.80 |
| 2 months | 29.80 | 73.39 | 44.98 | 88.98 |
| 3 months | 29.60 | 73.21 | 44.82 | 87.95 |

These are archived-final-product holdout scores under the assumed release policy. They show the climatology benchmark outperforming persistence in this retrospective holdout; they do not establish skill for a dynamic model or current operational issuance.

## Reproduce the historical forecast set

Run from the repository root on a Python environment with the project dependencies installed. The output directory must not already contain these filenames; the writer refuses to overwrite them.

```powershell
$py = '.\.venv\Scripts\python.exe'
& $py -m gldas.predictive validate --input data/exports/phase5a/regional_panel.parquet
& $py -m gldas.predictive.monthly_mvp `
  --input data/exports/phase5a/regional_panel.parquet `
  --evaluation data/analysis/phase6/predictive_evaluation_v1.json `
  --manifest data/exports/phase5a/MANIFEST.json `
  --issue-time 2025-09-30T23:59:59.999999999Z `
  --output-dir data/analysis/phase6/monthly-mvp-2025-09
```

The runner verifies the regional panel, Phase 5A manifest, evaluation provenance, assumed five-calendar-month release policy, 2024–2025 holdout, and the unique regional storage model selected before holdout for each horizon. It then uses the existing frozen-fit chronological forecasting implementation, validates each JSON against `config/forecast_v1.schema.json`, and writes three exclusive-create files:

- `forecast_v1_h1.json` — 1 month, target October 2025.
- `forecast_v1_h2.json` — 2 months, target November 2025.
- `forecast_v1.json` — 3 months, target December 2025.

All share issue time `2025-09-30T23:59:59.999999999Z`. They are three separate single-record `forecast_v1` artifacts, not one array. The canonical `forecast_v1.json` is the 3-month demonstration.

## Historical out-of-sample results

The selected predictor is seasonal climatology for each horizon. The values below are genuine outputs from that model and the recovered panel. Scores are from the frozen-fit 24-month holdout (January 2024–December 2025); paired intervals are 95% 12-month block-bootstrap intervals for the RMSE difference against persistence. The pointwise 90% prediction interval uses the chronological 2022–2023 calibration residuals. Holdout coverage is descriptive and does not certify prospective calibration.

| Horizon | Target month | Prediction (mm) | Nominal 90% interval (mm) | Calibration months | Holdout n | RMSE (mm) | MAE (mm) | Bias (mm) | RMSE skill vs persistence | RMSE difference vs persistence, 95% interval (mm) | Holdout interval coverage |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1 month | 2025-10 | 228.90 | 158.43–299.37 | 19 | 24 | 28.99 | 23.74 | −4.14 | 0.591 | −41.88 [−51.24, −30.64] | 1.00 |
| 2 months | 2025-11 | 207.37 | 131.58–283.16 | 18 | 24 | 28.99 | 23.74 | −3.98 | 0.605 | −44.40 [−55.04, −30.58] | 1.00 |
| 3 months | 2025-12 | 182.76 | 106.97–258.55 | 17 | 24 | 28.95 | 23.81 | −3.83 | 0.605 | −44.26 [−56.37, −28.24] | 1.00 |

The larger Phase 5B report, [`PREDICTIVE_REAL_DATA_RESULTS.md`](PREDICTIVE_REAL_DATA_RESULTS.md), documents all six model families, both regional and spatial scopes, all three targets, the 18 pre-holdout selections, holdout metrics, and their comparisons. The result that climatology won the pre-holdout selection does not demonstrate dynamic forecasting skill. These new hindcasts are a way to exercise the inference path and uncertainty calculation under chronological holdout; their prediction values are not evidence that a dynamic model is useful.

## Causal timing, coverage, and limits

- A forecast row uses only monthly observations with `observation_end <= issue_time` and the panel's assumed `available_at <= issue_time`. The issue, target, fit, calibration, and holdout boundaries are explicit and chronological. Forecast features are regenerated from the eligible panel prefix; future observed values are not features.
- The research panel covers 2006-01 through 2025-12. Under the assumed five-month release policy, its final month is assigned availability at 2026-05-01. The latest input at the historical Sep 2025 issue is April 2025, available by the assumed policy on Sep 1, 2025.
- As of 2026-11-15, the source panel is nearly eleven months behind its last observation month. More importantly, the original GLDAS artifacts lack verified historical provider publication/first-access vintages. A release-lag assumption is not current availability evidence. No present-day forecast is emitted; the operational mode continues to fail closed.
- The interval is a split-conformal-style absolute-residual quantile from only 17–19 calibration months. Serial dependence, a short calibration period, and the 24-month holdout limit its coverage guarantee. The 100% holdout coverage shown above is a measured result on that small retrospective holdout, not a prospective promise.
- This MVP is a regional area-weighted Pampas series, not a field or individual GLDAS grid-cell forecast. It uses only the existing GLDAS monthly predictors. No SMAP, weather-vintage, crop, or soil data are silently added.
- The 14/28-day SMAP panel remains below its history gate; it does not block this monthly demo. See [`DUAL_TRACK_FORECASTING_HANDOFF.md`](DUAL_TRACK_FORECASTING_HANDOFF.md) for the separate short-term gaps.

## Notebook/frontend integration handoff

`config/forecast_v1.schema.json` is the versioned record contract. Each JSON contains `schema_version`, retrospective status, issue and target period, horizon, regional support, target, selected model and version, latest available observation, prediction and units, chronological calibration and holdout metrics, a nominal prediction interval, assumed input vintages, source checksums, and a non-operational quality status.

The notebook frontend's existing static path is `frontend/public/data/forecast_v1.json`. These regional historical demonstrations should **not** be installed there as though they were live. The current Forecast page requires an operationally eligible, selected spatial grid-cell record with verified provider-publication and content-bound availability evidence; it correctly withholds these retrospective regional artifacts. To display a historical demonstration, the notebook should use an explicit historical mode that preserves the issue date, holdout label, region-level support, assumed availability, and retrospective status. A future operational record needs a separately validated spatial producer, current issue-time vintages, actual publication evidence, and prospective calibration. No frontend code or branch was changed here.

## Validation commands

```powershell
& $py -m pytest -q
& $py -m gldas.predictive validate --input data/exports/phase5a/monthly_panel.parquet
& $py -m gldas.predictive validate --input data/exports/phase5a/regional_panel.parquet
```

The monthly MVP tests cover checksum-linked model selection, rejection of ambiguous selection, UTC-Z timestamps, forecast schema validation, and fail-closed status. The forecast files are small but NASA-derived and remain in the ignored local `data/` tree; do not publish them as current operational forecasts.
