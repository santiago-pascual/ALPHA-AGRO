# Alpha Agro frontend

**Alpha Agro** is NASA-powered Earth system intelligence for agriculture, developed by team **Quant Alpha** for NASA Space Apps Challenge 2026: **Be An Earth System Trend Detective!** Its tagline is **From Earth data to agricultural insight.** The dashboard presents historical GLDAS Noah v2.1 soil-water trends across the Argentine Pampas. The default view is DEMO: every displayed value and grid cell is generated locally, fictional, and clearly labeled. It is not a NASA finding.

## Run locally

From this directory:

~~~powershell
npm install
npm run dev
~~~

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

The report writes `data/analysis/2006-2025/trend_analysis.json`. Copy that reviewed output to `frontend/public/data/trend_analysis.json`, then select REAL DATA in the header. The JSON is git-ignored by public/data/.gitignore; raw NetCDF files do not belong in this app. If the file is absent or invalid, the overview shows an empty/error state and does not fall back to synthetic results.

The adapter in src/data/loadTrend.ts maps and validates the engine fields before presentation. It checks continuous monthly dates, coverage fractions, grid dimensions, eligible-cell counts, and per-input-file SHA-256 provenance in addition to reading months, spatial_grid, quality, regional_monthly_series, regional_monthly_anomalies, regional_trend, and spatial trends. The dashboard identifies this output as a historical retrospective analysis; it does not provide operational forecasts. The schema and statistical assumptions are described in ../docs/TREND_ENGINE.md.

Automated tests use a schema-valid synthetic fixture under `src/data/__fixtures__/`. Its values are test-only and are never loaded by the application. The default DEMO mode remains visibly labeled and uses separate fictional data.

## Screens

- Overview: regional trend, HAC interval and p-value, coverage, cell-level map, date-filtered monthly storage/anomalies, and cautious crop context.
- Methods & data: GLDAS variables and units, coverage rules, trend methods, provenance, and limits.
- Predictive research: versioned historical evaluation artifact loader, regional/spatial, horizon and target filters, walk-forward/holdout comparison, baseline skill, score-difference intervals, and explicit separation from future forecasts. The screen remains empty when the evaluation JSON is absent.

## Predictive evaluation integration

The data-holding PC must provide `predictive_evaluation_v1.json` at `frontend/public/data/predictive_evaluation_v1.json`. Use the exact contract and engine mapping notes in [docs/PREDICTIVE_EVALUATION_V1.md](docs/PREDICTIVE_EVALUATION_V1.md). The current Python evaluator produces spatial fold records only; the artifact must also contain separately evaluated regional mean results, provenance hashes and pre-holdout model selection derived only from walk-forward data. Do not fill missing fields with synthetic values. This JSON is ignored by Git.

The page labels the best candidate on the untouched holdout as descriptive only. Its 95% intervals describe score differences against a baseline, not uncertainty intervals for a future prediction. The separate Forecast Explorer is disabled until a validated, operationally defined `forecast_v1.json` exists. `forecast_v1.json` and the evaluation artifact are both ignored by Git.

Component and adapter tests use a fixture explicitly marked **TEST ONLY — SYNTHETIC**. It is never imported into application runtime code.

The map uses free OpenStreetMap tiles with visible attribution. It requires an internet connection for basemap tiles; the dashboard data itself does not call a paid API or require credentials. Regional GLDAS fields are modeled data and do not establish field conditions, crop yield, or damage.
