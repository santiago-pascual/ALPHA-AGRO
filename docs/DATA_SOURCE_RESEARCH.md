# Candidate NASA data sources

The figures below describe candidate collections from provider documentation. Argentina-specific coverage, date continuity, access, latency, and submission eligibility require verification during the event. Start with **Details** and **Resources** on the official challenge page. Record the source qualification and attribution rules, distinguish suggested resources from eligibility requirements, and flag ambiguity to the event organizer. [Official challenge page](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/)

NASA DAAC downloads generally require a free Earthdata Login and may require consent for the relevant service. Keep login information outside the repo and log only the outcome of the access check. Access routes below are candidates. [NASA Earthdata Login guidance](https://urs.earthdata.nasa.gov/documentation/what_do_i_need_to_know)

## GPM IMERG precipitation

- **Purpose and nominal coverage.** Daily precipitation totals or anomalies for historical wet/dry trends and lead–lag relationships. Candidate GES DISC Final daily `GPM_3IMERGDF` V07 is 0.1° × 0.1° and daily. Related half-hourly products use the same nominal grid. The mission documents a V07B archive extending to January 1998 and identifies September 2025 as the V07 Final end. V08 Final release and the active near-real-time version need reconfirmation. [Daily Final product](https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary) · [NASA data directory](https://gpm.nasa.gov/data/directory) · [Transition schedule](https://gpm.nasa.gov/data/news/imerg-v08-transition-schedule) · [August 2026 update](https://gpm.nasa.gov/data/news/update-imerg-v08-transition-schedule-aug-2026)
- **Access.** Use Earthdata Login for GES DISC and check Earthdata Search, HTTPS, or supported OPeNDAP and subsetting. Check PPS registration separately if considering a PPS route.
- **Limitations and kickoff checks.** Satellite retrievals and gauge adjustments can introduce regional and period-dependent bias. The Final Run typically lags by months. Early/Late releases and retrospective versions can have different properties. Verify product and run, archive endpoints, local coverage, variable and accumulation units, missing values, and when each input would have been available. [NASA latency documentation](https://gpm.nasa.gov/resources/faq/what-determines-latency-imerg)

## SMAP soil moisture

- **Purpose and nominal coverage.** Near-surface moisture for wet/dry anomalies and rainfall response. Candidate `SPL3SMP_E` V6 is daily on a nominal 9 km EASE-Grid 2.0 with catalog coverage beginning March 31, 2015. The posting interval is finer than the independent radiometer footprint. [NSIDC DAAC product page](https://nsidc.org/data/spl3smp_e/versions/6)
- **Access.** Use Earthdata Login with NSIDC DAAC and check Earthdata Search, HTTPS HDF5, or NSIDC subsetting if supported.
- **Limitations and kickoff checks.** Surface retrievals have limited depth and represent a broad footprint. Overpass gaps, radio-frequency interference, dense vegetation, water, and quality masks can affect use. Verify AM/PM acquisition times, flags, units, Argentina coverage, valid-day fraction, actual latency, and any replacement version. If root-zone moisture is essential, independently review SMAP L4 as a model-assimilated product. [SMAP product directory](https://nsidc.org/data/smap/data)

## MODIS vegetation indices

- **Purpose and nominal coverage.** NDVI and EVI to study vegetation seasonality and associations with hydroclimate. Terra `MOD13Q1` 061 is a 16-day composite on a nominal 250 m sinusoidal grid. Catalog history starts in February 2000. [LP DAAC product DOI](https://doi.org/10.5067/MODIS/MOD13Q1.061)
- **Access.** Use Earthdata Login with LP DAAC. Check AppEEARS point or area subsetting and Earthdata Search with HTTPS. Direct HDF-EOS access may need a compatible reader beyond the initial environment. [NASA AppEEARS](https://appeears.earthdatacloud.nasa.gov/)
- **Limitations and kickoff checks.** Composite timing varies by pixel. Clouds, aerosols, observation geometry, dense vegetation, and mixed land cover affect interpretation. Verify QA bits, scale factors, acquisition-day layer, tiles, available dates and publication latency. Use a complete, available composite for any forecast input.

## GLDAS land surface variables

- **Purpose and nominal coverage.** Model-derived soil moisture by layer, runoff, and evapotranspiration for land water balance context. Noah `GLDAS_NOAH025_3H` V2.1 is 0.25° × 0.25° and three-hourly. Documented history begins January 2000. [GES DISC product page](https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_3H_2.1/summary?keywords=GLDAS)
- **Access.** Use Earthdata Login with GES DISC. Check Earthdata Search, HTTPS NetCDF, OPeNDAP, or GES DISC subsetting.
- **Limitations and kickoff checks.** Noah V2.1 outputs depend on meteorological forcing and land-model assumptions. Coarse grid cells mix surface conditions. Verify soil layer depths and water units, flux accumulation conventions, available dates, release lag, and dependence between model-derived targets and candidate inputs.

## MERRA-2 atmospheric variables

- **Purpose and nominal coverage.** Reanalysis temperature at 2 m and atmospheric context for trend and relationship analysis. `M2T1NXSLV` V5.12.4 uses 0.5° latitude × 0.625° longitude and hourly averages. Catalog history begins January 1980. [GES DISC product page](https://disc.gsfc.nasa.gov/datasets/M2T1NXSLV_5.12.4/summary) · [NASA collection summary](https://search.earthdata.nasa.gov/search?q=MERRA2)
- **Access.** Use Earthdata Login with GES DISC. Check Earthdata Search, HTTPS NetCDF, OPeNDAP, or GES DISC subsetting.
- **Limitations and kickoff checks.** Coarse reanalysis cannot resolve field microclimates. Inputs and processing can change over the archive, and availability lags observations. Verify relevant variables, averaging and UTC timestamps, unit conversions, release timing, coverage, and any documented reprocessing.

## First sample decision

After the start, confirm the official Resources and eligibility, pick one region with usable overlapping observations, and confirm exact collection IDs, versions, dates, licensing and attribution. Acquire one small real spatial and temporal subset, record the route and checks, and inspect QA, units, latency and spatial support before expanding the time window. Keep a product alternative ready if access, coverage, or record length fails.
