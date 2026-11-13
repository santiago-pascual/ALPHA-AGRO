# 48-hour implementation plan

The clock starts Saturday, November 14 at 09:00 ART. The official site lists submission close on Sunday, November 15 at 23:59 local time, 38 hours and 59 minutes after kickoff in ART. Confirm the virtual event's applicable deadline and portal timezone at kickoff. Aim to submit by Sunday 20:00 ART. Hours after the submission deadline are reserved for local handoff and retrospective work. [NASA Space Apps 2026 event page](https://www.spaceappschallenge.org/2026/)

## Mandatory MVP

| Time (ART) | Computer A — research | Computer B — application and delivery | Checkpoint |
| --- | --- | --- | --- |
| Sat 09:00–11:00 (H+0–2) | Verify Details and Resources, qualification, versions, access, and latency. Acquire a tiny real subset and choose one region and crop with the team. | Confirm submission rules and deadline, prepare an event task list, and agree with A on output fields and a low-friction demo path. | Record eligible sources, one region and crop, and sample provenance. |
| Sat 11:00–15:00 (H+2–6) | Inspect QA, units, coverage, and time windows. Retrieve only the history needed to estimate a first trend. Define a geographic comparison and a paired variable. | Build the minimal mobile-friendly interface with an interactive location selector and a clear missing-data state. Document how to launch it locally. | Pass a small real artifact through the agreed interface. |
| Sat 15:00–20:00 (H+6–11) | Produce reproducible historical trend and relationship results. Quantify magnitude, uncertainty and significance as supported. Compare locations, document limitations, and export real results. | Connect real results to the UI. Let users choose supported variables. Show source scale, timestamps and plain-language interpretation. Check a mobile-width view. | Merge a working historical demo into `main`. |
| Sat 20:00–23:00 (H+11–14) | Define one hydrological target and feasible horizon, create chronological splits with issue-time availability, and implement persistence and climatology baselines. | Test clean setup and start the submission narrative with data citations and a methods outline. | Freeze the historical baseline demo and document the prediction evaluation protocol. |
| Sat 23:00–Sun 08:00 (H+14–23) | Rest and leave a handoff note. | Rest and leave a handoff note. | Record the next verification steps. |
| Sun 08:00–12:00 (H+23–27) | Run final held-out evaluation. Report metrics, uncertainty and leakage checks. Decide whether the evidence supports a forecast, retrospective replay, or an evaluation-only result. | Render the approved state using real outputs. Explain observation versus issue dates, uncertainty, limitations and stale or unsupported locations. | Approve exactly the claims supported by the data. |
| Sun 12:00–16:00 (H+27–31) | Reproduce the analysis from the documented inputs and review figures, citations and estimates. | Deploy the working demo on an available free route, verify access from an independent browser, and capture a backup demo per event rules. | Freeze the release and check reproducibility and demo access on both computers. |
| Sun 16:00–20:00 (H+31–35) | Review methods, assumptions, numeric claims, and citations against the release. | Assemble portal submission, demo, credits and links. Check judging visibility and submit after team review. | Verify submitted status and save the confirmation. |
| Sun 20:00–23:59 (H+35–38:59) | Resolve any verified scientific or data issue affecting the submission. | Use the buffer for link or portal recovery and recheck submitted status before close. | Record the final release commit and portal confirmation. |
| Sun 23:59–Mon 09:00 (H+38:59–48) | Archive reproduction notes locally and note research follow-ups. | Preserve submission materials and write the retrospective. | Keep post-deadline work outside the submitted release. |

If data access is slow, switch to a verified eligible alternative or reduce geographic and temporal scope while retaining enough history for defensible inference. If forecasting lacks sufficient data, skill, or plausible issue-time inputs, document that outcome and submit the trend demonstration with the completed validation evidence. If deployment stalls, preserve the reproducible local demo and use only a fallback the official rules allow.

## Optional extensions

Add a second crop or region, growth-stage controls, a second horizon, better chart exploration, probability calibration, or gradient boosting only after a reproducible core demo and sufficient validation evidence. The 7-, 14-, and 28-day horizons are options. One supportable horizon is sufficient for the first experiment.
