# Prospective regional storage pilot

## Question and fixed comparison

Can a lagged-input XGBoost model reduce one-month-ahead error for regional 0–100 cm GLDAS Noah v2.1 monthly soil-water storage relative to seasonal climatology when the exact inputs used were demonstrably available at issue time?

Use one regional series with the provisional Pampas box and the Phase 3 common 867-cell spherical-area weighting. Issue at the last instant of each UTC month. Predict storage in mm for the next calendar month. Keep the target pinned to main-production GLDAS monthly v2.1, collection C1342986036-GES_DISC. The verifying value is a subsequent model-derived storage estimate. Validate against independent soil-profile observations separately.

- **Baseline.** Calendar-month climatology from the frozen, eligible training labels. It was preselected in all Phase 5B configurations.
- **One challenger.** Plain XGBoost. For regional one-month storage, eligible pre-holdout pooled RMSE was 36.699493 mm for climatology, 37.849951 mm for XGBoost, and 37.910864 mm for autoregressive Ridge. XGBoost is the lowest-scoring non-baseline challenger to climatology in this comparison. The 2024–2025 holdout ranking is excluded from this choice.
- **Fixed settings.** Learning rate 0.03, depth 1 and 80 estimators, the modal choice in five of seven selection-eligible nested folds. Use the Phase 5B regressor settings for remaining options, including histogram trees, seed 1729 and one worker. Freeze the evaluator commit, XGBoost 3.4.1 and pinned environment, six released monthly lags and target calendar terms, area mask, units, model artifact digests and training-data digest before the first issue. No HMM, retuning or alternative targets in this pilot.

## Issue-time protocol

1. Use the existing availability monitor to capture first successful content retrieval of each exact regional input vintage. Keep the observation interval, provider publication timestamp when independently verified, first observed access timestamp, CMR ID, stream/version, and SHA-256 separate. A catalog hit, documented latency, or byte-range probe alone does not verify access to the exact predictor content. Capture all six monthly records required by the challenger. Record missing, late or revised vintages without silently filling them.
2. Before opening the pilot, train using reconstructable prior issue snapshots and training labels demonstrably available by the freeze time. If historical predictor vintages cannot be reconstructed, collect them prospectively before fitting the challenger. Do not backfill claimed vintages from today's archive. Freeze both fitted models, the fixed support, and a record of the training/calibration cutoffs. Confirm independent replays of both predictions.
3. For each scheduled issue, require complete, verified shared inputs with checksums matching the frozen feature snapshot. Persist both predictions and their issue timestamp, target, model digests, input digests and QC disposition in the same append-only record before target data become available. Keep a timestamped record or signed digest off the forecasting machine. Withhold both predictions for an issue that fails these rules, and record why.
4. Score only against the pinned target granule's first verified main-production vintage. Preserve later revisions separately. Record the content checksum and verification time. Publish all scheduled issues, including withheld and unscored outcomes, and explain any missing targets.

## Acceptance criteria

- Schedule consecutive monthly attempts. The feasibility milestone is six paired, fully verified cases, with up to 12 scheduled issues before reviewing access and missingness. Every scored case must have an immutable prediction record created before target availability and a complete verified training and issue-time audit.
- Report paired RMSE as primary, MAE and signed bias as secondary, and list all paired errors by issue. Challenger progress in the pilot requires lower descriptive RMSE than climatology and reproducible replay of every scored case. A six-month sample is feasibility evidence. It cannot justify promotion or an operational skill claim.
- Keep promotion gated on a longer prespecified prospective evaluation spanning multiple seasonal cycles, independent observations, and a dependence-aware paired interval supporting improvement. Fit uncertainty calibration on a separate eligible period before its own scored evaluation. Retain the seasonal baseline if availability, validation or reproducibility fails.

See [the forecast runbook](PHASE6_FORECAST_PIPELINE.md), [historical comparison](PREDICTIVE_REAL_DATA_RESULTS.md), and [asset monitor](PHASE6B_ASSET_AVAILABILITY_MONITOR.md).
