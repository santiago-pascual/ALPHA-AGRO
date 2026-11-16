import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, BarChart3, CalendarClock, Crosshair, Database, LoaderCircle, LockKeyhole, MapPin } from "lucide-react";
import type { DashboardDataset } from "../types";
import { coordinateError, findEligibleCell, formatCoordinate, type CoordinatePoint, type LocationSource, type SelectedLocation } from "../data/location";
import { TrendMap } from "./TrendMap";
import type { ForecastTarget } from "../types/forecast";
import type { PredictiveEvaluation } from "../types/predictive";
import { buildForecastRequest, gridCellId, loadForecastArtifact, resolveForecast, selectedPreHoldoutModel, type ForecastIssueRequest, type ForecastLoad } from "../data/forecast";
import { loadPredictiveEvaluation } from "../data/loadPredictive";
import { SavedFieldsPanel } from "./SavedFieldsPanel";
import type { SavedField } from "../data/fields";
import { interpretAnomaly, interpretCellTrend, interpretForecastAnomaly, interpretLowMoistureProbability, interpretStorage } from "../data/interpretation";
import { useI18n, type TranslationKey } from "../i18n";
import { CropComparisonPanel, CropDecisionPanel } from "./CropDecisionPanel";
import { buildFarmerAnalysisRequest, CROP_CATALOG, DEFAULT_CROP_CONFIGURATION, type CropConfiguration, type FarmerAnalysisRequest } from "../data/agronomy";
import { historicalContextForForecast } from "../data/farmerAnalysis";
import { ForecastIntervalVisual } from "./ForecastIntervalVisual";
import { loadPhase8ForecastBundle, type Phase8BundleLoad } from "../data/phase8Forecast";
import { loadPhase9Interpretation } from "../data/phase9Interpretation";
import { Phase8Outlook } from "./Phase8Outlook";
import { AgriculturalAnalysis } from "./AgriculturalAnalysis";
import type { Phase9Load } from "../types/phase9";
import { loadLandContext } from "../data/loadLandContext";
import type { LandContextLoad } from "../types/landContext";

const forecastFile = "frontend/public/data/forecast_v1.json";

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
  onViewHistory: () => void;
  cropConfiguration: CropConfiguration;
  onCropConfigurationChange: (configuration: CropConfiguration) => void;
};

