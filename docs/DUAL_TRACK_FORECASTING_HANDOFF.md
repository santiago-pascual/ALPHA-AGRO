# Dual-track forecasting status and execution handoff

## Scope and current evidence

Alpha Agro has two separate forecast products:

1. **Short term:** 14- and 28-day soil-water outlooks. The current GLDAS 3-hourly pilot covers January 2–3, 2020 (16 regional assets, 867 cells per day). It fails the history gate. The separate SMAP pilot has only short 2020 and 2017 fragments (15 complete days in the Phase 11 panel); there are no eligible locations for model fitting. No real-data short-horizon score, uncertainty coverage, or probability calibration is available. Weather predictors have not been admitted.
2. **Seasonal:** 1-, 2-, and 3-month outlooks from the 2006–2025 GLDAS monthly research. Its documented protocol used chronological walk-forward evaluation and a separate 2024–2025 holdout. Seasonal climatology was selected on pre-holdout walk-forward loss in all 18 scope × horizon × target configurations. Holdout winners are descriptive and cannot replace that selection. This is retrospective research on final archived NASA data with assumed five-calendar-month latency, not prospective operational skill. A climatological probability may be shown only as an explicitly labeled baseline.

The monthly report is available at [`PREDICTIVE_REAL_DATA_RESULTS.md`](PREDICTIVE_REAL_DATA_RESULTS.md); the GLDAS short-pilot limits and design are in [`WATER_RISK_14_28.md`](WATER_RISK_14_28.md). The separate Phase 11 SMAP report describes a 15-complete-day 2017/2020 panel, but is not part of this main-branch checkout. The claimed auxiliary JSON digest and 972-fold count were not available to this checkout for independent verification. The tracked monthly report does verify the 18/18 climatology selection.

## Product behavior added on this branch

The forecast page now describes both tracks separately, exposes the 18/18 baseline-selection finding with its correct interpretation, and keeps both forecast outputs withheld. Selecting a supported grid cell shows its long-term GLDAS trend and interval from the validated trend artifact. The diagnosis explicitly distinguishes that long-term modeled trend from current field conditions, short-term water stress, and land degradation. Guidance explains the prerequisites for any later conditional advice; no current action threshold or crop-specific recommendation is asserted.

The existing monthly `forecast_v1` contract remains limited to 1–3 months. Do not encode 14/28-day predictions in it. A future short-horizon release needs its own versioned schema and reader, with lead days, issue timestamp, grid-cell identity, source vintage and publication evidence, input cutoff, target definition, uncertainty/calibration, and status gate. Current fields remain unavailable until the evidence and validation gates pass.

## Validation design to execute when the archived panels are available

For **each horizon, target, and spatial cell or region**, use chronological, non-overlapping reference, fit, model-selection, calibration, and untouched final-holdout periods. Respect actual provider release times and a frozen issue cutoff; never let a target or meteorological forecast published after issue enter features. Fit thresholds, preprocessing, HMM states, and calibration on the permitted earlier partition only. Compare at minimum:

- Seasonal climatology fitted from training history (including a separately labeled climatological event probability).
- Persistence using only the latest value available at issue time.
- Fixed, predeclared autoregression/Ridge as a transparent dynamic comparator.
- XGBoost and XGBoost with forward-filtered HMM state probabilities, with tuning nested inside chronological training folds.

Report common-support sample counts, RMSE/MAE/bias for continuous storage, Brier/log loss and reliability for event probabilities, paired date-block intervals, and nominal interval coverage. Report skill relative to both climatology and persistence. Keep the final holdout sealed until model/feature selection and calibration are frozen. A model is eligible for display only when it improves on the strong baselines with uncertainty supporting that claim, is calibrated on an independent chronological interval, and has issue-time source evidence. A retrospective assumed-lag replay cannot meet the operational gate.

Short-term weather variables may be added only as archived forecast vintages issued by the forecast origin and available by issue time; later reanalysis or realized weather is not a valid substitute. Confirm spatial/temporal alignment and missingness before evaluation. For seasonal horizons, add predictors only after a scientific rationale, archived vintage availability, and an ablation against the GLDAS-only climatology/persistence baselines.

## Data not present on this development computer

No local NASA archive is available in this worktree. In particular, the ignored `data/` archive is absent: the 240 monthly GLDAS soil-water and driver exports required by the original Phase 4 panel builder, the GLDAS 3-hourly regional pilot assets, and the SMAP/AppEEARS or Harmony historical site/cell panels are not here. The locally served `frontend/public/data/{trend_analysis,predictive_evaluation_v1,forecast_v1}.json` artifacts are also absent. Existing tracked reports are not substitutes for source bytes, verified release vintages, or deployable JSON artifacts. Do not acquire the 240 files again.

## Original data-holding PC: required work

1. Verify checksums/manifests for the 240 existing GLDAS monthly exports and driver exports; export and validate the monthly parquet panel using the commands in [`PREDICTIVE_MODELING_STATUS.md`](PREDICTIVE_MODELING_STATUS.md). Reuse the preserved evaluation and inspect source output/configuration rather than repeating expensive runs unnecessarily. Recover the existing predictive-evaluation JSON/digest if present.
2. Resume the already-submitted AppEEARS task only if its task record and bounded output are available; do not submit a new 240-file acquisition. Validate any returned SMAP/AppEEARS cells against the already acquired Harmony probe and preserve provider metadata/checksums.
3. Inventory existing SMAP/GLDAS short-term records and their real publication/availability timestamps. If history continuity and sample count still fail the gate, acquire a bounded, approved provider-supported batch after validating that route; first extend the coverage required by the frozen split plan. Keep credentials on that PC and never add them to artifacts or Git.
4. On sufficient data, run the already implemented chronological research (and the separate short-term evaluation) on the holdout protocol above. Do not claim dynamic skill from final-holdout selection. Generate artifacts with exclusive writes, schema-validate them, and transfer only reviewed, hashed outputs to this development checkout.
5. Only then enable forecast display. Carry source/prediction hashes, vintage evidence, uncertainty and calibration into the artifact. Re-run release-gate checks before publication.

Until then, this computer is ready for frontend and deterministic framework work, but **not** for scientific model fitting, validated forecasting, or an operational Phase 4/dual-track release.
