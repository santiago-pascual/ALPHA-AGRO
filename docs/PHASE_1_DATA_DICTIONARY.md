# Phase 1 GLDAS data dictionary and candidate target

The January 2020 monthly sample and January 1 three-hourly batch confirm the names and units below. The fields are ordered `(time, lat, lon)` and use −9999 for fill and missing values. The monthly fields are float32 monthly means, including fields with the inherited `_inst` suffix. The three-hourly fields with that suffix are instantaneous. `Rainf_f_tavg` is a mean rate over the three hours ending at the time label. See the [measured acquisition report](PHASE_1_ACQUISITION_REPORT.md). [GES DISC field table](https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_3H_2.1/summary?keywords=GLDAS) · [NASA monthly product description](https://data.nasa.gov/dataset/gldas-noah-land-surface-model-l4-monthly-0-25-x-0-25-degree-v2-1-gldas-noah025-m-at-ges-di-23acd)

| Field | Meaning | Native unit | Sample validation |
| --- | --- | --- | --- |
| `SoilMoi0_10cm_inst` | 0–10 cm soil water storage | kg/m² | Check unit, fill and mask, usable count and physical range. Layer thickness 0.10 m. |
| `SoilMoi10_40cm_inst` | 10–40 cm soil water storage | kg/m² | Same checks. Layer thickness 0.30 m. |
| `SoilMoi40_100cm_inst` | 40–100 cm soil water storage | kg/m² | Same checks. Layer thickness 0.60 m. |
| `SoilMoi100_200cm_inst` | 100–200 cm soil water storage | kg/m² | Same checks. Layer thickness 1.00 m. |
| `RootMoist_inst` | Model-defined root-zone soil water storage | kg/m² | Verify the Noah variable's depth and meaning before using it. The explicit 0–100 cm aggregate is defined separately. |
| `Rainf_f_tavg` | Total precipitation forcing rate | kg/m²/s | Integrate the three-hourly mean rate over its preceding interval. Use bounds rather than grouping end labels by date. |
| `Tair_f_inst` | Near-surface air temperature forcing | K | Instantaneous in the three-hourly files. Convert to °C by subtracting 273.15 when needed. |
| Latitude and longitude coordinates | Grid cell centers | degrees north and degrees east | Verify actual names, axes, axis orientation, spacing, bounds, longitude convention and unique finite coordinates. |
| Time coordinate | Source time label in UTC | CF encoded time | Inspect encoding, calendar, coverage metadata, ordering and duplicates. Compare to CMR and identify what interval each field represents. |

## Physically valid aggregation

For a cell with all required layers valid, sum the first three layer storages to obtain the 0–100 cm water column in kg/m². This has the same numeric value as mm water equivalent at water density 1,000 kg/m³. To express the profile mean as volumetric fraction, divide summed storage by water density times total thickness in meters. Equivalently, divide each layer storage by water density and its own thickness, then thickness-weight those fractions. Keep a consistent valid-layer mask and propagate missing values. [NASA LDAS soil moisture unit conversion](https://ldas.gsfc.nasa.gov/faq/all)

For daily storage from instantaneous three-hourly data, define a day convention and average the eight regularly spaced valid observations for a complete day. Use a documented coverage rule for incomplete days. Do not sum storage through time. Use the monthly product directly for monthly trends. For a regional mean, weight grid cells by area, optionally multiplied by boundary overlap, and report the fraction of valid contributing area. The provisional rectangle does not establish a soybean footprint.

## Candidate low-soil-moisture event

Use a daily 0–100 cm mean soil water series in each eligible grid cell or a predeclared area-weighted region. For a horizon of 7, 14, or 28 days, define a candidate event as at least one valid daily value below its seasonally matched historical percentile in the days after issue time through the horizon end. A 20th percentile estimated from a window around each calendar day is a proposal. Predeclare window width, leap-day handling, baseline years, minimum support for each seasonal window, and a coverage rule for event labels. An incomplete future window without an observed breach remains unknown unless the rule explicitly justifies a negative label.

Fit percentile thresholds on training history only. Report event frequency by season and horizon and test sensitivity to window, percentile and minimum duration before finalizing the target. Respect publication latency and revisions when eventually constructing issue-time predictors. The target describes model-derived hydrological conditions at grid scale and cannot establish soybean stress, damage, or a prescriptive action.
