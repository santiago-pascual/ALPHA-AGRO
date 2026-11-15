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
- **Forecast:** a distinct monthly 1–3 month workspace. Its configuration controls stay disabled until a schema-valid artifact provides issue-time evidence, uncertainty, provenance, and verified operational eligibility. There are no fallback values or crop recommendations.
- **Research & Methods:** versioned historical evaluation, regional/spatial, horizon and target filters, walk-forward/holdout comparison, baseline skill, score-difference intervals, and research-status ladder. Holdout rankings are descriptive only.
- **About & data sources:** GLDAS variables and units, coverage rules, trend methods, provenance, and scientific limits.

## Predictive evaluation integration

The data-holding PC must provide `predictive_evaluation_v1.json` at `frontend/public/data/predictive_evaluation_v1.json`. Use the exact contract and engine mapping notes in [docs/PREDICTIVE_EVALUATION_V1.md](docs/PREDICTIVE_EVALUATION_V1.md). The current Python evaluator produces spatial fold records only; the artifact must also contain separately evaluated regional mean results, provenance hashes and pre-holdout model selection derived only from walk-forward data. Do not fill missing fields with synthetic values. This JSON is ignored by Git.

The page labels the best model on the untouched holdout as descriptive only. Its 95% intervals describe score differences against a baseline, not uncertainty intervals for a future prediction. `forecast_v1.json` is a separate contract defined in `../config/forecast_v1.schema.json`; it must not be derived by relabeling a retrospective hindcast. Forecast controls remain unavailable until a separately validated and operationally eligible artifact exists. Generated artifacts are ignored by Git.

Component and adapter tests use fixtures explicitly marked **TEST ONLY — SYNTHETIC**. They are never imported into application runtime code.

The navigation is organized as **Observatory**, **Forecast**, **Research & Methods**, and **About & Data Sources**. No geographic selector is exposed: only the validated Argentine Pampas support is represented.

The map uses free OpenStreetMap tiles with visible attribution. It requires an internet connection for basemap tiles; the dashboard data itself does not call a paid API or require credentials. Regional GLDAS fields are modeled data and do not establish field conditions, crop yield, or damage.

## Demo and static hosting

The English presenter script is in [../docs/ALPHA_AGRO_DEMO_SCRIPT.md](../docs/ALPHA_AGRO_DEMO_SCRIPT.md). GitHub Pages static hosting is prepared as a manual-only workflow; see [DEPLOYMENT.md](DEPLOYMENT.md). No public deployment is triggered by the workflow file or by building locally. The standard checkout build does not include ignored NASA or predictive JSON artifacts.
