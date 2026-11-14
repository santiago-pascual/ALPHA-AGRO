# Research handoff

**Branch** `feature/research` tracks `origin/feature/research` in the private `santiago-pascual/quant-alpha-agro` repository.

**Latest scientific checkpoint** `36962343fdc0410d520b27c99900bee370dfe8b3`. The handoff update is a later documentation commit. Use `git log -1 --oneline` to read the exact tip of the branch containing this file. Use `git ls-remote --exit-code origin refs/heads/feature/research` to check the published tip.

## Resume

1. Read [AGENTS.md](../AGENTS.md), [project status](PROJECT_STATUS.md), this handoff, and the [scientific research charter](SCIENTIFIC_RESEARCH_CHARTER.md).
2. Phase 1 monthly sample validation is complete. The sample has 896 cells, with 867 valid per soil layer. Six tests passed and a fresh subset export matched the existing SHA-256. Consult the [acquisition report](PHASE_1_ACQUISITION_REPORT.md) and [manifest](DATA_MANIFEST.md).
3. Next, acquire and validate the January 1, 2020 three-hourly batch. CMR resolved the eight expected UTC slots. Check time labels, grid coordinates, variable units, fill and missing values, and provenance against the files. Compare shared fields and masks with the monthly product. A single day cannot reproduce a monthly mean.
4. After the three-hourly check passes, test a bounded monthly batch and verify file-level coverage and grid consistency. For the full period, benchmark an official spatial subset route first to avoid unnecessary global transfers. Keep the date plan in bounded batches. The current CLI resumes by reusing checksum-verified complete granules and restarts interrupted individual transfers.

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

The terminal download accepts an Earthdata user token either through the hidden prompt below or through `EARTHDATA_TOKEN` in the process environment with `--prompt-token` omitted. Open an interactive terminal for the hidden prompt and paste the token there. Tests and the local-file import need no secret variable. Use the [Earthdata token instructions](https://urs.earthdata.nasa.gov/documentation/for_users/user_token) and keep the token outside chat, shell command text, Git, and logs.

```powershell
.\.venv\Scripts\python.exe -m gldas --product 3hourly --start 2020-01-01 --end 2020-01-01 --max-granules 8 --prompt-token
```

**Blocker and limits.** This session has no available Earthdata token. The browser profile route requested login. The real three-hourly schema and authenticated CLI transfer remain unverified. If an authorized request redirects, use the [acquisition report](PHASE_1_ACQUISITION_REPORT.md) to check GES DISC authorization or import browser downloads by granule.

**Local files.** The raw monthly granule and checksum manifest, the Pampas cutout, and the JSON report are under ignored `data/phase1/`. The original browser download and `.venv/` are also local. See relative paths and hashes in [DATA_MANIFEST.md](DATA_MANIFEST.md).

## Checkpoint workflow

At each meaningful milestone, run the relevant tests and update this file and [PROJECT_STATUS.md](PROJECT_STATUS.md). Record new evidence and dataset provenance where applicable. Stage explicit source and documentation paths, then check the staged diff for secrets, raw datasets, generated files, and whitespace. Commit and push to `feature/research`, then compare local HEAD with the remote ref. Label an unfinished checkpoint WIP. Keep dataset bytes in ignored local storage and coordinate the next write to the shared feature branch before switching computers.
