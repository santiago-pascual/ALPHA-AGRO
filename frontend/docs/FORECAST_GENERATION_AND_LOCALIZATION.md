# Forecast generation and language support

## User workflow

The Forecast page requires an eligible map cell, manually entered coordinates, or a saved field. It uses the validated trend artifact's eligible-cell mask to resolve that location. The Generate forecast action validates the location, the monthly horizon, the target, and the pre-holdout selected model before looking up the local `forecast_v1` artifact.

The frontend does not calculate predictions. Results appear only after an explicit request and only when the artifact passes the existing schema adapter and operational eligibility checks in `src/data/forecast.ts`. A missing, invalid, retrospective, experimental, stale, temporally inconsistent, or request-mismatched artifact produces an unavailable result. Historical analysis is offered separately; no historical value is substituted.

## Current contract boundary

The current [`forecast_v1` schema](../../config/forecast_v1.schema.json) supports only 1, 2, and 3 month horizons, and one forecast record per JSON object. It does not define 14/28-day results, multi-record indexing, calibrated farmer guidance, or skill against comparison baselines. Accordingly:

- 14-day and 28-day horizons are shown in a separate disabled short-term group.
- Monthly target options are limited to storage, anomaly, and low-moisture probability from the existing contract.
- Only the exact cell/horizon/target/model/issue match is displayed.
- The interface does not claim baseline skill or provide crop-specific advice when the artifact does not contain those validated fields and rules.

The research team must supply the existing monthly artifact at `public/data/forecast_v1.json`. To support multiple user selections, coordinate a versioned collection/index contract with explicit per-record spatial identity, issue time, horizon, target, model, prediction, uncertainty/calibration, eligibility evidence, provenance hashes, and quality flags. A separate schema is required for 14/28-day short-term forecasts. Do not use retrospective hindcasts as replacements.

## Localization

`src/i18n.tsx` contains the typed English and Spanish dictionaries and the lightweight context used by the interface. English is the first-visit default. The EN / ES control changes language without reload, updates the document language, applies locale-aware formatting helpers, and stores the preference under `alpha-agro.language.v1` in local storage. Saved coordinates remain governed by the existing local-only saved-field storage behavior.

## Checks

From `frontend/`, run `npm run lint`, `npm test`, and `npm run build`. Forecast artifact fixtures contain synthetic values solely for automated tests and are not imported by application code or published under `public/data/`.
