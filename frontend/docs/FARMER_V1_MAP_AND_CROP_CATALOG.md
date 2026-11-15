# Farmer V1 map and crop catalog

## Field map behavior

The Forecast workspace opens on a road map centered on Argentina and supports pan/zoom over the wider map. The field-selection view hides cell trend rectangles and the cell legend by default. A research-only checkbox can turn the validated GLDAS trend-cell overlay on. Observatory and other scientific maps retain their current grid visualizations.

The farmer selects a reference point by clicking the map, entering coordinates, or explicitly requesting browser geolocation. Saved points stay in local storage. A point outside the validated trend-cell mask can still be selected and saved, but it has no GLDAS cell ID and cannot generate a forecast. The application does not construct a national border or extrapolate science coverage from the map viewport.

The map layer control shows **Map**, **Satellite**, and **Hybrid**. Only Map is active today. OpenStreetMap supplies road context, not aerial imagery. Satellite and Hybrid are disabled with an explanation because no account-free satellite source with verified usage terms is configured. Esri's current Static Basemap Tiles service requires an ArcGIS Location Platform or ArcGIS Online account, requires attribution, and lists a usage charge beyond its included monthly allowance. Do not add an Esri token, enable billable tiles, or replace the disabled states without provider approval and production usage controls.

Local search recognizes a latitude/longitude pair. It does not geocode locality names or street addresses. No locality/address is transmitted to a third party. Connect a geocoder only after its privacy, accuracy, regional coverage, rate limits, and terms are reviewed.

### Basemap references

- OpenStreetMap Foundation, [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution, application-identifying request metadata, referer, caching, no bulk downloads, and best-effort availability without SLA.
- Esri Developer, [Static Basemap Tiles](https://developers.arcgis.com/rest/static-basemap-tiles/): account requirements, attribution, tile costs, and supported styles.
- Esri Support, [World Imagery attribution](https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040).

The browser-based Leaflet image tile request cannot set a custom `User-Agent` header. The current OSM standard endpoint is suitable only as a low-volume demonstration dependency where the browser/platform request metadata and use comply with the OSMF policy. Replace it with an explicitly approved provider or self-hosted tile service before a public high-traffic release.

## Crop catalog

`src/data/agronomy.ts` provides typed entries for soybean/soja, maize/maíz, wheat/trigo, sunflower/girasol, barley/cebada, sorghum/sorgo, sugarcane/caña de azúcar, grapevine/vid-uva, citrus/cítricos-limones, and yerba mate. Annual and perennial categories have different stage option sets. Irrigation selection is rainfed, irrigated, or unknown.

The catalog is not a production ranking. Its geographic applicability is intentionally null, suitability is `not_assessed`, and evidence references are empty for every entry because a crop-by-crop source review for Argentine regions has not been completed. The UI exposes those gaps and offers no thresholds, suitability scores, crop recommendations, planting dates, yield outputs, or irrigation amounts. The physical GLDAS forecast request remains independent of the crop context.

## Forecast contract boundary

The existing `forecast_v1` adapter and eligibility resolver remain authoritative. A field point is converted to a grid-cell identifier only if the point lies within an eligible cell supplied by validated trend analysis. The request still needs the pre-holdout selected model, matching monthly horizon/target/issue time, verified availability evidence, and all existing provenance and temporal gates. No browser-side prediction or spatial extrapolation is performed.

The current artifact contract contains one monthly result record. A user can choose a 1-, 2-, or 3-month horizon, but only a corresponding validated artifact record can be displayed. A multi-horizon result series, national trend coverage, crop response model, multi-record artifact, or operational issue-time data is not inferred from the current single-record schema.

## Validation

Automated regression tests cover crop catalog completeness and stage validity, localization, local coordinate search, unsupported-cell selection and storage, hidden-by-default scientific grid, and the research grid toggle. Test artifact values remain synthetic and test-only.
