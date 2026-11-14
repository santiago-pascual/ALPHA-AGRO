# Trend and relationship engine

## Current scope

The gldas.trends module analyzes complete monthly GLDAS Noah v2.1 regional NetCDF exports produced by the acquisition pipeline. It covers 0–100 cm soil-water storage, area-weighted regional means, seasonal climatology and anomalies, temporal trends, cell-level trends, coverage diagnostics, and false-discovery-rate adjustment.

The module does not download data. Synthetic inputs are used only by unit tests. This branch has not generated scientific findings from NASA data, and no crop-yield or crop-damage inference is supported.

## Input contract

The API accepts a chronologically ordered sequence of monthly files, one record per file. Each file must include:

- A CF time coordinate with one label on the first day of the month and a bounds attribute pointing to a one-month time_bnds variable.
- Ascending, finite lat and lon coordinates on the GLDAS 0.25 degree grid; coordinate units degrees_north and degrees_east.
- SoilMoi0_10cm_inst, SoilMoi10_40cm_inst, and SoilMoi40_100cm_inst, each with dimensions (time, lat, lon) and units kg m-2.
- The same coordinates in every file and exactly one contiguous record for every month in the requested period.

Missing values may be masked by NetCDF or represented as NaN in the direct array API. Unmasked infinities, incorrect units, impossible layer values, inconsistent grids, missing months, malformed time bounds, and layer shape mismatches are errors. Soil storage is calculated only where all three layers are valid.

The array API:

```python
from gldas.trends import analyze_monthly_grids

result = analyze_monthly_grids(
    months,                 # month-start dates, no gaps
    latitudes,              # ascending 0.25 degree cell centres
    longitudes,             # ascending 0.25 degree cell centres
    layer_arrays,           # the three names mapped to (time, lat, lon) arrays
    units={name: "kg m-2" for name in layer_names},
    minimum_regional_coverage=0.80,
    minimum_spatial_months=60,
    alpha=0.05,
)
```

For pipeline outputs, load_monthly_netcdf(paths) returns the validated dates, grid axes, layer arrays, and units. analyze_monthly_files(paths, ...) loads and analyzes them in one call. Results are JSON-serializable and use schema_version 1.0.

## Run

After the 240 regional monthly exports are available under data/phase1/subsets/-64.0_-38.0_-57.0_-30.0/, run from the repository root in PowerShell:

```powershell
.\.venv\Scripts\python.exe -m gldas.trends data\phase1\subsets\-64.0_-38.0_-57.0_-30.0 --output data\analysis\trend_analysis.json --minimum-regional-coverage 0.80 --minimum-spatial-months 60 --alpha 0.05 --hac-max-lag-months 12
```

The command reads only .nc4 files in the input directory and writes one JSON file. The output includes per-month regional values and area coverage, full-period month climatology, monthly anomalies, a regional trend summary, cell-level trend rows suitable for plotting or tabulation, and the filename plus SHA-256 of each input export. Keep generated analysis output out of Git unless the team explicitly decides otherwise.

## Definitions and assumptions

- **0–100 cm storage:** sum the first three GLDAS soil-water layers. Their native units are kg m-2, numerically equal to mm water equivalent at water density 1,000 kg m-3. The fourth 100–200 cm layer is excluded.
- **Regional mean:** use exact spherical areas for regular latitude/longitude cells, computed from each cell's latitude bounds and 0.25 degree longitude width. The calculation covers the supplied grid only and does not apply fractional overlap with a Pampas polygon.
- **Coverage:** valid area is the area of cells with all three required layers divided by total supplied-grid area. Withhold a month's regional mean below the configured threshold; report both area coverage and valid cell counts.
- **Climatology and anomalies:** calculate a full-period mean for each calendar month when at least two observations exist, then subtract that mean from each matching month. This descriptive baseline uses the complete analysis period and is not suitable for issue-time prediction.
- **Linear trend:** fit time in calendar months with month-of-year fixed effects, then convert the coefficient to mm per decade. Report a 95% normal-approximation interval and two-sided p-value using a Newey-West HAC covariance estimate with Bartlett weights and up to a configurable number of calendar-month lags (default 12). The finite-sample correction does not remove the asymptotic nature of this inference. Check sensitivity to lag and period choices.
- **Sen slope:** median pairwise slope among observations from the same calendar month in different years, scaled to mm per decade. This seasonal pairing reduces confounding by the annual cycle.
- **Mann-Kendall:** report classic tie-corrected Mann-Kendall on the displayed anomalies and Seasonal Kendall comparisons within the same calendar month. Their p-values assume independence and do not correct serial autocorrelation. Treat them as descriptive when serial dependence is present; use HAC trend inference for the autocorrelation-aware linear test.
- **Spatial testing:** estimate each eligible grid-cell trend with the same month effects and HAC method. Apply Benjamini-Hochberg to cell p-values. Spatial dependence can affect false-discovery control; interpret adjusted significance as approximate.
- **Missingness:** regional means use a consistent complete-profile mask per cell and month. Spatial trends require the configured minimum number and fraction of valid months. Reports retain coverage diagnostics.
- **Interpretation:** GLDAS soil moisture is modeled hydrological state. Trend or anomaly results do not establish soybean yield effects, crop stress, or crop damage.

## Reproducibility

Run the entire suite with:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Trend unit tests create deterministic synthetic arrays and temporary NetCDF files. They test signs, no-trend and seasonal cases, autocorrelated errors, missingness, units, calendar continuity, grid validation, spherical-area weighting, NetCDF ingestion, and Benjamini-Hochberg calculations. Synthetic tests are not NASA observations.