export function ForecastPage({ dataset, selectedLocation, onLocationChange, savedFields, activeFieldId, storageWarning, cropConfiguration = DEFAULT_CROP_CONFIGURATION, onCropConfigurationChange, onFieldSelect, onFieldAdd, onFieldRename, onFieldDelete, onViewHistory }: ForecastPageProps) {
  const { language, t, formatDate, formatNumber } = useI18n();
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<ForecastTarget>("storage");
  const [issueMode, setIssueMode] = useState<ForecastIssueRequest["issue"]["mode"]>("latest_verified_eligible");
  const [issueDate, setIssueDate] = useState("");
  const [evaluation, setEvaluation] = useState<PredictiveEvaluation | null>(null);
  const [evaluationState, setEvaluationState] = useState<"loading" | "ready" | "error">("loading");
  const [forecastState, setForecastState] = useState<ForecastLoad>({ status: "loading" });
  const [phase8State, setPhase8State] = useState<Phase8BundleLoad>({ status: "loading" });
  const [phase9State, setPhase9State] = useState<Phase9Load>({ status: "loading" });
  const [landContextState, setLandContextState] = useState<LandContextLoad>({ status: "loading" });
  const [submittedRequest, setSubmittedRequest] = useState<ForecastIssueRequest | null>(null);
  const [submittedAnalysis, setSubmittedAnalysis] = useState<FarmerAnalysisRequest | null>(null);
  const [submissionAttempted, setSubmissionAttempted] = useState(false);
  const [analysisGenerated, setAnalysisGenerated] = useState(false);
  const [submitError, setSubmitError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    let active = true;
    setEvaluationState("loading");
    loadPredictiveEvaluation().then((loadedEvaluation) => {
      if (active) { setEvaluation(loadedEvaluation); setEvaluationState("ready"); }
    }).catch(() => {
      if (active) setEvaluationState("error");
    });
    loadForecastArtifact().then((loadedForecast) => { if (active) setForecastState(loadedForecast); });
    loadPhase8ForecastBundle().then((loadedBundle) => { if (active) setPhase8State(loadedBundle); });
    loadLandContext().then((loadedContext) => { if (active) setLandContextState(loadedContext); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (phase8State.status === "loading") setPhase9State({ status: "loading" });
    else if (phase8State.status !== "ready") setPhase9State({ status: "error", message: "A validated Phase 8 bundle is required to join Phase 9 cell/month records." });
    else {
      setPhase9State({ status: "loading" });
      loadPhase9Interpretation(phase8State.bundle, phase8State.artifactSha256).then((loaded) => { if (active) setPhase9State(loaded); });
    }
    return () => { active = false; };
  }, [phase8State]);

  const retryPhase8Bundle = () => {
    setPhase8State({ status: "loading" });
    loadPhase8ForecastBundle().then(setPhase8State);
  };

  useEffect(() => { if (forecastState.status !== "loading") setIsGenerating(false); }, [forecastState.status]);

  const selectedModel = selectedPreHoldoutModel(evaluation, horizon, target);
  const selectedSeries = evaluation?.results.find((row) => row.scope === "spatial" && row.horizon_months === horizon && row.target === target);
  const selectedEventDefinition = selectedSeries?.target_definition.threshold ?? selectedSeries?.target_definition.method;
  const activeField = savedFields.find((field) => field.id === activeFieldId) ?? null;
  const requestResult = useMemo(() => {
    try {
      return { request: buildForecastRequest({ location: selectedLocation, dataset, evaluation, horizon, target, issue: issueMode === "date" ? { mode: "date", value: issueDate } : { mode: "latest_verified_eligible" } }), error: null };
    } catch (error) { return { request: null, error: error instanceof Error ? error.message : "Forecast request is invalid." }; }
  }, [selectedLocation, dataset, evaluation, horizon, target, issueMode, issueDate]);
  const requestErrorKey: TranslationKey | null = requestResult.error === "Select a field location first." ? "selectLocationError"
    : requestResult.error === "The selected point is outside the validated eligible-cell mask." ? "outsideCoverage"
    : requestResult.error?.startsWith("Latitude") ? "latitudeRange"
      : requestResult.error?.startsWith("Longitude") ? "longitudeRange"
        : requestResult.error?.startsWith("Enter finite") ? "validCoordinates"
          : requestResult.error === "Validated trend coverage is required to identify an eligible GLDAS cell." ? "coverageNeeded"
            : requestResult.error === "No matching spatial, pre-holdout model selection is available." ? "noModelSelection"
              : requestResult.error === "Choose a valid explicit UTC issue timestamp." ? "invalidIssueTimestamp" : null;
  const localizedRequestError = requestErrorKey ? t(requestErrorKey) : requestResult.error;
  const latestRegionalObservation = dataset?.series[dataset.series.length - 1] ?? null;
  const anomalyExplanation = interpretAnomaly(latestRegionalObservation?.anomalyMm ?? null);
  const selectedCell = selectedLocation && dataset ? findEligibleCell(selectedLocation, dataset.cells, dataset.resolutionDegrees) : null;
  const cellTrendExplanation = interpretCellTrend(selectedCell?.slopePerDecade ?? null);
  const requestedResolution = submittedRequest && forecastState.status === "ready" ? resolveForecast(submittedRequest, forecastState.artifact) : null;
  const requestedPlainLanguage = requestedResolution?.status === "available"
    ? requestedResolution.artifact.target === "low_moisture"
      ? interpretLowMoistureProbability(requestedResolution.artifact.value, selectedEventDefinition)
      : requestedResolution.artifact.target === "anomaly"
        ? interpretForecastAnomaly(requestedResolution.artifact.value)
        : interpretStorage()
    : null;
  const requestedDisplay = requestedResolution?.status === "available" && requestedPlainLanguage ? requestedResolution : null;
  const historicalContext = requestedDisplay ? historicalContextForForecast(dataset, requestedDisplay.artifact) : null;
  const seasonalReference = historicalContext?.seasonalStorageReferenceMm;

  useEffect(() => {
    setSubmittedRequest(null);
    setSubmissionAttempted(false);
    setSubmitError(null);
    setSubmittedAnalysis(null);
    setAnalysisGenerated(false);
  }, [selectedLocation?.latitude, selectedLocation?.longitude, horizon, target, issueMode, issueDate, cropConfiguration.crop, cropConfiguration.growthStage, cropConfiguration.waterManagement]);

  const generateForecast = () => {
    setSubmissionAttempted(true);
    setSubmittedRequest(null);
    setSubmitError(null);
    if (!selectedLocation) { setSubmitError("selectLocationError"); return; }
    if (![1, 2, 3].includes(horizon)) { setSubmitError("selectHorizonError"); return; }
    if (!("storage anomaly low_moisture".split(" ")).includes(target)) { setSubmitError("selectTargetError"); return; }
    const selectedCellForRequest = selectedLocation && dataset ? findEligibleCell(selectedLocation, dataset.cells, dataset.resolutionDegrees) : null;
    try { setSubmittedAnalysis(buildFarmerAnalysisRequest({
      location: selectedLocation,
      gridCellId: selectedCellForRequest && dataset ? gridCellId(selectedCellForRequest, dataset.resolutionDegrees) : null,
      horizon,
      target,
      issue: issueMode === "date" ? { mode: "date", value: issueDate } : { mode: "latest_verified_eligible" },
      cropContext: cropConfiguration,
      physicalForecastRequest: requestResult.request,
    })); }
    catch { setSubmitError("invalidRequest"); return; }
    if (!requestResult.request) { setSubmitError(requestErrorKey ?? "invalidRequest"); return; }
    setSubmittedRequest(requestResult.request);
  };

  const selectLocation = (point: CoordinatePoint, source: LocationSource, accuracyMeters: number | null = null) => {
    const invalid = coordinateError(point);
    if (invalid) {
      setLocationError(invalid.startsWith("Enter finite") ? t("validCoordinates") : invalid.startsWith("Latitude") ? t("latitudeRange") : invalid.startsWith("Longitude") ? t("longitudeRange") : invalid);
      setLocationNotice(null);
      return;
    }
    onLocationChange({ ...point, source, accuracyMeters });
    const eligibleCell = dataset ? findEligibleCell(point, dataset.cells, dataset.resolutionDegrees) : null;
    setLocationError(dataset && !eligibleCell ? t("outsideCoverageDetail") : null);
    setLocationNotice(eligibleCell ? t("selectedInCoverage") : t("selectedNoForecastCoverage"));
  };

  const submitManualCoordinates = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const latText = latitude.trim();
    const lonText = longitude.trim();
    if (!latText || !lonText) {
      setLocationError(t("enterBothCoordinates"));
      setLocationNotice(null);
      return;
    }
    selectLocation({ latitude: Number(latText), longitude: Number(lonText) }, "manual");
  };

  const submitLocationSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const match = locationSearch.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      setLocationError(t("geocoderUnavailable"));
      setLocationNotice(null);
      return;
    }
    const point = { latitude: Number(match[1]), longitude: Number(match[2]) };
    setLatitude(String(point.latitude));
    setLongitude(String(point.longitude));
    selectLocation(point, "manual");
  };

  const requestDeviceLocation = () => {
    setLocationError(null);
    setLocationNotice(null);
    if (!navigator.geolocation) {
      setLocationError(t("geoUnavailable"));
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
        void message;
        setLocationError(error.code === error.PERMISSION_DENIED ? t("permissionDenied") : error.code === error.POSITION_UNAVAILABLE ? t("geoPositionUnavailable") : error.code === error.TIMEOUT ? t("geoTimeout") : t("geoFailure"));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  return <>
    <section className="page-intro forecast-intro">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> {language === "es" ? "TU CAMPO" : "YOUR FIELD"}</div>
        <h1>{language === "es" ? "Análisis del campo" : "Field analysis"}</h1>
        <p>{language === "es" ? "Elegí ubicación, cultivo y período." : "Choose a location, crop, and period."}</p>
      </div>
    </section>

    <section className="location-workspace" aria-labelledby="location-title">
      <div className="location-workspace-heading">
        <div><div className="eyebrow">{language === "es" ? "CONTEXTO DEL CAMPO" : "FIELD CONTEXT"}</div><h2 id="location-title">{t("selectLocation")}</h2></div>
      </div>
      <SavedFieldsPanel dataset={dataset} selectedLocation={selectedLocation} fields={savedFields} activeFieldId={activeFieldId} storageWarning={storageWarning} onSelect={onFieldSelect} onAdd={onFieldAdd} onRename={onFieldRename} onDelete={onFieldDelete} />
      <form className="location-search-form panel" onSubmit={submitLocationSearch}>
        <label htmlFor="field-location-search">{t("searchLocationLabel")}</label>
        <div><MapPin size={16} aria-hidden="true" /><input id="field-location-search" value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} placeholder={t("coordinateSearchPlaceholder")} autoComplete="off" /><button type="submit">{t("searchLocation")}</button></div>
      </form>
      {dataset ? <TrendMap
        dataset={dataset}
        region="all"
        onRegionChange={() => undefined}
        selectedLocation={selectedLocation}
        savedFields={savedFields}
        activeSavedFieldId={activeFieldId}
        onLocationSelect={(point) => selectLocation(point, "map")}
        selectionMode
      /> : <div className="location-coverage-missing panel" role="status"><Database size={17} /><div><b>{t("coverageUnavailable")}</b><span>{t("coverageUnavailableDetail")}</span></div></div>}
      <div className="location-tools panel">
        <div className="location-tool-heading"><Crosshair size={16} /><div><b>{language === "es" ? "Ubicarme" : "Use my location"}</b></div></div>
        <button className="button-secondary" type="button" onClick={requestDeviceLocation}>{t("useMyLocation")}</button>
        <form className="coordinate-form" onSubmit={submitManualCoordinates} noValidate>
          <label><span>{t("latitude")}</span><input aria-label={t("latitude")} type="number" inputMode="decimal" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="−34.00" /></label>
          <label><span>{t("longitude")}</span><input aria-label={t("longitude")} type="number" inputMode="decimal" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="−60.00" /></label>
          <button className="button-secondary" type="submit">{t("useCoordinates")}</button>
        </form>
        {locationError && <p className="location-feedback location-error" role="alert">{locationError}</p>}
        {locationNotice && <p className="location-feedback location-success" role="status">{locationNotice}</p>}
        {selectedLocation && <div className="selected-location-summary" aria-live="polite">
          <div><span className="eyebrow">SELECTED · {selectedLocation.source.toUpperCase()}</span><b>{formatCoordinate(selectedLocation.latitude, "latitude")} · {formatCoordinate(selectedLocation.longitude, "longitude")}</b></div>
          <span>{selectedLocation.source === "gps" ? selectedLocation.accuracyMeters === null ? (language === "es" ? "Precisión GPS no disponible" : "GPS accuracy unavailable") : `${t("gpsAccuracyValue")}${Math.round(selectedLocation.accuracyMeters)} m` : (language === "es" ? "La precisión GPS no aplica a esta selección" : "GPS accuracy does not apply to this selection")}</span>
          <button className="location-clear" type="button" onClick={() => { onLocationChange(null); setLocationError(null); setLocationNotice(null); }}>{t("clearLocation")}</button>
        </div>}
        <details className="location-privacy-note"><summary>{language === "es" ? "Privacidad y precisión" : "Privacy and map accuracy"}</summary><p>{language === "es" ? `La ubicación queda en este dispositivo. La precisión GPS describe el posicionamiento; ${dataset?.resolutionDegrees ?? "0.25"}° es el soporte de grilla del modelo GLDAS, no la precisión GPS ni una medición del lote.` : `Your location stays on this device. GPS accuracy describes positioning; ${dataset?.resolutionDegrees ?? "0.25"}° — GLDAS grid spacing is model-grid support, not GPS precision or satellite soil-moisture observation resolution.`}</p></details>
      </div>
    </section>

    <CropDecisionPanel configuration={cropConfiguration} onChange={onCropConfigurationChange} />

    <section className="farmer-analysis-launch" aria-label={language === "es" ? "Generar análisis del campo" : "Generate field analysis"}>
      <button type="button" className="button-primary forecast-generate" onClick={() => setAnalysisGenerated(true)} disabled={!selectedLocation}>
        <BarChart3 size={17} aria-hidden="true" />{language === "es" ? "Generar análisis" : "Generate analysis"}<ArrowRight size={16} aria-hidden="true" />
      </button>
      {!selectedLocation && <span>{language === "es" ? "Elegí primero la ubicación del campo." : "Select a field location first."}</span>}
    </section>
    {analysisGenerated && <AgriculturalAnalysis phase8={phase8State} phase9={phase9State} landContext={landContextState} historical={dataset} location={selectedLocation} crop={cropConfiguration} language={language} formatNumber={formatNumber} onChooseCrop={(crop) => onCropConfigurationChange({ ...cropConfiguration, crop })} />}

    <section className="forecast-setup panel" aria-labelledby="forecast-setup-title">
      <div className="panel-heading"><div><div className="eyebrow">{t("requestCell")}</div><h2 id="forecast-setup-title">{t("forecastSetup")}</h2></div></div>
      <div className="forecast-controls">
        <label><span>{t("location")}</span><div className="forecast-fixed-field"><MapPin size={14} /> {selectedLocation ? requestResult.request ? `${activeField?.name ? `${activeField.name} · ` : ""}GLDAS cell · ${requestResult.request.grid_cell_id}` : `${formatCoordinate(selectedLocation.latitude, "latitude")} · ${formatCoordinate(selectedLocation.longitude, "longitude")} · ${localizedRequestError ?? t("checking")}` : language === "es" ? "Pampas argentinas · elegí un punto" : "Argentine Pampas · select a point"}</div></label>
        <label><span>{t("horizon")}</span><select aria-label={t("horizon")} value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 1 | 2 | 3)}><optgroup label={t("shortTermTrack")}><option value="14d" disabled>{t("months14")} — {t("shortTermUnavailable")}</option><option value="28d" disabled>{t("months28")} — {t("shortTermUnavailable")}</option></optgroup><optgroup label={t("monthlyTrack")}><option value="1">{t("oneMonth")}</option><option value="2">{t("twoMonths")}</option><option value="3">{t("threeMonths")}</option></optgroup></select></label>
        <label><span>{t("target")}</span><select aria-label={t("target")} value={target} onChange={(event) => setTarget(event.target.value as ForecastTarget)}><option value="storage">{t("storage")} (mm)</option><option value="anomaly" disabled>{t("anomaly")} · {t("notAvailable")}</option><option value="low_moisture" disabled>{t("lowMoisture")} · {t("notAvailable")}</option></select></label>
        <label><span>{t("model")}</span><div className="forecast-fixed-field">{evaluationState === "loading" ? t("loading") : selectedModel ? `${selectedModel} · ${language === "es" ? "elegido antes del período reservado" : "selected before holdout"}` : (language === "es" ? "Sin configuración de evaluación" : "No matching evaluation configuration")}</div></label>
        <label><span>{t("issueTime")}</span><select aria-label={t("issueTime")} value={issueMode} onChange={(event) => setIssueMode(event.target.value as ForecastIssueRequest["issue"]["mode"])}><option value="latest_verified_eligible">{language === "es" ? "Última fecha elegible verificada" : "Latest verified eligible date"}</option><option value="date">{language === "es" ? "Elegir fecha UTC" : "Choose UTC issue time"}</option></select></label>
        {issueMode === "date" && <label><span>{language === "es" ? "Fecha y hora UTC" : "UTC issue timestamp"}</span><input aria-label={language === "es" ? "Fecha y hora de emisión UTC" : "UTC issue timestamp"} type="text" inputMode="text" placeholder="2025-10-31T23:59:59Z" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /> <small>{language === "es" ? "Ingresá una fecha UTC terminada en Z. La fecha de hoy no se considera válida por defecto." : "Enter a UTC timestamp ending in Z. Today’s date is not assumed to be scientifically valid."}</small></label>}
      </div>
      <details className="forecast-readiness"><summary>{language === "es" ? "Método y estado de investigación" : "Method and research status"}</summary>
      <p className="forecast-controls-note">{language === "es" ? "Solo se muestran resultados validados." : "Only validated results are shown."}</p>
      <div className="research-status-ladder" aria-label={language === "es" ? "Niveles de preparación científica" : "Scientific readiness levels"}>
        <div><b>1 · {language === "es" ? "Investigación histórica" : "Historical research"}</b><span>{language === "es" ? "Disponible en el Observatorio" : "Available in Observatory"}</span></div><div><b>2 · {language === "es" ? "Evaluación retrospectiva" : "Retrospective evaluation"}</b><span>{evaluationState === "ready" ? (language === "es" ? "Artefacto de evaluación cargado" : "Evaluation artifact loaded") : (language === "es" ? "Cargando o no disponible" : "Loading or unavailable")}</span></div><div><b>3 · {language === "es" ? "Investigación prospectiva experimental" : "Experimental prospective"}</b><span>{phase8State.status === "ready" ? (language === "es" ? "Bundle experimental validado · no operativo" : "Experimental bundle validated · not operational") : phase8State.status === "loading" ? t("loading") : (language === "es" ? "Artefacto no disponible" : "Artifact unavailable")}</span></div><div><b>4 · {language === "es" ? "Elegibilidad operativa" : "Operational eligibility"}</b><span>{requestedResolution?.status === "available" ? (language === "es" ? "Evidencia verificada" : "Evidence matched") : (language === "es" ? "No establecida" : "Not established")}</span></div>
      </div>
      </details>
      <details className="operational-forecast-request"><summary>{language === "es" ? "Comprobar pronóstico operativo validado" : "Check for a validated operational forecast"}</summary>
        <p>{language === "es" ? "El análisis histórico y la perspectiva experimental no son pronósticos operativos." : "Historical analysis and the experimental outlook are not operational forecasts."}</p>
        <button type="button" className="button-secondary" onClick={() => { setIsGenerating(!!requestResult.request && forecastState.status === "loading"); generateForecast(); }} disabled={isGenerating} aria-busy={isGenerating}>{isGenerating ? <LoaderCircle className="forecast-generate-spinner" size={17} aria-hidden="true" /> : <BarChart3 size={17} aria-hidden="true" />}{isGenerating ? t("generating") : t("generateForecast")}<ArrowRight size={16} aria-hidden="true" /></button>
      </details>
    </section>

    <Phase8Outlook state={phase8State} phase9State={phase9State} horizon={horizon} onHorizonChange={setHorizon} selectedLocation={selectedLocation} fieldName={activeField?.name ?? null} cropName={CROP_CATALOG.find((crop) => crop.id === cropConfiguration.crop)?.name[language] ?? cropConfiguration.crop} growthStageName={t(cropConfiguration.growthStage)} waterManagementName={t(cropConfiguration.waterManagement)} target={target} onRetry={retryPhase8Bundle} language={language} formatDate={formatDate} formatNumber={formatNumber} />

    {submissionAttempted && <section className="forecast-unavailable panel forecast-results" aria-labelledby="forecast-unavailable-title" aria-live="polite">
      <div className="forecast-unavailable-icon"><LockKeyhole size={19} /></div>
      <div>
        <div className="eyebrow">{t("forecastResults")}</div>
        <h2 id="forecast-unavailable-title">{requestedDisplay ? (language === "es" ? `Pronóstico validado · ${activeField?.name ?? "ubicación seleccionada"}` : `Validated forecast · ${activeField?.name ?? "Selected location"}`) : t("forecastMissing")}</h2>
        <p>{submitError ? t(submitError) : requestedDisplay ? (language === "es" ? "Estimación científica para el período indicado. No describe una medición dentro del lote ni garantiza resultados agrícolas." : "Scientific estimate for the selected period. It is not a measurement within the field and does not guarantee agricultural outcomes.") : forecastState.status === "loading" ? t("generating") : forecastState.status === "error" ? t("artifactInvalid") : requestedResolution?.status === "unavailable" ? requestedResolution.reason : (language === "es" ? t("forecastMissingEs") : t("forecastMissing")) + " " + t("noFallback")}</p>
        <details className="forecast-artifact-path"><summary>{language === "es" ? "Origen del artefacto" : "Artifact source"}</summary><div className="forecast-file-path"><Database size={14} /><code>{forecastFile}</code></div></details>
        {submittedAnalysis && <div className="farmer-request-summary" role="status"><b>{t("analysisRequest")}</b><span>{activeField?.name ?? (language === "es" ? "Ubicación seleccionada" : "Selected location")} · {formatCoordinate(submittedAnalysis.selection.latitude, "latitude")} · {formatCoordinate(submittedAnalysis.selection.longitude, "longitude")}{submittedAnalysis.selection.grid_cell_id ? ` · ${submittedAnalysis.selection.grid_cell_id}` : ""}</span><span>{CROP_CATALOG.find((crop) => crop.id === submittedAnalysis.crop_context.crop)?.name[language]} · {t(submittedAnalysis.crop_context.growthStage)} · {t(submittedAnalysis.crop_context.waterManagement)}</span><small>{t("cropNeutralForecast")}; {t("insufficientEvidence")} {language === "es" ? "para interpretar aptitud del cultivo." : "for crop-specific interpretation."}</small></div>}
        {requestedDisplay && <>
          <div className="farmer-result-summary" aria-label={t("cropAndManagement")}>
            <article><span>{t("cropAndManagement")}</span><b>{CROP_CATALOG.find((crop) => crop.id === cropConfiguration.crop)?.name[language]} · {t(cropConfiguration.growthStage)} · {t(cropConfiguration.waterManagement)}</b></article>
            <article><span>{t("targetMonthCard")}</span><b>{requestedDisplay.artifact.target_month} · {requestedDisplay.artifact.horizon_months} {language === "es" ? "meses" : "months"}</b></article>
            <article><span>{t("forecastValueCard")}</span><b>{requestedDisplay.artifact.target === "low_moisture" ? `${formatNumber(requestedDisplay.artifact.value * 100, { maximumFractionDigits: 1 })}%` : `${formatNumber(requestedDisplay.artifact.value, { maximumFractionDigits: 1 })} ${requestedDisplay.artifact.units}`}</b></article>
          </div>
          <p className="crop-context-note">{language === "es" ? "Contexto general; no hay una recomendación validada para este cultivo." : "General context; no validated recommendation is available for this crop."}</p>
          <details className="farmer-history-details"><summary>{language === "es" ? "Ver contexto histórico" : "View historical context"}</summary>
          <div className="farmer-result-context">
            <article className="panel"><span>{t("latestObservationLabel")}</span><b>{historicalContext?.latestObservation ? `${formatNumber(historicalContext.latestObservation.storageMm!, { maximumFractionDigits: 1 })} mm · ${historicalContext.latestObservation.month.slice(0, 7)}` : t("notAvailable")}</b><small>{historicalContext?.latestObservation?.anomalyMm !== null && historicalContext?.latestObservation?.anomalyMm !== undefined ? `${t("anomaly")}: ${formatNumber(historicalContext.latestObservation.anomalyMm, { maximumFractionDigits: 1 })} mm` : t("noMonthlyValues")}. {t("noFieldMeasurement")}</small></article>
            <article className="panel"><span>{t("seasonalReferenceLabel")}</span><b>{seasonalReference === null || seasonalReference === undefined ? t("noSeasonalReference") : `${formatNumber(seasonalReference, { maximumFractionDigits: 1 })} mm · n=${historicalContext?.seasonalReferenceCount ?? 0}`}</b><small>{t("seasonalReferenceNote")}</small></article>
            <article className="panel"><span>{t("spatialContextLabel")}</span><b>{selectedLocation ? `${formatCoordinate(selectedLocation.latitude, "latitude")} · ${formatCoordinate(selectedLocation.longitude, "longitude")}` : "—"}</b><small>{selectedCell?.slopePerDecade === null || !selectedCell ? t("notAvailable") : `${t("gridTrendLabel")}: ${formatNumber(selectedCell.slopePerDecade, { maximumFractionDigits: 2 })} mm / ${language === "es" ? "década" : "decade"}`}</small></article>
          </div>
          </details>
          <article className="farmer-forecast-reading" aria-labelledby="forecast-reading-title">
            <div className="eyebrow">{language === "es" ? "LECTURA SENCILLA" : "PLAIN-LANGUAGE READING"}</div>
            <h3 id="forecast-reading-title">{requestedDisplay.artifact.target === "low_moisture" ? `${language === "es" ? "Probabilidad estimada" : "Estimated probability"}: ${formatNumber(requestedDisplay.artifact.value * 100, { maximumFractionDigits: 1 })}%` : `${language === "es" ? "Valor estimado" : "Estimated value"}: ${formatNumber(requestedDisplay.artifact.value, { maximumFractionDigits: 1 })} ${requestedDisplay.artifact.units}`}</h3>
            <p>{language === "es" ? requestedPlainLanguage?.spanish : requestedPlainLanguage?.english}</p>
            {requestedDisplay.artifact.target === "low_moisture" && selectedEventDefinition && <p className="forecast-event-definition">{language === "es" ? "Evento definido por la investigación" : "Research-defined event"}: {selectedEventDefinition}</p>}
            {requestedDisplay.artifact.target === "low_moisture" && <p className="forecast-event-definition">{language === "es" ? "El artefacto no informa un intervalo predictivo para esta probabilidad." : "The artifact does not report a prediction interval for this probability."}</p>}
            <p>{language === "es" ? "No es una recomendación de manejo." : "This is not management advice."}</p>
          </article>
          <ForecastIntervalVisual artifact={requestedDisplay.artifact} valueLabel={t("predictedValue")} intervalLabel={t("interval")} formatNumber={formatNumber} language={language} />
          <details className="forecast-scientific-details"><summary>{language === "es" ? "Detalles científicos" : "Scientific details"}</summary><dl className="phase7-metrics" aria-label={language === "es" ? "Detalles científicos del pronóstico" : "Forecast scientific details"}>
            <div><dt>{t("location")}</dt><dd>{activeField?.name ?? submittedRequest?.grid_cell_id ?? "—"}</dd></div>
            <div><dt>{t("issueDate")} / {t("targetPeriod")}</dt><dd>{formatDate(requestedDisplay.artifact.issue_time, { dateStyle: "medium", timeStyle: "short" })} UTC → {requestedDisplay.artifact.target_month}</dd></div>
            <div><dt>{t("horizon")} / {t("model")}</dt><dd>{requestedDisplay.artifact.horizon_months} {language === "es" ? "meses" : "months"} · {requestedDisplay.artifact.model.name} {requestedDisplay.artifact.model.version}</dd></div>
            <div><dt>{language === "es" ? "Corte de observaciones" : "Observation cutoff"}</dt><dd>{requestedDisplay.artifact.input_observation_cutoff}</dd></div>
            {requestedDisplay.artifact.predictive_interval && <div><dt>{t("interval")} ({Math.round(requestedDisplay.artifact.predictive_interval.level * 100)}%)</dt><dd>{requestedDisplay.artifact.predictive_interval.lower}–{requestedDisplay.artifact.predictive_interval.upper} mm · {requestedDisplay.artifact.predictive_interval.method}</dd></div>}
            <div><dt>{t("provenance")}</dt><dd>{requestedDisplay.artifact.source.collection} · {requestedDisplay.artifact.source.doi}</dd></div>
            <div><dt>{language === "es" ? "Calibración" : "Calibration"}</dt><dd>{requestedDisplay.artifact.calibration.start} — {requestedDisplay.artifact.calibration.end} · n={requestedDisplay.artifact.calibration.n_months}</dd></div>
            <div><dt>{language === "es" ? "Evidencia y archivos" : "Evidence & inputs"}</dt><dd>{requestedDisplay.artifact.availability.publication_evidence && typeof requestedDisplay.artifact.availability.publication_evidence.asset_id === "string" ? requestedDisplay.artifact.availability.publication_evidence.asset_id : "—"} · {requestedDisplay.artifact.availability.input_months.length} {language === "es" ? "meses de entrada" : "input months"} · SHA-256 {requestedDisplay.artifact.source.input_panel_sha256}</dd></div>
            <div><dt>{language === "es" ? "Comparación con línea base" : "Baseline comparison"}</dt><dd>{t("baselineSkillUnavailable")}</dd></div>
          </dl></details>
        </>}
        {!requestedDisplay && <div className="forecast-result-actions"><button type="button" className="button-secondary" onClick={onViewHistory}>{t("historicalAction")}</button><span>{t("noFallback")}</span></div>}
      </div>
    </section>}

    {submissionAttempted && <details className="crop-comparison-disclosure"><summary>{language === "es" ? "Comparar contexto de cultivos" : "Compare crop context"}</summary><CropComparisonPanel configuration={cropConfiguration} physicalForecastAvailable={!!requestedDisplay} /></details>}

    <details className="farmer-history-details"><summary>{language === "es" ? "Contexto histórico" : "Historical context"}</summary><section className="farmer-reading-grid" aria-label={language === "es" ? "Lectura simple de información histórica" : "Plain-language historical reading"}>
      <article className="farmer-reading-card panel">
        <div className="eyebrow">{language === "es" ? "AGUA DEL SUELO · CONTEXTO REGIONAL" : "SOIL WATER · REGIONAL CONTEXT"}</div><h2>{language === "es" ? "¿Más o menos agua que lo habitual?" : "More or less water than usual?"}</h2>
        <p className="farmer-reading-value">{latestRegionalObservation?.anomalyMm === null || latestRegionalObservation?.anomalyMm === undefined ? (language === "es" ? "Anomalía mensual no disponible" : "Monthly anomaly unavailable") : `${latestRegionalObservation.anomalyMm > 0 ? "+" : ""}${formatNumber(latestRegionalObservation.anomalyMm, { maximumFractionDigits: 1 })} mm · ${latestRegionalObservation.month.slice(0, 7)}`}</p>
        <p>{language === "es" ? anomalyExplanation.spanish : anomalyExplanation.english}</p>
        {latestRegionalObservation && <p className="farmer-reading-coverage">{language === "es" ? `Cobertura regional válida: ${formatNumber(latestRegionalObservation.coverage * 100, { maximumFractionDigits: 1 })}%. Indica cuánto del área tuvo datos válidos; no mide certeza.` : `Valid regional area coverage: ${formatNumber(latestRegionalObservation.coverage * 100, { maximumFractionDigits: 1 })}%. It indicates the share of the area with valid data, not confidence.`}</p>}
        <p className="farmer-reading-coverage">{language === "es" ? "Esta anomalía mensual no incluye un intervalo de incertidumbre." : "No uncertainty interval is reported for this monthly anomaly."}</p>
        <p className="farmer-reading-limit">{language === "es" ? "Este dato resume la región pampeana: no mide este campo. No permite concluir rendimiento, daño, sequía agrícola ni necesidad de riego." : "This is a regional summary, not a measurement of this field. It cannot establish yield, damage, agricultural drought, or irrigation need."}</p>
      </article>
      <article className="farmer-reading-card panel">
        <div className="eyebrow">{language === "es" ? "HISTORIAL DE LA CELDA" : "GRID-CELL HISTORY"}</div><h2>{activeField ? activeField.name : language === "es" ? "Punto seleccionado" : "Selected point"}</h2>
        <p>{selectedLocation ? language === "es" ? cellTrendExplanation.spanish : cellTrendExplanation.english : language === "es" ? "Elegí un punto en una celda con tendencia histórica elegible para leer esa serie." : "Select a point in a cell with an eligible historical trend to read its series."}</p>
        {selectedCell && <details className="farmer-science-details"><summary>{language === "es" ? "Ver detalle científico" : "View scientific detail"}</summary><span>{selectedCell.slopePerDecade === null ? t("noEstimate") : `${formatNumber(selectedCell.slopePerDecade, { maximumFractionDigits: 2 })} mm / ${language === "es" ? "década" : "decade"} · ${dataset?.start.slice(0, 4)}–${dataset?.end.slice(0, 4)}`}</span><span>{selectedCell.ci95 ? `${language === "es" ? "Intervalo HAC del 95%" : "95% HAC interval"}: ${formatNumber(selectedCell.ci95[0], { maximumFractionDigits: 2 })}–${formatNumber(selectedCell.ci95[1], { maximumFractionDigits: 2 })} mm/${language === "es" ? "década" : "decade"}` : language === "es" ? "Intervalo HAC no disponible" : "HAC interval unavailable"}</span></details>}
        <p className="farmer-reading-limit">{language === "es" ? "La anomalía mensual es regional. La tendencia de esta celda describe cambios históricos, no la humedad actual." : "The monthly anomaly is regional. This cell trend describes historical changes, not current moisture."}</p>
      </article>
    </section></details>

    <details className="forecast-readiness"><summary>{language === "es" ? "Qué requiere un pronóstico operativo" : "What an operational forecast requires"}</summary><section className="forecast-requirements" aria-label={language === "es" ? "Requisitos de evidencia para el pronóstico" : "Forecast evidence requirements"}>
      <article className="panel"><CalendarClock size={17} /><div><b>{language === "es" ? "Evidencia a la fecha de emisión" : "Issue-time evidence"}</b><span>{language === "es" ? "Los datos y sus fechas de publicación deben estar disponibles antes del momento de emisión registrado." : "Observed inputs and their release times must be available by the recorded issue timestamp."}</span></div></article>
      <article className="panel"><AlertTriangle size={17} /><div><b>{language === "es" ? "Validación antes de mostrar" : "Validation before display"}</b><span>{language === "es" ? "Deben documentarse la evaluación cronológica, calibración, incertidumbre, versiones de fuentes y controles de calidad." : "Chronological evaluation, calibration, uncertainty, source versions, and quality flags must be documented."}</span></div></article>
    </section></details>
    <footer className="page-footer"><span>{language === "es" ? "HORIZONTES MENSUALES · 1–3 MESES" : "MONTHLY HORIZONS · 1–3 MONTHS"}</span><span>{language === "es" ? "SIN PRONÓSTICOS EN VIVO · SIN CONSEJOS POR CULTIVO" : "NO LIVE FORECASTS · NO CROP-SPECIFIC ADVICE"}</span><span>ALPHA AGRO · {language === "es" ? "DESARROLLADO POR QUANT ALPHA" : "DEVELOPED BY QUANT ALPHA"}</span></footer>
  </>;
}
