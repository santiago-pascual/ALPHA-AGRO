# Research handoff

**Starting branch** Use `main` for new work. It includes the acquisition workflow and both historical analyses.

**Latest scientific checkpoint** Both analyses reproduced against all 240 monthly exports. The full-record regional slope was −2.83 mm per decade (95% HAC interval −23.69 to +18.03). Use `git log -1 --oneline` for the current commit. [First analysis](REAL_DATA_RESULTS.md) · [Sensitivity results](SCIENTIFIC_DISCOVERY_RESULTS.md) · [Machine-readable JSON](GLDAS_DISCOVERY_RESULTS.json)

## Resume

1. Read [AGENTS.md](../AGENTS.md), [project status](PROJECT_STATUS.md), this handoff, and the [scientific research charter](SCIENTIFIC_RESEARCH_CHARTER.md).
2. Phase 1 monthly sample validation is complete. The sample has 896 cells, with 867 valid per soil layer. A fresh subset export matched the existing SHA-256. Consult the [acquisition report](PHASE_1_ACQUISITION_REPORT.md) and [manifest](DATA_MANIFEST.md).
3. The authenticated three-hourly batch passed for all eight UTC labels from 00:00 through 21:00. Raw and subset hashes matched the manifests and reports. Grid centres, units and masks for the checked fields matched the monthly sample. All 27 tests passed. See [acquisition evidence](PHASE_1_ACQUISITION_REPORT.md#three-hourly-validation).
4. The historical acquisition passed validation for all 240 months. The grid and common valid-cell mask are consistent throughout the series. Use the [data manifest](DATA_MANIFEST.md) and [scientific plan](SCIENTIFIC_PLAN.md) for the 0–100 cm analysis.

## Reproduce on Windows

For a fresh checkout, authenticate to the private repo and run these commands in PowerShell. On an existing checkout, confirm the working tree is clean before switching branches or pulling with `--ff-only`.

```powershell
git clone --branch main https://github.com/santiago-pascual/quant-alpha-agro.git
Set-Location quant-alpha-agro
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

For monthly reproduction, download the [January 2020 file from NASA](https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/2020/GLDAS_NOAH025_M.A202001.021.nc4) with an authorized Earthdata account. Save it under its original name in Downloads or adjust the path.

```powershell
.\.venv\Scripts\python.exe -m gldas --start 2020-01-01 --end 2020-01-31 --local-file "$env:USERPROFILE\Downloads\GLDAS_NOAH025_M.A202001.021.nc4"
```

## Earthdata authentication

From the repository root in PowerShell, install the updated dependencies and run the one-time setup if needed. Enter the token at the hidden prompt. The second command stores it in Windows Credential Manager under service `quant-alpha-agro` and username `earthdata`. Rerun it to replace an expired token. Set up the credential under the Windows account that runs the downloads on each computer. [NASA Earthdata token instructions](https://urs.earthdata.nasa.gov/documentation/for_users/user_token)

```powershell
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements-dev.txt
.\.venv\Scripts\python.exe -m gldas.auth
```

The download commands use `EARTHDATA_TOKEN` first, then the Windows credential. With either source available, omit `--prompt-token` for an unattended run. Use `--prompt-token` to enter a token for one invocation. The history and benchmark commands also prompt automatically when run interactively without a configured token. Tests and local-file imports need no token. Keep the token out of chat, URLs, command arguments and logs.

```powershell
.\.venv\Scripts\python.exe -m gldas --product 3hourly --start 2020-01-01 --end 2020-01-01 --max-granules 8
```

**Reproduce the completed monthly pilot.** From the repository root, this reuses checksum-verified January and February files when present. New transfers use the configured token. [NASA GESDISC DATA ARCHIVE authorization](https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ)

```powershell
.\.venv\Scripts\python.exe -m gldas --product monthly --start 2020-01-01 --end 2020-02-29 --max-granules 2
```

**Verified benchmark.** The February export matched decoded times and bounds, coordinate values, units, missing-data masks, and all retained soil-water values exactly. The export and metrics are under ignored `data/phase1/benchmark/`. The benchmark can be reproduced from PowerShell. [NASA OPeNDAP tutorials](https://github.com/nasa/gesdisc-tutorials)

```powershell
.\.venv\Scripts\python.exe -m gldas.benchmark
```

**Reproduce the historical inputs.** The provider exports and JSON manifests are in ignored `data/phase1/historical-opendap/`. Use the command below to retrieve the inputs on another machine. The runner checks and reuses complete files.

```powershell
.\.venv\Scripts\python.exe -m gldas.history --batches 60
```

**Reproduce the historical analysis.** Run `.\.venv\Scripts\python.exe -m gldas.trend_report` with the 240 local exports and their manifests in place. No Earthdata token is needed. The JSON and figures are ignored under `data/analysis/2006-2025/`. Use `--output` with a new directory for a repeat run.

**Second-phase checkpoint.** Regional sensitivity, spatial contrasts, and temporal persistence are documented in [Scientific discovery results](SCIENTIFIC_DISCOVERY_RESULTS.md). Run `.\.venv\Scripts\python.exe -m gldas.discovery` offline with the verified inputs. The ignored outputs are under `data/analysis/scientific-discovery/`.

**Next task.** Benchmark a single regional OPeNDAP export of the additional GLDAS variables against a local full granule. The two full monthly files are insufficient for estimates of long-term associations.

**Limits.** Three-hourly rainfall intervals are labelled by their ending time. These eight labels cover December 31 at 21:00 to January 1 at 21:00 UTC for rainfall. To aggregate the full January 1 UTC rainfall day, use intervals ending at 03:00 through January 2 at 00:00. The subset is a provisional box and the model values have not been validated against field observations.

**Local files.** Both monthly and all eight three-hourly raw granules, manifests, cutouts and JSON reports are under ignored `data/phase1/`. The browser download and `.venv/` are also local. See [DATA_MANIFEST.md](DATA_MANIFEST.md).

## Checkpoint workflow

At each meaningful milestone, run the relevant tests and update this file and [PROJECT_STATUS.md](PROJECT_STATUS.md). Record new evidence and dataset provenance where applicable. Stage explicit source and documentation paths, then check the staged diff for secrets, raw datasets, generated files, and whitespace. Push to the assigned feature branch, then compare local HEAD with the remote ref. Label an unfinished checkpoint WIP. Keep dataset bytes in ignored local storage and coordinate the next write to the shared feature branch before switching computers.
