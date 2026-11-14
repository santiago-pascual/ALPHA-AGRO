# Quant Alpha Agro

Quant Alpha is preparing a virtual entry for the 2026 NASA Space Apps Challenge, [Be An Earth System Trend Detective!](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/). The planned web application will help agricultural producers in Argentina interpret Earth observation trends and hydrological conditions relevant to soybean, maize, and wheat.

This repository is in pre-event setup. Competition implementation is deferred until November 14, 2026 at 09:00 Argentina time (ART, UTC−03:00). The initial scope is one region and one crop. Historical trend analysis is the core deliverable. Any hydrological prediction shown will require historical validation.

## Local Python environment

From the repository root in PowerShell, use Python 3.13 and recreate the environment on each computer. The example calls the isolated interpreter directly and works without changing the PowerShell execution policy.

```powershell
py -3.13 --version
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -c "import numpy, pandas, scipy, xarray, requests, netCDF4, matplotlib, sklearn, streamlit, plotly, folium, pytest; print('Candidate imports OK')"
```

The dependency snapshot captures the candidate packages and their dependencies for Windows x64 and Python 3.13. For a different platform, resolve compatible wheels in a separate virtual environment and verify imports there before sharing a new snapshot. Choose final runtime dependencies once the MVP needs are known. In VS Code, select `.venv\Scripts\python.exe` as the workspace interpreter.

## Planning documents

For the current research checkpoint, start with [project status](docs/PROJECT_STATUS.md) and [handoff](docs/HANDOFF.md).

- [Vision](docs/PROJECT_VISION.md), [requirements](docs/REQUIREMENTS.md), and [architecture proposal](docs/ARCHITECTURE_PROPOSAL.md)
- [Scientific research charter](docs/SCIENTIFIC_RESEARCH_CHARTER.md), [NASA source research](docs/DATA_SOURCE_RESEARCH.md), and [scientific plan](docs/SCIENTIFIC_PLAN.md)
- [Phase 1 dataset inventory](docs/PHASE_1_DATA_INVENTORY.md), [GLDAS data dictionary](docs/PHASE_1_DATA_DICTIONARY.md), and [acquisition report](docs/PHASE_1_ACQUISITION_REPORT.md)
- [48-hour development plan](docs/DEVELOPMENT_PLAN.md), [two-computer workflow](docs/TEAM_WORKFLOW.md), and [submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Agent instructions](AGENTS.md)

## Reproduce the validated research

Quant Alpha Agro studies changes in modelled soil-water storage in a provisional Pampas region of Argentina, with soybean as the initial use case. The validated acquisition covers all **240 months from January 2006 through December 2025**. Each monthly export contains three soil-water layers for a 0.25° grid. The same 867 of 896 cells have all three layers throughout the record.

| NASA dataset | Role |
| --- | --- |
| GLDAS Noah v2.1 monthly | Verified historical inputs for 0–100 cm soil-water trend analysis |
| GLDAS Noah v2.1 three-hourly | Verified one-day sample for checking data cadence and units |
| GPM IMERG Final V07B, Terra MODIS MOD13Q1 v061, and SMAP | Candidate precipitation, vegetation, and soil-moisture comparisons. Coverage and dependencies differ by product. |

See the [dataset inventory](docs/PHASE_1_DATA_INVENTORY.md) for collection identifiers, DOIs, and coverage.

The acquisition layer discovers version-pinned NASA granules, downloads the Pampas subset, and validates its schema, time bounds, and provenance. The statistical engine reads those local exports and produces regional and grid-cell trend results. The planned interface will consume validated results.

After installing the dependencies above, store an authorized Earthdata token once per Windows account using the hidden prompt, then fetch the monthly inputs. Run the trend engine on the **historical OPeNDAP directory**. The NetCDF exports and generated outputs stay under ignored `data/`.

```powershell
.\.venv\Scripts\python.exe -m gldas.auth
.\.venv\Scripts\python.exe -m gldas.history --batches 60
.\.venv\Scripts\python.exe -m gldas.trends data/phase1/historical-opendap --output data/analysis/trend_analysis.json
.\.venv\Scripts\python.exe -m pytest -q
```

The verification run on all 240 months estimated a regional linear trend of **−2.83 mm per decade**. The 95% interval allowing for temporal autocorrelation was **−23.69 to +18.03 mm per decade** (`p = 0.79`). The estimate is uncertain for this period and provisional box. The grid represents modelled regional soil water, and field conditions, soybean damage, and forecast skill require separate evidence. [Trend engine and assumptions](docs/TREND_ENGINE.md) · [Input checksums](docs/GLDAS_MONTHLY_SHA256.csv) · [Earthdata setup](docs/HANDOFF.md#earthdata-authentication)
