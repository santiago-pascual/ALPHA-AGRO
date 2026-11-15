# Phase 8 experimental outlook integration

The Forecast workspace reads `phase8_forecast_bundle_v1.json` at `/data/phase8_forecast_bundle_v1.json` as a separate **Research / Experimental Outlook**. It is not the `forecast_v1` operational eligibility path. The adapter is based on `config/phase8_forecast_bundle_v1.schema.json` introduced on the scientific branch at commit `a381248af3320a497d543a5cf0384c764b604bdd`.

## Install the artifact

Transfer the locally validated bundle from the scientific PC:

```text
Source:      data/analysis/phase8_2026_bounded/phase8_forecast_bundle_v1.json
Destination: frontend/public/data/phase8_forecast_bundle_v1.json
```

Do not commit or force-add the JSON. Its destination is listed in `frontend/public/data/.gitignore`. A clean checkout without the transfer shows an explicit missing-artifact state. An invalid or incomplete file shows an error and never falls back to another forecast artifact or test fixture.

## Validation before display

The frontend parses the complete object before rendering values. It checks the version and experimental/non-operational flags; 2006–2025 history plus the January–July 2026 extension; UTC issue and observation cutoff; provenance SHA-256 fields; NASA product/collection/DOI; three dated horizons; storage variable and millimeter units; 90% intervals; seasonal-climatology pre-holdout selection; retrospective holdout metadata; issue-time availability flags; 896 unique grid centers aligned to 0.25°; the 867/29 valid/masked support; null-only masked-cell values; and regional versus spatial weighted-mean agreement. Sub-millisecond UTC timestamp precision is accepted and preserved in source values.

Regional output is shown by default. A selected location is matched to its nearest grid center only when it lies within that cell's grid footprint and the cell is marked valid. A masked nearest cell or unsupported point remains unavailable; there is no nearest-valid-cell substitution or spatial interpolation.

The panel labels the issue experimental, shows its issue date and latest observation, target months, storage unit/depth, uncertainty intervals, source IDs and hashes, and retrospective holdout metrics. Holdout metrics remain descriptive; they do not select or replace the model. The panel states that first-publication time is unverified, there is no prospective 2026 outcome validation, and the research does not support yield, damage, irrigation, or crop-specific recommendations.

## Verification

`npm test` always checks the adapter and UI with explicitly test-only synthetic structures. If the ignored real bundle is installed, a conditional regression test validates the full transferred file and checks that its regional value appears in the experimental panel. The JSON itself is never a test fixture and is not included in Git.
