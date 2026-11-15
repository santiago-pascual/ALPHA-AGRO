# Phase 11 SMAP historical benchmark

The [frozen design](../config/smap_phase11_design_v1.json) uses 24 native 9 km EASE-Grid centers across four provisional Pampas subregions, snapped to prespecified town-area coordinates. Each location represents the grid cell, not a measured field. The 2016–2018 climatology is separate from model fitting (2019–2020), validation and model selection (2021), calibration (2022–2023) and the final 2024 issue-date holdout. A response window that would cross the corresponding release cutoff is excluded. Archived SMAP simulations assume a seven-day publication lag. The study requires at least 12 locations with enough reference, fitting, validation, calibration and holdout observations.

## Acquisition and result

The AppEEARS pilot returned SPL4SMGP.008 Geophysical_Data_sm_rootzone, 0–100 cm, m³/m³, with native three-hour UTC midpoints. The catalog lists fill −9999 and no associated quality layer for this field. All 48 values from three cells over January 2–3, 2020 matched native Harmony values to within 5.0 × 10⁻⁸ m³/m³. Native row/column indices, the official granule list and the provider's file sizes and SHA-256 values passed verification. The generic Earthdata bearer received HTTP 403; direct AppEEARS access requires a service login. The local runner limits a probe to seven days, subsequent requests to one year, and output to 150 MB per bundle. These are project limits. [AppEEARS API](https://appeears.earthdatacloud.nasa.gov/api/) · [NSIDC SMAP V008 specification](https://nsidc.org/sites/default/files/documents/technical-reference/smap_l4_sm_psd_v17_for_l4sm_version_8.pdf)

NASA Harmony job ac900b0e-abcb-4118-9fd7-aa23a949112c added 56 native-grid regional subsets for January 2–8, 2017 (3,635,053 bytes). Together with January 2–9, 2020, the panel has 120 unique slots, 15 complete days and 360 verified site-days. Missing dates, slots and cells remain missing. The working panel SHA-256 is 21f069e31e6cadd0b823ec3b491a7ad0d9f4b4612fb10e96e7560a6351fb5a04. Both horizons returned insufficient_history with zero holdout-eligible locations. No XGBoost or other model was fitted against the real panel. The November 2026 native granule remains a single three-hour observation and cannot initialize the daily causal feature history.

## Continue the verified workflow

From this checkout, set the Python executable to the research environment. The hidden AppEEARS login keeps credentials in memory. A successful time-series probe must match January 2–3, 2020 native Harmony values at all three probe sites before the longer point archive is consumed.

```powershell
$py = '.\.venv\Scripts\python.exe'
& $py -m gldas.smap_appeears submit --pilot --start 2020-01-02 --end 2020-01-03 --output data/smap/phase11/appeears-pilot.json --archive data/smap/phase11/appeears --prompt-login
# To resume an already submitted task, use collect --task-id ID --archive data/smap/phase11/appeears --wait-minutes 10 --prompt-login.
& $py -m gldas.smap_sites --harmony data/smap/phase10/harmony --start 2016-01-01 --end 2025-01-27 --output data/smap/phase11/harmony_site_panel.npz
& $py -m gldas.smap_benchmark --panel data/smap/phase11/harmony_site_panel.npz --output data/smap/phase11/harmony_benchmark.json
```

For the full point history, the AppEEARS CLI's history command takes --state and --archive for the existing AppEEARS request and bundle directories and --harmony for the verified native overlap archive. It resumes recorded jobs, starts at most --max-new-jobs new bounded annual tasks, and waits for each task to be validated before submitting the next. Start with one annual job to measure time, size and missingness. Add --appeears with the full collected point-bundle archive path to the panel command. The importer separates the three-site probe from the annual tasks.

Holdout reporting uses equal weighting across verified site-days, pre-holdout selection and calibration, and paired 28-issue-day blocks resampled across sites together. The event models use per-site Platt calibration when both calibration classes have sufficient support. Empirical residual intervals are evaluated separately. The dashboard stays in its existing unavailable state until a real benchmark and issue-time evidence support forecast use.
