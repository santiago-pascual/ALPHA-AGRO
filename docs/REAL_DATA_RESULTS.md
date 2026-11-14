# GLDAS soil-water trends in the provisional Pampas study area

## January 2006 through December 2025

Across the provisional study box (38–30°S, 64–57°W), the area-weighted trend in modeled 0–100 cm soil-water storage was **−2.83 mm per decade** (95% HAC interval **−23.69 to +18.03 mm per decade**, p = 0.790). The interval includes both drying and wetting. The direction of the regional trend remains unresolved.

| Measure | Result |
| --- | --- |
| Input records | 240 consecutive months. Every file matched its recorded SHA-256, NASA granule ID, grid, units and time bounds. |
| Regional data coverage | 867 of 896 cells retained in every month (96.76% of grid area). The other 29 cells were masked throughout. No regional monthly mean was withheld. |
| Regional seasonal Sen slope | −3.93 mm per decade |
| Seasonal Kendall | τ = −0.037. The nominal independence-based p = 0.437 is descriptive because residuals are serially dependent. |
| HAC sensitivity | 6 lags: [−21.99, +16.32]; 24 lags: [−22.37, +16.71] mm per decade. Lag-1 residual correlation was 0.84. |
| Spatial trends | 517 negative and 350 positive slopes (−20.61 to +18.50 mm per decade). No cell passed Benjamini–Hochberg at 0.05. The area-weighted mean of cell slopes reproduced the regional estimate. |
| Largest monthly anomalies | +99.71 mm in April 2007 and −81.40 mm in May 2009, relative to the full-period mean for each calendar month. |

## Data and methods

The inputs are NASA GES DISC GLDAS Noah v2.1 monthly exports (GLDAS_NOAH025_M, 0.25°). Sum `SoilMoi0_10cm_inst`, `SoilMoi10_40cm_inst` and `SoilMoi40_100cm_inst` where all three are valid. The native kg m⁻² sum is numerically equal to mm water equivalent. Weight cells by spherical area. For anomalies, subtract the 2006–2025 mean for the corresponding calendar month. Fit OLS with calendar-month fixed effects and a 12-lag Newey–West HAC covariance estimate for both the regional and cell-level slopes. The report independently checks the regional fit using the full regression design. [NASA product](https://doi.org/10.5067/SXAVCZFAQLNO) · [Newey–West](https://www.nber.org/papers/t0055) · [Seasonal Kendall](https://pubs.usgs.gov/publication/ofr81488)

GLDAS estimates soil-water storage with a land surface model at regional scale. The box does not follow the official Pampas boundary or isolate soybean fields. There is no independent in situ validation in this analysis. Spatial dependence limits the interpretation of the cell-level multiplicity adjustment. The full-period climatology is retrospective and would leak future information if used directly for forecast validation. These results cannot establish soybean stress, yield or damage, forecast skill, or climate causation.

## Reproduce

From the repository root on Windows, use the existing environment or follow the setup in `docs/HANDOFF.md`. The 240 OPeNDAP exports and matching JSON provenance manifests must already be in `data/phase1/historical-opendap/`. The audit checks them against `docs/GLDAS_MONTHLY_SHA256.csv`. No network access or Earthdata credential is needed to analyze these files.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m gldas.trend_report
```

The report writes `trend_analysis.json`, `regional_trend.png`, `monthly_anomalies.png`, and `spatial_trend.png` to `data/analysis/2006-2025/`. For a repeat run, use `--output data/analysis/2006-2025-repeat` to preserve the original outputs. The next scientific step is to assess sensitivity to the region and time window and compare the descriptive patterns with independent observations where appropriate.
