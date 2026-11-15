# Alpha Agro — NASA Space Apps demo script

**Length:** about 3–4 minutes
**Product:** Alpha Agro · **Team:** Quant Alpha
**Tagline:** From Earth data to agricultural insight.

## Run of show

1. **Frame the question (20 seconds).** Open the landing page. Explain that water availability is a major part of the agricultural context in the Argentine Pampas, while regional data cannot diagnose an individual field or predict yield.
2. **Introduce the evidence (30 seconds).** Point to the GLDAS Noah v2.1 monthly historical product, 0.25° model-grid support, and 2006–2025 study period. Emphasize that GLDAS is modeled land-surface storage, not a direct field sensor. Open Methods & data for units, coverage, assumptions, source and provenance.
3. **Inspect the historical record (45 seconds).** Choose **Load validated GLDAS data** to enter REAL DATA mode. On a machine with the validated `frontend/public/data/trend_analysis.json`, read the monthly series and anomalies, then explain the displayed trend, confidence interval, HAC p-value, eligible-cell coverage, and missingness. If the file is absent or invalid, show the explicit unavailable/error state; do not switch silently to DEMO. The default DEMO mode is synthetic and explicitly labeled.
4. **Explore space (35 seconds).** Use the map legend and region selection to compare the available model grid cells. Describe the map as regional model support, point out cells with no eligible estimate, and leave the OpenStreetMap attribution visible. Do not call cells farms or field boundaries.
5. **Discuss relationships (25 seconds).** Open Environmental relationships. With the approved `environmental_relationships_v1.json`, compare drivers by region and lag and explain the intervals, HAC p-values, and adjusted q-values. If the bundle is not available, show the explicit missing-artifact message. These are shared-model associations, not independent causal evidence.
6. **Explain predictive research (45 seconds).** Open Predictive research. If its versioned evaluation artifact is present, distinguish pre-holdout walk-forward model selection from descriptive untouched-holdout winners. Seasonal climatology remains selected based on the recorded pre-holdout selection procedure; a better descriptive holdout score for XGBoost or HMM is not a reason to retune on that holdout. These are historical evaluations, not current forecasts. If the artifact is missing, show the explicit missing-artifact state.
7. **Close with the boundary (20 seconds).** The Forecast Explorer remains disabled until a versioned future artifact and verified eligibility are provided. Alpha Agro does not issue field moisture, crop stress, yield, or damage predictions.

## Presenter checklist

- Select **REAL DATA** only when the validated JSON is present; never present DEMO values as NASA findings.
- Keep source, period, units, geographic support, uncertainty, and coverage visible when describing a result.
- Do not call historical reconstruction or holdout evaluation an operational forecast.
- If any optional artifact is absent, explain the empty state and continue with the supported parts of the demo.
