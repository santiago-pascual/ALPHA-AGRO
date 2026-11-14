# Quant Alpha Agro frontend

A responsive dark-mode dashboard for historical GLDAS Noah v2.1 soil-water trends across the Argentine Pampas. The default view is DEMO: every displayed value and grid cell is generated locally, fictional, and clearly labeled. It is not a NASA finding.

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

The frontend reads the trend engine's schema version 1.0. Copy a reviewed trend_analysis.json to public/data/trend_analysis.json, then select REAL DATA in the header. The JSON is git-ignored by public/data/.gitignore; raw NetCDF files do not belong in this app. If the file is absent or invalid, the overview shows an empty/error state and does not fall back to synthetic results.

The adapter in src/data/loadTrend.ts maps the engine fields into presentation types. It reads months, spatial_grid, quality, regional_monthly_series, regional_monthly_anomalies, regional_trend, and spatial_trends_on_cell_seasonal_anomalies. The schema and statistical assumptions are described in ../docs/TREND_ENGINE.md.

## Screens

- Overview: regional trend, HAC interval and p-value, coverage, cell-level map, date-filtered monthly storage/anomalies, and cautious crop context.
- Methods & data: GLDAS variables and units, coverage rules, trend methods, provenance, and limits.

The map uses free OpenStreetMap tiles with visible attribution. It requires an internet connection for basemap tiles; the dashboard data itself does not call a paid API or require credentials. Regional GLDAS fields are modeled data and do not establish field conditions, crop yield, or damage.
