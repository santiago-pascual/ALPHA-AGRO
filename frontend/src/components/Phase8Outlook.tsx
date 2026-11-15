import { useState } from "react";
import { AlertTriangle, Database, RefreshCw } from "lucide-react";
import type { Phase8BundleLoad } from "../data/phase8Forecast";
import { matchPhase8Cell, phase8ForecastForHorizon } from "../data/phase8Forecast";
import type { CoordinatePoint } from "../data/location";
import type { Language } from "../i18n";

type Props = {
  state: Phase8BundleLoad;
  horizon: 1 | 2 | 3;
  onHorizonChange: (horizon: 1 | 2 | 3) => void;
  selectedLocation: CoordinatePoint | null;
  onRetry: () => void;
  language: Language;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};
const filePath = "frontend/public/data/phase8_forecast_bundle_v1.json";

export function Phase8Outlook({ state, horizon, onHorizonChange, selectedLocation, onRetry, language, formatDate, formatNumber }: Props) {
  const es = language === "es";
  const [scope, setScope] = useState<"regional" | "spatial">("regional");
  const h = es ? "Horizonte" : "Horizon";
  const selected = state.status === "ready" ? phase8ForecastForHorizon(state.bundle, horizon) : null;
  const cellMatch = selected && scope === "spatial" ? matchPhase8Cell(selectedLocation, selected.spatial, state.status === "ready" ? state.bundle.spatial_forecasts.spatial_resolution_degrees : 0.25) : null;
  const value = scope === "regional" ? selected?.regional.value : cellMatch?.status === "matched" ? cellMatch.cell.value : null;
  const interval = scope === "regional" ? selected?.regional.predictive_interval : cellMatch?.status === "matched" ? cellMatch.cell.predictive_interval : null;
  const headline = scope === "regional" ? (es ? "Resumen regional ponderado por área" : "Area-weighted regional outlook") : (es ? "Celda GLDAS coincidente más cercana" : "Nearest matching GLDAS grid cell");
  const dateLabel = (month: string) => new Intl.DateTimeFormat(es ? "es-AR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

  return <section className="phase8-outlook panel" aria-labelledby="phase8-outlook-title">
    <div className="phase8-heading">
      <div><div className="eyebrow">PHASE 8 · {es ? "INVESTIGACIÓN / PERSPECTIVA EXPERIMENTAL" : "RESEARCH / EXPERIMENTAL OUTLOOK"}</div><h2 id="phase8-outlook-title">{es ? "Perspectiva experimental de almacenamiento" : "Experimental soil-storage outlook"}</h2></div>
      <span className="phase8-status"><span aria-hidden="true">●</span> {es ? "EXPERIMENTAL · NO OPERATIVO" : "EXPERIMENTAL · NOT OPERATIONAL"}</span>
    </div>
    <p className="phase8-summary">{es ? "Resultados científicos cargados de un artefacto versionado. Es una perspectiva experimental basada en climatología estacional; no es un pronóstico operativo ni una recomendación agrícola." : "Scientific results loaded from a versioned artifact. This is an experimental seasonal-climatology outlook, not an operational forecast or an agricultural recommendation."}</p>

    {state.status === "loading" && <div className="phase8-state" role="status">{es ? "Cargando y validando el bundle Phase 8…" : "Loading and validating the Phase 8 bundle…"}</div>}
    {(state.status === "missing" || state.status === "error") && <div className="phase8-state phase8-state-alert" role={state.status === "error" ? "alert" : "status"}>
      <AlertTriangle size={17} aria-hidden="true" /><div><b>{state.status === "missing" ? (es ? "Artefacto experimental no instalado" : "Experimental artifact not installed") : (es ? "No se pudo validar el artefacto" : "Artifact could not be validated")}</b><span>{state.message}</span><code>{filePath}</code></div><button className="button-secondary" type="button" onClick={onRetry}><RefreshCw size={14} />{es ? "Reintentar" : "Retry"}</button>
    </div>}

    {state.status === "ready" && selected && <>
      <div className="phase8-meta" aria-label={es ? "Período y fuente de datos del pronóstico experimental" : "Experimental outlook period and data source"}>
        <article><span>{es ? "EMISIÓN (UTC)" : "ISSUE TIME (UTC)"}</span><b>{formatDate(state.bundle.issue_time, { dateStyle: "medium", timeStyle: "short" })}</b></article>
        <article><span>{es ? "ÚLTIMA OBSERVACIÓN" : "LATEST OBSERVATION"}</span><b>{dateLabel(state.bundle.latest_available_observation_month)}</b></article>
        <article><span>{es ? "COBERTURA TEMPORAL" : "SOURCE COVERAGE"}</span><b>{es ? "247 meses" : "247 months"} · {dateLabel(state.bundle.source_dataset.historical_first_month)}–{dateLabel(state.bundle.source_dataset.extension_last_month)}</b></article>
        <article><span>{es ? "CORTE DE OBSERVACIÓN" : "OBSERVATION CUTOFF"}</span><b>{formatDate(state.bundle.input_observation_cutoff, { dateStyle: "medium", timeStyle: "short" })}</b></article>
        <article><span>{es ? "HORIZONTES DEL ARTEFACTO" : "ARTIFACT HORIZONS"}</span><b>{state.bundle.temporal_convention.target_months.map(dateLabel).join(" · ")}</b></article>
        <article><span>{es ? "VARIABLE / SOPORTE" : "TARGET / SUPPORT"}</span><b>{es ? "Agua del suelo 0–100 cm · mm" : "0–100 cm soil-water storage · mm"}</b></article>
        <article><span>{es ? "MÉTODO" : "METHOD"}</span><b>Seasonal climatology · {state.bundle.spatial_forecasts.spatial_resolution_degrees}°</b></article>
      </div>

      <div className="phase8-controls">
        <div className="phase8-horizons" role="group" aria-label={h}>{([1, 2, 3] as const).map((n) => <button key={n} type="button" aria-pressed={horizon === n} onClick={() => onHorizonChange(n)}>{h} {n} · {dateLabel(state.bundle.temporal_convention.target_months[n - 1])}</button>)}</div>
        <div className="phase8-scope" role="group" aria-label={es ? "Alcance espacial" : "Spatial scope"}>
          <button type="button" aria-pressed={scope === "regional"} onClick={() => setScope("regional")}>{es ? "Regional" : "Regional"}</button>
          <button type="button" aria-pressed={scope === "spatial"} onClick={() => setScope("spatial")}>{es ? "Mi celda GLDAS" : "My GLDAS cell"}</button>
        </div>
      </div>

      <div className="phase8-reading" aria-live="polite">
        <div><div className="eyebrow">{headline}</div><h3>{dateLabel(selected.regional.target_month)} · {horizon} {es ? "mes" : "month"}{horizon > 1 ? (es ? "es" : "s") : ""}</h3>
          {scope === "spatial" && cellMatch?.status === "matched" && <p>{cellMatch.cell.cell_id} · {formatNumber(cellMatch.cell.latitude, { maximumFractionDigits: 4 })}, {formatNumber(cellMatch.cell.longitude, { maximumFractionDigits: 4 })} · {formatNumber(cellMatch.distanceKm, { maximumFractionDigits: 1 })} km {es ? "del centro de celda" : "from cell center"}</p>}
          <span className="phase8-value">{value === null || value === undefined ? "—" : `${formatNumber(value, { maximumFractionDigits: 1 })} mm`}</span>
          {interval && <div className="phase8-interval"><b>{es ? "Intervalo predictivo del 90%" : "90% predictive interval"}</b><span>{formatNumber(interval.lower, { maximumFractionDigits: 1 })}–{formatNumber(interval.upper, { maximumFractionDigits: 1 })} mm</span><small>{interval.method}</small></div>}
        </div>
        {scope === "spatial" && cellMatch?.status !== "matched" && <div className="phase8-state phase8-state-alert" role="status"><AlertTriangle size={16} /><span>{cellMatch?.status === "masked" ? (es ? "La celda GLDAS más cercana está enmascarada. No se sustituye por otra celda ni se interpola." : "The nearest GLDAS cell is masked. It is not replaced with another cell or interpolated.") : selectedLocation ? (es ? "El punto no corresponde a un centro de celda dentro del soporte del bundle." : "The point does not match a grid-cell center within the bundle support.") : (es ? "Elegí un punto de campo para consultar una celda GLDAS." : "Select a field location to look up a GLDAS cell.")}</span></div>}
        {scope === "spatial" && cellMatch?.status === "matched" && <p className="phase8-cell-note">{es ? "La celda modelada representa el soporte de una grilla de 0,25°. No es una medición del campo ni una estimación de precisión parcelaria." : "The modeled cell represents a 0.25° grid support. It is not a field measurement or field-scale estimate."}</p>}
      </div>

      <div className="phase8-research-grid">
        <article><b>{es ? "Selección del método" : "Method selection"}</b><p>{es ? "Climatología estacional seleccionada antes del período de holdout en las 18 configuraciones de evaluación. Los resultados del holdout solo describen el desempeño histórico; no seleccionan el modelo." : "Seasonal climatology was selected before the holdout in all 18 evaluation configurations. Holdout results describe historical performance only; they do not select the model."}</p></article>
        <article><b>{es ? "Incertidumbre y validación" : "Uncertainty and validation"}</b><p>{es ? `Los intervalos se calibraron con residuos históricos (${selected.regional.calibration.start}–${selected.regional.calibration.end}) y se truncaron al rango físico 0–1.000 mm. La cobertura es retrospectiva, no una garantía futura. Holdout regional ${selected.regional.out_of_sample.period[0]}–${selected.regional.out_of_sample.period[1]}: RMSE ${typeof selected.regional.out_of_sample.metrics.rmse === "number" ? `${formatNumber(selected.regional.out_of_sample.metrics.rmse, { maximumFractionDigits: 1 })} mm` : "—"}; MAE ${typeof selected.regional.out_of_sample.metrics.mae === "number" ? `${formatNumber(selected.regional.out_of_sample.metrics.mae, { maximumFractionDigits: 1 })} mm` : "—"}.` : `Intervals use historical residual calibration (${selected.regional.calibration.start}–${selected.regional.calibration.end}) and are truncated to the physical 0–1,000 mm range. Coverage is retrospective, not a future guarantee. Regional holdout ${selected.regional.out_of_sample.period[0]}–${selected.regional.out_of_sample.period[1]}: RMSE ${typeof selected.regional.out_of_sample.metrics.rmse === "number" ? `${formatNumber(selected.regional.out_of_sample.metrics.rmse, { maximumFractionDigits: 1 })} mm` : "—"}; MAE ${typeof selected.regional.out_of_sample.metrics.mae === "number" ? `${formatNumber(selected.regional.out_of_sample.metrics.mae, { maximumFractionDigits: 1 })} mm` : "—"}.`}</p></article>
        <article><b>{es ? "Alcance y limitaciones" : "Scope and limitations"}</b><p>{es ? "GLDAS representa agua modelada en una celda de 0,25°, no una observación de campo. La emisión se hizo luego de verificar localmente los archivos; la primera publicación pública de NASA no está verificada y el producto no es casi en tiempo real. No hay validación de resultados de 2026. No predice rendimiento ni daño y no genera recomendaciones de cultivo o riego." : "GLDAS represents modeled water on a 0.25° grid, not a field observation. This issue followed local file verification; NASA first-publication time is unverified and this is not near real time. No 2026 outcomes have been validated. It does not predict yield or damage and provides no crop or irrigation recommendations."}</p></article>
      </div>

      <details className="phase8-provenance"><summary><Database size={14} /> {es ? "Procedencia y controles del artefacto" : "Artifact provenance and checks"}</summary>
        <dl><div><dt>{es ? "Producto NASA" : "NASA product"}</dt><dd>{state.bundle.source_dataset.product} · {state.bundle.source_dataset.collection}</dd></div><div><dt>DOI</dt><dd>{state.bundle.source_dataset.doi}</dd></div><div><dt>{es ? "Disponibilidad pública verificada" : "Public release time verified"}</dt><dd>{es ? "No · la elegibilidad operativa permanece desactivada" : "No · operational eligibility remains disabled"}</dd></div><div><dt>{es ? "Edad de la observación más reciente al emitir" : "Latest observation age at issue"}</dt><dd>{state.bundle.availability.latency_days} {es ? "días" : "days"}</dd></div><div><dt>{es ? "Panel histórico SHA-256" : "Historical panel SHA-256"}</dt><dd>{state.bundle.source_dataset.historical_panel_sha256}</dd></div><div><dt>{es ? "Panel extendido SHA-256" : "Extended panel SHA-256"}</dt><dd>{state.bundle.source_dataset.extended_spatial_panel_sha256} · {state.bundle.source_dataset.extended_regional_panel_sha256}</dd></div><div><dt>{es ? "Manifiesto SHA-256" : "Manifest SHA-256"}</dt><dd>{state.bundle.source_dataset.extension_manifest_sha256}</dd></div><div><dt>{es ? "Evaluación Phase 5B SHA-256" : "Phase 5B evaluation SHA-256"}</dt><dd>{state.bundle.source_dataset.phase5b_evaluation_sha256}</dd></div><div><dt>{es ? "Integridad del bundle" : "Bundle integrity"}</dt><dd>{es ? "Esquema reconocido · 896 celdas · 867 elegibles · 29 enmascaradas · consistencia regional/espacial comprobada" : "Supported schema · 896 cells · 867 eligible · 29 masked · regional/spatial consistency checked"}</dd></div></dl>
      </details>
      <p className="phase8-not-operational"><AlertTriangle size={15} /> {es ? "ESTADO EXPLÍCITO: operationally_eligible = false. Esta investigación experimental no habilita pronósticos operativos." : "EXPLICIT STATUS: operationally_eligible = false. This experimental research does not enable operational forecasts."}</p>
    </>}
  </section>;
}
