# Phase 6B — NASA asset availability monitor

**Status:** implemented; offline-tested. No forecast is issued and prospective forecasting is not operationally ready.

## Scope and sources

The monitor preserves the Phase 6A source registry and probes a deliberately small set:

| Source | Request | What success means |
|---|---|---|
| NASA POWER Daily API | One daily `T2M` JSON response at a Pampas point (34°S, 60°W), UTC day; default is yesterday UTC. | The complete API response parses and the requested value is finite and not the POWER missing sentinel. The response body is SHA-256 hashed. This establishes a usable value for this one point/day, not regional coverage or forecast skill. |
| NASA GPM IMERG V07 Late Daily (`GPM_3IMERGDL`) | Public CMR UMM-G search for the chosen UTC day, then at most a 4 KiB HTTP Range request to a NASA-hosted granule URL returned by CMR. | CMR success is metadata only. A response with recognized NetCDF/HDF container magic establishes prefix-byte access; it does not establish a full download or usable parsed precipitation observations. |
| NASA GLDAS Noah v2.1 Monthly (`GLDAS_NOAH025_M`) | Public CMR UMM-G search for one month; defaults to the month four months before the current UTC month, then at most a 4 KiB Range request to a NASA-hosted granule URL. | Same distinction as IMERG. A prefix hash is explicitly scoped to the returned bytes, never the whole asset. |

The POWER endpoint is public and does not require Earthdata credentials in its API documentation. CMR catalog searches are public. Data assets can require Earthdata Login and DAAC authorization. The monitor attempts authenticated access only when both `NASA_EARTHDATA_USERNAME` and `NASA_EARTHDATA_PASSWORD` are already present in the process environment. Authentication is scoped to configured NASA Earthdata/DAAC hosts; asset URLs returned by CMR are rejected unless HTTPS and under `nasa.gov`. Credentials are never placed in URLs or SQLite, and sensitive query parameters are redacted from logged evidence URLs.

NASA describes POWER daily access and temporal parameters in the [Daily API reference](https://power.larc.nasa.gov/docs/services/api/temporal/daily/). The monitor’s catalog lookups use the public [CMR Search API](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html) and its [UMM-G granule response format](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#umm-json). Product context is documented in the [IMERG V07 directory](https://gpm.nasa.gov/data/directory) and [GLDAS product page](https://ldas.gsfc.nasa.gov/gldas/gldas). Expected product latencies in the Phase 6A registry are documented expectations, not measurements from this monitor.

## Evidence and status rules

Each HTTP event is appended to the local SQLite database at `data/availability/asset_availability.sqlite3` (ignored by Git). It records UTC request/completion times, a separate successful-access timestamp when there is qualifying evidence, source/product/variable/units, asset/granule identifier, observation interval where returned, spatial support, request/evidence URL, HTTP status, metadata versus asset endpoint role, retrieval/usability booleans, content version, response byte count, SHA-256 and checksum scope where appropriate, quality flags, and transport error class. The successful-access timestamp records when this monitor first observed success for that request; it is not a NASA historical publication timestamp. SQLite triggers reject `UPDATE` and `DELETE` against recorded events; repeated runs append new events.

`verified_available` is reserved for a finite, non-missing POWER value or successful NASA-hosted scientific-container prefix retrieval. CMR success alone is `unknown` with `metadata_access_success=true` and `asset_retrieval_success=false`. Partial data asset bytes are not marked `usable_scientific_data`; the data body is not stored and the monitor does not parse scientific arrays. It distinguishes that evidence from complete usable POWER JSON data.

Network errors, timeouts, HTTP 401/403, 404, 429, 5xx, empty CMR results, malformed responses, and non-NASA asset URLs remain `unknown`. A failed request is never evidence that NASA had not published an asset. `429` records a rate-limit flag; the monitor does not automatically retry, preventing avoidable load and duplicate unbounded requests. Unknown remains in the report even when the expected observation date is old.

The Phase 6A registry at `config/availability_registry_v1.json` is not rewritten by this monitor. The SQLite log is local evidence, not a reconstructed historical publication calendar: a first successful access timestamp only bounds availability at/before that time. It cannot prove the asset was inaccessible beforehand.

## Live probe result in this environment

On 2026-11-15, one minimal public POWER request was attempted for `T2M`, UTC day 2026-11-14, at the Pampas point. The runtime returned Windows network error `WinError 10051` (“network is unreachable”) before receiving an HTTP response. No HTTP status, content, checksum, metadata, or NASA availability evidence was obtained. No IMERG or GLDAS request was made after network access was shown unavailable. The database contains no live observations from this work. This is an environment/network blocker, not evidence of NASA unavailability.

## Run and inspect

From the repository root (the monitor uses only Python standard-library modules):

```powershell
python -m gldas.availability monitor
python -m gldas.availability monitor --observation-date 2026-11-14 --gldas-month 2026-06-01
```

Choose a database outside Git if desired:

```powershell
python -m gldas.availability monitor --database C:\QuantAlphaAgroData\asset_availability.sqlite3
```

The CLI prints counts and lists of verified, metadata-only, and unknown/failed events. It does not print retrieved scientific values or credentials. To inspect details, use SQLite locally, for example:

```powershell
python -c "import sqlite3; c=sqlite3.connect('data/availability/asset_availability.sqlite3'); print(*c.execute('SELECT requested_at_utc,source_id,asset_identifier,endpoint_role,http_status,availability_status,usable_scientific_data,quality_flags_json FROM probe_events ORDER BY event_id'), sep='\n')"
```

## Optional Windows Task Scheduler setup

No recurring task was installed. After manually reviewing a successful one-shot run, create a task in Windows Task Scheduler with:

1. Trigger: Daily at a suitable UTC-equivalent local time; document the local timezone and daylight-saving behavior.
2. Action program: the full path to the intended Python executable (for example, `<repo>\.venv\Scripts\python.exe`).
3. Arguments: `-m gldas.availability monitor --database "<local-data-folder>\asset_availability.sqlite3"`.
4. “Start in”: the repository root, so Python can import `gldas`.
5. Run as the least-privileged Windows user that can write the database. Enable task history and do not configure automatic rapid retries.

Do not put Earthdata usernames/passwords in task arguments, scripts, or the database. If access to protected assets is required, configure the two environment variables through an approved local secret-management process for the task identity before enabling that task. Leave them unset when only public catalog and POWER checks are desired.

## Remaining blockers

- Network egress was unavailable here, so no live HTTP response or timing was collected.
- No Earthdata authorization was configured or tested; protected granule access remains unknown.
- The 4 KiB CMR asset probe only demonstrates access to a recognized file prefix. A separate bounded product validation step must parse selected variables and quality flags before calling the science usable.
- POWER represents a single point and daily parameter. Regional aggregation, spatial harmonization, missingness, and publication-time monitoring remain future work.
- Actual first-publication times require repeated probes and retained time-stamped evidence; one successful retrieval cannot establish historical availability.
- No forecasts, model training, or validation were performed. Prospective forecast readiness is not claimed.
