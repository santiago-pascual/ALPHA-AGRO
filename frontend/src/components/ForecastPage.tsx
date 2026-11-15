import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CalendarClock, CircleHelp, Crosshair, Database, LockKeyhole, MapPin } from "lucide-react";
import type { DashboardDataset } from "../types";
import { coordinateError, findEligibleCell, formatCoordinate, type CoordinatePoint, type LocationSource, type SelectedLocation } from "../data/location";
import { TrendMap } from "./TrendMap";
import type { ForecastTarget } from "../types/forecast";
import type { PredictiveEvaluation } from "../types/predictive";
import { buildForecastRequest, loadForecastArtifact, resolveForecast, selectedPreHoldoutModel, type ForecastIssueRequest, type ForecastLoad } from "../data/forecast";
import { loadPredictiveEvaluation } from "../data/loadPredictive";
import { SavedFieldsPanel } from "./SavedFieldsPanel";
import type { SavedField } from "../data/fields";
import { interpretAnomaly, interpretCellTrend, interpretForecastAnomaly, interpretLowMoistureProbability, interpretStorage } from "../data/interpretation";

const forecastFile = "frontend/public/data/forecast_v1.json";

function coordinateMessage(message: string) {
  if (message.startsWith("Enter finite")) return `Ingresá números válidos para latitud y longitud. / ${message}`;
  if (message.startsWith("Latitude")) return `La latitud debe estar entre −90° y 90°. / ${message}`;
  if (message.startsWith("Longitude")) return `La longitud debe estar entre −180° y 180°. / ${message}`;
  return message;
}

type ForecastPageProps = {
  dataset: DashboardDataset | null;
  selectedLocation: SelectedLocation | null;
  onLocationChange: (location: SelectedLocation | null) => void;
  savedFields: SavedField[];
  activeFieldId: string | null;
  storageWarning: string | null;
  onFieldSelect: (id: string | null) => void;
  onFieldAdd: (name: string, description: string) => void;
  onFieldRename: (id: string, name: string) => void;
  onFieldDelete: (id: string) => void;
};

