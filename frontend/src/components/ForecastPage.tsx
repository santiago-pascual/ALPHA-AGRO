import { useState, type FormEvent } from "react";
import { AlertTriangle, CalendarClock, CircleHelp, Crosshair, Database, LockKeyhole, MapPin } from "lucide-react";
import type { DashboardDataset } from "../types";
import { coordinateError, findEligibleCell, formatCoordinate, type CoordinatePoint, type LocationSource, type SelectedLocation } from "../data/location";
import { TrendMap } from "./TrendMap";

const forecastFile = "frontend/public/data/forecast_v1.json";

type ForecastPageProps = {
  dataset: DashboardDataset | null;
  selectedLocation: SelectedLocation | null;
  onLocationChange: (location: SelectedLocation | null) => void;
};

export function ForecastPage({ dataset, selectedLocation, onLocationChange }: ForecastPageProps) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const selectLocation = (point: CoordinatePoint, source: LocationSource, accuracyMeters: number | null = null) => {
    const invalid = coordinateError(point);
    if (invalid) {
      setLocationError(invalid);
      setLocationNotice(null);
      return;
    }
    if (!dataset) {
      setLocationError("Coverage cannot be verified because the validated trend artifact is unavailable. No location was selected.");
      setLocationNotice(null);
      return;
    }
    if (!findEligibleCell(point, dataset.cells, dataset.resolutionDegrees)) {
      setLocationError(`This point is outside cells with eligible historical trend estimates in the validated Pampas grid. ${selectedLocation ? "The previous selection remains unchanged." : "No location was selected."}`);
      setLocationNotice(null);
      return;
    }
    onLocationChange({ ...point, source, accuracyMeters });
    setLocationError(null);
    setLocationNotice("Selected within a grid cell with an eligible historical trend estimate.");
  };

  const submitManualCoordinates = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const latText = latitude.trim();
    const lonText = longitude.trim();
    if (!latText || !lonText) {
      setLocationError("Enter both latitude and longitude.");
      setLocationNotice(null);
      return;
    }
    selectLocation({ latitude: Number(latText), longitude: Number(lonText) }, "manual");
  };

  const requestDeviceLocation = () => {
    setLocationError(null);
    setLocationNotice(null);
    if (!navigator.geolocation) {
      setLocationError("Browser geolocation is unavailable. Enter coordinates or select the map instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => selectLocation(
        { latitude: position.coords.latitude, longitude: position.coords.longitude },
        "gps",
        Number.isFinite(position.coords.accuracy) && position.coords.accuracy > 0 ? position.coords.accuracy : null,
      ),
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. You can enter coordinates or select the map instead."
          : error.code === error.POSITION_UNAVAILABLE
            ? "The device could not determine a location. You can enter coordinates or select the map instead."
            : error.code === error.TIMEOUT
              ? "The location request timed out. Try again or enter coordinates manually."
              : "The browser could not determine a location. You can enter coordinates or select the map instead.";
        setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  return <>
    <section className="page-intro forecast-intro">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> PROSPECTIVE SOIL-WATER OUTLOOK</div>
        <h1>Forecast <em>availability</em></h1>
        <p>Monthly forecasts are not available yet. Historical evaluation and retrospective simulations are not current forecasts.</p>
      </div>
      <div className="forecast-status" role="status"><span /><b>NOT OPERATIONALLY ELIGIBLE</b><small>NO VALIDATED FORECAST ARTIFACT</small></div>
    </section>

    <section className="forecast-unavailable panel" aria-labelledby="forecast-unavailable-title">
      <div className="forecast-unavailable-icon"><LockKeyhole size={19} /></div>
      <div>
        <div className="eyebrow">FORECAST WORKSPACE / UNAVAILABLE</div>
        <h2 id="forecast-unavailable-title">No prospective result is connected</h2>
        <p>The application will show a result only after a schema-valid <code>forecast_v1.json</code> includes issue time, an observation availability cutoff, predictive uncertainty, provenance, and verified operational eligibility. No historical hindcast is substituted.</p>
        <div className="forecast-file-path"><Database size={14} /><code>{forecastFile}</code></div>
      </div>
    </section>

    <section className="forecast-setup panel" aria-labelledby="forecast-setup-title">
      <div className="panel-heading"><div><div className="eyebrow">SUPPORTED CONFIGURATION</div><h2 id="forecast-setup-title">Monthly horizons</h2></div><span className="historical-chip">CONTROLS DISABLED</span></div>
      <div className="forecast-controls">
        <label><span>Study region</span><div className="forecast-fixed-field"><MapPin size={14} /> Argentine Pampas · regional model grid</div></label>
        <label><span>Forecast horizon</span><select disabled aria-label="Forecast horizon"><option>1 month ahead</option><option>2 months ahead</option><option>3 months ahead</option></select></label>
        <label><span>Target variable</span><select disabled aria-label="Forecast target"><option>Soil-water storage (mm)</option><option>Storage anomaly (mm)</option><option>Low-moisture probability</option></select></label>
      </div>
      <p className="forecast-controls-note"><CircleHelp size={14} /> The interface is prepared for the validated 1–3 month research horizons. Configuration stays locked until an eligible forecast artifact is available.</p>
    </section>

    <section className="location-workspace" aria-labelledby="location-title">
      <div className="location-workspace-heading">
        <div><div className="eyebrow">FIELD CONTEXT / SESSION ONLY</div><h2 id="location-title">Choose a location</h2></div>
        <p>Location selection is for future supported-area context only. It does not produce a field-level measurement or forecast.</p>
      </div>
      {dataset ? <TrendMap
        dataset={dataset}
        region="all"
        onRegionChange={() => undefined}
        selectedLocation={selectedLocation}
        onLocationSelect={(point) => selectLocation(point, "map")}
        selectionMode
      /> : <div className="location-coverage-missing panel" role="status"><Database size={17} /><div><b>Validated coverage mask unavailable</b><span>Load the reviewed trend_analysis.json to enable map selection. A guessed boundary is not used.</span></div></div>}
      <div className="location-tools panel">
        <div className="location-tool-heading"><Crosshair size={16} /><div><b>Use this device</b><span>Your browser requests location only after you select the button.</span></div></div>
        <button className="button-secondary" type="button" onClick={requestDeviceLocation}>Use my location</button>
        <form className="coordinate-form" onSubmit={submitManualCoordinates} noValidate>
          <label><span>Latitude</span><input aria-label="Latitude" type="number" inputMode="decimal" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="e.g. −34.00" /></label>
          <label><span>Longitude</span><input aria-label="Longitude" type="number" inputMode="decimal" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="e.g. −60.00" /></label>
          <button className="button-secondary" type="submit">Use coordinates</button>
        </form>
        {locationError && <p className="location-feedback location-error" role="alert">{locationError}</p>}
        {locationNotice && <p className="location-feedback location-success" role="status">{locationNotice}</p>}
        {selectedLocation && <div className="selected-location-summary" aria-live="polite">
          <div><span className="eyebrow">SELECTED · {selectedLocation.source.toUpperCase()}</span><b>{formatCoordinate(selectedLocation.latitude, "latitude")} · {formatCoordinate(selectedLocation.longitude, "longitude")}</b></div>
          <span>{selectedLocation.source === "gps" ? selectedLocation.accuracyMeters === null ? "GPS-reported accuracy unavailable" : `GPS-reported horizontal accuracy ±${Math.round(selectedLocation.accuracyMeters)} m` : "GPS accuracy not applicable to this selection"}</span>
          <button className="location-clear" type="button" onClick={() => { onLocationChange(null); setLocationError(null); setLocationNotice(null); }}>Clear location</button>
        </div>}
        <p className="location-privacy-note">The selected coordinates stay in this page's memory for this tab session and are not sent to a forecasting service. The GLDAS Noah {dataset?.resolutionDegrees ?? "0.25"}° grid spacing is model-grid support, not GPS precision or a satellite soil-moisture observation resolution.</p>
      </div>
    </section>

    <section className="forecast-requirements" aria-label="Forecast evidence requirements">
      <article className="panel"><CalendarClock size={17} /><div><b>Issue-time evidence</b><span>Observed inputs and their release times must be available by the recorded issue timestamp.</span></div></article>
      <article className="panel"><AlertTriangle size={17} /><div><b>Validation before display</b><span>Chronological evaluation, calibration, uncertainty, source versions, and quality flags must be documented.</span></div></article>
    </section>
    <footer className="page-footer"><span>MONTHLY HORIZONS · 1–3 MONTHS</span><span>NO LIVE FORECASTS · NO CROP-SPECIFIC ADVICE</span><span>ALPHA AGRO · DEVELOPED BY QUANT ALPHA</span></footer>
  </>;
}
