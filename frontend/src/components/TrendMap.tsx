import { useMemo, useState } from "react";
import { CircleHelp, Layers3, MapPin } from "lucide-react";
import { divIcon } from "leaflet";
import { Circle, MapContainer, Marker, Popup, Rectangle, ScaleControl, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import type { CoordinatePoint, SelectedLocation } from "../data/location";
import type { DashboardDataset, TrendCell } from "../types";

export type RegionSelection = "all" | "north" | "south" | "west" | "east";

type TrendMapProps = {
  dataset: DashboardDataset;
  region: RegionSelection;
  onRegionChange: (region: RegionSelection) => void;
  selectedLocation?: SelectedLocation | null;
  onLocationSelect?: (point: CoordinatePoint) => void;
  selectionMode?: boolean;
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

const regionLabels: Record<RegionSelection, string> = {
  all: "Study area",
  north: "Northern Pampas",
  south: "Southern Pampas",
  west: "Western Pampas",
  east: "Eastern Pampas",
};

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

export function TrendMap({ dataset, region, onRegionChange, selectedLocation = null, onLocationSelect, selectionMode = false }: TrendMapProps) {
  const [selectedCell, setSelectedCell] = useState<TrendCell | null>(null);
  const visibleCells = useMemo(() => dataset.cells, [dataset.cells]);

  return (
    <section className="panel map-panel" aria-labelledby="map-title">
      <div className="panel-heading map-heading">
        <div>
            <div className="eyebrow">{selectionMode ? "Validated analysis support" : "Spatial pattern"}</div>
            <h2 id="map-title">{selectionMode ? "Select a field location" : "Cell-level trend"}</h2>
        </div>
        {!selectionMode && <label className="select-wrap compact-select">
          <span className="sr-only">Select Pampas subregion</span>
          <MapPin size={14} aria-hidden="true" />
          <select
            value={region}
            onChange={(event) => {
              onRegionChange(event.target.value as RegionSelection);
              setSelectedCell(null);
            }}
          >
            <option value="all">Study area</option>
            <option value="north">Northern Pampas</option>
            <option value="south">Southern Pampas</option>
            <option value="west">Western Pampas</option>
            <option value="east">Eastern Pampas</option>
          </select>
        </label>}
      </div>
      <div className="map-meta">
        <span><span className="live-dot" /> {dataset.eligibleCells} / {dataset.gridCells} cells with trend estimates · {dataset.resolutionDegrees}° grid</span>
        <span>{selectionMode ? "Click an eligible cell to place a marker" : "Argentine Pampas · analysis grid"}</span>
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
          aria-label={selectionMode ? "Select a location on eligible Argentine Pampas analysis cells" : "Interactive map of soil-water trends across the Pampas"}
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
                  <strong>{cell.latitude.toFixed(2)}° · {cell.longitude.toFixed(2)}°</strong>
                  <br />
                  {cell.slopePerDecade === null
                    ? "No trend estimate"
                    : (cell.slopePerDecade > 0 ? "+" : "") +
                      cell.slopePerDecade.toFixed(1) + " mm / decade"}
                  <br />
                  {dataset.mode === "demo"
                    ? "DEMO significance flag · synthetic"
                    : cell.significant ? "FDR-adjusted: significant" : "FDR-adjusted: not significant"}
                </Tooltip>
              </Rectangle>
            );
          })}
          {selectedLocation?.accuracyMeters !== null && selectedLocation?.accuracyMeters !== undefined && <Circle
            center={[selectedLocation.latitude, selectedLocation.longitude]}
            radius={selectedLocation.accuracyMeters}
            pathOptions={{ color: "#f2d99d", weight: 1, fillColor: "#f2d99d", fillOpacity: 0.12 }}
          />}
          {selectedLocation && <Marker
            position={[selectedLocation.latitude, selectedLocation.longitude]}
            icon={locationIcon}
            title="Selected field location"
            alt="Selected field location"
          >
            <Popup>Selected location · {selectedLocation.source === "gps" ? "browser GPS" : selectedLocation.source === "map" ? "map" : "manual entry"}</Popup>
          </Marker>}
        </MapContainer>
        <div className="map-overlay map-overlay-top">
          <Layers3 size={14} aria-hidden="true" />
          <span>Linear trend</span>
        </div>
        <div className="map-overlay map-overlay-bottom" aria-hidden="true">N ↑</div>
      </div>
      <div className="map-legend" role="list" aria-label="Cell-level trend, millimeters per decade">
        {trendLegend.map((item) => <span className="map-legend-item" role="listitem" key={item.label}>
          <i aria-hidden="true" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </span>)}
        <span className="legend-unit">mm / decade · dry ← → wet</span>
      </div>
      <div className="map-footnote">
        <CircleHelp size={14} aria-hidden="true" />
        <span>
          {selectionMode
            ? `Selectable footprints are cells with eligible historical trend estimates from this artifact. ${dataset.gridCells - dataset.eligibleCells} grid cells lack eligible estimates; uncovered areas are not treated as supported.`
            : dataset.mode === "demo"
              ? "Synthetic cell values · fictitious, for interface demonstration only."
              : `Cell-level seasonal anomaly trends; significance uses BH-adjusted HAC p-values. ${dataset.gridCells - dataset.eligibleCells} cells have no eligible trend estimate.`}
        </span>
      </div>
      {selectionMode && <p className="location-grid-note">GLDAS Noah is a land-surface model. Its {dataset.resolutionDegrees}° grid spacing is not GPS precision, a satellite soil-moisture observation, or a field boundary.</p>}
      {selectedCell && (
        <div className="selected-cell" aria-live="polite">
          <div>
            <span className="eyebrow">Selected grid cell</span>
            <strong>{selectedCell.latitude.toFixed(2)}° S, {Math.abs(selectedCell.longitude).toFixed(2)}° W</strong>
          </div>
          <div className="selected-cell-value">
            <b>
              {selectedCell.slopePerDecade === null
                ? "—"
                : (selectedCell.slopePerDecade > 0 ? "+" : "") +
                  selectedCell.slopePerDecade.toFixed(1)}
            </b>
            <span>mm / decade</span>
          </div>
        </div>
      )}
      <p className="map-region-caption">Viewing: {regionLabels[region]}</p>
    </section>
  );
}
