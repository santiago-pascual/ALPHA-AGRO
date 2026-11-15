import { useMemo, useState } from "react";
import { CircleHelp, Layers3, MapPin } from "lucide-react";
import { divIcon } from "leaflet";
import { Circle, MapContainer, Marker, Popup, Rectangle, ScaleControl, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import type { CoordinatePoint, SelectedLocation } from "../data/location";
import type { DashboardDataset, TrendCell } from "../types";
import type { SavedField } from "../data/fields";
import { useI18n } from "../i18n";

export type RegionSelection = "all" | "north" | "south" | "west" | "east";

type TrendMapProps = {
  dataset: DashboardDataset;
  region: RegionSelection;
  onRegionChange: (region: RegionSelection) => void;
  selectedLocation?: SelectedLocation | null;
  onLocationSelect?: (point: CoordinatePoint) => void;
  selectionMode?: boolean;
  savedFields?: SavedField[];
  activeSavedFieldId?: string | null;
};

const locationIcon = divIcon({
  className: "field-location-marker",
  html: "<span></span>",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

export function MapClickHandler({ onSelect }: { onSelect?: (point: CoordinatePoint) => void }) {
  useMapEvents({
    click(event) {
      onSelect?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

function trendColor(value: number | null) {
  if (value === null) return "#596366";
  if (value < -16) return "#b35806";
  if (value < -6) return "#e08214";
  if (value < 6) return "#b7b7b7";
  if (value < 16) return "#67a9cf";
  return "#2166ac";
}

const trendLegend = [
  { label: "≤ −16", color: "#b35806" },
  { label: "−16 to −6", color: "#e08214" },
  { label: "−6 to +6", color: "#b7b7b7" },
  { label: "+6 to +16", color: "#67a9cf" },
  { label: "≥ +16", color: "#2166ac" },
  { label: "No estimate", color: "#596366" },
];

function isInRegion(cell: TrendCell, region: RegionSelection) {
  switch (region) {
    case "north":
      return cell.latitude >= -34;
    case "south":
      return cell.latitude < -34;
    case "west":
      return cell.longitude < -60.5;
    case "east":
      return cell.longitude >= -60.5;
    default:
      return true;
  }
}

export function TrendMap({ dataset, region, onRegionChange, selectedLocation = null, onLocationSelect, selectionMode = false, savedFields = [], activeSavedFieldId = null }: TrendMapProps) {
  const { t, formatNumber } = useI18n();
  const regionLabels: Record<RegionSelection, string> = { all: t("regionStudy"), north: t("regionNorth"), south: t("regionSouth"), west: t("regionWest"), east: t("regionEast") };
  const [selectedCell, setSelectedCell] = useState<TrendCell | null>(null);
  const visibleCells = useMemo(() => dataset.cells, [dataset.cells]);

  return (
    <section className="panel map-panel" aria-labelledby="map-title">
      <div className="panel-heading map-heading">
        <div>
            <div className="eyebrow">{selectionMode ? t("coverage") + " · " + t("validatedSupport") : t("mapSpatial")}</div>
            <h2 id="map-title">{selectionMode ? t("selectSupportedMap") : t("cellTrend")}</h2>
        </div>
        {!selectionMode && <label className="select-wrap compact-select">
          <span className="sr-only">{t("selectSubregion")}</span>
          <MapPin size={14} aria-hidden="true" />
          <select
            value={region}
            onChange={(event) => {
              onRegionChange(event.target.value as RegionSelection);
              setSelectedCell(null);
            }}
          >
            <option value="all">{t("regionStudy")}</option>
            <option value="north">{t("regionNorth")}</option>
            <option value="south">{t("regionSouth")}</option>
            <option value="west">{t("regionWest")}</option>
            <option value="east">{t("regionEast")}</option>
          </select>
        </label>}
      </div>
      <div className="map-meta">
        <span><span className="live-dot" /> {dataset.eligibleCells} / {dataset.gridCells} {t("trendCells")} · {dataset.resolutionDegrees}° grid</span>
        <span>{selectionMode ? t("selectCellMarker") : t("regionName") + " · " + t("regionResolution")}</span>
      </div>
      <div className="map-frame">
        <MapContainer
          center={[-34.2, -60.5]}
          zoom={6}
          minZoom={5}
          maxZoom={10}
          scrollWheelZoom
          zoomControl
          className="pampas-map"
          aria-label={selectionMode ? t("selectSupportedMap") : t("mapSpatial") + " · " + t("regionName")}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ScaleControl position="bottomright" imperial={false} />
          <MapClickHandler onSelect={onLocationSelect} />
          {visibleCells.map((cell) => {
            const selectedRegion = isInRegion(cell, region);
            const bounds: [[number, number], [number, number]] = [
              [cell.latitude - dataset.resolutionDegrees / 2, cell.longitude - dataset.resolutionDegrees / 2],
              [cell.latitude + dataset.resolutionDegrees / 2, cell.longitude + dataset.resolutionDegrees / 2],
            ];
            const selected = selectedCell === cell;

            return (
              <Rectangle
                key={cell.latitude + ":" + cell.longitude}
                bounds={bounds}
                pathOptions={{
                  color: selected ? "#f5ead0" : "#15201e",
                  weight: selected ? 1.4 : 0.35,
                  fillColor: trendColor(cell.slopePerDecade),
                  fillOpacity: selectedRegion ? 0.76 : 0.14,
                }}
                eventHandlers={{ click: () => setSelectedCell(cell) }}
              >
                <Tooltip sticky>
                  <strong>{formatNumber(cell.latitude, { maximumFractionDigits: 2 })}° · {formatNumber(cell.longitude, { maximumFractionDigits: 2 })}°</strong>
                  <br />
                  {cell.slopePerDecade === null
                    ? t("noTrendEstimate")
                    : (cell.slopePerDecade > 0 ? "+" : "") +
                      formatNumber(cell.slopePerDecade, { maximumFractionDigits: 1 }) + " mm / decade"}
                  <br />
                  {dataset.mode === "demo"
                    ? t("demoSignificance")
                    : cell.significant ? t("fdrSignificant") : t("fdrNotSignificant")}
                </Tooltip>
              </Rectangle>
            );
          })}
          {selectedLocation?.accuracyMeters !== null && selectedLocation?.accuracyMeters !== undefined && <Circle
            center={[selectedLocation.latitude, selectedLocation.longitude]}
            radius={selectedLocation.accuracyMeters}
            pathOptions={{ color: "#f2d99d", weight: 1, fillColor: "#f2d99d", fillOpacity: 0.12 }}
          />}
          {savedFields.map((field) => <Marker key={`saved:${field.id}`} position={[field.latitude, field.longitude]} icon={locationIcon} title={`${t("savedField")}: ${field.name}`} alt={`${t("savedField")} ${field.name}`}>
            <Popup>{field.name} · {t("referencePoint")}</Popup>
            <Tooltip>{field.name}{field.id === activeSavedFieldId ? " · " + t("activeField") : ""}</Tooltip>
          </Marker>)}
          {selectedLocation && !savedFields.some((field) => field.id === activeSavedFieldId) && <Marker
            position={[selectedLocation.latitude, selectedLocation.longitude]}
            icon={locationIcon}
            title={t("selectedLocation")}
            alt={t("selectedLocation")}
          >
            <Popup>{t("selectedLocation")} · {selectedLocation.source === "gps" ? t("browserGps") : selectedLocation.source === "map" ? t("mapSource") : t("manualEntry")}</Popup>
          </Marker>}
        </MapContainer>
        <div className="map-overlay map-overlay-top">
          <Layers3 size={14} aria-hidden="true" />
          <span>{t("linearTrend")}</span>
        </div>
        <div className="map-overlay map-overlay-bottom" aria-hidden="true">N ↑</div>
      </div>
      <div className="map-legend" role="list" aria-label={t("legendLabel")}>
        {trendLegend.map((item) => <span className="map-legend-item" role="listitem" key={item.label}>
          <i aria-hidden="true" style={{ backgroundColor: item.color }} />
          <span>{item.label === "No estimate" ? t("noEstimate") : item.label}</span>
        </span>)}
        <span className="legend-unit">{t("dryWet")}</span>
      </div>
      <div className="map-footnote">
        <CircleHelp size={14} aria-hidden="true" />
        <span>
          {selectionMode
            ? `${t("mapSelectionFoot")} ${dataset.gridCells - dataset.eligibleCells} ${t("noEstimateCoverage")}`
            : dataset.mode === "demo"
              ? t("mapDemoFoot")
              : `${t("mapRealFoot")} ${dataset.gridCells - dataset.eligibleCells} ${t("noEstimateCoverage")}`}
        </span>
      </div>
      {selectionMode && <p className="location-grid-note">{t("gridResolutionNote")}</p>}
      {selectedCell && (
        <div className="selected-cell" aria-live="polite">
          <div>
            <span className="eyebrow">{t("selectedGridCell")}</span>
            <strong>{formatNumber(Math.abs(selectedCell.latitude), { maximumFractionDigits: 2 })}° S, {formatNumber(Math.abs(selectedCell.longitude), { maximumFractionDigits: 2 })}° W</strong>
          </div>
          <div className="selected-cell-value">
            <b>
              {selectedCell.slopePerDecade === null
                ? "—"
                : (selectedCell.slopePerDecade > 0 ? "+" : "") +
                  formatNumber(selectedCell.slopePerDecade, { maximumFractionDigits: 1 })}
            </b>
            <span>mm / decade</span>
          </div>
        </div>
      )}
      <p className="map-region-caption">{t("viewing")}: {regionLabels[region]}</p>
    </section>
  );
}
