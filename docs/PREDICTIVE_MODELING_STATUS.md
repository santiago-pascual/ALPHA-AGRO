# Phase 4 predictive modeling status

**Implementation status:** framework and deterministic synthetic tests implemented; real-data evaluation pending.

## Delivered in this branch

- UTC Parquet panel contract v1.0.0 and non-overwriting export/validation commands.
- Causal as-of lag features with explicit issue, observation, and availability timestamps.
- Expanding monthly-grouped folds, nested temporal parameter selection, and a reserved final contiguous holdout.
- Seasonal climatology, persistence, autoregressive Ridge, Ridge, XGBoost, and XGBoost plus a filtered Gaussian HMM.
- Storage and per-cell training-climatology anomaly targets; per-cell, calendar-month training-quantile low-moisture events.
- RMSE, MAE, bias, persistence skill, Brier/log loss, calibration bins, paired performance comparisons, and month-block uncertainty intervals.
- Deterministic tests use synthetic fixtures only. No synthetic score is a scientific finding.

## Runtime findings

- Python 3.15.2 and the existing environment are retained.
- `xgboost==3.4.1` has a compatible Windows binary wheel and installed successfully.
- `hmmlearn==0.3.3` has no compatible binary wheel available to the current Python 3.15 Windows pip resolver. The implementation uses a local diagonal Gaussian HMM with NumPy/SciPy and a forward-filter-only API; no unsupported source build was attempted.
- The branch is based on `feature/gldas-multivariable` at `d523bf3`; the implementation depends on the unmerged Phase 3 branch. It must not be merged into `main` ahead of Phase 3.

## Still required

- Run the exporter on the original data-holding PC and transfer the validated Parquet file.
- Confirm exact release-time snapshots or maintain the explicit five-calendar-month assumption and label the evaluation retrospective.
- Run the walk-forward CLI on the real panel. Review each target/horizon's outer folds, nested selections, untouched holdout, metrics, paired intervals, coverage, and convergence/degenerate-fold errors.
- Compare the HMM-augmented XGBoost against identical XGBoost folds and targets. Do not claim improvement if the paired evidence is inconclusive.
- Real-data OOS skill, calibration quality, low-moisture event utility, and operational forecast readiness remain unverified.

## Commands

From the original PC's Phase 4 checkout, with audited Phase 3 archives already present:

```powershell
.\.venv\Scripts\python.exe -m gldas.multivariable --months 240
.\.venv\Scripts\python.exe -m gldas.predictive.export_panel --release-lag-months 5 --output data/exports/phase4/monthly_panel.parquet
.\.venv\Scripts\python.exe -m gldas.predictive validate --input data/exports/phase4/monthly_panel.parquet
```

The first command may retrieve missing driver exports. It is unnecessary if all 240 validated driver files already exist. It does not redownload the 240 soil-water files. After transfer, run `python -m gldas.predictive evaluate` as shown in the design document. All exports and evaluation outputs stay under ignored `data/`.
