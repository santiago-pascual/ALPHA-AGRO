# Archived original README (historical setup; superseded)

# Alpha Agro

**Alpha Agro** is NASA-powered Earth system intelligence for agriculture, developed by team **Quant Alpha** for the 2026 NASA Space Apps Challenge, [Be An Earth System Trend Detective!](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/). **From Earth data to agricultural insight.** The application helps users explore historical Earth observation trends and hydrological context for the Argentine Pampas, with cautious context for soybean, maize, and wheat.

The initial scope is one region and one crop. Historical trend analysis is the core deliverable. The statistical engine is documented in [Trend engine](TREND_ENGINE.md); it does not establish crop effects. Any hydrological prediction shown will require historical validation.

## Local Python environment

This checkout has been configured and tested with the installed Python 3.15.2. Use the existing .venv where available; the pinned development requirements were verified as binary-wheel installable on Python 3.15.2. Recreate only when needed using the installed Python 3.15 executable, without relying on the Windows Store alias.

```powershell
$python315 = Join-Path $env:LOCALAPPDATA "Python\bin\python.exe"
& $python315 --version
& $python315 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -c "import numpy, pandas, scipy, xarray, requests, netCDF4, matplotlib, sklearn, streamlit, plotly, folium, pytest; print('Candidate imports OK')"
```

The dependency snapshot captures candidate packages and their dependencies. All pinned development requirements installed from binary wheels in the Python 3.15.2 environment used for this branch. The trend engine uses `netCDF4` and `numpy` for masked NetCDF input; its estimators use the Python standard library. In VS Code, select `.venv\Scripts\python.exe` as the workspace interpreter.

## Planning documents


For the statistical analysis API, assumptions, JSON contract, and run command, see [Trend engine](TREND_ENGINE.md).

For the current research checkpoint, start with [project status](PROJECT_STATUS.md) and [handoff](HANDOFF.md).

- [Vision](PROJECT_VISION.md), [requirements](REQUIREMENTS.md), and [architecture proposal](ARCHITECTURE_PROPOSAL.md)
- [Scientific research charter](SCIENTIFIC_RESEARCH_CHARTER.md), [NASA source research](DATA_SOURCE_RESEARCH.md), and [scientific plan](SCIENTIFIC_PLAN.md)
- [Phase 1 dataset inventory](PHASE_1_DATA_INVENTORY.md), [GLDAS data dictionary](PHASE_1_DATA_DICTIONARY.md), and [acquisition report](PHASE_1_ACQUISITION_REPORT.md)
- [48-hour development plan](DEVELOPMENT_PLAN.md), [two-computer workflow](TEAM_WORKFLOW.md), and [submission checklist](SUBMISSION_CHECKLIST.md)
- [Agent instructions](../AGENTS.md)

## Reproduce the validated research

Alpha Agro studies changes in modelled soil-water storage in a provisional Pampas region of Argentina, with soybean as the initial use case. The validated acquisition covers all **240 months from January 2006 through December 2025**. Each monthly export contains three soil-water layers for a 0.25° grid. The same 867 of 896 cells have all three layers throughout the record.

| NASA dataset | Role |
| --- | --- |
| GLDAS Noah v2.1 monthly | Verified historical inputs for 0–100 cm soil-water trend analysis |
| GLDAS Noah v2.1 three-hourly | Verified one-day sample for checking data cadence and units |
| GPM IMERG Final V07B, Terra MODIS MOD13Q1 v061, and SMAP | Candidate precipitation, vegetation, and soil-moisture comparisons. Coverage and dependencies differ by product. |

See the [dataset inventory](PHASE_1_DATA_INVENTORY.md) for collection identifiers, DOIs, and coverage.

The acquisition layer discovers version-pinned NASA granules, downloads the Pampas subset, and validates its schema, time bounds, and provenance. The statistical engine reads those local exports and produces regional and grid-cell trend results. The planned interface will consume validated results.

After installing the dependencies above, store an authorized Earthdata token once per Windows account using the hidden prompt, then fetch the monthly inputs. Run the trend engine on the **historical OPeNDAP directory**. The NetCDF exports and generated outputs stay under ignored `data/`.

```powershell
.\.venv\Scripts\python.exe -m gldas.auth
.\.venv\Scripts\python.exe -m gldas.history --batches 60
.\.venv\Scripts\python.exe -m gldas.trends data/phase1/historical-opendap --output data/analysis/trend_analysis.json
.\.venv\Scripts\python.exe -m pytest -q
```

The verification run on all 240 months estimated a regional linear trend of **−2.83 mm per decade**. The 95% interval allowing for temporal autocorrelation was **−23.69 to +18.03 mm per decade** (`p = 0.79`). The estimate is uncertain for this period and provisional box. The grid represents modelled regional soil water, and field conditions, soybean damage, and forecast skill require separate evidence. [Trend engine and assumptions](TREND_ENGINE.md) · [Input checksums](GLDAS_MONTHLY_SHA256.csv) · [Earthdata setup](HANDOFF.md#earthdata-authentication)
