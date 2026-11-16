import { matchPhase8Cell } from "../data/phase8Forecast";
import type { CoordinatePoint } from "../data/location";
import type { CropConfiguration } from "../data/agronomy";
import { CROP_CATALOG } from "../data/agronomy";
import type { Phase8BundleLoad } from "../data/phase8Forecast";
import type { Phase9Load } from "../types/phase9";
import type { Language } from "../i18n";
import type { DashboardDataset } from "../types";
import { findEligibleCell } from "../data/location";
import type { LandContextLoad } from "../types/landContext";
import { assessCropStageSeason, pampasMapGroups, plantingMonthsFor, seasonalCropOptions, waterSignalForCrop } from "../data/regionalAgronomy";

type Props = {
  phase8: Phase8BundleLoad;
  phase9: Phase9Load;
  landContext?: LandContextLoad;
  historical?: DashboardDataset | null;
  location: CoordinatePoint | null;
  crop: CropConfiguration;
  language: Language;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  onChooseCrop: (crop: CropConfiguration["crop"]) => void;
};

const months = ["2026-12", "2027-01", "2027-02"] as const;
const monthName = (month: string, es: boolean) => new Intl.DateTimeFormat(es ? "es-AR" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

export function AgriculturalAnalysis({ phase8, phase9, historical, landContext = { status: "missing", message: "Local land context bundle is missing." }, location, crop, language, formatNumber, onChooseCrop }: Props) {
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
  const issueMonth = phase8.status === "ready" ? Number(phase8.bundle.issue_time.slice(5, 7)) : null;
  const issueDay = phase8.status === "ready" ? Number(phase8.bundle.issue_time.slice(8, 10)) : null;
  const mapGroups = location ? pampasMapGroups(location.latitude, location.longitude) : [];
  const cropOptions = issueMonth && issueDay && location ? seasonalCropOptions(issueMonth, issueDay, location.latitude) : [];
  const lateMaizeWindowApproaching = issueMonth === 11 && issueDay !== null && issueDay < 20;
  const calendarAssessment = issueMonth && location ? assessCropStageSeason(crop.crop, crop.growthStage, issueMonth, location.latitude) : "no-source";
  const plantingMonths = location ? plantingMonthsFor(crop.crop, location.latitude) : null;
  const waterSignal = waterSignalForCrop(observed?.condition_code);
  const formatMonth = (month: number) => new Intl.DateTimeFormat(es ? "es-AR" : "en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, month - 1, 1)));
  const yieldEstimate = landContext.status === "ready" && ["soybean", "maize", "wheat"].includes(crop.crop) ? landContext.data.yield_context.crops[crop.crop as "soybean" | "maize" | "wheat"] : null;
  const nppRows = landContext.status === "ready" ? landContext.data.productivity.years.filter((row) => row.year >= 2006 && row.year <= 2025 && row.mean_kg_c_m2 !== null) : [];
  const nppValues = nppRows.map((row) => row.mean_kg_c_m2 as number);
  const nppMin = nppValues.length ? Math.min(...nppValues) : 0;
  const nppMax = nppValues.length ? Math.max(...nppValues) : 1;
  const nppPoints = nppRows.map((row, index) => `${nppRows.length < 2 ? 50 : index * 100 / (nppRows.length - 1)},${42 - ((row.mean_kg_c_m2! - nppMin) / Math.max(nppMax - nppMin, 1e-9)) * 36}`).join(" ");
  const historicalCell = historical && location ? findEligibleCell(location, historical.cells, historical.resolutionDegrees) : null;
  const regionalTrend = historical?.mode === "real" ? historical.regionalTrend : null;
  const signalLabel = (slope: number | null, interval: [number, number] | null, pValue: number | null) => {
    if (slope === null || interval === null || pValue === null) return es ? "Sin evidencia suficiente" : "Insufficient evidence";
    if (pValue >= 0.05 || (interval[0] <= 0 && interval[1] >= 0)) return es ? "Sin cambio direccional claro" : "No clear directional change";
    return slope < 0 ? (es ? "Señal hídrica descendente" : "Declining water signal") : (es ? "Señal hídrica ascendente" : "Increasing water signal");
  };
  const displayTrendValue = (value: number | null | undefined) => value == null ? unavailable : `${value > 0 ? "+" : ""}${formatNumber(value, { maximumFractionDigits: 2 })} mm / ${es ? "década" : "decade"}`;
  const fmtStage = (value: string) => ({ planning: es ? "Planificación / siembra" : "Planning / planting", establishment: es ? "Implantación" : "Establishment", vegetative: es ? "Crecimiento vegetativo" : "Vegetative growth", reproductive: es ? "Floración / reproductiva" : "Flowering / reproductive", fruit_development: es ? "Desarrollo del fruto" : "Fruit development", maturation: es ? "Maduración" : "Maturation", harvest: es ? "Cosecha" : "Harvest", dormancy: es ? "Reposo" : "Dormancy", ratoon_recovery: es ? "Rebrote de soca" : "Ratoon recovery" }[value] ?? value);

  return <section className="agricultural-analysis panel" aria-labelledby="agricultural-analysis-title">
    <div className="agricultural-analysis-heading">
      <div><div className="eyebrow">{es ? "ANÁLISIS DEL CAMPO" : "FIELD ANALYSIS"}</div><h2 id="agricultural-analysis-title">{es ? "Resumen para tu campo" : "Your field summary"}</h2></div>
      <span className="phase8-status">{es ? "PERSPECTIVA EXPERIMENTAL" : "EXPERIMENTAL OUTLOOK"}</span>
    </div>
    <div className="agricultural-analysis-crop">
      <b>{cropName}</b><span>{fmtStage(crop.growthStage)} · {crop.waterManagement === "unknown" ? (es ? "Manejo no indicado" : "Management not specified") : crop.waterManagement === "rainfed" ? (es ? "Secano" : "Rainfed") : (es ? "Regadío" : "Irrigated")}</span>
    </div>
    {location && <section className="seasonal-crop-context" aria-label={es ? "Contexto de zona y calendario" : "Zone and crop calendar context"}>
      <div><span>{es ? "ZONAS DE REFERENCIA DEL MAPA" : "MAP REFERENCE GROUPS"}</span><b>{mapGroups.map((group) => ({ north: es ? "Pampas del norte" : "Northern Pampas", south: es ? "Pampas del sur" : "Southern Pampas", west: es ? "Pampas del oeste" : "Western Pampas", east: es ? "Pampas del este" : "Eastern Pampas" })[group]).join(" · ")}</b></div>
      <div><span>{es ? "ETAPA ELEGIDA" : "SELECTED STAGE"}</span><b>{fmtStage(crop.growthStage)}</b></div>
      <small>{issueMonth ? (es ? `Mes de emisión: ${formatMonth(issueMonth)} · ventana orientativa: ${plantingMonths?.map(formatMonth).join(", ") ?? unavailable}` : `Issue month: ${formatMonth(issueMonth)} · broad sowing window: ${plantingMonths?.map(formatMonth).join(", ") ?? unavailable}`) : (es ? "Fecha de emisión no disponible" : "Issue date unavailable")}</small>
      <p>{calendarAssessment === "inside-window"
        ? (es ? "El mes de emisión coincide con una ventana regional documentada de siembra para este cultivo. Es contexto de calendario, no una recomendación de sembrar." : "The issue month overlaps a documented regional sowing window for this crop. This is calendar context, not a recommendation to plant.")
        : calendarAssessment === "outside-window"
          ? (es ? "El mes de emisión queda fuera de la ventana regional habitual de siembra. Revisá si elegiste Planificación / siembra para la campaña correcta." : "The issue month falls outside the broad regional sowing window. Check whether Planning / planting refers to the intended campaign.")
          : calendarAssessment === "stage-not-inferable"
            ? (es ? "La etapa del cultivo no se puede confirmar con el mes solamente. Hace falta la fecha de siembra y la variedad." : "The crop stage cannot be confirmed from the month alone. Planting date and cultivar are needed.")
            : (es ? "No hay calendario regional incorporado para este cultivo." : "No regional calendar is connected for this crop.")}</p>
      <div className="regional-crop-shortlist"><b>{es ? "Opciones por calendario para revisar" : "Calendar-based options to review"}</b><span>{cropOptions.length ? cropOptions.map((id) => CROP_CATALOG.find((item) => item.id === id)?.name[language]).join(" · ") : (es ? "Sin ventana de siembra identificada" : "No sowing window identified")}</span>{lateMaizeWindowApproaching && <small>{es ? "La ventana orientativa de maíz tardío se acerca a fines de noviembre y diciembre." : "The broad delayed-maize window approaches in late November and December."}</small>}<small>{es ? "Es una coincidencia de calendario regional, no un ranking de aptitud ni una recomendación para este lote." : "This is a regional calendar match, not a suitability ranking or a recommendation for this field."}</small></div>
      <small>{es ? "La zona norte/sur sigue el agrupamiento descriptivo del mapa; no es una zonificación agronómica oficial." : "North/south follows the map's descriptive grouping; it is not an official agronomic zone."}</small>
    </section>}
    {!location && <p className="phase8-state" role="status">{es ? "Elegí una ubicación compatible para preparar el análisis." : "Choose a supported location to prepare the analysis."}</p>}
    {location && phase8.status === "loading" && <p className="phase8-state" role="status">{es ? "Validando los datos científicos…" : "Validating scientific data…"}</p>}
    {location && (phase8.status === "missing" || phase8.status === "error") && <p className="phase8-state phase8-state-alert" role={phase8.status === "error" ? "alert" : "status"}>{es ? "Los resultados de agua en el suelo no están disponibles." : "Soil-water results are unavailable."}</p>}
    {location && phase8.status === "ready" && !cell && <p className="phase8-state phase8-state-alert" role="status">{es ? "Esta ubicación no coincide con una celda científica válida." : "This location does not match a valid scientific grid cell."}</p>}
    {location && phase8.status === "ready" && cell && <>
      <div className="agricultural-conditions" aria-live="polite">
        <div><span>{es ? "ÚLTIMA OBSERVACIÓN" : "LATEST OBSERVATION"}</span><b>{observed ? `${fmt(observed.value_mm)} · ${es ? "julio de 2026" : "July 2026"}` : unavailable}</b></div>
        <p>{observed ? `${es ? "Desvío frente a la referencia de julio" : "Difference from the July reference"}: ${observed.anomaly_mm > 0 ? "+" : ""}${formatNumber(observed.anomaly_mm, { maximumFractionDigits: 1 })} mm · ${formatNumber(observed.empirical_percentile, { maximumFractionDigits: 0 })}${es ? "° percentil" : "th percentile"}. ${phase9.status === "ready" ? phase9.data.glossary[es ? "es" : "en"][observed.condition_code] : ""}` : (es ? "No hay una observación válida para esta celda." : "No valid observation is available for this cell.")}</p>
      </div>
      <article className="crop-water-interpretation"><b>{es ? `Lectura del agua para ${cropName}` : `Water context for ${cropName}`}</b><p>{waterSignal === "below-reference"
        ? (es ? "En julio se observó menos agua almacenada que en la mayoría de los julios de referencia. Una reserva menor podría limitar disponibilidad si el cultivo demanda agua, pero no confirma estrés ni daño en el lote." : "July storage was lower than in most reference Julys. A smaller reserve could limit availability when the crop needs water, but this does not confirm field stress or damage.")
        : waterSignal === "above-reference"
          ? (es ? "En julio se observó más agua almacenada que en la mayoría de los julios de referencia. Puede favorecer la disponibilidad si el cultivo la necesita, pero más agua no siempre es mejor; no se midieron anegamiento ni condiciones del lote." : "July storage was higher than in most reference Julys. This may support availability when the crop needs water, but more water is not always better; waterlogging and field conditions were not measured.")
          : waterSignal === "within-reference"
            ? (es ? "El almacenamiento de julio quedó dentro del rango central histórico. Eso no indica por sí solo una condición favorable o desfavorable para el cultivo." : "July storage fell within the central historical range. That alone does not indicate favorable or unfavorable crop conditions.")
            : (es ? "Sin una anomalía observada válida, no se puede valorar si el agua favorece al cultivo." : "Without a valid observed anomaly, crop water favorability cannot be assessed.")}</p><small>{es ? `Observación de julio de 2026 para ${cropName}; etapa elegida: ${fmtStage(crop.growthStage).toLowerCase()}. La perspectiva futura no modela la respuesta del cultivo.` : `July 2026 observation for ${cropName}; selected stage: ${fmtStage(crop.growthStage).toLowerCase()}. The future outlook does not model crop response.`}</small></article>
      <div className="agricultural-months" aria-label={es ? "Perspectiva experimental a tres meses" : "Three-month experimental outlook"}>
        {months.map((month, index) => {
          const spatial = phase8.bundle.spatial_forecasts.forecasts[index].cells.find((item) => item.cell_id === cell.cell_id);
          const result = phase9.status === "ready" && p9Cell ? phase9.data.forecasts.get(`${p9Cell.cell_id}|${month}`) : null;
          const historicalReference = phase9.status === "ready" && p9Cell ? phase9.data.monthlyReference.get(`${p9Cell.cell_id}|${Number(month.slice(5, 7))}`) : null;
          const valid = spatial?.valid === true && typeof spatial.value === "number" && spatial.predictive_interval !== null;
          return <article key={month}>
            <span>{monthName(month, es)}</span><b>{valid ? fmt(spatial.value) : unavailable}</b>
            <small>{es ? "Agua modelada · 0–100 cm" : "Modeled soil water · 0–100 cm"}</small>
            <div>{es ? "Media histórica del mes" : "Historical monthly mean"}: {result?.reference_mean_mm != null ? fmt(result.reference_mean_mm) : spatial?.climatological_reference_mm != null ? fmt(spatial.climatological_reference_mm) : unavailable}</div>
            <div>{es ? "Rango histórico P20–P80" : "Historical P20–P80 range"}: {result?.reference_p20_mm != null && result.reference_p80_mm != null ? `${fmt(result.reference_p20_mm)}–${fmt(result.reference_p80_mm)}` : unavailable}</div>
            <div>{es ? "Frecuencia histórica bajo P20" : "Historical frequency below P20"}: {historicalReference?.low_moisture_frequency != null ? `${formatNumber(historicalReference.low_moisture_frequency * 100, { maximumFractionDigits: 1 })}%` : unavailable} · {es ? "no es probabilidad futura calibrada" : "not a calibrated future probability"}</div>
            <div>{es ? "Incertidumbre experimental 90%" : "Experimental 90% interval"}: {valid && spatial.predictive_interval ? `${fmt(spatial.predictive_interval.lower)}–${fmt(spatial.predictive_interval.upper)}` : unavailable}</div>
          </article>;
        })}
      </div>
      <p className="agricultural-explanation">{es ? "El agua del suelo representa almacenamiento modelado en los primeros 100 cm; no es lluvia prevista ni una medición directa de tu lote. La perspectiva usa climatología estacional y no es un pronóstico operativo." : "Soil water is modeled storage in the upper 100 cm; it is not expected rainfall or a direct measurement of your field. This seasonal-climatology outlook is experimental, not operational."}</p>
      <section className="degradation-screening" aria-labelledby="degradation-screening-title">
        <div><div className="eyebrow">{es ? "LECTURA PRELIMINAR · NO ES UN DIAGNÓSTICO" : "PRELIMINARY SCREEN · NOT A DIAGNOSIS"}</div><h3 id="degradation-screening-title">{es ? "Señales de cambio" : "Change signals"}</h3></div>
        <article className="degradation-water-signal">
          <span>{es ? "Tendencia regional del agua · 2006–2025" : "Regional soil-water trend · 2006–2025"}</span>
          <b>{displayTrendValue(regionalTrend?.slopePerDecade)}</b>
          <strong>{signalLabel(regionalTrend?.slopePerDecade ?? null, regionalTrend?.ci95 ?? null, regionalTrend?.pValue ?? null)}</strong>
          <small>{regionalTrend?.ci95 ? `95% CI ${formatNumber(regionalTrend.ci95[0], { maximumFractionDigits: 2 })} to ${formatNumber(regionalTrend.ci95[1], { maximumFractionDigits: 2 })} · HAC p ${regionalTrend.pValue === null ? unavailable : formatNumber(regionalTrend.pValue, { maximumFractionDigits: 3 })}` : (es ? "Tendencia o incertidumbre no disponible" : "Trend or uncertainty unavailable")}</small>
          <small>{es ? "Cobertura media" : "Mean data coverage"}: {historical?.mode === "real" ? `${formatNumber(historical.meanCoverage * 100, { maximumFractionDigits: 1 })}%` : unavailable}</small>
        </article>
        <article>
          <span>{es ? "Señal de la celda elegida" : "Selected grid-cell signal"}</span>
          {historicalCell ? <><b>{displayTrendValue(historicalCell.slopePerDecade)}</b><strong>{signalLabel(historicalCell.slopePerDecade, historicalCell.ci95, historicalCell.pValue)}</strong><small>{es ? "Tendencia estacional de anomalías, no deterioro del suelo." : "Seasonal anomaly trend; not a measure of land degradation."}</small></> : <b>{unavailable}</b>}
        </article>
        <div className="degradation-indicators" aria-label={es ? "Disponibilidad de indicadores de degradación" : "Land degradation indicator availability"}>
          <div><b>{es ? "Agua del suelo" : "Soil water"}</b><span>{regionalTrend ? (es ? "Disponible · GLDAS" : "Available · GLDAS") : unavailable}</span></div>
          <div><b>{es ? "Productividad vegetal" : "Vegetation productivity"}</b><span>{nppRows.length ? `${nppRows.length} ${es ? "años de NPP · muestra NASA" : "years of NASA NPP · sample"}` : (es ? "Sin bundle descargado" : "No downloaded bundle")}</span></div>
          <div><b>{es ? "Cambio de cobertura" : "Land-cover change"}</b><span>{es ? "Sin serie temporal integrada" : "No time series connected"}</span></div>
          <div><b>{es ? "Carbono orgánico del suelo" : "Soil organic carbon"}</b><span>{es ? "Sin mediciones comparables integradas" : "No comparable measurements connected"}</span></div>
        </div>
        {nppRows.length > 0 && <article className="npp-context">
          <div><b>{es ? "Productividad anual · muestra de celdas" : "Annual productivity · grid-cell sample"}</b><span>MODIS NPP · 500 m · kg C/m²/year</span></div>
          <svg viewBox="0 0 100 48" role="img" aria-label={es ? "Serie anual de productividad MODIS en cinco celdas seleccionadas" : "Annual MODIS productivity series at five sampled grid cells"} preserveAspectRatio="none"><polyline points={nppPoints} fill="none" stroke="#9cb98a" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>
          <small>{nppRows[0].year}–{nppRows[nppRows.length - 1].year} · {es ? "Promedio de muestra; no es una media areal de las Pampas." : "Sample mean; not an area-weighted Pampas mean."} {landContext.status === "ready" ? landContext.data.productivity.quality_note : ""}</small>
        </article>}
        <p>{es ? (observed?.condition_code === "below_reference_p20" ? "Sugerencia experimental: julio quedó bajo el P20 histórico. Comprobá humedad del lote y lluvia local antes de decidir si sembrar o regar." : "Sugerencia experimental: contrastá esta lectura con humedad del lote, lluvia local y etapa del cultivo antes de sembrar o regar.") : (observed?.condition_code === "below_reference_p20" ? "Experimental suggestion: July was below its historical P20. Check field soil moisture and local rainfall before deciding whether to plant or irrigate." : "Experimental suggestion: compare this reading with field moisture, local rainfall, and crop stage before planting or irrigation decisions.")} {es ? "No indica fecha de siembra ni cantidad de riego." : "It does not prescribe a planting date or irrigation amount."}</p>
        <div className="degradation-unavailable-grid">
          <div><span>{es ? "Probabilidad futura de baja humedad" : "Future low-moisture probability"}</span><b>{es ? "No disponible" : "Not available"}<small>{es ? "No hay una probabilidad futura calibrada." : "No calibrated future probability."}</small></b></div>
          <div><span>{es ? "Recomendación de siembra / riego" : "Planting / irrigation recommendation"}</span><b>{es ? "No disponible" : "Not available"}<small>{es ? "Sin umbrales por lote ni clima local." : "No field thresholds or local weather."}</small></b></div>
          <div><span>{es ? "Predicción de rendimiento" : "Crop-yield prediction"}</span><b>{es ? "No disponible" : "Not available"}<small>{es ? "La referencia regional de abajo no es una predicción para el campo." : "The regional reference below is not a field-specific prediction."}</small></b></div>
        </div>
        {landContext.status === "loading" && <p role="status">{es ? "Cargando el contexto NASA y de rendimientos…" : "Loading NASA and yield context…"}</p>}
        {(landContext.status === "missing" || landContext.status === "error") && <p className="land-context-state" role={landContext.status === "error" ? "alert" : "status"}>{es ? "Falta el paquete local de productividad y rendimiento. Ejecutá frontend/scripts/build_land_context.py para descargarlo desde fuentes públicas." : "The local productivity and yield bundle is missing. Run frontend/scripts/build_land_context.py to fetch it from public sources."}</p>}
        {landContext.status === "ready" && yieldEstimate && <article className="yield-context"><div><span>{es ? "REFERENCIA EXPLORATORIA DE RENDIMIENTO" : "EXPLORATORY YIELD REFERENCE"}</span><b>{yieldEstimate.exploratory_baseline_kg_ha == null ? unavailable : `${formatNumber(yieldEstimate.exploratory_baseline_kg_ha, { maximumFractionDigits: 0 })} kg/ha`}</b></div><p>{es ? `Promedio ponderado por superficie cosechada de ${yieldEstimate.baseline_campaigns.join(", ")}. Rango de campañas: ${yieldEstimate.recent_campaign_range_kg_ha ? `${formatNumber(yieldEstimate.recent_campaign_range_kg_ha[0], { maximumFractionDigits: 0 })}–${formatNumber(yieldEstimate.recent_campaign_range_kg_ha[1], { maximumFractionDigits: 0 })} kg/ha` : unavailable}.` : `Harvested-area-weighted mean for ${yieldEstimate.baseline_campaigns.join(", ")}. Campaign range: ${yieldEstimate.recent_campaign_range_kg_ha ? `${formatNumber(yieldEstimate.recent_campaign_range_kg_ha[0], { maximumFractionDigits: 0 })}–${formatNumber(yieldEstimate.recent_campaign_range_kg_ha[1], { maximumFractionDigits: 0 })} kg/ha` : unavailable}.`}</p><small>{es ? `Contexto provincial (${landContext.data.yield_context.geography.join(", ")}), no estimación del lote ni modelo de rendimiento.` : `Provincial context (${landContext.data.yield_context.geography.join(", ")}); not a field estimate or yield model.`}</small></article>}
        {landContext.status === "ready" && !yieldEstimate && <p>{es ? "El rendimiento histórico no está disponible para este cultivo." : "Historical yield context is unavailable for this crop."}</p>}
      </section>
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
      <details className="agricultural-source"><summary>{es ? "Fuentes de contexto regional y método" : "Regional context & method sources"}</summary>
        {landContext.status === "ready" && <><p><a href="https://modis.ornl.gov/data/modis_webservice.html" target="_blank" rel="noreferrer">NASA ORNL DAAC · MOD17A3HGF.061</a> — annual 500 m NPP subset API. DOI: <a href="https://doi.org/10.5067/MODIS/MOD17A3HGF.061" target="_blank" rel="noreferrer">10.5067/MODIS/MOD17A3HGF.061</a>. {es ? `Muestra: ${landContext.data.productivity.sample_cells.length} celdas; control de calidad pixel a pixel no descargado.` : `Sample: ${landContext.data.productivity.sample_cells.length} cells; pixel quality flags were not downloaded.`}</p><p><a href="https://datos.gob.ar/dataset/agroindustria-agricultura---estimaciones-agricolas" target="_blank" rel="noreferrer">Argentina · Estimaciones agrícolas</a> — {es ? `rendimientos agregados en cinco provincias; CSV SHA-256 ${landContext.data.yield_context.csv_sha256}.` : `aggregated yields across five provinces; CSV SHA-256 ${landContext.data.yield_context.csv_sha256}.`}</p></>}
        <p><a href="https://www.unccd.int/resources/unccd-library/good-practice-guidance-sustainable-development-goal-sdg-indicator-1531" target="_blank" rel="noreferrer">UNCCD · SDG indicator 15.3.1</a> — {es ? "integra cambio de cobertura, productividad de la tierra y carbono orgánico del suelo; este tablero solo muestra una señal de agua." : "integrates land-cover change, land productivity, and soil organic carbon; this dashboard currently shows only a water signal."}</p>
        <p><a href="https://www.argentina.gob.ar/node/486863" target="_blank" rel="noreferrer">INTA · Mapa Nacional de Cultivos</a> — {es ? "mapeo anual de la distribución de cultivos." : "annual crop distribution mapping."}</p>
        <p><a href="https://www.agritotal.com/nota/eleccion-y-manejo-cultivares/" target="_blank" rel="noreferrer">INTA · Elección y manejo por región</a> — {es ? "ventanas orientativas de soja para Pampas norte y sur; varían con ambiente y cultivar." : "indicative soybean windows for the northern and southern Pampas; they vary by environment and cultivar."}</p>
        <p><a href="https://repositorio.inta.gob.ar/xmlui/bitstream/handle/20.500.12123/8295/INTA_CRBsAsNorte_EEAPergamino_Ventimiglia_Luis_Maiz_siembra_temprana_o_siembra_demorada.pdf?isAllowed=y&sequence=1" target="_blank" rel="noreferrer">INTA · Maíz: siembra temprana o demorada</a> — {es ? "ventanas variables de maíz en la región pampeana." : "variable maize sowing windows in the Pampas region."}</p>
        <p><a href="https://www.argentina.gob.ar/node/375799" target="_blank" rel="noreferrer">INTA · Ciclos y siembra de trigo</a> — {es ? "fechas orientativas según ciclo y ambiente." : "indicative dates by cultivar cycle and environment."}</p>
        <p><a href="https://repositorio.inta.gob.ar/bitstream/handle/20.500.12123/3833/INTA_CIAP_InstitutodePatologiaVegetal_Serri_DL_Incorporacion_de_trigo_en_la_rotacion_agricola.pdf?isAllowed=y&sequence=1" target="_blank" rel="noreferrer">INTA · Incorporación de trigo en la rotación agrícola</a> — {es ? "contexto histórico de cultivos pampeanos. Las fuentes documentan presencia regional, no aptitud local del campo." : "historical Pampas crop context. Sources establish regional presence, not local field suitability."}</p>
      </details>
    </>}
  </section>;
}
