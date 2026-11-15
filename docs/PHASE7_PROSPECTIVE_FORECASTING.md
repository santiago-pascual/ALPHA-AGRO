# Phase 7 prospective forecasting

The frozen design is [pampas-regional-storage-m1-v1](../config/phase7_prospective_pilot_v1.json). Fit seasonal climatology and one preregistered XGBoost challenger on signed, content-bound regional snapshots. Training targets are capped at December 2025 and must have been verified by model freeze. Each feature vector is reconstructed at its historical issue cutoff. The model uses six consecutive released monthly values, calendar terms and the same native area support as Phase 5B. The December 2025 cap is a protocol choice. It is not a claim that historical vintages have been recovered.

## Current gate

No approved receipt signing public key is configured. Metadata-only events, partial files, archive dates and today's access to an old file cannot substitute for original complete science vintages. The live CLI uses the existing Node.js runtime to verify a detached Ed25519 signature on canonical JSON receipts from a trusted ingestion process. The receipt binds the normalized monthly snapshot to the full validated soil and driver byte digests, GLDAS collection/version, scope, interval and access time. Provisioning the signer and the full-content receipt adapter remains prerequisite work. No real model was frozen or prospective prediction issued in this phase. The historic forecast route remains disabled.

The local writer uses exclusive filenames. It resists accidental overwrites and reports a digest. The protocol requires separately time-anchoring each issued digest off the forecasting machine before outcomes arrive. The local directory alone is not tamper-proof.

## Bounded live probe

One monitor pass and two single-source checks appended to local `data/availability/phase7-probes.sqlite3`. These events measure access on November 15, 2026 UTC. They do not reconstruct historical publication.

| Request UTC | Product / asset | Observed response |
| --- | --- | --- |
| 05:27:08 | POWER T2M, Nov 14 UTC at 34°S, 60°W | HTTP 200; no usable value for that day |
| 05:27:09 | IMERG Late V07, Nov 14 UTC | HTTP 200 catalog; no matching granule in this query |
| 05:27:10 | GLDAS monthly main v2.1, July 2026 | HTTP 200 metadata; HTTP 401 on asset, no scientific bytes verified |
| 05:28:37 | POWER T2M, Nov 10 UTC at the same point | HTTP 200, complete usable point JSON, API v2.10.3; body SHA-256 `6001f118ade7ab8af4adebb26f45c73c1fa6edb5c1fd25ffdce081084adcfe2e` |
| 05:28:38 | SMAP SPL4SMGP V008, Nov 10 UTC | HTTP 200 metadata; HTTP 401 on asset, no scientific bytes verified |

The point temperature response does not satisfy the GLDAS regional pilot gate. Protected requests were not retried. No recurring tasks were installed.

## Reproduce

Run from the Phase 7 worktree. `$base` refers to the original project checkout.

```powershell
$base = Join-Path (Split-Path -Parent (Get-Location).Path) 'Quant Alpha Agro NASA Space Apps'
$py = Join-Path $base '.venv/Scripts/python.exe'
$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
& $py -m pytest tests/test_phase7_prospective.py -q
& $py -m gldas.predictive.prospective --help
& $py -m gldas.availability monitor --database "$base/data/availability/phase7-probes.sqlite3"
```

The synthetic tests exercise fit, signed-receipt checks, issue-time filtering, append-only prediction, first available vintage scoring and paired score summaries. To issue experimentally after the receipts and key exist, run `freeze` with training snapshots, then `issue` with a signed receipt manifest, six input snapshots, a frozen model, its previously anchored canonical digest and the final UTC nanosecond of the month. The record must be written by the first minute of the target month. `score` accepts the original record, its previously anchored canonical digest and the subsequent verified target; `summarize` computes RMSE, MAE and bias over distinct scored months.
