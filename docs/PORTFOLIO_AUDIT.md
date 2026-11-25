# Portfolio audit — 2026-11-25

Scope: uploaded main-branch ZIP, not Git history or deployed website. No application or scientific engine code changed. Existing research artifacts, source files, checksums and provenance preserved. The original root README is archived in LEGACY_SETUP.md; the frontend README now identifies earlier artifact-availability instructions as historical.

## Executed checks
- Python 3.13.5: full pytest attempted; collection stopped with 10 import errors (missing dependencies including netCDF4). Installation attempt could not resolve a package from available indexes.
- Availability and availability-monitor tests: 19 passed, 4 subtests passed.
- Python compileall for gldas, tests and scripts: passed.
- Node 22.16.0 / npm 10.9.2: offline npm ci failed (uncached yallist tarball). Frontend lint, tests, build and actual screenshots not executable in this environment.
- Offline evidence script: passed; 240 chronological monthly records, matching manifest entries, anomaly recomputation, independent full-design OLS/HAC interval, spatial aggregation, 18 predictive selection records and experimental eligibility. Figures generated from committed artifacts.
- Raw NASA inputs absent; acquisition, raw checksums and model refitting not rerun. No claim of full scientific reproduction.
- Existing deployment workflow is manual only. Added non-deploying CI for artifact checks and frontend; remote execution subsequently passed. Full backend CI remains dependent on the original pinned environment.

## Security review
Pattern scan of readable archive files for JWT-shaped strings, GitHub tokens and private-key headers; no matching credential patterns reported. This is not a comprehensive secret scan or Git history review. Local path references are documentation hygiene issues, not proof of leaked credentials. Existing ignore rules protect common local credential and raw-data paths. No credentials were requested or used.

## Remaining work
Run the full dependency installation, Python tests and frontend checks in the original environment; capture actual screenshots from the running app. Review all historical phase documents before treating them as current instructions. Remote portfolio CI passed after publication. No scientific methodology or reported findings were changed.
