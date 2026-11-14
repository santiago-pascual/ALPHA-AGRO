# Quant Alpha Agro

Quant Alpha is preparing a virtual entry for the 2026 NASA Space Apps Challenge, [Be An Earth System Trend Detective!](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/). The planned web application will help agricultural producers in Argentina interpret Earth observation trends and hydrological conditions relevant to soybean, maize, and wheat.

The initial scope is one region and one crop. Historical trend analysis is the core deliverable. The statistical engine is documented in [Trend engine](docs/TREND_ENGINE.md); it does not establish crop effects. Any hydrological prediction shown will require historical validation.

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


For the statistical analysis API, assumptions, JSON contract, and run command, see [Trend engine](docs/TREND_ENGINE.md).

For the current research checkpoint, start with [project status](docs/PROJECT_STATUS.md) and [handoff](docs/HANDOFF.md).

- [Vision](docs/PROJECT_VISION.md), [requirements](docs/REQUIREMENTS.md), and [architecture proposal](docs/ARCHITECTURE_PROPOSAL.md)
- [Scientific research charter](docs/SCIENTIFIC_RESEARCH_CHARTER.md), [NASA source research](docs/DATA_SOURCE_RESEARCH.md), and [scientific plan](docs/SCIENTIFIC_PLAN.md)
- [Phase 1 dataset inventory](docs/PHASE_1_DATA_INVENTORY.md), [GLDAS data dictionary](docs/PHASE_1_DATA_DICTIONARY.md), and [acquisition report](docs/PHASE_1_ACQUISITION_REPORT.md)
- [48-hour development plan](docs/DEVELOPMENT_PLAN.md), [two-computer workflow](docs/TEAM_WORKFLOW.md), and [submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Agent instructions](AGENTS.md)
