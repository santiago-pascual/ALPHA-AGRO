# Forecast v1 frontend handoff

The Forecast page consumes `frontend/public/data/forecast_v1.json`. This is a public, static artifact; the browser does not train models, fetch provider data, or infer an issue timestamp. Do not install a research fixture at this path.

## Required record

The current JSON Schema is `config/forecast_v1.schema.json`. The frontend validates its required fields at runtime and applies stricter display gates:

- `schema_version`: `forecast_v1`.
- `status`: `operationally_eligible` for numeric display. `retrospective_simulation` and `experimental` are withheld.
- `issue_time`, `input_observation_cutoff`: timezone-aware UTC ISO timestamps ending in `Z`. Both must parse, cutoff and calibration label availability must not follow issue time, and issue time cannot be in the future.
- `target_month`, `horizon_months`: `YYYY-MM` and 1, 2, or 3; target month must equal issue month plus horizon.
- `scope.id`, `scope.bounds_west_south_east_north`: exact selected eligible cell identity and `[west, south, east, north]` bounds. The bounds must contain the selected point.
- `target`: `storage`, `anomaly`, or `low_moisture`.
- `model.name`, `model.version`: `model.name` must equal the pre-holdout selected model in the matching spatial `predictive_evaluation_v1` series. Holdout ranking is descriptive and never used for selection. The current 18-configuration artifact must be queried rather than hardcoding `seasonal_climatology`.
- `availability.policy`, `availability.operationally_eligible`, `availability.input_months`, `availability.publication_evidence`: eligibility must be true and aggregate evidence must be an object containing `asset_id`, `first_verified_access_at` (UTC, no later than issue time), and `sha256` (64 hexadecimal characters). Each input-month object must include `month` (`YYYY-MM`), UTC `observation_end`, UTC `provider_publication_at`, UTC `available_at`, `availability_is_assumed: false`, and 64-character `soil_sha256` and `driver_sha256`. All publication/usable timestamps must be no later than issue time and observations no later than `input_observation_cutoff`. A failed request, assumed release lag, archive date, or `null` publication time is not evidence.
- `value`, `units`, `predictive_interval`: storage/anomaly values must be finite millimetres with a finite ordered predictive interval and explicit nominal level/method. Low-moisture probability must be finite in `[0,1]`, use `probability`, and must not include a millimetre interval. Evaluation score intervals are not forecast uncertainty.
- `calibration`: period, positive month count, label availability timestamp, and metrics.
- `quality_flags`, `source.collection`, `source.doi`, `source.input_panel_sha256` (SHA-256).

Unknown, missing, stale, incompatible, experimental, and retrospective records are unavailable. The page never falls back to historical series, persistence, climatology, or test fixtures. Only one artifact record is currently supported; regional forecasts and arrays of records require an explicit versioned contract change.

## Cell identity

The page validates a selected coordinate against eligible cell footprints in the actual trend artifact using its declared resolution. It builds an ID as `gldas-noah-v2.1:<latitude-center-to-4-decimals>:<longitude-center-to-4-decimals>`. The forecast producer must emit that exact center-derived ID and matching geographic bounds. Coordinates are in-memory only. GLDAS grid support is not field-scale measurement or GPS precision.

## Model and request selection

The UI supports spatial requests only. For every horizon and target selection it reads the matching `scope=spatial` series from `predictive_evaluation_v1.json` and derives the model marked selected before holdout. The request consists of the selected coordinate, validated grid-cell ID, horizon, target, spatial scope, requested issue policy/date, model ID, and `forecast_v1` version. A user cannot override the model. “Latest verified eligible issue” means the artifact is checked for matching issue-time evidence; it does not substitute the current date.

An explicit issue timestamp is UTC RFC 3339 ending in `Z`. Target month is the first day of the issue month plus the horizon as defined by the current schema. Input months must have content-bound availability evidence no later than issue time. The frontend can verify supplied timestamps and hashes structurally, but cannot independently establish that provider publication evidence is genuine; the scientific pipeline and review must do so.

## Current pipeline gap and installation

The existing `gldas.predictive.forecast` runner emits a one-record `retrospective_simulation` using assumed archive release lag, `publication_evidence: null`, and a regional panel scope. It is intentionally ineligible and does not match the selected spatial-cell contract. The frontend does not relabel or display it. Do not change that runner or its scientific results to satisfy the UI. A separately reviewed producer must emit the contract above after prospective validation and independent publication-vintage verification.

After the research PC generates and reviews a compatible artifact, install it locally at `frontend/public/data/forecast_v1.json`. Validate it against `config/forecast_v1.schema.json`, review provenance and issue-time gates, then run from `frontend/`:

```powershell
npm run lint
npm test
npm run build
```

The path is git-ignored. Do not force-add the NASA-derived artifact or include it in a public release without approval. Test fixtures under `src/data/__fixtures__/` are synthetic and test-only.
