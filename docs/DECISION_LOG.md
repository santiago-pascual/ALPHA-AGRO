# Research decisions

| Date (ART) | Decision | Rationale |
| --- | --- | --- |
| 2026-11-14 | Use the provisional Pampas box and soybean as the first use case. Target 2006–2025 for trends. | The box gives a reproducible acquisition window. Regional and crop inference require documented spatial support. |
| 2026-11-14 | Pin GLDAS Noah v2.1 monthly and three-hourly main streams. | The monthly series supports historical trends. Three-hourly samples establish the cadence for daily conditions. Both products use the same underlying simulation. |
| 2026-11-14 | Preserve source bytes and publish geographic derivatives separately. | Checksums identify the local input, and the source remains available for revalidation. |
| 2026-11-14 | Keep the scientific checkpoint on `feature/research`. | A shared branch carries reproducible code and evidence between computers while the team reviews integration. |
| 2026-11-14 | Start the next authenticated check with one UTC day. | Eight granules are enough to test cadence and encoding before scaling. A seasonally low soil-water percentile remains a hydrological candidate, with prediction work downstream of validation. |
