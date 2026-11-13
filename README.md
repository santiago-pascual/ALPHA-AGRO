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

- [Vision](docs/PROJECT_VISION.md), [requirements](docs/REQUIREMENTS.md), and [architecture proposal](docs/ARCHITECTURE_PROPOSAL.md)
- [NASA source research](docs/DATA_SOURCE_RESEARCH.md) and [scientific plan](docs/SCIENTIFIC_PLAN.md)
- [48-hour development plan](docs/DEVELOPMENT_PLAN.md), [two-computer workflow](docs/TEAM_WORKFLOW.md), and [submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Agent instructions](AGENTS.md)
