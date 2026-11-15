# Alpha Agro frontend

**Alpha Agro** is NASA-powered Earth system intelligence for agriculture, developed by team **Quant Alpha** for NASA Space Apps Challenge 2026: **Be An Earth System Trend Detective!** Its tagline is **From Earth data to agricultural insight.** The public interface is real-data-first and presents only schema-validated scientific artifacts. Test fixtures remain confined to tests; synthetic observations are not a public dashboard mode.

## Run locally

From this directory:

~~~powershell
npm install
npm run dev
~~~

The app opens on the Alpha Agro landing page with a seven-step guided tour. The tour explains real product capabilities and evidence limits; it does not inject synthetic observations. Open **Observatory** to inspect the Argentine Pampas study. If the validated trend artifact is missing or invalid, the Observatory remains empty and explains the issue.

Build and check the frontend with:

~~~powershell
npm run lint
npm test
npm run build
~~~

## Connect validated results

The frontend reads the trend engine's schema version 1.0. On the original data-holding PC, after the 240 monthly GLDAS exports and provenance manifests have passed the audit, run this from the repository root:

~~~powershell
.\.venv\Scripts\python.exe -m gldas.trend_report
~~~

The report writes `data/analysis/2006-2025/trend_analysis.json`. Copy that reviewed output to `frontend/public/data/trend_analysis.json`. The JSON is git-ignored by `public/data/.gitignore`; raw NetCDF files do not belong in this app. If the file is absent or invalid, the Observatory shows an empty/error state and does not fall back to synthetic results.

The adapter in src/data/loadTrend.ts maps and validates the engine fields before presentation. It checks continuous monthly dates, coverage fractions, grid dimensions, eligible-cell counts, and per-input-file SHA-256 provenance in addition to reading months, spatial_grid, quality, regional_monthly_series, regional_monthly_anomalies, regional_trend, and spatial trends. The dashboard identifies this output as a historical retrospective analysis; it does not provide operational forecasts. The schema and statistical assumptions are described in ../docs/TREND_ENGINE.md.

Automated tests use schema-valid fixtures under `src/data/__fixtures__/`. Their values are test-only and are never imported by the application runtime.

## Screens

- Landing and guided demonstration: study context, evidence boundaries, and a seven-step presenter walkthrough. The cross-variable relationship chart is not connected in this frontend.

- **Observatory:** regional trend, HAC interval and p-value, coverage, cell-level map, date-filtered monthly storage/anomalies, and cautious crop context. The current supported study region is the Argentine Pampas; no other region is implied.
- **Forecast:** Argentina-wide road map and reference-point selection, local coordinate search, GPS/manual selection, saved field and crop settings, ten crop categories, crop-appropriate stage controls, three irrigation states, and monthly 1–3 month requests. The scientific GLDAS grid is hidden by default on the farmer map and can be toggled for research. Forecast results remain artifact-gated and crop-neutral; comparison displays evidence gaps without scores or recommendations.
- **Research & Methods:** versioned historical evaluation, regional/spatial, horizon and target filters, walk-forward/holdout comparison, baseline skill, score-difference intervals, and research-status ladder. Holdout rankings are descriptive only.
- **About & data sources:** GLDAS variables and units, coverage rules, trend methods, provenance, and scientific limits.

## Predictive evaluation integration

The data-holding PC must provide `predictive_evaluation_v1.json` at `frontend/public/data/predictive_evaluation_v1.json`. Use the exact contract and engine mapping notes in [docs/PREDICTIVE_EVALUATION_V1.md](docs/PREDICTIVE_EVALUATION_V1.md). The current Python evaluator produces spatial fold records only; the artifact must also contain separately evaluated regional mean results, provenance hashes and pre-holdout model selection derived only from walk-forward data. Do not fill missing fields with synthetic values. This JSON is ignored by Git.

The page labels the best model on the untouched holdout as descriptive only. Its 95% intervals describe score differences against a baseline, not uncertainty intervals for a future prediction. `forecast_v1.json` is a separate contract defined in `../config/forecast_v1.schema.json`; it must not be derived by relabeling a retrospective hindcast. Forecast request controls are interactive, while forecast values remain withheld until a separately validated and operationally eligible artifact exists. Generated artifacts are ignored by Git.

### Forecast artifact gate

The research PC must provide a compatible artifact at `frontend/public/data/forecast_v1.json`. It must validate against `config/forecast_v1.schema.json` and the stricter frontend request matching rules. Cell identity, selected pre-holdout model, issue/cutoff times, target month, units, prediction uncertainty, calibration, source hashes, and verified publication evidence must all match. See [docs/FORECAST_V1_FRONTEND_HANDOFF.md](docs/FORECAST_V1_FRONTEND_HANDOFF.md) for the exact contract and current exporter limitations. `retrospective_simulation` and `experimental` artifacts remain withheld from the numeric Forecast display. Experimental 14/28-day SMAP research remains separate from this monthly GLDAS interface.

Component and adapter tests use fixtures explicitly marked **TEST ONLY — SYNTHETIC**. They are never imported into application runtime code.

The navigation is organized as **Observatory**, **Forecast**, **Research & Methods**, and **About & Data Sources**. English is the default interface language; use the EN / ES selector to change languages. The choice is stored only in this browser. Field selection can pan across Argentina, but scientific forecast coverage remains limited to matching cells in the validated artifact.

### Saved fields and farmer-facing interpretation

