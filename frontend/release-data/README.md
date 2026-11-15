# Approved public data bundle

This directory is intentionally empty in the Phase 8B code change. Add only a generated bundle after scientific review and explicit public-release approval.

From `frontend/`, make a pending bundle:

```powershell
npm run export:public-data -- --trend public/data/trend_analysis.json --relationships ../docs/GLDAS_RELATIONSHIPS_RESULTS.json --driver-manifest ../docs/GLDAS_DRIVER_SHA256.csv --predictive public/data/predictive_evaluation_v1.json --output release-data/generated-bundle
```

Review `release-data/generated-bundle/public_data_manifest_v1.json`, the source checksums, NASA dataset terms, and publication approval. Only after approval, regenerate the bundle with the same command plus `--approve-publication`, then commit the generated files under `generated-bundle/`. The deployment workflow rejects pending bundles.

The exporter fails for missing, invalid, incomplete, or incompatible inputs. It preserves trend and predictive artifact bytes, does not create demo values, does not overwrite an existing bundle, and does not include raw NASA archives.
