# Reproduction and environment

## Historical environment
The original project records Windows x64 Python 3.15.2 and binary-wheel installation of `requirements-dev.txt`; `requirements-ml.txt` adds XGBoost. These pins were not reinstalled in the portfolio audit. The audit used Python 3.13.5 and Node 22.16.0; the existing Pages workflow specifies Node 20. Do not infer full cross-platform compatibility from the partial audit.

Windows PowerShell, from the root (use the recorded Python interpreter):
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pytest -q
```
For ML experiments install `requirements-ml.txt` as well. On POSIX, the analogous interpreter is `.venv/bin/python`; full installation there remains unverified.

## Earthdata
Use `python -m gldas.auth` in a Windows interactive terminal to store a token in Windows Credential Manager through hidden input. The acquisition code also accepts the `EARTHDATA_TOKEN` environment variable supplied securely by the shell or secret manager. Never commit a token, paste it into a command history, or include it in diagnostics. See [handoff](HANDOFF.md).

## Full historical reproduction
With the authorized environment, `python -m gldas.history --batches 60` acquires historical inputs. With all 240 exports and provenance manifests in `data/phase1/historical-opendap/`, run `python -m gldas.trend_report --output data/analysis/2006-2025-repeat`. See [real-data results](REAL_DATA_RESULTS.md) and [predictive results](PREDICTIVE_REAL_DATA_RESULTS.md). The portfolio audit did not run acquisition or refit predictive models.

## Lightweight demonstration
Install NumPy and matplotlib in a separate environment and run `python scripts/portfolio_evidence.py` from the root. This verified workflow uses only the committed JSON artifacts and checksum index. For the frontend, use Node.js 22 (locally validated; Node.js 26 produced localStorage test failures with the existing test stack). The `.gitattributes` rule preserves LF line endings for public JSON artifacts and their byte-level provenance hashes. Run `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npm run preview` inside `frontend/`. The public data bundle is already included. External map tiles require internet. See [deployment](../frontend/DEPLOYMENT.md). No operational forecast artifact is included.