export function ForecastPage({ dataset, selectedLocation, onLocationChange, savedFields, activeFieldId, storageWarning, onFieldSelect, onFieldAdd, onFieldRename, onFieldDelete }: ForecastPageProps) {
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
  const selectedSeries = evaluation?.results.find((row) => row.scope === "spatial" && row.horizon_months === horizon && row.target === target);
  const selectedEventDefinition = selectedSeries?.target_definition.threshold ?? selectedSeries?.target_definition.method;
  const activeField = savedFields.find((field) => field.id === activeFieldId) ?? null;
  const requestResult = useMemo(() => {
    try {
      return { request: buildForecastRequest({ location: selectedLocation, dataset, evaluation, horizon, target, issue: issueMode === "date" ? { mode: "date", value: issueDate } : { mode: "latest_verified_eligible" } }), error: null };
    } catch (error) { return { request: null, error: error instanceof Error ? error.message : "Forecast request is invalid." }; }
  }, [selectedLocation, dataset, evaluation, horizon, target, issueMode, issueDate]);
  const resolution = requestResult.request && forecastState.status === "ready" ? resolveForecast(requestResult.request, forecastState.artifact) : null;
  const forecastPlainLanguage = resolution?.status === "available"
    ? resolution.artifact.target === "low_moisture"
      ? interpretLowMoistureProbability(resolution.artifact.value, selectedEventDefinition)
      : resolution.artifact.target === "anomaly"
        ? interpretForecastAnomaly(resolution.artifact.value)
        : interpretStorage()
    : null;
  const displayResolution = resolution?.status === "available" && forecastPlainLanguage !== null ? resolution : null;
  const latestRegionalObservation = dataset?.series[dataset.series.length - 1] ?? null;
  const anomalyExplanation = interpretAnomaly(latestRegionalObservation?.anomalyMm ?? null);
  const selectedCell = selectedLocation && dataset ? findEligibleCell(selectedLocation, dataset.cells, dataset.resolutionDegrees) : null;
  const cellTrendExplanation = interpretCellTrend(selectedCell?.slopePerDecade ?? null);

  const selectLocation = (point: CoordinatePoint, source: LocationSource, accuracyMeters: number | null = null) => {
    const invalid = coordinateError(point);
    if (invalid) {
      setLocationError(coordinateMessage(invalid));
      setLocationNotice(null);
      return;
    }
    if (!dataset) {
      setLocationError("No se puede comprobar la cobertura sin el análisis histórico validado; no se seleccionó el punto. / Coverage cannot be verified because the validated trend artifact is unavailable. No location was selected.");
      setLocationNotice(null);
      return;
    }
    if (!findEligibleCell(point, dataset.cells, dataset.resolutionDegrees)) {
      setLocationError(`Este punto queda fuera de las celdas con tendencias históricas elegibles de la región pampeana validada. ${selectedLocation ? "La selección anterior sigue activa." : "No se seleccionó ningún punto."} / This point is outside cells with eligible historical trend estimates in the validated Pampas grid. ${selectedLocation ? "The previous selection remains unchanged." : "No location was selected."}`);
      setLocationNotice(null);
      return;
    }
    onLocationChange({ ...point, source, accuracyMeters });
    setLocationError(null);
    setLocationNotice("Punto ubicado dentro de una celda con tendencia histórica elegible. / Selected within a grid cell with an eligible historical trend estimate.");
  };

  const submitManualCoordinates = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const latText = latitude.trim();
    const lonText = longitude.trim();
    if (!latText || !lonText) {
      setLocationError("Ingresá latitud y longitud. / Enter both latitude and longitude.");
      setLocationNotice(null);
      return;
    }
    selectLocation({ latitude: Number(latText), longitude: Number(lonText) }, "manual");
  };

  const requestDeviceLocation = () => {
    setLocationError(null);
    setLocationNotice(null);
    if (!navigator.geolocation) {
      setLocationError("La ubicación del navegador no está disponible. Podés ingresar coordenadas o elegir el mapa. / Browser geolocation is unavailable. Enter coordinates or select the map instead.");
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
          ? "Se denegó el permiso de ubicación. Podés ingresar coordenadas o elegir el mapa. / Location permission was denied. You can enter coordinates or select the map instead."
          : error.code === error.POSITION_UNAVAILABLE
            ? "El dispositivo no pudo determinar la ubicación. Podés ingresar coordenadas o elegir el mapa. / The device could not determine a location. You can enter coordinates or select the map instead."
            : error.code === error.TIMEOUT
              ? "Se agotó el tiempo para ubicarte. Probá otra vez o ingresá las coordenadas. / The location request timed out. Try again or enter coordinates manually."
              : "El navegador no pudo determinar la ubicación. Podés ingresar coordenadas o elegir el mapa. / The browser could not determine a location. You can enter coordinates or select the map instead.";
        setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  return <>
    <section className="page-intro forecast-intro">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> DISPONIBILIDAD DE PRONÓSTICOS · FORECAST AVAILABILITY</div>
        <h1>Pronóstico y <em>disponibilidad</em></h1>
        <p>Elegí un campo y el período que querés consultar. Solo mostramos un resultado cuando sus datos y su validación científica están comprobados.</p>
        <p className="forecast-intro-english" lang="en">Choose a field and a period. Results appear only when data availability and scientific eligibility are verified.</p>
      </div>
      <div className="forecast-status" role="status"><span /><b>{displayResolution ? "OPERATIONALLY ELIGIBLE" : resolution?.status === "available" ? "RESULT WITHHELD" : forecastState.status === "loading" ? "CHECKING ARTIFACT" : "NOT OPERATIONALLY ELIGIBLE"}</b><small>{displayResolution ? "VERIFIED FORECAST RECORD" : resolution?.status === "available" ? "EVENT DEFINITION REQUIRED" : forecastState.status === "ready" ? "FORECAST WITHHELD · REQUEST OR EVIDENCE MISMATCH" : forecastState.status === "loading" ? "VALIDATING FORECAST CONTRACT" : "NO VERIFIED LIVE RESULT · FORECAST WITHHELD"}</small></div>
    </section>

    <section className="forecast-unavailable panel" aria-labelledby="forecast-unavailable-title">
      <div className="forecast-unavailable-icon"><LockKeyhole size={19} /></div>
      <div>
        <div className="eyebrow">ESPACIO DE PRONÓSTICO · FORECAST WORKSPACE</div>
        <h2 id="forecast-unavailable-title">{displayResolution ? `Pronóstico validado · ${activeField?.name ?? "campo seleccionado"}` : "Pronóstico no disponible · Forecast unavailable"}</h2>
        <p>{displayResolution ? "Este resultado corresponde a una estimación científica para el período indicado; no describe una medición dentro del lote ni garantiza resultados agrícolas." : resolution?.status === "available" ? "El artefacto no incluye una definición clara del evento de baja humedad. Por eso no mostramos esta probabilidad. / The artifact does not clearly define the low-moisture event, so this probability is withheld." : forecastState.status === "loading" ? "Estamos comprobando si hay un archivo forecast_v1 válido. No mostramos una predicción mientras se valida, ni sustituimos resultados históricos. / Checking for a valid forecast_v1 artifact. No prediction is shown during validation, and historical evaluations are never substituted." : forecastState.status === "missing" || forecastState.status === "error" ? `Podemos mostrar información histórica de agua en el suelo para esta región, pero todavía no hay un pronóstico verificado. / We can show historical soil-water information for this area, but a verified forecast is not available yet. ${forecastState.message} Historical evaluations are never substituted.` : resolution?.status === "unavailable" ? `${resolution.reason} / The selected scientific requirements are not met.` : requestResult.error ?? "No hay datos científicos suficientes para esta solicitud. / The scientific inputs for this request are not available."}</p>
        <div className="forecast-file-path"><Database size={14} /><code>{forecastFile}</code></div>
        {displayResolution && <>
          <article className="farmer-forecast-reading" aria-labelledby="forecast-reading-title">
            <div className="eyebrow">LECTURA SENCILLA · PLAIN-LANGUAGE READING</div>
            <h3 id="forecast-reading-title">{displayResolution.artifact.target === "low_moisture" ? `Probabilidad estimada: ${(displayResolution.artifact.value * 100).toFixed(1)}%` : `Estimación del modelo: ${displayResolution.artifact.value.toFixed(1)} ${displayResolution.artifact.units}`}</h3>
            <p>{forecastPlainLanguage?.spanish}</p><p lang="en">{forecastPlainLanguage?.english}</p>
            {displayResolution.artifact.target === "low_moisture" && selectedEventDefinition && <p className="forecast-event-definition">Evento definido por la investigación · Research event definition: {selectedEventDefinition}</p>}
            {displayResolution.artifact.target === "low_moisture" && <p className="forecast-event-definition">El artefacto no informa un intervalo predictivo para esta probabilidad. / The artifact does not report a predictive interval for this probability.</p>}
            <p>Esto no es una recomendación de riego ni una predicción de rendimiento o daño. / This is not an irrigation recommendation or a yield or damage prediction.</p>
          </article>
          <dl className="phase7-metrics" aria-label="Detalles científicos del pronóstico / Forecast scientific details">
            <div><dt>Campo · Field</dt><dd>{activeField?.name ?? "Punto sin guardar · Unnamed location"}</dd></div>
            <div><dt>Emisión / período · Issue / target</dt><dd>{displayResolution.artifact.issue_time} → {displayResolution.artifact.target_month}</dd></div>
            <div><dt>Horizonte / modelo · Horizon / model</dt><dd>{displayResolution.artifact.horizon_months} meses · {displayResolution.artifact.model.name} {displayResolution.artifact.model.version}</dd></div>
            <div><dt>Corte de observaciones · Observation cutoff</dt><dd>{displayResolution.artifact.input_observation_cutoff}</dd></div>
            {displayResolution.artifact.predictive_interval && <div><dt>Intervalo predictivo · Predictive interval ({Math.round(displayResolution.artifact.predictive_interval.level * 100)}%)</dt><dd>{displayResolution.artifact.predictive_interval.lower}–{displayResolution.artifact.predictive_interval.upper} mm · {displayResolution.artifact.predictive_interval.method}</dd></div>}
            <div><dt>Fuente · Source</dt><dd>{displayResolution.artifact.source.collection} · {displayResolution.artifact.source.doi}</dd></div>
          </dl>
        </>}
      </div>
    </section>

    <section className="forecast-setup panel" aria-labelledby="forecast-setup-title">
      <div className="panel-heading"><div><div className="eyebrow">SOLICITUD POR CELDA · NO SE ASUME FECHA DE EMISIÓN</div><h2 id="forecast-setup-title">Configuración · Forecast setup</h2></div><span className="historical-chip">{forecastState.status === "ready" ? "VERIFICANDO · CHECKING" : forecastState.status === "loading" ? "CARGANDO · LOADING" : "RESULTADOS RETENIDOS · WITHHELD"}</span></div>
      <div className="forecast-controls">
        <label><span>Ubicación · Location</span><div className="forecast-fixed-field"><MapPin size={14} /> {selectedLocation && requestResult.request ? `${activeField?.name ? `${activeField.name} · ` : ""}Celda GLDAS · ${requestResult.request.grid_cell_id}` : "Región pampeana argentina · elegí un punto / Argentine Pampas · select a point"}</div></label>
        <label><span>Horizonte · Forecast horizon</span><select aria-label="Forecast horizon" value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 1 | 2 | 3)}><option value="1">1 mes · 1 month</option><option value="2">2 meses · 2 months</option><option value="3">3 meses · 3 months</option></select></label>
        <label><span>Qué consultar · Target</span><select aria-label="Forecast target" value={target} onChange={(event) => setTarget(event.target.value as ForecastTarget)}><option value="storage">Agua almacenada · Storage (mm)</option><option value="anomaly">Diferencia con lo habitual · Anomaly (mm)</option><option value="low_moisture">Probabilidad de poca humedad · Low-moisture probability</option></select></label>
        <label><span>Modelo · Model selection</span><div className="forecast-fixed-field">{evaluationState === "loading" ? "Cargando evaluación · Loading…" : selectedModel ? `${selectedModel} · elegido antes del período reservado / selected before holdout` : "Sin configuración de evaluación / No matching evaluation configuration"}</div></label>
        <label><span>Fecha de emisión · Issue time</span><select aria-label="Issue-time request" value={issueMode} onChange={(event) => setIssueMode(event.target.value as ForecastIssueRequest["issue"]["mode"])}><option value="latest_verified_eligible">Última fecha verificada · Latest verified</option><option value="date">Elegir fecha UTC · Specific UTC issue time</option></select></label>
        {issueMode === "date" && <label><span>Fecha y hora UTC · UTC issue timestamp</span><input aria-label="UTC issue timestamp" type="text" inputMode="text" placeholder="2025-10-31T23:59:59Z" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /> <small>Ingresá una fecha UTC terminada en Z. La fecha de hoy no se considera válida por defecto. / Enter a UTC timestamp ending in Z. Today’s date is not assumed to be scientifically valid.</small></label>}
      </div>
      <p className="forecast-controls-note"><CircleHelp size={14} /> {evaluationState === "error" ? evaluationError : requestResult.error ?? `La solicitud cambia con cada selección. El modelo se elige con la evaluación previa al holdout; no se selecciona por resultados del holdout. / The request updates with each selection. Model selection uses pre-holdout evaluation, never holdout rankings. ${selectedModel ? `Modelo · Model: ${selectedModel}.` : "La selección requiere el archivo de evaluación. / Model selection requires the evaluation artifact."}`}</p>
      <div className="research-status-ladder" aria-label="Scientific readiness levels">
        <div><b>1 · Historical research</b><span>Available separately in Observatory</span></div><div><b>2 · Retrospective evaluation</b><span>{evaluationState === "ready" ? "Evaluation artifact loaded" : "Loading or unavailable"}</span></div><div><b>3 · Experimental prospective</b><span>Not connected</span></div><div><b>4 · Operational eligibility</b><span>{resolution?.status === "available" ? "Evidence matched" : "Not established"}</span></div>
      </div>
    </section>

    <section className="location-workspace" aria-labelledby="location-title">
      <div className="location-workspace-heading">
        <div><div className="eyebrow">CONTEXTO DEL CAMPO · FIELD CONTEXT</div><h2 id="location-title">Elegí o guardá un campo</h2></div>
        <p>El punto ayuda a encontrar una celda de análisis. No representa el lote completo ni produce una medición local. / A point identifies an analysis cell; it is not a full field boundary or field measurement.</p>
      </div>
      <SavedFieldsPanel dataset={dataset} selectedLocation={selectedLocation} fields={savedFields} activeFieldId={activeFieldId} storageWarning={storageWarning} onSelect={onFieldSelect} onAdd={onFieldAdd} onRename={onFieldRename} onDelete={onFieldDelete} />
      {dataset ? <TrendMap
        dataset={dataset}
        region="all"
        onRegionChange={() => undefined}
        selectedLocation={selectedLocation}
        savedFields={savedFields}
        activeSavedFieldId={activeFieldId}
        onLocationSelect={(point) => selectLocation(point, "map")}
        selectionMode
      /> : <div className="location-coverage-missing panel" role="status"><Database size={17} /><div><b>Validated coverage mask unavailable</b><span>Load the reviewed trend_analysis.json to enable map selection. A guessed boundary is not used.</span></div></div>}
      <div className="location-tools panel">
        <div className="location-tool-heading"><Crosshair size={16} /><div><b>Usar este dispositivo · Use this device</b><span>El navegador pide permiso solo cuando elegís el botón. / Your browser asks permission only after you select the button.</span></div></div>
        <button className="button-secondary" type="button" onClick={requestDeviceLocation}>Usar mi ubicación · Use my location</button>
        <form className="coordinate-form" onSubmit={submitManualCoordinates} noValidate>
          <label><span>Latitud · Latitude</span><input aria-label="Latitude" type="number" inputMode="decimal" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="ej. −34.00" /></label>
          <label><span>Longitud · Longitude</span><input aria-label="Longitude" type="number" inputMode="decimal" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="ej. −60.00" /></label>
          <button className="button-secondary" type="submit">Usar coordenadas · Use coordinates</button>
        </form>
        {locationError && <p className="location-feedback location-error" role="alert">{locationError}</p>}
        {locationNotice && <p className="location-feedback location-success" role="status">{locationNotice}</p>}
        {selectedLocation && <div className="selected-location-summary" aria-live="polite">
          <div><span className="eyebrow">SELECTED · {selectedLocation.source.toUpperCase()}</span><b>{formatCoordinate(selectedLocation.latitude, "latitude")} · {formatCoordinate(selectedLocation.longitude, "longitude")}</b></div>
          <span>{selectedLocation.source === "gps" ? selectedLocation.accuracyMeters === null ? "Precisión GPS no disponible · GPS-reported accuracy unavailable" : `Precisión horizontal informada por GPS ±${Math.round(selectedLocation.accuracyMeters)} m · GPS-reported horizontal accuracy ±${Math.round(selectedLocation.accuracyMeters)} m` : "La precisión GPS no aplica a esta selección · GPS accuracy not applicable"}</span>
          <button className="location-clear" type="button" onClick={() => { onLocationChange(null); setLocationError(null); setLocationNotice(null); }}>Quitar selección · Clear location</button>
        </div>}
        <p className="location-privacy-note">Los campos guardados permanecen en este navegador y dispositivo. No se envían al servicio de mapas ni a un servicio de pronóstico. La grilla de GLDAS Noah de {dataset?.resolutionDegrees ?? "0.25"}° es soporte de un modelo terrestre, no precisión GPS ni resolución de humedad observada por satélite. / Saved fields stay on this browser and device and are not sent to a forecast service. The GLDAS Noah {dataset?.resolutionDegrees ?? "0.25"}° grid spacing is model-grid support, not GPS precision or a satellite soil-moisture observation resolution.</p>
      </div>
    </section>

    <section className="farmer-reading-grid" aria-label="Lectura simple de información histórica / Plain-language historical reading">
      <article className="farmer-reading-card panel">
        <div className="eyebrow">AGUA DEL SUELO · CONTEXTO REGIONAL</div><h2>¿Más o menos agua que lo habitual?</h2>
        <p className="farmer-reading-value">{latestRegionalObservation?.anomalyMm === null || latestRegionalObservation?.anomalyMm === undefined ? "Anomalía mensual no disponible" : `${latestRegionalObservation.anomalyMm > 0 ? "+" : ""}${latestRegionalObservation.anomalyMm.toFixed(1)} mm · ${latestRegionalObservation.month.slice(0, 7)}`}</p>
        <p>{anomalyExplanation.spanish}</p><p lang="en">{anomalyExplanation.english}</p>
        {latestRegionalObservation && <p className="farmer-reading-coverage">Cobertura regional válida: {(latestRegionalObservation.coverage * 100).toFixed(1)}%. La cobertura indica cuánto del área tuvo datos válidos; no es una medida de certeza. / Valid regional area coverage; this is not a confidence measure.</p>}
        <p className="farmer-reading-coverage">Esta anomalía mensual no incluye un intervalo de incertidumbre. / No uncertainty interval is reported for this monthly anomaly.</p>
        <p className="farmer-reading-limit">Este dato resume la región pampeana: no mide este campo. No permite concluir rendimiento, daño, sequía agrícola ni una necesidad de riego. / This is a regional summary, not a measurement of this field. It cannot establish yield, damage, agricultural drought, or irrigation need.</p>
      </article>
      <article className="farmer-reading-card panel">
        <div className="eyebrow">HISTORIA DE LA CELDA · GRID-CELL HISTORY</div><h2>{activeField ? activeField.name : "Punto seleccionado"}</h2>
        <p>{selectedLocation ? cellTrendExplanation.spanish : "Elegí un punto en una celda con tendencia histórica elegible para ver una explicación de esa serie."}</p>
        <p lang="en">{selectedLocation ? cellTrendExplanation.english : "Select a point in a cell with an eligible historical trend to read its series."}</p>
        {selectedCell && <details className="farmer-science-details"><summary>Ver detalle científico · Scientific detail</summary><span>{selectedCell.slopePerDecade === null ? "Sin estimación / No estimate" : `${selectedCell.slopePerDecade.toFixed(2)} mm por década · ${dataset?.start.slice(0, 4)}–${dataset?.end.slice(0, 4)}`}</span><span>{selectedCell.ci95 ? `Intervalo HAC 95%: ${selectedCell.ci95[0].toFixed(2)} a ${selectedCell.ci95[1].toFixed(2)} mm/década` : "Intervalo HAC no disponible / HAC interval unavailable"}</span></details>}
        <p className="farmer-reading-limit">La anomalía mensual de arriba es regional. La tendencia de esta celda describe cambios históricos, no la humedad actual. / The monthly anomaly above is regional. This cell trend describes historical changes, not current moisture.</p>
      </article>
    </section>

    <section className="forecast-requirements" aria-label="Forecast evidence requirements">
      <article className="panel"><CalendarClock size={17} /><div><b>Issue-time evidence</b><span>Observed inputs and their release times must be available by the recorded issue timestamp.</span></div></article>
      <article className="panel"><AlertTriangle size={17} /><div><b>Validation before display</b><span>Chronological evaluation, calibration, uncertainty, source versions, and quality flags must be documented.</span></div></article>
    </section>
    <footer className="page-footer"><span>MONTHLY HORIZONS · 1–3 MONTHS</span><span>NO LIVE FORECASTS · NO CROP-SPECIFIC ADVICE</span><span>ALPHA AGRO · DEVELOPED BY QUANT ALPHA</span></footer>
  </>;
}
