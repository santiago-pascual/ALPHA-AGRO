import { matchPhase8Cell } from "../data/phase8Forecast";
import type { CoordinatePoint } from "../data/location";
import type { CropConfiguration } from "../data/agronomy";
import { CROP_CATALOG } from "../data/agronomy";
import type { Phase8BundleLoad } from "../data/phase8Forecast";
import type { Phase9Load } from "../types/phase9";
import type { Language } from "../i18n";

type Props = {
  phase8: Phase8BundleLoad;
  phase9: Phase9Load;
  location: CoordinatePoint | null;
  crop: CropConfiguration;
  language: Language;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  onChooseCrop: (crop: CropConfiguration["crop"]) => void;
};

const months = ["2026-12", "2027-01", "2027-02"] as const;
const monthName = (month: string, es: boolean) => new Intl.DateTimeFormat(es ? "es-AR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

export function AgriculturalAnalysis({ phase8, phase9, location, crop, language, formatNumber, onChooseCrop }: Props) {
  const es = language === "es";
  const cropName = CROP_CATALOG.find((item) => item.id === crop.crop)?.name[language] ?? crop.crop;
  const unavailable = es ? "No disponible" : "Not available";
  const fmt = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? unavailable : `${formatNumber(value, { maximumFractionDigits: 1 })} mm`;
  const matched = phase8.status === "ready" && location
    ? matchPhase8Cell(location, phase8.bundle.spatial_forecasts.forecasts[0], phase8.bundle.spatial_forecasts.spatial_resolution_degrees)
    : null;
  const cell = matched?.status === "matched" ? matched.cell : null;
  const p9Cell = phase9.status === "ready" && cell ? phase9.data.cells.get(cell.cell_id) : null;
  const observed = phase9.status === "ready" && p9Cell ? phase9.data.latestObserved.get(p9Cell.cell_id) : null;
  const fmtStage = (value: string) => ({ planning: es ? "Planificación / siembra" : "Planning / planting", establishment: es ? "Implantación" : "Establishment", vegetative: es ? "Crecimiento vegetativo" : "Vegetative growth", reproductive: es ? "Floración / reproductiva" : "Flowering / reproductive", fruit_development: es ? "Desarrollo del fruto" : "Fruit development", maturation: es ? "Maduración" : "Maturation", harvest: es ? "Cosecha" : "Harvest", dormancy: es ? "Reposo" : "Dormancy", ratoon_recovery: es ? "Rebrote de soca" : "Ratoon recovery" }[value] ?? value);

  return <section className="agricultural-analysis panel" aria-labelledby="agricultural-analysis-title">
    <div className="agricultural-analysis-heading">
      <div><div className="eyebrow">{es ? "ANÁLISIS DEL CAMPO" : "FIELD ANALYSIS"}</div><h2 id="agricultural-analysis-title">{es ? "Resumen para tu campo" : "Your field summary"}</h2></div>
      <span className="phase8-status">{es ? "PERSPECTIVA EXPERIMENTAL" : "EXPERIMENTAL OUTLOOK"}</span>
    </div>
    <div className="agricultural-analysis-crop">
      <b>{cropName}</b><span>{fmtStage(crop.growthStage)} · {crop.waterManagement === "unknown" ? (es ? "Manejo no indicado" : "Management not specified") : crop.waterManagement === "rainfed" ? (es ? "Secano" : "Rainfed") : (es ? "Regadío" : "Irrigated")}</span>
    </div>
    {!location && <p className="phase8-state" role="status">{es ? "Elegí una ubicación compatible para preparar el análisis." : "Choose a supported location to prepare the analysis."}</p>}
    {location && phase8.status === "loading" && <p className="phase8-state" role="status">{es ? "Validando los datos científicos…" : "Validating scientific data…"}</p>}
    {location && (phase8.status === "missing" || phase8.status === "error") && <p className="phase8-state phase8-state-alert" role={phase8.status === "error" ? "alert" : "status"}>{es ? "Los resultados de agua en el suelo no están disponibles." : "Soil-water results are unavailable."}</p>}
    {location && phase8.status === "ready" && !cell && <p className="phase8-state phase8-state-alert" role="status">{es ? "Esta ubicación no coincide con una celda científica válida." : "This location does not match a valid scientific grid cell."}</p>}
    {location && phase8.status === "ready" && cell && <>
      <div className="agricultural-conditions" aria-live="polite">
        <div><span>{es ? "ÚLTIMA OBSERVACIÓN" : "LATEST OBSERVATION"}</span><b>{observed ? `${fmt(observed.value_mm)} · ${es ? "julio de 2026" : "July 2026"}` : unavailable}</b></div>
        <p>{observed ? `${es ? "Desvío frente a la referencia de julio" : "Difference from the July reference"}: ${observed.anomaly_mm > 0 ? "+" : ""}${formatNumber(observed.anomaly_mm, { maximumFractionDigits: 1 })} mm · ${formatNumber(observed.empirical_percentile, { maximumFractionDigits: 0 })}${es ? "° percentil" : "th percentile"}. ${phase9.status === "ready" ? phase9.data.glossary[es ? "es" : "en"][observed.condition_code] : ""}` : (es ? "No hay una observación válida para esta celda." : "No valid observation is available for this cell.")}</p>
      </div>
      <div className="agricultural-months" aria-label={es ? "Perspectiva experimental a tres meses" : "Three-month experimental outlook"}>
        {months.map((month, index) => {
          const spatial = phase8.bundle.spatial_forecasts.forecasts[index].cells.find((item) => item.cell_id === cell.cell_id);
          const result = phase9.status === "ready" && p9Cell ? phase9.data.forecasts.get(`${p9Cell.cell_id}|${month}`) : null;
          const valid = spatial?.valid === true && typeof spatial.value === "number" && spatial.predictive_interval !== null;
          return <article key={month}>
            <span>{monthName(month, es)}</span><b>{valid ? fmt(spatial.value) : unavailable}</b>
            <small>{es ? "Agua modelada · 0–100 cm" : "Modeled soil water · 0–100 cm"}</small>
            <div>{es ? "Media histórica del mes" : "Historical monthly mean"}: {result?.reference_mean_mm != null ? fmt(result.reference_mean_mm) : spatial?.climatological_reference_mm != null ? fmt(spatial.climatological_reference_mm) : unavailable}</div>
            <div>{es ? "Rango histórico P20–P80" : "Historical P20–P80 range"}: {result?.reference_p20_mm != null && result.reference_p80_mm != null ? `${fmt(result.reference_p20_mm)}–${fmt(result.reference_p80_mm)}` : unavailable}</div>
            <div>{es ? "Incertidumbre experimental 90%" : "Experimental 90% interval"}: {valid && spatial.predictive_interval ? `${fmt(spatial.predictive_interval.lower)}–${fmt(spatial.predictive_interval.upper)}` : unavailable}</div>
          </article>;
        })}
      </div>
      <p className="agricultural-explanation">{es ? "El agua del suelo representa almacenamiento modelado en los primeros 100 cm; no es lluvia prevista ni una medición directa de tu lote. La perspectiva usa climatología estacional y no es un pronóstico operativo." : "Soil water is modeled storage in the upper 100 cm; it is not expected rainfall or a direct measurement of your field. This seasonal-climatology outlook is experimental, not operational."}</p>
      <details className="agricultural-details"><summary>{es ? "Contexto agrícola y límites" : "Agricultural context & limits"}</summary>
        <p>{es ? `Para ${cropName}, la etapa elegida es ${fmtStage(crop.growthStage).toLowerCase()} y el escenario es ${crop.waterManagement === "unknown" ? "manejo no indicado" : crop.waterManagement === "rainfed" ? "secano" : "regadío"}. Las necesidades de agua varían con cultivo, etapa, suelo, clima y manejo. Este contexto no evalúa aptitud ni recomienda fechas de siembra o riego.` : `For ${cropName}, the selected stage is ${fmtStage(crop.growthStage).toLowerCase()} and the scenario is ${crop.waterManagement === "unknown" ? "management not specified" : crop.waterManagement}. Water needs vary with crop, growth stage, soil, weather, and management. This context does not assess suitability or recommend planting or irrigation.`}</p>
        <p>{es ? "El resultado describe una celda regional GLDAS, no el lote. La incertidumbre refleja errores históricos y no garantiza valores futuros. El cero de una anomalía climatológica construida no demuestra condiciones futuras normales. No hay recomendaciones agrícolas validadas para esta ubicación." : "The result describes a regional GLDAS grid cell, not the field. Uncertainty reflects historical errors and does not guarantee future values. A climatology-constructed zero anomaly does not prove normal future conditions. No validated agricultural recommendations are available for this location."}</p>
      </details>
      <div className="agricultural-alternatives"><span>{es ? "Otros cultivos documentados en la región pampeana · opciones generales, no recomendaciones" : "Other crops documented in the Pampas · general options, not recommendations"}</span>
        {(["soybean", "maize", "wheat"] as const).filter((id) => id !== crop.crop).map((id) => {
          const entry = CROP_CATALOG.find((item) => item.id === id)!;
          return <button type="button" key={id} onClick={() => onChooseCrop(id)}>{entry.name[language]}</button>;
        })}
      </div>
      <p className="agricultural-planning-note">{es ? "Contexto para conversar y planificar: esta lectura regional no indica qué sembrar ni cuándo; no hay recomendaciones validadas para este campo." : "Planning context: use this regional reading as background for discussion. It does not say what or when to plant; no field-specific recommendations are validated."}</p>
      <details className="agricultural-source"><summary>{es ? "Fuentes de contexto regional" : "Regional context sources"}</summary>
        <p><a href="https://www.argentina.gob.ar/node/486863" target="_blank" rel="noreferrer">INTA · Mapa Nacional de Cultivos</a> — {es ? "mapeo anual de la distribución de cultivos." : "annual crop distribution mapping."}</p>
        <p><a href="https://repositorio.inta.gob.ar/bitstream/handle/20.500.12123/3833/INTA_CIAP_InstitutodePatologiaVegetal_Serri_DL_Incorporacion_de_trigo_en_la_rotacion_agricola.pdf?isAllowed=y&sequence=1" target="_blank" rel="noreferrer">INTA · Incorporación de trigo en la rotación agrícola</a> — {es ? "contexto histórico de cultivos pampeanos. Las fuentes documentan presencia regional, no aptitud local del campo." : "historical Pampas crop context. Sources establish regional presence, not local field suitability."}</p>
      </details>
    </>}
  </section>;
}
