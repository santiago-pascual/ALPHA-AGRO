# Repository instructions

## Event window

Before November 14, 2026 at 09:00 ART (UTC−03:00), work is limited to generic environment setup, dependency verification, repository configuration, documentation, and planning. Defer competition code, dataset acquisition or processing, scientific execution, map or application components, mock predictions, and feature tests until the event opens.

## Scientific integrity and reproducibility

- Report measured results and verified access only. Label hypotheses, proposals, and unavailable inputs explicitly. Never fabricate observations, source availability, metrics, model outputs, or citations.
- Record product IDs, versions, citations, access and release dates where available, variables and units, quality flags, time bounds, spatial footprint, preprocessing, and exclusions. Capture commands, package versions, random seeds where relevant, and reproducible split boundaries.
- Preserve the historical trends and relationships as the core challenge contribution. Report magnitude, direction, uncertainty, significance assumptions, spatial support, and the limits of interpretation. Hydrological proxies cannot establish crop damage.
- Keep draft, retrospective, and operational status clear. Document validation failures and withhold forecast displays when evidence or timely inputs are insufficient.

## Engineering and documentation

- Keep data access, analysis, forecasting, and presentation independently testable. Agree on a versioned interface with the other computer before coupling components. The UI should consume reproducible scientific outputs and clearly handle unavailable data.
- Document how to run and reproduce the demo and analysis from a clean checkout. Keep units, dates, time zones, dataset attribution, data limitations, and changes to assumptions visible.
- Once functionality exists, test coordinate and time alignment, units, missing data, cutoff-time leakage, and real output integration as applicable. Verify a fresh install and a mobile-width demo before submission.

## Security and spending

- Keep credentials, local environments, private field locations, and raw downloads out of Git and logs. Use a credential store, local ignored configuration, or deployment secret manager. Review changes for secrets and restrict access to what each task needs.
- Use free resources by default. Obtain explicit user approval before any paid service, API usage that may incur charges, or billable cloud resource. If approved, document the spending limit and usage controls before enabling it.
- Obtain explicit approval to create a GitHub remote, push changes, or change repository visibility. Keep the initial remote private if approved.
