import { matchPhase8Cell } from "../data/phase8Forecast";
import { phase9ForCellMonth } from "../data/phase9Interpretation";
import type { CoordinatePoint } from "../data/location";
import type { Language } from "../i18n";
import type { Phase8ForecastBundle } from "../types/phase8";
import type { Phase9Interpretation, Phase9Load } from "../types/phase9";

type Props = {
  state: Phase9Load;
  bundle: Phase8ForecastBundle;
  selectedLocation: CoordinatePoint | null;
  horizon: 1 | 2 | 3;
  language: Language;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};
const targetMonths = ["2026-12", "2027-01", "2027-02"] as const;
const keyForCondition = (code: string, data: Phase9Interpretation, language: Language) => data.glossary[language === "es" ? "es" : "en"][code as keyof Phase9Interpretation["glossary"]["en"]];
const monthLabel = (month: string, language: Language) => new Intl.DateTimeFormat(language === "es" ? "es-AR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

export function Phase9ContextPanel({ state, bundle, selectedLocation, horizon, language, formatNumber }: Props) {
  const es = language === "es";
  const matched = selectedLocation ? matchPhase8Cell(selectedLocation, bundle.spatial_forecasts.forecasts[horizon - 1], bundle.spatial_forecasts.spatial_resolution_degrees) : { status: "outside" as const };
  const cell = matched.status === "matched" ? matched.cell : null;
  const fmt = (value: number | null | undefined) => value === null || value === undefined ? (es ? "No disponible" : "Not available") : `${formatNumber(value, { maximumFractionDigits: 1 })} mm`;

  return <section className="phase9-context panel" aria-labelledby="phase9-context-title">
    <div className="phase9-context-heading"><div><div className="eyebrow">{es ? "REFERENCIA E INTERPRETACIÓN" : "REFERENCE & INTERPRETATION"}</div><h3 id="phase9-context-title">{es ? "Contexto de tu celda" : "Your cell context"}</h3></div><span>{es ? "EXPERIMENTAL" : "EXPERIMENTAL"}</span></div>
    {state.status === "loading" && <p role="status">{es ? "Validando el contexto Phase 9…" : "Validating Phase 9 context…"}</p>}
    {(state.status === "missing" || state.status === "error") && <div className="phase9-unavailable" role={state.status === "error" ? "alert" : "status"}><p>{es ? "Interpretación Phase 9 no disponible." : "Phase 9 interpretation unavailable."}</p><details><summary>{es ? "Detalles" : "Details"}</summary><span>{state.message}</span></details></div>}
    {state.status === "ready" && !selectedLocation && <p role="status">{es ? "Elegí una ubicación con cobertura para ver su historial." : "Select a supported location to view its history."}</p>}
    {state.status === "ready" && selectedLocation && !cell && <p className="phase9-unavailable" role="status">{es ? "Sin interpretación disponible para esta ubicación." : "No interpretation is available for this location."}</p>}
    {state.status === "ready" && cell && <>
      {(() => {
        const data = state.data;
        const observed = data.latestObserved.get(cell.cell_id);
        return <>
          <article className="phase9-observed" aria-label={es ? "Observación de julio de 2026" : "July 2026 observation"}>
            <div><span>{es ? "OBSERVADO · JULIO 2026" : "OBSERVED · JULY 2026"}</span><b>{fmt(observed?.value_mm)}</b></div>
            {observed ? <>
              <p>{es ? "Anomalía observada" : "Observed anomaly"}: <strong>{observed.anomaly_mm > 0 ? "+" : ""}{formatNumber(observed.anomaly_mm, { maximumFractionDigits: 1 })} mm</strong> · {es ? "respecto de la media histórica de julio" : "against the historical July mean"}</p>
              <p>{keyForCondition(observed.condition_code, data, language)} · {formatNumber(observed.empirical_percentile, { maximumFractionDigits: 0 })}{es ? "° percentil" : "th percentile"}</p>
            </> : <p>{es ? "La observación no está disponible para esta celda." : "No observation is available for this cell."}</p>}
          </article>
          <div className="phase9-month-grid" aria-label={es ? "Perspectiva experimental y referencia histórica" : "Experimental outlook and historical reference"}>
            {targetMonths.map((targetMonth) => {
              const context = phase9ForCellMonth(data, cell.cell_id, targetMonth);
              const p8 = bundle.spatial_forecasts.forecasts[context.forecast?.horizon_months ? context.forecast.horizon_months - 1 : targetMonths.indexOf(targetMonth)].cells.find((item) => item.cell_id === cell.cell_id);
              return <article key={targetMonth} className="phase9-month-card">
                <span>{monthLabel(targetMonth, language)}</span>
                <b>{context.forecast?.status === "experimental_climatological_outlook" ? fmt(context.forecast.forecast_mm) : (es ? "No disponible" : "Not available")}</b>
                <small>{es ? "Perspectiva experimental" : "Experimental outlook"}</small>
                <div><span>{es ? "Media histórica del mes" : "Historical monthly mean"}</span><strong>{fmt(context.reference?.mean_mm)}</strong></div>
                <div><span>{es ? "Rango histórico P20–P80" : "Historical P20–P80 range"}</span><strong>{context.reference ? `${fmt(context.reference.p20_mm)} – ${fmt(context.reference.p80_mm)}` : (es ? "No disponible" : "Not available")}</strong></div>
                <small>{es ? "La referencia describe el pasado; no es un intervalo de pronóstico." : "Historical reference describes the past; it is not a forecast interval."}</small>
                {context.forecast?.probability_below_p20 === null && <span className="phase9-probability-unavailable">{es ? "Probabilidad de humedad baja: no disponible" : "Low-moisture probability: unavailable"}</span>}
                {p8?.predictive_interval && <span className="phase9-uncertainty">{es ? "Intervalo experimental 90%" : "Experimental 90% interval"}: {fmt(p8.predictive_interval.lower)}–{fmt(p8.predictive_interval.upper)}</span>}
              </article>;
            })}
          </div>
          <p className="phase9-interpretation">{es ? data.forecastInterpretation.es : data.forecastInterpretation.en}</p>
          <details className="phase9-details"><summary>{es ? "Método y detalles" : "Method and details"}</summary>
            <p>{es ? `Referencia 2006–2025; percentiles empíricos (${data.reference.quantile_method}). La observación de julio compara la celda con su mismo mes calendario.` : `Reference: 2006–2025; empirical percentiles (${data.reference.quantile_method}). July observation is compared with the same calendar month for this cell.`}</p>
            <p>{es ? data.agriculturalInterpretation.es : data.agriculturalInterpretation.en}</p>
            <p>{es ? "Percentiles históricos del mes elegido" : "Selected-month historical percentiles"}: {(() => { const reference = phase9ForCellMonth(data, cell.cell_id, targetMonths[horizon - 1]).reference; return reference ? `P10 ${fmt(reference.p10_mm)} · P20 ${fmt(reference.p20_mm)} · P50 ${fmt(reference.p50_mm)} · P80 ${fmt(reference.p80_mm)} · P90 ${fmt(reference.p90_mm)} · n=${reference.n_years}` : (es ? "No disponible" : "Not available"); })()}</p>
            <p>{es ? "Anomalía central futura" : "Future central anomaly"}: {fmt(phase9ForCellMonth(data, cell.cell_id, targetMonths[horizon - 1]).forecast?.forecast_central_anomaly_mm)} · {phase9ForCellMonth(data, cell.cell_id, targetMonths[horizon - 1]).forecast?.forecast_anomaly_status ?? (es ? "no disponible" : "unavailable")}. {es ? "El cero construido por climatología no demuestra condiciones futuras normales." : "A climatology-constructed zero does not establish normal future conditions."}</p>
            <p>{es ? "Probabilidad futura bajo P20" : "Future probability below P20"}: {phase9ForCellMonth(data, cell.cell_id, targetMonths[horizon - 1]).forecast?.probability_below_p20 === null ? (es ? "No disponible: no está calibrada." : "Unavailable: not calibrated.") : fmt(phase9ForCellMonth(data, cell.cell_id, targetMonths[horizon - 1]).forecast?.probability_below_p20)}</p>
            <p>{es ? "Umbral histórico descriptivo" : "Descriptive historical threshold"}: {es ? "Almacenamiento observado igual o menor que el percentil 20 del mismo mes y celda (2006–2025); no es un umbral agronómico de sequía." : data.reference.low_moisture_definition}</p>
            <p>{data.probabilitySummary.status === "unavailable" ? (es ? "Probabilidad no disponible" : "Probability unavailable") + ": " + (es ? "no hay calibración de evento validada; el intervalo del 90% no es una distribución de probabilidad." : data.probabilitySummary.reason) : ""}</p>
            <p>{es ? "Fuente" : "Source"}: {data.provenance.product} · DOI {data.provenance.doi} · {data.reference.start}–{data.reference.end}</p>
            <p>SHA-256 · {es ? "panel histórico" : "historical panel"}: {data.provenance.panel_sha256}<br />SHA-256 · Phase 8: {data.provenance.forecast_bundle_sha256}</p>
            <p>{es ? "Incertidumbre espacial" : "Spatial uncertainty"}: {bundle.spatial_forecasts.uncertainty_note}</p>
            <ul>{data.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
          </details>
        </>;
      })()}
    </>}
  </section>;
}
