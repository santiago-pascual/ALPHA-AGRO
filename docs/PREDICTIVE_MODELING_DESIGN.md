# Phase 4 predictive modeling design

**Status:** framework implementation on `feature/predictive-modeling`, based on the unmerged Phase 3 branch `feature/gldas-multivariable` at `d523bf3`. The Phase 4 branch depends on that branch until PR #7 is merged. No changes to `main` were made.

## Scope and scientific status

This code supports research evaluation of regional or cell-level monthly soil-water storage, training-defined anomalies, and model-defined low-moisture events at 1, 2, and 3 month horizons. It is a retrospective framework. The 240-month local NASA archive is not present on this computer; no real-data model results were generated. Archived final products and assumed release times cannot establish operational forecast skill. A low-moisture label is a statistical soil-water threshold, **not verified agricultural drought**, crop stress, yield loss, or crop damage.

Models are seasonal climatology, persistence, autoregressive Ridge, Ridge, XGBoost, a diagonal Gaussian HMM, and XGBoost augmented with filtered HMM state probabilities. The HMM is a feature source, not a standalone forecast. Its two-state and three-state alternatives are compared by BIC on the training period only.

## Timing and leakage controls

- Every input record has a UTC monthly observation interval and an explicit `available_at` timestamp. Feature rows use only observations with `available_at <= issue_time` and observation month no later than the issue month.
- Forecast issue time is the last instant of the origin month. Targets are the complete monthly value `horizon` calendar months later. Horizons are 1, 2, or 3 months.
- The export default assigns a conservative **assumed** release time five calendar months after an observation month starts. This is a planning policy, not a measured release timestamp. If original release-time snapshots become available, the archive owner must replace the assumption with those records and regenerate the export.
- The anomaly climatology and low-moisture thresholds are fitted independently from each training fold, per cell and target calendar month. The low-moisture threshold is the training 20th percentile, with a training-only calendar-month fallback and then a training-only pooled fallback.
- Imputation and scaling are fitted inside model pipelines on training rows. Nested chronological validation chooses model parameters inside each outer training window.
- Expanding walk-forward folds group all cells from the same target month together. The last requested contiguous months form one final untouched holdout.
- At both the outer and inner split, fitting uses only training labels released by the first validation or test issue time. Outer results record the actual training months and label-availability cutoff.
- The HMM implementation exposes forward filtering only. For training features it refits on prefixes through each issue month; for validation/test it fits state parameters on training issue months and filters new observations sequentially. No full-sequence smoothing or future-dependent state path is used.

## Parquet contract

Schema version `1.0.0` is defined in `gldas/predictive/contract.py`. One row represents a `(month, cell_id)` pair. The file contains a constant spatial grid for a continuous monthly period.

| Group | Fields |
| --- | --- |
| Identity | `month` (UTC month start), `cell_id`, `latitude`, `longitude`, `area_weight` |
| Values | `soil_water_mm`, `precipitation_mm_month`, `evapotranspiration_mm_month`, `air_temperature_c`, `surface_runoff_mm_month`, `subsurface_runoff_mm_month` |
| Masks | One `<variable>_valid` boolean per value; masked values must be null |
| Time | `observation_start`, `observation_end` (half-open interval), `available_at` |
| Provenance | product/version/DOI, soil and driver granule IDs, SHA-256 checksums, and `availability_policy` |

Parquet metadata records schema version, units, and availability policy. The validator checks timestamps, contiguous months, stable cell set/coordinates/weights, masks, positive area weights, provenance fields, and checksums. Canonical units follow the field names: GLDAS soil storage in mm water equivalent; fluxes converted to mm/month; temperature in °C; area in m².

## Original data-holding PC workflow

Run these commands from the Phase 4 branch checkout on the original PC, after verifying the already-held Phase 3 soil and driver archives and provenance manifests exist locally. These commands only read local archives; they do not download NASA data. Stop if an expected archive is missing and recover it from the original local storage before exporting.

```powershell
.\.venv\Scripts\python.exe -m gldas.predictive.export_panel --release-lag-months 5 --output data/exports/phase4/monthly_panel.parquet
.\.venv\Scripts\python.exe -m gldas.predictive validate --input data/exports/phase4/monthly_panel.parquet
```

The export requires both the 240 soil-water OPeNDAP exports and the matching 240 driver exports under the paths documented in `docs/MULTIVARIABLE_DATA_VALIDATION.md`. It revalidates driver files and refuses to overwrite an existing Parquet file. Transfer the resulting Parquet file using the team's approved private channel; do not commit it.

To run the same CLI on area-weighted regional means, create a one-region panel from the validated spatial file.

```powershell
.\.venv\Scripts\python.exe -m gldas.predictive.export_panel --regional-from data/exports/phase4/monthly_panel.parquet --output data/exports/phase4/regional_panel.parquet
.\.venv\Scripts\python.exe -m gldas.predictive validate --input data/exports/phase4/regional_panel.parquet
```

The regional panel uses the Phase 3 common valid mask and spherical cell areas and preserves the source granule IDs and assumed release policy. Its latitude and longitude are the area-weighted centroid of the contributing grid cells.

After transfer to an environment with the model dependencies, evaluate with:

```powershell
.\.venv\Scripts\python.exe -m gldas.predictive evaluate --input data/exports/phase4/monthly_panel.parquet --output data/analysis/phase4/walk_forward.json --initial-train-months 120 --test-window-months 12 --holdout-months 24 --horizons 1 2 3
```

Evaluation outputs are local, ignored data. Real-time release snapshots are not present in the current project artifacts, so output must be described as retrospective validation on archived final products.

## Dependencies and verification

`requirements-ml.txt` pins XGBoost 3.4.1. PyPI supplied a `py3-none-win_amd64` wheel and it was installed and import-checked in Python 3.15.2; `pip check` passed. `hmmlearn==0.3.3` was checked using a binary-only pip download and no compatible wheel was available for this Python/Windows runtime. No source build or Python downgrade was attempted. The HMM code uses the existing NumPy, SciPy, and scikit-learn dependencies.

Run automated tests from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Synthetic fixtures test timing, leakage, splits, transforms, model interfaces, filtering, metrics, reproducibility, and Parquet validation. Their scores are not scientific results.
