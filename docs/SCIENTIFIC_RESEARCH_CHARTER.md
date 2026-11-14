# Quant Alpha Agro — Scientific Research Charter

## Official NASA challenge

Be An Earth System Trend Detective! — NASA Space Apps Challenge 2026.

[Official challenge reference](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/)

## Non-negotiable NASA objectives

1. Select relevant NASA Earth science variables.
2. Acquire data for a defined geographic region.
3. Generate and visualize sufficiently long time series.
4. Estimate temporal trend magnitude, uncertainty, and statistical significance.

Investigate geographic heterogeneity and relationships between Earth system variables where feasible.

## Research principles

- Ground analyses in established atmospheric, hydrological, and agronomic science.
- Explicitly distinguish known physical relationships, regional empirical findings, and exploratory hypotheses.
- Document all datasets, units, resolutions, versions, assumptions, and limitations.
- Examine seasonality, autocorrelation, missing observations, and spatial dependence.
- Do not interpret ML feature importance as statistical significance or causality.
- Avoid data leakage, multiple-testing bias, and unsupported scientific claims.
- Use reproducible pipelines and transparent out-of-sample evaluation.
- Never fabricate data or scientific results.

## Research workflow

1. NASA data acquisition and provenance.
2. Data cleaning and exploratory quality assessment.
3. Physical-domain assumptions and literature review.
4. Trend estimation and significance testing.
5. Multivariable relationship exploration.
6. Definition of a measurable prediction target.
7. Baseline predictive modeling.
8. Walk-forward and spatial out-of-sample validation.
9. Optional nonlinear, regime-switching, and physical models.
10. Farmer-focused application using validated scientific outputs.

## Agricultural product vision

Develop a simple application for Argentine soybean, maize, and wheat producers.

Users should eventually be able to select their geographic area or field, specify a crop, and obtain understandable information about current hydrological conditions and validated future risk.

Evaluate 7-, 14-, and 28-day prediction horizons without assuming that any will be reliable.

Do not equate hydrological anomalies with confirmed crop damage.

Do not provide prescriptive agricultural actions without adequate evidence.

## Priorities

Scientific correctness > reproducibility > validated predictive value > user accessibility > model complexity.

The NASA trend-analysis objectives must remain satisfied even if predictive modeling is unsuccessful.