The Forecast workspace can save multiple named reference points in this browser/device's `localStorage` key `alpha-agro.saved-fields.v1`. Fields are never sent to Alpha Agro services; map tile requests remain an external dependency and do not include a saved-field record. Users can select, rename, and delete each field. The active field is restored after refresh. Saved data includes coordinates, creation time, description, crop context, and a validated GLDAS grid-cell identifier when coverage exists; GPS accuracy is never copied into a field record. Points outside scientific coverage can still be saved with no grid-cell ID; forecasts remain unavailable. Malformed or older records are ignored with a visible notice.

Map, GPS, and coordinate selections can be retained throughout Argentina, while scientific results are matched only to a cell footprint in the validated artifact's eligible trend-cell mask. The mask and declared grid spacing are used; cells absent from the mask are unsupported and are never extrapolated. A point is not an official country/Pampas polygon, farm boundary, or field-level measurement. The browser's GPS-reported horizontal accuracy describes device positioning. GLDAS Noah grid spacing describes land-model support; neither is GPS precision nor satellite-observation resolution. Fields sharing one grid cell receive the same cell-level historical support, and the UI explains that distinction.

Plain-language anomaly interpretation uses only the sign of the validated monthly regional anomaly. The dashboard labels it as regional context and does not present area coverage as confidence; no monthly anomaly uncertainty interval is provided by the current contract. A selected cell's seasonal-anomaly trend is historical and distinct from current moisture. No drought category, irrigation advice, crop stress, yield, or damage outcome is inferred. Forecast values remain hidden unless the existing `forecast_v1` validation gates pass; low-moisture probability is withheld when its research-defined event is missing.

The current road basemap uses the standard OpenStreetMap tile endpoint with visible attribution and requires internet access. OSMF describes the service as best-effort with no SLA and requires application-identifying request headers, referer, caching, and low-volume use; production scale should use a provider whose terms and access are explicitly configured. Satellite and hybrid modes are present but disabled: Esri's current basemap services require an account/token and billable usage after free allowances. Locality/address search is not connected to a geocoder; coordinate parsing and map selection are local, avoiding disclosure of an address to a third party. Regional GLDAS fields are modeled data and do not establish field conditions, crop yield, or damage.

The ten-crop catalog is configuration metadata, not a ranking or production-volume list. Crop-stage choices are stored per field. Regional suitability, water thresholds, recommendations, and crop-specific responses remain unavailable until reviewed sources and evidence are added with traceable geographic applicability. See [docs/FARMER_V1_MAP_AND_CROP_CATALOG.md](docs/FARMER_V1_MAP_AND_CROP_CATALOG.md).

### Forecast horizon support

The current `forecast_v1` contract in `../config/forecast_v1.schema.json` defines only monthly horizons of 1, 2, or 3 months. The 14-day and 28-day options belong to a separate short-term research track and remain disabled until its validated artifact contract and eligibility evidence are available. Do not adapt monthly GLDAS outputs or retrospective evaluation rows into short-term predictions.

`forecast_v1` currently describes one spatial record per artifact. The page matches that record to the selected GLDAS cell, horizon, target, issue time, and pre-holdout model. A record for another selection is withheld. Serving multiple locations/horizons/targets from one artifact will require an agreed, versioned record collection or index from the scientific team; this frontend does not invent that schema. The current contract also does not provide baseline-relative forecast skill or farmer-facing decision rules, so the UI reports those as unavailable and does not generate field advice.

See [FORECAST_GENERATION_AND_LOCALIZATION.md](docs/FORECAST_GENERATION_AND_LOCALIZATION.md) for request behavior and the artifact fields needed to enable this workflow.

### Phase 8 experimental outlook bundle

The Forecast workspace has a separate **Research / Experimental Outlook** reader for `phase8_forecast_bundle_v1`. Its adapter follows the versioned contract introduced by scientific commit `a381248af3320a497d543a5cf0384c764b604bdd` in `config/phase8_forecast_bundle_v1.schema.json`. It validates the complete three-horizon regional and spatial bundle, checks provenance digests, bounds and missing-cell masks, and verifies regional/spatial agreement before exposing any result. The current scientific issue is marked experimental with `operationally_eligible: false`; this panel cannot enable operational forecasts.

On the scientific computer, copy the locally validated `data/analysis/phase8_2026_bounded/phase8_forecast_bundle_v1.json` to `frontend/public/data/phase8_forecast_bundle_v1.json`. The destination is git-ignored and must not be force-added. The UI reads only this artifact; a missing or invalid bundle produces an explicit unavailable/error state. It shows the regional outlook by default. Spatial lookup uses the nearest bundle grid center only when that cell is valid; masked or out-of-support locations stay unavailable, with no replacement or interpolation. It does not calculate predictions in the browser or derive crop guidance.

The Phase 8 reader and UI tests use synthetic test-only contract fixtures. If the ignored real bundle is present locally, an additional regression test validates it during `npm test`; the artifact itself is never required by or included in a clean Git checkout.

## Demo and static hosting

The English presenter script is in [../docs/ALPHA_AGRO_DEMO_SCRIPT.md](../docs/ALPHA_AGRO_DEMO_SCRIPT.md). GitHub Pages static hosting is prepared as a manual-only workflow; see [DEPLOYMENT.md](DEPLOYMENT.md). No public deployment is triggered by the workflow file or by building locally. The standard checkout build does not include ignored NASA or predictive JSON artifacts.
