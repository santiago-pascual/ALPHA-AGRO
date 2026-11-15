# Phase 7B verified GLDAS input vintages

The pilot still pairs seasonal climatology and the fixed XGBoost challenger selected before the holdout. Historic evaluations and prospective eligibility remain separate.

## Capture and replay

Run these PowerShell commands from the Phase 7B checkout. The Python environment must have the repository research dependencies installed. The archive root is ignored by Git. Keep a separate backup of the archive for later scoring.

```powershell
.\.venv\Scripts\python.exe -m gldas.vintages capture --month 2026-07-01 --root data/availability/phase7b-vintages --prompt-token
.\.venv\Scripts\python.exe -m gldas.vintages audit --bundle 'data/availability/phase7b-vintages/2026-07/<asset-sha256>'
```

You can use the Python executable from the original checkout by substituting its absolute path. The CLI checks `EARTHDATA_TOKEN` and Windows Credential Manager (service `quant-alpha-agro`, user `earthdata`) before asking with a hidden prompt. Use a current NASA Earthdata Login user token with [GES DISC application authorization](https://hydro1.gesdisc.eosdis.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/). A 401 means the request was unauthenticated at the provider. A 403 can indicate denied authorization. Confirm the token is current and the Earthdata account has authorized the provider before attempting another capture. The token is sent only in the HTTPS Authorization header to NASA OPeNDAP and the downloader refuses redirects.

The CLI discovers a single month through CMR, pins GES DISC collection `C1342986036-GES_DISC` and GLDAS Noah monthly Version 2.1 (DOI `10.5067/SXAVCZFAQLNO`), and preserves the complete regional OPeNDAP NetCDF response. Its scope is the provisional study box and eight science fields, including three soil layers and five drivers. The pipeline validates the full response, science metadata and time bounds, and recomputes an area-weighted snapshot on the fixed 867-cell common mask. [NASA GLDAS documentation](https://hydro1.gesdisc.eosdis.nasa.gov/data/GLDAS/GLDAS_NOAH025_M.2.1/doc/README_GLDAS2.pdf)

A bundle contains:

- `export.nc4` with the original response bytes.
- `capture.json` with provider identity, endpoint, constraint, request and completion UTC times, observation bounds, byte count and hashes.
- `snapshot.json` with the normalized predictor and target values.
- `candidate-receipt.json` with the hashes to supply to an independent witness.

A repeat with identical bytes preserves the first recorded local receipt. Different byte hashes retain separate vintages; changes to NetCDF metadata alone can change a hash. Audit recomputes the science and hashes from disk. Retrieval today does not reconstruct earlier vintages or establish when NASA first published the file.

## Bounded live result

The earlier July 2026 asset probe received HTTP 401. The authenticated OPeNDAP capture returned HTTP 200 for `G4378078469-GES_DISC`. The full 105,235-byte regional response finished at `2026-11-15T13:09:21.659048Z`, according to the local clock. Observation bounds are July 1 through August 1, 2026 UTC (exclusive end). Offline audit reproduced the bundle.

| SHA-256 | Value |
| --- | --- |
| Provider NetCDF response | `ed5433b6d42f7722e5b454bf2d291449a0363c3077c79fb725c461f50716bf45` |
| Canonical normalized snapshot | `d2eb21638ca1ed2ac2d1965b7867cbdedf8cc9f9b78b3d193c8a2d9b9e69c71e` |

## Independent evidence and issuance

A local capture records when this downloader first finished a valid retrieval. It cannot establish a true provider release timestamp or prove historical availability to a third party. An independent authority must witness and time the actual capture, reproduce the bundle audit or validate the same archived bytes and normalization, and retain a record that binds the two hashes to the source and UTC time. An independently performed later re-fetch can only attest to its own witnessed time and bytes. Pin the authority identity and Ed25519 verification key through an independently authenticated channel before accepting signed receipts. Keep the signed receipt manifest and witness record together with the archived bytes. The private signing key belongs to the authority.

The prospective CLI consumes a detached signature over canonical JSON and validates the authority, receipt scope, capture and snapshot hash bindings, and cutoff. The attested receipt requires `evidence_status=independently_witnessed`, `authority_id`, `witness_record_id` and `witnessed_at` in addition to the binding fields from the candidate. Its canonical form is UTF-8 JSON with sorted keys, no insignificant whitespace and no trailing newline. The signature file is the hex-encoded Ed25519 signature.

For scoring, provide the signed receipt manifest with the complete eligible receipt history for the outcome month. Maintain an append-only archive and publish each accepted receipt. The first-vintage rule requires the earliest verified archived outcome and rejects conflicting earliest digests. Scoring also requires `--prediction-seal` and `--prediction-seal-signature` for an independently signed `pilot_prediction_seal_v1` object with `schema_version`, `authority_id`, `witness_record_id`, `prediction_sha256` and `witnessed_at`. The seal must attest to the recorded prediction before first outcome access. A locally generated signature by itself is insufficient.

No independent authority or key is configured. The July capture does not establish the pre-issue input histories, eligible frozen training data or first-outcome evidence required by the pilot. No real prospective case was issued or scored. Follow the [Phase 7 pilot workflow](PHASE7_PROSPECTIVE_FORECASTING.md) once signed as-of evidence, the causal frozen model, and the scheduled issue window are available. Start by arranging an independent time witness for the next new GLDAS monthly vintage.
