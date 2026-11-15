# Phase 9: soil-moisture interpretation handoff

Created on `feature/dual-track-forecasting` for the GLDAS Phase 8 results. This adds historical context only; it does not change the forecast pipeline, expand coverage, add ENSO, or alter the existing Phase 8 forecast bundle.

## Artifact

Local generated artifact (2,602,769 bytes; SHA-256 `13666b53a3eb37e3ec100b8c41f65f87bb7350a08dfbf08c453a187c55ba8313`):

`data/analysis/phase9/soil_moisture_interpretation_v1.json`

Schema: `config/soil_moisture_interpretation_v1.schema.json`.

The artifact includes 896 supported grid identifiers (867 valid and 29 masked), 10,752 cell/calendar-month reference rows, 867 latest-observation rows, and 2,688 future cell/horizon rows (896 cells × 3 horizons). Large generated output remains local and ignored by Git.

## Method

Input is the verified 247-month Phase 8 panel, with 2006–2025 retained as the reference period. For every cell and calendar month, the artifact reports sample count, mean, sample standard deviation, and linear empirical p10/p20/p50/p80/p90 in mm. There are 20 same-month years for valid cells and zero for masked cells. Masked rows have null statistics; no values are imputed.

The relative low-moisture definition is observed storage less than or equal to that cell's own same-calendar-month 2006–2025 p20. The artifact reports the in-reference count and frequency. This is a descriptive percentile threshold, not an independently validated drought, crop, or agronomic threshold. Since the threshold and frequency are estimated from the same 20 observations, the frequency is descriptive and not independent validation.

For the latest available observation (July 2026), the artifact reports observed mm, same-month historical mean, observed anomaly, empirical reference percentile and a condition code. This historical observed anomaly is separate from the future forecast central anomaly. Future outlook central anomalies are recomputed as forecast minus the matching reference mean; because the selected method is seasonal climatology they are zero up to floating-point precision. This does not imply that future realized anomalies will be zero.

## Probability decision

Future probability of falling below the same-cell same-month reference p20 is **unavailable**. Existing hindcasts and interval calibration do not establish reliable cell-specific event probabilities, and the short regional holdout cannot support robust calibration/reliability assessment. The 90% prediction interval is not converted to an event probability. The JSON provides `probability_below_p20: null`, status `unavailable_not_defensibly_calibrated`, and a shared reason under `forecast_interpretation.probability_reason`.

## Frontend integration

Join `forecast_context.records` to `forecast_v1` spatial cells on `cell_id` and `target_month` (forecast horizons are also included). To decode each compact positional row, use its sibling `columns` array: each row index corresponds to the column at that index. Do the same for `monthly_reference_statistics` (`cell_id`, `calendar_month` key) and `latest_observed_context` (`cell_id`, observation month). Null p20 probability must render as “not available,” not zero.

Show `latest_observed_context` as an observed historical diagnosis with its observation date and reference period. The bilingual `interpretation_glossary` maps `condition_code` to English and Spanish text. Label forecast rows experimental and climatological; use the shared `forecast_interpretation` copy. Present storage in mm and GLDAS spatial support at 0.25°. The `agricultural_interpretation` fields prohibit crop-specific suitability, yield, irrigation, planting, switching, damage, or degradation conclusions from this proxy alone.

## Reproduction and validation

```powershell
& 'D:\Datos\Downloads\GLDAS_2026_WORK\.venv\Scripts\python.exe' -m gldas.predictive.interpretation `
  --panel data/exports/phase8_2026/monthly_panel.parquet `
  --forecast-bundle data/analysis/phase8_2026_bounded/phase8_forecast_bundle_v1.json `
  --output data/analysis/phase9/soil_moisture_interpretation_v1.json
```

The writer refuses to overwrite an existing output. Tests cover quantiles, historical month matching, observed anomaly calculation, low-moisture count/frequency definition, future-data exclusion from reference statistics, mask preservation, unavailable probability, and duplicate month/cell rejection. Full repository test suite result for this change: 131 passed, 4 subtests passed. Artifact validation against the schema passed with zero errors.

This remains modeled GLDAS grid context, not field measurement. No crop-specific thresholds, recommendations, or causal claims are made.
