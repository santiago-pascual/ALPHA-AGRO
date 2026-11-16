import { useState } from "react";
import { AlertTriangle, Database, RefreshCw } from "lucide-react";
import type { Phase8BundleLoad } from "../data/phase8Forecast";
import { phase8ForecastForHorizon, resolvePhase8Metric } from "../data/phase8Forecast";
import type { CoordinatePoint } from "../data/location";
import type { Language } from "../i18n";
import type { ForecastTarget } from "../types/forecast";
import type { Phase9Load } from "../types/phase9";
import { Phase9ContextPanel } from "./Phase9ContextPanel";

type Props = {
  state: Phase8BundleLoad;
  phase9State: Phase9Load;
  horizon: 1 | 2 | 3;
  onHorizonChange: (horizon: 1 | 2 | 3) => void;
  selectedLocation: CoordinatePoint | null;
  fieldName: string | null;
  cropName: string;
  growthStageName: string;
  waterManagementName: string;
  target: ForecastTarget;
  onRetry: () => void;
  language: Language;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};
const filePath = "frontend/public/data/phase8_forecast_bundle_v1.json";

export function Phase8Outlook({ state, phase9State, horizon, onHorizonChange, selectedLocation, fieldName, cropName, growthStageName, waterManagementName, target, onRetry, language, formatDate, formatNumber }: Props) {
  const es = language === "es";
  const [scope, setScope] = useState<"regional" | "spatial">("regional");
  const [view, setView] = useState<"farmer" | "research">("farmer");
  const dateLabel = (month: string) => new Intl.DateTimeFormat(es ? "es-AR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T00:00:00Z"));
  const selected = state.status === "ready" ? phase8ForecastForHorizon(state.bundle, horizon) : null;
  const currentMetric = state.status === "ready" ? resolvePhase8Metric(state.bundle, horizon, scope, selectedLocation, target) : null;
  const metricName = target === "storage" ? (es ? "Almacenamiento de agua en el suelo" : "Soil-water storage") : target === "anomaly" ? (es ? "Anomalía de humedad del suelo" : "Soil-moisture anomaly") : (es ? "Probabilidad de humedad baja" : "Low-moisture probability");
  const explanation = target === "storage"
    ? (es ? "El almacenamiento representa agua modelada en los primeros 100 cm del suelo; no es lluvia prevista ni una medición directa del lote." : "Storage represents modeled water in the upper 100 cm of soil; it is not expected rainfall or a direct field measurement.")
    : target === "anomaly"
      ? (es ? "No disponible: esta perspectiva usa climatología estacional y no estima una anomalía dinámica. El valor anomaly_mm igual a cero es parte de la referencia, no una predicción." : "Not scientifically available: this seasonal-climatology outlook does not estimate a dynamic anomaly. Its zero anomaly_mm value is part of the reference construction, not a prediction.")
      : (es ? "No disponible: el artefacto no define un umbral de humedad baja ni contiene probabilidades calibradas para ese evento." : "Not scientifically available: the artifact defines no low-moisture threshold and contains no calibrated probability for that event.");

  return <section className="phase8-outlook panel" aria-labelledby="phase8-outlook-title">
    <div className="phase8-heading">
      <div><div className="eyebrow">{es ? "INVESTIGACIÓN PHASE 8" : "PHASE 8 RESEARCH"}</div><h2 id="phase8-outlook-title">{es ? "Perspectiva de agua en el suelo" : "Soil-water outlook"}</h2></div>
      <span className="phase8-status"><span aria-hidden="true">●</span> {es ? "EXPERIMENTAL · NO OPERATIVO" : "EXPERIMENTAL · NOT OPERATIONAL"}</span>
    </div>
    <div className="phase8-view-switch" role="group" aria-label={es ? "Presentación de resultados" : "Results presentation"}>
      <button type="button" aria-pressed={view === "farmer"} onClick={() => setView("farmer")}>{es ? "Vista productor" : "Farmer view"}</button>
      <button type="button" aria-pressed={view === "research"} onClick={() => setView("research")}>{es ? "Vista de investigación" : "Research view"}</button>
    </div>
    {state.status === "loading" && <div className="phase8-state" role="status">{es ? "Cargando y validando el bundle Phase 8…" : "Loading and validating the Phase 8 bundle…"}</div>}
    {(state.status === "missing" || state.status === "error") && <div className="phase8-state phase8-state-alert" role={state.status === "error" ? "alert" : "status"}>
      <AlertTriangle size={17} aria-hidden="true" /><div><b>{state.status === "missing" ? (es ? "Artefacto experimental no instalado" : "Experimental artifact not installed") : (es ? "No se pudo validar el artefacto" : "Artifact could not be validated")}</b><span>{state.message}</span><code>{filePath}</code></div><button className="button-secondary" type="button" onClick={onRetry}><RefreshCw size={14} />{es ? "Reintentar" : "Retry"}</button>
    </div>}

    {state.status === "ready" && selected && view === "farmer" && <>
      <div className="phase8-farmer-context">
        <article><span>{es ? "CAMPO" : "FIELD"}</span><b>{fieldName || (selectedLocation ? formatNumber(selectedLocation.latitude, { maximumFractionDigits: 4 }) + ", " + formatNumber(selectedLocation.longitude, { maximumFractionDigits: 4 }) : (es ? "Sin punto" : "No field selected"))}</b></article>
        <article><span>{es ? "CULTIVO Y ETAPA" : "CROP AND STAGE"}</span><b>{cropName} · {growthStageName}</b><small>{waterManagementName}</small></article>
      </div>
      <div className="phase8-controls">
        <div className="phase8-horizons" role="group" aria-label={es ? "Horizonte mensual" : "Monthly horizon"}>{([1, 2, 3] as const).map((n) => <button key={n} type="button" aria-pressed={horizon === n} onClick={() => onHorizonChange(n)}>{dateLabel(state.bundle.temporal_convention.target_months[n - 1])}</button>)}</div>
        <div className="phase8-scope" role="group" aria-label={es ? "Alcance espacial" : "Spatial scope"}><button type="button" aria-pressed={scope === "regional"} onClick={() => setScope("regional")}>{es ? "Regional" : "Regional"}</button><button type="button" aria-pressed={scope === "spatial"} onClick={() => setScope("spatial")}>{es ? "Mi celda GLDAS" : "My GLDAS cell"}</button></div>
      </div>
      <div className="phase8-month-cards" aria-label={es ? "Perspectiva mensual experimental" : "Experimental monthly outlook"}>
        {state.bundle.regional_forecasts.map((regional, index) => {
          const monthHorizon = (index + 1) as 1 | 2 | 3;
          const result = resolvePhase8Metric(state.bundle, monthHorizon, scope, selectedLocation, target);
          return <button className="phase8-month-card" key={regional.target_month} type="button" aria-pressed={horizon === monthHorizon} onClick={() => onHorizonChange(monthHorizon)}>
            <span className="phase8-card-month">{dateLabel(regional.target_month)}</span>
            {result.status === "available" ? <><b>{formatNumber(result.value, { maximumFractionDigits: 1 })} {result.units}</b><span>{es ? "Agua modelada · 0–100 cm" : "Modeled water · 0–100 cm"}</span><small>{es ? "Intervalo 90%" : "90% range"}: {formatNumber(result.interval.lower, { maximumFractionDigits: 1 })}–{formatNumber(result.interval.upper, { maximumFractionDigits: 1 })} mm</small></> : <b className="phase8-unavailable-value">{es ? "No disponible" : "Not available"}</b>}
          </button>;
        })}
      </div>
      <p className="phase8-meaning" aria-live="polite">{target === "storage" ? (es ? "Agua modelada en el suelo (0–100 cm), no lluvia prevista." : "Modeled soil water (0–100 cm), not expected rainfall.") : (es ? "Esta métrica no está disponible." : "This metric is unavailable.")} {scope === "spatial" && currentMetric?.status === "unavailable" ? (es ? "Sin datos válidos para esta celda." : "No valid data for this cell.") : ""}</p>
      <Phase9ContextPanel state={phase9State} bundle={state.bundle} selectedLocation={selectedLocation} horizon={horizon} language={language} formatNumber={formatNumber} />
      <details className="phase8-about"><summary>{es ? "Acerca de esta perspectiva" : "About this outlook"}</summary>
        <p>{explanation}</p>
        {scope === "spatial" && currentMetric?.status === "unavailable" && <p>{currentMetric.reason}</p>}
        <dl><div><dt>{es ? "Método" : "Method"}</dt><dd>{state.bundle.model.name} · {state.bundle.model.version}</dd></div>
          <div><dt>{es ? "Fuente" : "Source"}</dt><dd>{state.bundle.source_dataset.product} · {state.bundle.source_dataset.collection} · DOI {state.bundle.source_dataset.doi}</dd></div>
          <div><dt>{es ? "Observaciones" : "Observations"}</dt><dd>{state.bundle.source_dataset.historical_first_month}–{state.bundle.source_dataset.extension_last_month}; latest {state.bundle.latest_available_observation_month}</dd></div>
          <div><dt>{es ? "Emisión" : "Issue date"}</dt><dd>{formatDate(state.bundle.issue_time, { dateStyle: "medium", timeStyle: "short" })} UTC</dd></div>
          <div><dt>{es ? "Incertidumbre" : "Uncertainty"}</dt><dd>{selected.regional.predictive_interval?.method}; {es ? "intervalo del 90% basado en errores históricos, no garantiza valores futuros." : "90% interval based on historical errors; it does not guarantee future values."}</dd></div>
          <div><dt>{es ? "Grilla" : "Grid"}</dt><dd>{state.bundle.spatial_forecasts.spatial_resolution_degrees}°; {es ? "no representa la escala del lote." : "not field-scale."}</dd></div>
          <div><dt>{es ? "Estado" : "Status"}</dt><dd>{es ? "Experimental; no es un pronóstico operativo (operationally_eligible = false)." : "Experimental; not an operational forecast (operationally_eligible = false)."}</dd></div>
          <div><dt>{es ? "Uso agrícola" : "Agricultural use"}</dt><dd>{es ? "Contexto regional; no recomienda siembra, riego ni predice rendimiento." : "Regional context only; no planting or irrigation advice or yield prediction."}</dd></div>
        </dl>
      </details>
    </>}

    {state.status === "ready" && selected && view === "research" && <>
      <div className="phase8-meta" aria-label={es ? "Período y fuente de datos" : "Period and data source"}>
        <article><span>{es ? "EMISIÓN (UTC)" : "ISSUE TIME (UTC)"}</span><b>{formatDate(state.bundle.issue_time, { dateStyle: "medium", timeStyle: "short" })}</b></article>
        <article><span>{es ? "ÚLTIMA OBSERVACIÓN" : "LATEST OBSERVATION"}</span><b>{dateLabel(state.bundle.latest_available_observation_month)}</b></article>
        <article><span>{es ? "COBERTURA TEMPORAL" : "SOURCE COVERAGE"}</span><b>247 {es ? "meses" : "months"} · {dateLabel(state.bundle.source_dataset.historical_first_month)}–{dateLabel(state.bundle.source_dataset.extension_last_month)}</b></article>
        <article><span>{es ? "VARIABLE / SOPORTE" : "TARGET / SUPPORT"}</span><b>0–100 cm soil-water storage · mm · {state.bundle.spatial_forecasts.spatial_resolution_degrees}°</b></article>
        <article><span>{es ? "MODELO" : "MODEL"}</span><b>{state.bundle.model.name} · {state.bundle.model.version}</b></article>
        <article><span>{es ? "MÉTRICA ELEGIDA" : "SELECTED METRIC"}</span><b>{metricName}</b></article>
      </div>
      <div className="phase8-controls"><div className="phase8-horizons" role="group" aria-label={es ? "Horizonte" : "Horizon"}>{([1, 2, 3] as const).map((n) => <button key={n} type="button" aria-pressed={horizon === n} onClick={() => onHorizonChange(n)}>{dateLabel(state.bundle.temporal_convention.target_months[n - 1])}</button>)}</div><div className="phase8-scope" role="group" aria-label={es ? "Alcance espacial" : "Spatial scope"}><button type="button" aria-pressed={scope === "regional"} onClick={() => setScope("regional")}>Regional</button><button type="button" aria-pressed={scope === "spatial"} onClick={() => setScope("spatial")}>{es ? "Mi celda GLDAS" : "My GLDAS cell"}</button></div></div>
      <div className="phase8-reading" aria-live="polite"><div><div className="eyebrow">{scope === "regional" ? (es ? "RESUMEN REGIONAL PONDERADO POR ÁREA" : "AREA-WEIGHTED REGIONAL OUTLOOK") : (es ? "CELDA GLDAS SELECCIONADA" : "SELECTED GLDAS GRID CELL")}</div><h3>{dateLabel(selected.regional.target_month)} · {metricName}</h3>{currentMetric?.status === "available" ? <><span className="phase8-value">{formatNumber(currentMetric.value, { maximumFractionDigits: 1 })} mm</span><div className="phase8-interval"><b>{es ? "Intervalo predictivo del 90%" : "90% predictive interval"}</b><span>{formatNumber(currentMetric.interval.lower, { maximumFractionDigits: 1 })}–{formatNumber(currentMetric.interval.upper, { maximumFractionDigits: 1 })} mm</span><small>{currentMetric.interval.method}</small></div><p>{es ? "Referencia climatológica" : "Climatological reference"}: {formatNumber(currentMetric.climatologicalReferenceMm, { maximumFractionDigits: 1 })} mm</p></> : <div className="phase8-state phase8-state-alert" role="status"><AlertTriangle size={16} /><div><b>{es ? "No disponible científicamente" : "Not scientifically available"}</b><span>{currentMetric?.status === "unavailable" ? currentMetric.reason : explanation}</span></div></div>}</div></div>
      <div className="phase8-research-grid"><article><b>{es ? "Selección del método" : "Method selection"}</b><p>{es ? "Climatología estacional seleccionada antes del período de holdout en las 18 configuraciones. El holdout es solo descriptivo y no selecciona el modelo." : "Seasonal climatology was selected before holdout in all 18 configurations. Holdout comparisons are descriptive only and do not select the model."}</p></article><article><b>{es ? "Evaluación retrospectiva" : "Retrospective evaluation"}</b><p>{selected.regional.out_of_sample.period[0]}–{selected.regional.out_of_sample.period[1]} · RMSE {typeof selected.regional.out_of_sample.metrics.rmse === "number" ? formatNumber(selected.regional.out_of_sample.metrics.rmse, { maximumFractionDigits: 1 }) + " mm" : "—"} · MAE {typeof selected.regional.out_of_sample.metrics.mae === "number" ? formatNumber(selected.regional.out_of_sample.metrics.mae, { maximumFractionDigits: 1 }) + " mm" : "—"}. {es ? "No es validación prospectiva." : "Not prospective validation."}</p></article><article><b>{es ? "Elegibilidad y límites" : "Eligibility and limits"}</b><p>operationally_eligible = false. {es ? "Primera publicación NASA no verificada; sin resultados de 2026 validados ni inferencias específicas del cultivo." : "NASA first-publication time is unverified; 2026 outcomes and crop-specific inferences are not validated."}</p></article></div>
      <details className="phase8-provenance"><summary><Database size={14} />{es ? "Procedencia del artefacto" : "Artifact provenance"}</summary><dl><div><dt>{es ? "Producto NASA" : "NASA product"}</dt><dd>{state.bundle.source_dataset.product} · {state.bundle.source_dataset.collection}</dd></div><div><dt>DOI</dt><dd>{state.bundle.source_dataset.doi}</dd></div><div><dt>{es ? "Panel histórico SHA-256" : "Historical panel SHA-256"}</dt><dd>{state.bundle.source_dataset.historical_panel_sha256}</dd></div><div><dt>{es ? "Manifiesto SHA-256" : "Manifest SHA-256"}</dt><dd>{state.bundle.source_dataset.extension_manifest_sha256}</dd></div><div><dt>{es ? "Disponibilidad pública verificada" : "Public release time verified"}</dt><dd>{es ? "No · sin elegibilidad operativa" : "No · not operationally eligible"}</dd></div></dl></details>
    </>}
  </section>;
}
