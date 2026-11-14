# Research handoff

**Branch** `feature/research` tracks `origin/feature/research` in the private `santiago-pascual/quant-alpha-agro` repository.

**Latest scientific checkpoint** January–April 2006 historical OPeNDAP batch. Use `git log -1 --oneline` for the exact local commit and `git ls-remote --exit-code origin refs/heads/feature/research` for the published tip.

## Resume

1. Read [AGENTS.md](../AGENTS.md), [project status](PROJECT_STATUS.md), this handoff, and the [scientific research charter](SCIENTIFIC_RESEARCH_CHARTER.md).
2. Phase 1 monthly sample validation is complete. The sample has 896 cells, with 867 valid per soil layer. A fresh subset export matched the existing SHA-256. Consult the [acquisition report](PHASE_1_ACQUISITION_REPORT.md) and [manifest](DATA_MANIFEST.md).
3. The authenticated three-hourly batch passed for all eight UTC labels from 00:00 through 21:00. Raw and subset hashes matched the manifests and reports. Grid centres, units and masks for the checked fields matched the monthly sample. All 27 tests passed. See [acquisition evidence](PHASE_1_ACQUISITION_REPORT.md#three-hourly-validation).
4. The two-month pilot passed, including February's 29-day interval. Before the 240-month run, benchmark NASA OPeNDAP spatial subsetting to avoid unnecessary global transfers. Use bounded date batches. The CLI resumes at the granule level by reusing checksum-verified files and restarting interrupted transfers.

## Reproduce on Windows

For a fresh checkout, authenticate to the private repo and run these commands in PowerShell. On an existing checkout, confirm the working tree is clean before switching branches or pulling with `--ff-only`.

```powershell
git clone --branch feature/research https://github.com/santiago-pascual/quant-alpha-agro.git
Set-Location quant-alpha-agro
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

For monthly reproduction, download the [January 2020 file from NASA](https://data.gesdisc.earthdata.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/2020/GLDAS_NOAH025_M.A202001.021.nc4) with an authorized Earthdata account. Save it under its original name in Downloads or adjust the path.

```powershell
.\.venv\Scripts\python.exe -m gldas --start 2020-01-01 --end 2020-01-31 --local-file "$env:USERPROFILE\Downloads\GLDAS_NOAH025_M.A202001.021.nc4"
```

The terminal download accepts an Earthdata user token either through the hidden prompt below or through `EARTHDATA_TOKEN` in the process environment with `--prompt-token` omitted. From the repository root in the VS Code PowerShell terminal, enter the token at `Earthdata user token:`. It remains in that Python process for the download. The program exits if hidden input is unavailable. Tests and the local-file import need no secret variable. Use the [Earthdata token instructions](https://urs.earthdata.nasa.gov/documentation/for_users/user_token) and keep the token outside chat, shell command text, Git, and logs.

```powershell
.\.venv\Scripts\python.exe -m gldas --product 3hourly --start 2020-01-01 --end 2020-01-01 --max-granules 8 --prompt-token
```

**Reproduce the completed monthly pilot.** From the repository root, this reuses checksum-verified January and February files when present. A new transfer needs an Earthdata token in an interactive terminal. [NASA GESDISC DATA ARCHIVE authorization](https://urs.earthdata.nasa.gov/approve_app?client_id=e2WVk8Pw6weeLUKZYOxvTQ)

```powershell
.\.venv\Scripts\python.exe -m gldas --product monthly --start 2020-01-01 --end 2020-02-29 --max-granules 2 --prompt-token
```

**Verified benchmark.** The February export matched decoded times and bounds, coordinate values, units, missing-data masks, and all retained soil-water values exactly. The export and metrics are under ignored `data/phase1/benchmark/`. The benchmark can be reproduced from PowerShell. [NASA OPeNDAP tutorials](https://github.com/nasa/gesdisc-tutorials)

```powershell
.\.venv\Scripts\python.exe -m gldas.benchmark
```

**Next task.** Resume the full historical series in four-month batches with a single hidden token prompt. January–April 2006 will be reused after checksum and schema verification, then the runner continues in May. Use `--batches 2` to stop after August 2006. Each provider export and JSON manifest is stored under ignored `data/phase1/historical-opendap/`. If a later month fails, retain the completed exports and rerun the same command after reviewing the error. The authenticated `python -m gldas` HTTPS route remains available for a bounded fallback with separate provenance.

```powershell
.\.venv\Scripts\python.exe -m gldas.history --batches 60
```

**Limits.** Three-hourly rainfall intervals are labelled by their ending time. These eight labels cover December 31 at 21:00 to January 1 at 21:00 UTC for rainfall. To aggregate the full January 1 UTC rainfall day, use intervals ending at 03:00 through January 2 at 00:00. The subset is a provisional box and the model values have not been validated against field observations.

**Local files.** Both monthly and all eight three-hourly raw granules, manifests, cutouts and JSON reports are under ignored `data/phase1/`. The browser download and `.venv/` are also local. See [DATA_MANIFEST.md](DATA_MANIFEST.md).

## Checkpoint workflow

At each meaningful milestone, run the relevant tests and update this file and [PROJECT_STATUS.md](PROJECT_STATUS.md). Record new evidence and dataset provenance where applicable. Stage explicit source and documentation paths, then check the staged diff for secrets, raw datasets, generated files, and whitespace. Commit and push to `feature/research`, then compare local HEAD with the remote ref. Label an unfinished checkpoint WIP. Keep dataset bytes in ignored local storage and coordinate the next write to the shared feature branch before switching computers.
