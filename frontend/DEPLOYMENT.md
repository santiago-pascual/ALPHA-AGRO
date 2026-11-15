# Static deployment preparation

The frontend is a Vite static site with in-memory page navigation. The Vite `BASE_URL` prefixes its asset links and all trend, relationships, and evaluation JSON requests. It does not require a server-side route fallback.

## Scientific artifacts required for a complete real-data demonstration

1. **Historical and spatial analysis:** `trend_analysis.json`, schema 1.0, with all 240 monthly observations from January 2006 through December 2025, regional uncertainty and coverage, cell estimates, and 240 source-file SHA-256 records.
2. **Environmental relationships:** `GLDAS_RELATIONSHIPS_RESULTS.json` plus `GLDAS_DRIVER_SHA256.csv`. The exporter requires a 240-month checksum manifest, 105 associations, 35 north–south contrasts, units, coverage, intervals and significance fields. It packages this as `environmental_relationships_v1.json` with source and checksum provenance.
3. **Predictive evaluation:** `predictive_evaluation_v1.json`, containing all 18 region/scope × 1–3 month horizon × storage/anomaly/low-moisture combinations, selected pre-holdout models, baseline comparisons, holdout scores, uncertainty intervals, evaluation period, and input hashes. The current Python fold output is not a substitute for this frontend contract.

The trend artifact is present locally at `public/data/trend_analysis.json` (ignored). The relationship result and checksum index are tracked at `../docs/GLDAS_RELATIONSHIPS_RESULTS.json` and `../docs/GLDAS_DRIVER_SHA256.csv`. The transferred predictive evaluation is present locally at `public/data/predictive_evaluation_v1.json` (ignored); its transfer SHA-256 is `051792a95902c443bdb43a61d3da9126c33355d4746983bcc52276ff40e28dd9`. It contains separate regional and spatial results for all 18 combinations and model-declared 95% score-difference intervals. Re-check the transfer hash and adapter validation on other checkouts. No incomplete or synthetic evaluation is accepted for release.

## Reproducible export and approval

From `frontend/`, run:

```powershell
npm ci
npm run export:public-data -- --trend public/data/trend_analysis.json --relationships ../docs/GLDAS_RELATIONSHIPS_RESULTS.json --driver-manifest ../docs/GLDAS_DRIVER_SHA256.csv --predictive public/data/predictive_evaluation_v1.json --output release-data/generated-bundle
```

The exporter validates the existing typed trend and predictive adapters, the relationship source schema, continuous monthly coverage, source checksums, spatial support, model comparisons, and uncertainty. It preserves trend/evaluation JSON bytes and writes a deterministic manifest of source IDs, source checksums, file sizes, output checksums, and schema versions. The relationships wrapper preserves the numerical rows and adds explicit units/provenance. It fails closed and never overwrites an existing bundle.

Review source licensing, provenance, and every artifact before running the command again with `--approve-publication`. Commit only the generated three JSON artifacts and `public_data_manifest_v1.json` under `frontend/release-data/generated-bundle/` after they are explicitly approved for public release. The current Phase 8B branch does not contain or publish scientific data.

## GitHub Pages workflow

`.github/workflows/deploy-alpha-agro.yml` is manual-only and its deploy job runs only from `main`. A repository administrator must enable GitHub Pages with **GitHub Actions** as the publishing source, merge the approved code and data bundle, then manually run **Deploy Alpha Agro to GitHub Pages** on `main`.

Before deployment, the workflow requires a manifest with `approved_for_public_release`, revalidates the bundle, copies only the three allowlisted result files and bundle manifest, rejects unexpected data-directory files, runs TypeScript checks and tests, builds using `/${repository}/`, verifies asset and JSON paths and SHA-256 values, and uploads a deterministic file manifest with the deployment artifact. A checkout without the full approved bundle fails before deployment. No Pages setting is enabled and no public deployment is triggered by this branch.

## Preview and checks

```powershell
cd frontend
npm ci
npm run lint
npm test
npm run build
npm run preview
```

The base-path loader tests stub `/quant-alpha-agro/`. For the production Pages configuration, build with `npm run build -- --base=/quant-alpha-agro/` and run `npm run verify:pages-build -- --base /quant-alpha-agro/` after staging an approved bundle.

The map uses the standard OpenStreetMap raster tiles and displays attribution; it needs internet access and has best-effort availability. NASA data use must follow the dataset-specific notice. Forecast artifacts remain out of this initial bundle and the Forecast Explorer stays disabled.
