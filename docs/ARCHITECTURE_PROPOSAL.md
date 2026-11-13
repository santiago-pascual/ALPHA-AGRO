# Architecture proposal

Use three independently runnable parts during the event. The research workflow will prepare and quality-check source observations, analyze trends and relationships, and export documented historical summaries. A prediction workflow may produce validated forecast or replay outputs using the same provenance and availability rules. A small web application can load those published summaries and map selections to their supported grid or region.

Start with a batch export and a small static artifact if the files and refresh cadence allow it. Choose the format, application stack, deployment option, and precise schema together after reviewing the first real sample. Keep credentials and raw source data outside the deployed UI. Store only artifacts suitable for distribution and document how to regenerate them.

## Interface contract to agree at kickoff

- Record the contract version, source product versions, generation time, supported region and crop, coverage boundaries, coordinate reference system, and spatial resolution.
- Define how coordinates map to a region or grid cell, including longitude conventions and out-of-coverage behavior. Standardize units and encode timestamps with their timezone.
- Historical results need observation windows, sample counts, missingness or quality status, estimates, uncertainty, test assumptions, and source attribution.
- A prediction record needs target definition, issue time, latest input availability, lead window, validation status, and uncertainty. Agree how missing, stale, unsupported, and historical replay states are displayed.
- Agree on export location and handoff timing. Use a small real artifact for the first integration review and record compatibility changes in both PRs.
