import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarClock, CircleHelp, Crosshair, Database, LockKeyhole, MapPin } from "lucide-react";
import type { DashboardDataset } from "../types";
import { coordinateError, findEligibleCell, formatCoordinate, type CoordinatePoint, type LocationSource, type SelectedLocation } from "../data/location";
import { TrendMap } from "./TrendMap";
import type { ForecastTarget } from "../types/forecast";
import type { PredictiveEvaluation } from "../types/predictive";
import { buildForecastRequest, loadForecastArtifact, resolveForecast, selectedPreHoldoutModel, type ForecastIssueRequest, type ForecastLoad } from "../data/forecast";
import { loadPredictiveEvaluation } from "../data/loadPredictive";

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
  const [horizon, setHorizon] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<ForecastTarget>("storage");
  const [issueMode, setIssueMode] = useState<ForecastIssueRequest["issue"]["mode"]>("latest_verified_eligible");
  const [issueDate, setIssueDate] = useState("");
  const [evaluation, setEvaluation] = useState<PredictiveEvaluation | null>(null);
  const [evaluationState, setEvaluationState] = useState<"loading" | "ready" | "error">("loading");
  const [evaluationError, setEvaluationError] = useState("");
  const [forecastState, setForecastState] = useState<ForecastLoad>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setEvaluationState("loading");
    loadPredictiveEvaluation().then((loadedEvaluation) => {
      if (active) { setEvaluation(loadedEvaluation); setEvaluationState("ready"); }
    }).catch((error: unknown) => {
      if (active) { setEvaluationState("error"); setEvaluationError(error instanceof Error ? error.message : "Predictive evaluation could not be loaded."); }
    });
    loadForecastArtifact().then((loadedForecast) => { if (active) setForecastState(loadedForecast); });
    return () => { active = false; };
  }, []);

  const selectedModel = selectedPreHoldoutModel(evaluation, horizon, target);
  const selectedTrendCell = selectedLocation && dataset
    ? findEligibleCell(selectedLocation, dataset.cells, dataset.resolutionDegrees)
    : null;
  const requestResult = useMemo(() => {
    try {
      return { request: buildForecastRequest({ location: selectedLocation, dataset, evaluation, horizon, target, issue: issueMode === "date" ? { mode: "date", value: issueDate } : { mode: "latest_verified_eligible" } }), error: null };
    } catch (error) { return { request: null, error: error instanceof Error ? error.message : "Forecast request is invalid." }; }
  }, [selectedLocation, dataset, evaluation, horizon, target, issueMode, issueDate]);
  const resolution = requestResult.request && forecastState.status === "ready" ? resolveForecast(requestResult.request, forecastState.artifact) : null;

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
        <p>Configure a spatial request for the selected eligible Pampas grid cell. Results appear only after issue-time availability and scientific eligibility are verified.</p>
      </div>
      <div className="forecast-status" role="status"><span /><b>{resolution?.status === "available" ? "OPERATIONALLY ELIGIBLE" : forecastState.status === "loading" ? "CHECKING ARTIFACT" : "NOT OPERATIONALLY ELIGIBLE"}</b><small>{forecastState.status === "ready" ? "FORECAST WITHHELD · REQUEST OR EVIDENCE MISMATCH" : forecastState.status === "loading" ? "VALIDATING FORECAST CONTRACT" : "NO VERIFIED LIVE RESULT · FORECAST WITHHELD"}</small></div>
    </section>

    <section className="dual-track-grid" aria-label="Complementary forecasting tracks">
      <article className="dual-track-card panel">
        <div className="eyebrow">TRACK 1 · SHORT TERM</div>
        <h2>14- and 28-day water outlook</h2>
        <p>Designed around SMAP/GLDAS soil-water inputs and meteorological forecasts only when their issue-time publication is verified. The available NASA pilot covers two days and does not meet the history requirement.</p>
        <dl><div><dt>Current status</dt><dd>Withheld · no validated out-of-sample skill</dd></div><div><dt>Required comparison</dt><dd>Seasonal climatology and persistence</dd></div><div><dt>Weather inputs</dt><dd>Not yet admitted; causal vintages required</dd></div></dl>
      </article>
      <article className="dual-track-card panel">
        <div className="eyebrow">TRACK 2 · SEASONAL</div>
        <h2>1-, 2- and 3-month outlook</h2>
        <p>Based on the 2006–2025 GLDAS research. Seasonal climatology was selected in all 18 configurations using pre-holdout walk-forward results; this is a benchmark finding, not evidence of a skillful dynamic forecast.</p>
        <dl><div><dt>Current status</dt><dd>Historical evaluation only · no operational forecast</dd></div><div><dt>Comparisons</dt><dd>Climatology and persistence; holdout ranking stays descriptive</dd></div><div><dt>Additional predictors</dt><dd>Only with justified, dated availability evidence</dd></div></dl>
      </article>
    </section>

    <section className="location-diagnosis panel" aria-labelledby="location-diagnosis-title">
      <div className="eyebrow">LOCATION-SPECIFIC HISTORICAL DIAGNOSIS</div>
      <h2 id="location-diagnosis-title">{selectedTrendCell ? "Historical GLDAS trend for the selected grid cell" : "Select a supported location to see its historical trend"}</h2>
      {selectedTrendCell && <dl className="phase7-metrics">
        <div><dt>Period</dt><dd>{dataset?.start.slice(0, 4)}–{dataset?.end.slice(0, 4)}</dd></div>
        <div><dt>Estimated trend</dt><dd>{selectedTrendCell.slopePerDecade === null ? "Unavailable" : `${selectedTrendCell.slopePerDecade >= 0 ? "+" : ""}${selectedTrendCell.slopePerDecade.toFixed(2)} mm/decade`}</dd></div>
        <div><dt>95% interval</dt><dd>{selectedTrendCell.ci95 ? `${selectedTrendCell.ci95[0].toFixed(2)} to ${selectedTrendCell.ci95[1].toFixed(2)} mm/decade` : "Unavailable"}</dd></div>
        <div><dt>FDR-adjusted</dt><dd>{selectedTrendCell.significant ? "Significant" : "Not significant"}</dd></div>
      </dl>}
      <p>{selectedTrendCell
        ? "This is a long-term modeled storage trend for a GLDAS grid cell. It does not measure current field conditions, predict near-term soil-water stress, or establish land degradation."
        : dataset ? "A selected supported cell will show its historical trend with uncertainty. This historical indicator is separate from current soil-water stress and land degradation." : "Validated historical coverage is unavailable, so no location-specific diagnosis is shown."}</p>
    </section>

    <section className="conditional-guidance panel" aria-label="Agricultural guidance limits">
      <div className="eyebrow">CONDITIONAL AGRICULTURAL GUIDANCE</div>
      <p>No action threshold is triggered here. If a future forecast passes chronological out-of-sample, calibration, uncertainty, and issue-time data gates, any guidance must remain conditional on that forecast, local soil measurements, crop and growth stage, and regional agronomic advice.</p>
    </section>

    <section className="forecast-unavailable panel" aria-labelledby="forecast-unavailable-title">
      <div className="forecast-unavailable-icon"><LockKeyhole size={19} /></div>
      <div>
        <div className="eyebrow">FORECAST WORKSPACE / UNAVAILABLE</div>
        <h2 id="forecast-unavailable-title">{resolution?.status === "available" ? "Verified forecast record" : "Forecast result withheld"}</h2>
        <p>{forecastState.status === "loading" ? "Checking for a forecast_v1 artifact. No prediction is displayed while validation is in progress." : forecastState.status === "missing" || forecastState.status === "error" ? `${forecastState.message} Historical evaluations are never substituted.` : resolution?.status === "unavailable" ? resolution.reason : requestResult.error ?? "A verified record must match this request, selected pre-holdout model, issue time, target month, cell, cutoff and publication evidence. Historical evaluations are never substituted."}</p>
        <div className="forecast-file-path"><Database size={14} /><code>{forecastFile}</code></div>
        {resolution?.status === "available" && <dl className="phase7-metrics" aria-label="Operational forecast details">
          <div><dt>Value</dt><dd>{resolution.artifact.value} {resolution.artifact.units}</dd></div>
          <div><dt>Issue / target</dt><dd>{resolution.artifact.issue_time} → {resolution.artifact.target_month}</dd></div>
          <div><dt>Horizon / model</dt><dd>{resolution.artifact.horizon_months} months · {resolution.artifact.model.name} {resolution.artifact.model.version}</dd></div>
          <div><dt>Observation cutoff</dt><dd>{resolution.artifact.input_observation_cutoff}</dd></div>
          {resolution.artifact.predictive_interval && <div><dt>{Math.round(resolution.artifact.predictive_interval.level * 100)}% predictive interval</dt><dd>{resolution.artifact.predictive_interval.lower}–{resolution.artifact.predictive_interval.upper} mm · {resolution.artifact.predictive_interval.method}</dd></div>}
          <div><dt>Source</dt><dd>{resolution.artifact.source.collection} · {resolution.artifact.source.doi}</dd></div>
        </dl>}
      </div>
    </section>

    <section className="forecast-setup panel" aria-labelledby="forecast-setup-title">
      <div className="panel-heading"><div><div className="eyebrow">SPATIAL REQUEST · NO AUTOMATIC ISSUE DATE</div><h2 id="forecast-setup-title">Forecast configuration</h2></div><span className="historical-chip">{forecastState.status === "ready" ? "CHECKING EVIDENCE" : forecastState.status === "loading" ? "LOADING ARTIFACT" : "RESULTS WITHHELD"}</span></div>
      <div className="forecast-controls">
        <label><span>Geographic support</span><div className="forecast-fixed-field"><MapPin size={14} /> {selectedLocation && requestResult.request ? `Selected GLDAS cell · ${requestResult.request.grid_cell_id}` : "Argentine Pampas · select eligible cell"}</div></label>
        <label><span>Forecast horizon</span><select aria-label="Forecast horizon" value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 1 | 2 | 3)}><option value="1">1 month ahead</option><option value="2">2 months ahead</option><option value="3">3 months ahead</option></select></label>
        <label><span>Target variable</span><select aria-label="Forecast target" value={target} onChange={(event) => setTarget(event.target.value as ForecastTarget)}><option value="storage">Soil-water storage (mm)</option><option value="anomaly">Storage anomaly (mm)</option><option value="low_moisture">Low-moisture probability</option></select></label>
        <label><span>Model selection</span><div className="forecast-fixed-field">{evaluationState === "loading" ? "Loading evaluation…" : selectedModel ? `${selectedModel} · selected before holdout` : "No matching evaluation configuration"}</div></label>
        <label><span>Issue-time request</span><select aria-label="Issue-time request" value={issueMode} onChange={(event) => setIssueMode(event.target.value as ForecastIssueRequest["issue"]["mode"])}><option value="latest_verified_eligible">Latest verified eligible issue</option><option value="date">Specific UTC issue time</option></select></label>
        {issueMode === "date" && <label><span>UTC issue timestamp</span><input aria-label="UTC issue timestamp" type="text" inputMode="text" placeholder="2025-10-31T23:59:59Z" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /> <small>Enter an explicit UTC timestamp ending in Z. A current date is never assumed to be scientifically valid.</small></label>}
      </div>
      <p className="forecast-controls-note"><CircleHelp size={14} /> {evaluationState === "error" ? evaluationError : requestResult.error ?? `Request updates with each selection. Model selection is derived from the spatial walk-forward evaluation; holdout rankings are not used. ${selectedModel ? `Selected model: ${selectedModel}.` : "Model selection is unavailable until the evaluation artifact loads."}`}</p>
      <div className="research-status-ladder" aria-label="Scientific readiness levels">
        <div><b>1 · Historical research</b><span>Available separately in Observatory</span></div><div><b>2 · Retrospective evaluation</b><span>{evaluationState === "ready" ? "Evaluation artifact loaded" : "Loading or unavailable"}</span></div><div><b>3 · Experimental prospective</b><span>Not connected</span></div><div><b>4 · Operational eligibility</b><span>{resolution?.status === "available" ? "Evidence matched" : "Not established"}</span></div>
      </div>
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
