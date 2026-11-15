import { SpatialHindcast } from "./SpatialHindcast";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Database, LoaderCircle, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadPredictiveEvaluation } from "../data/loadPredictive";
import type { EvaluationScope, EvaluationTarget, PredictiveEvaluation, ScoreName } from "../types/predictive";
import { useI18n } from "../i18n";

type LoadState = { status: "loading" } | { status: "ready"; data: PredictiveEvaluation } | { status: "error"; message: string };
const scoreLabel: Record<ScoreName, string> = { rmse: "RMSE", mae: "MAE", brier: "Brier score" };
const modelNames: Record<string, string> = {
  seasonal_climatology: "Seasonal climatology", persistence: "Persistence", autoregressive_ridge: "Autoregressive Ridge",
  ridge: "Ridge", xgboost: "XGBoost", xgboost_hmm: "XGBoost + filtered HMM states",
};
const targetNames: Record<EvaluationTarget, string> = { storage: "Soil-water storage", anomaly: "Storage anomaly", low_moisture: "Low-moisture probability" };
const show = (value: number | null | undefined, language: "en" | "es" = "en") => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(language === "es" ? "es-AR" : "en-US", { maximumFractionDigits: 3 }).format(value);

export function PredictiveResearchPage() {
  const { language, t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [scope, setScope] = useState<EvaluationScope>("regional");
  const [horizon, setHorizon] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<EvaluationTarget>("storage");

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    loadPredictiveEvaluation().then(
      (data) => active && setState({ status: "ready", data }),
      (error: unknown) => active && setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load predictive evaluation." }),
    );
    return () => { active = false; };
  }, [attempt]);

  const selected = state.status === "ready" ? state.data.results.find((item) => item.scope === scope && item.horizon_months === horizon && item.target === target) : undefined;
  const score: ScoreName = selected?.primary_metric ?? (target === "low_moisture" ? "brier" : "rmse");
  const chartData = useMemo(() => selected?.models.map((item) => ({
    name: modelNames[item.model] ?? item.model,
    role: item.role,
    selected: item.selected_before_holdout,
    walkForward: mean(item.walk_forward.folds.map((fold) => fold.metrics[score])),
    holdout: item.holdout.metrics[score] ?? null,
    id: item.model,
  })) ?? [], [selected, score]);
  const holdoutWinner = selected?.models.find((item) => item.model === selected.descriptive_holdout_model);
  const preHoldoutSelection = selected?.models.find((item) => item.model === selected.selected_model);

  return <>
    <section className="page-intro predictive-intro">
      <div><div className="eyebrow"><span className="eyebrow-line" /> {language === "es" ? "INVESTIGACIÓN / EVALUACIÓN RETROSPECTIVA DE MODELOS" : "RESEARCH / RETROSPECTIVE MODEL EVALUATION"}</div>
        <h1>{language === "es" ? <>Investigación <em>predictiva</em></> : <>Predictive <em>research</em></>}</h1>
        <p>{language === "es" ? "Evaluación cronológica fuera de muestra de variables históricas de agua en el suelo. Esta página no emite pronósticos en vivo." : t("researchDesc")}</p>
      </div>
      <div className="research-status"><span className="status-mark" /><b>{language === "es" ? "EVALUACIÓN HISTÓRICA" : "HISTORICAL EVALUATION"}</b><small>{language === "es" ? "SIN PRONÓSTICO OPERATIVO" : "NO OPERATIONAL FORECAST"}</small></div>
    </section>

    <div className="research-notice" role="note"><Activity size={16} /><span>{language === "es" ? "Los puntajes solo aparecerán cuando se instale un artefacto de evaluación válido. No se muestran resultados ilustrativos ni DEMO." : "Model scores appear only after a schema-valid evaluation artifact is installed. No illustrative or DEMO scores are shown."}</span><code>predictive_evaluation_v1</code></div>

    <section className="research-status-ladder" aria-label="Evaluation and forecast status">
      <article><span>01 · {language === "es" ? "EVALUACIÓN HISTÓRICA" : "HISTORICAL EVALUATION"}</span><b>{state.status === "ready" ? (language === "es" ? "Artefacto validado cargado" : "Validated artifact loaded") : (language === "es" ? "Sin artefacto de evaluación" : "No evaluation artifact loaded")}</b></article>
      <article><span>02 · {language === "es" ? "HINDCAST RETROSPECTIVO" : "RETROSPECTIVE HINDCAST"}</span><b>{language === "es" ? "Solo períodos históricos y holdout" : "Historical folds and holdout only"}</b></article>
      <article><span>03 · {language === "es" ? "PROSPECTIVA EXPERIMENTAL" : "EXPERIMENTAL PROSPECTIVE"}</span><b>{language === "es" ? "No conectada en esta versión" : "Not connected in this frontend"}</b></article>
      <article><span>04 · {language === "es" ? "ELEGIBILIDAD OPERATIVA" : "OPERATIONALLY ELIGIBLE"}</span><b>{language === "es" ? "No disponible · sin señal verificada" : "Unavailable · no verified eligibility signal"}</b></article>
    </section>

    <section className="research-selection-context" aria-labelledby="selection-context-title">
      <div className="eyebrow">{language === "es" ? "SELECCIÓN DEL MODELO / DISCIPLINA DE HOLDOUТ" : "MODEL SELECTION / HOLDOUT DISCIPLINE"}</div>
      <h2 id="selection-context-title">{language === "es" ? "Selección previa al holdout" : "Pre-holdout model selection"}</h2>
      <p>{preHoldoutSelection ? `${modelNames[preHoldoutSelection.model] ?? preHoldoutSelection.model} ${language === "es" ? "es el modelo" : "is the model"} ${preHoldoutSelection.role} ${language === "es" ? "seleccionado con resultados walk-forward anteriores al holdout reservado." : "selected using walk-forward results before the reserved holdout."}` : (language === "es" ? "El artefacto identifica el modelo elegido con resultados walk-forward previos al holdout reservado." : "The artifact identifies the selected model using walk-forward results before the reserved holdout.")} {language === "es" ? "Los rankings del holdout son descriptivos y nunca se usan para elegir nuevamente un modelo." : "Holdout rankings are descriptive only and are never used to reselect a model."}</p>
      <span>{language === "es" ? "El holdout mide la generalización histórica; no demuestra habilidad predictiva prospectiva u operativa." : "The holdout measures historical generalization. It does not establish prospective or operational forecast skill."}</span>
    </section>

    <section className="research-controls panel" aria-label={language === "es" ? "Filtros de evaluación" : "Evaluation filters"}>
      <label><span>{language === "es" ? "Soporte de evaluación" : "Evaluation support"}</span><select value={scope} onChange={(event) => setScope(event.target.value as EvaluationScope)}><option value="regional">{language === "es" ? "Promedio regional" : "Regional average"}</option><option value="spatial">{language === "es" ? "Celdas espaciales" : "Spatial cells"}</option></select></label>
      <label><span>{language === "es" ? "Horizonte de predicción" : "Prediction horizon"}</span><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>{language === "es" ? "A 1 mes" : "1 month ahead"}</option><option value={2}>{language === "es" ? "A 2 meses" : "2 months ahead"}</option><option value={3}>{language === "es" ? "A 3 meses" : "3 months ahead"}</option></select></label>
      <label><span>{t("target")}</span><select value={target} onChange={(event) => setTarget(event.target.value as EvaluationTarget)}><option value="storage">{t("storage")}</option><option value="anomaly">{t("anomaly")}</option><option value="low_moisture">{t("lowMoisture")}</option></select></label>
    </section>

    {state.status === "loading" && <section className="research-state panel" aria-live="polite"><LoaderCircle className="spin" size={21} /><div><b>{language === "es" ? "Buscando una evaluación validada" : "Checking for validated evaluation"}</b><span>{language === "es" ? "Leyendo" : "Reading"} /data/predictive_evaluation_v1.json</span></div></section>}
    {state.status === "error" && <section className="research-state research-error panel" role="status"><AlertTriangle size={20} /><div><b>{language === "es" ? "Evaluación histórica no disponible" : "Historical evaluation unavailable"}</b><span>{state.message}</span><code>frontend/public/data/predictive_evaluation_v1.json</code><button className="button-secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={13} /> {t("retry")}</button></div></section>}
    {state.status === "ready" && !selected && <section className="research-state panel" role="status"><Database size={20} /><div><b>{language === "es" ? "No hay resultados para esta selección" : "No evaluated result for this selection"}</b><span>{language === "es" ? `El artefacto no contiene un resultado ${scope === "regional" ? "regional" : "espacial"} a ${horizon} mes(es) para ${targetNames[target]}. No se sustituye ningún valor.` : `The artifact has no ${scope} result for ${horizon} month(s) ahead and ${targetNames[target].toLowerCase()}. No value is substituted.`}</span></div></section>}
    {selected && state.status === "ready" && <>
      <section className="research-meta-grid">
        <article className="panel research-meta-card"><span>{language === "es" ? "PERÍODO DE OBSERVACIÓN" : "OBSERVATION PERIOD"}</span><b>{selected.models[0].holdout.period.start} — {selected.models[0].holdout.period.end}</b><small>{t("holdout")}: {state.data.evaluation.holdout_month_count} {language === "es" ? "meses objetivo ·" : "target months ·"} {selected.models[0].holdout.n_rows.toLocaleString(language === "es" ? "es-AR" : "en-US")} {language === "es" ? "filas evaluadas" : "evaluated rows"}</small></article>
        <article className="panel research-meta-card"><span>SUPPORT & TARGET</span><b>{selected.scope_definition}</b><small>{targetNames[selected.target]} · {selected.target_definition.units} · {selected.horizon_months} month horizon</small></article>
        <article className="panel research-meta-card"><span>INPUT PROVENANCE</span><b>{state.data.provenance.source_product} {state.data.provenance.source_version}</b><small>{state.data.provenance.source_file_count} source files · {state.data.provenance.geography} · {state.data.provenance.grid_resolution_degrees}° grid</small></article>
      </section>
      <section className="panel research-chart-panel">
        <div className="panel-heading research-chart-heading"><div><div className="eyebrow">{t("modelComparison")} / {scoreLabel[score].toUpperCase()}</div><h2>{t(selected.target === "storage" ? "storage" : selected.target === "anomaly" ? "anomaly" : "lowMoisture")} · {selected.horizon_months} {language === "es" ? "meses" : "months"}</h2></div><span className="historical-chip">{t("outOfSampleHistorical")}</span></div>
        <div className="chart-key-row"><span><i className="key-walk" /> {t("walkForwardMean")}</span><span><i className="key-hold" /> {t("untouchedHoldout")}</span><small>{t("lowerIsBetter").replace("{metric}", scoreLabel[score])} · {selected.target_definition.units}</small></div>
        <div className="research-chart" role="img" aria-label={`${scoreLabel[score]} ${language === "es" ? "comparación de períodos walk-forward y holdout" : "comparison for walk-forward and holdout periods"}`}>
          {chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
            <CartesianGrid stroke="#283334" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#9aa69e", fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={52} />
            <YAxis tick={{ fill: "#84928b", fontSize: 9 }} width={52} domain={[0, "auto"]} />
            <Tooltip contentStyle={{ background: "#121a1a", border: "1px solid #364342", borderRadius: 5, color: "#e1e8df", fontSize: 11 }} formatter={(value, name) => [show(typeof value === "number" ? value : null, language), name === "walkForward" ? t("walkForwardMean") : t("untouchedHoldout")]} />
            <Legend formatter={(value) => value === "walkForward" ? t("walkForwardMean") : t("untouchedHoldout")} />
            <Bar dataKey="walkForward" name="walkForward" fill="#79a48b" radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Bar dataKey="holdout" name="holdout" fill="#d3b883" radius={[3, 3, 0, 0]} maxBarSize={32} />
          </BarChart></ResponsiveContainer> : <div className="chart-empty">{t("noFiniteScores")}</div>}
        </div>
        <div className="selection-labels"><span><b>{t("modelSelectionControl")}</b> {preHoldoutSelection ? `${modelNames[preHoldoutSelection.model] ?? preHoldoutSelection.model} · ${preHoldoutSelection.role === "baseline" ? t("selectedBaseline") : t("selectedCandidate")}` : t("notAvailableChosenWalk")}</span><span><b>{t("descriptiveHoldoutComparison")}</b> {holdoutWinner ? `${modelNames[holdoutWinner.model] ?? holdoutWinner.model} · ${t("descriptiveLowestHoldout")}` : t("evalNotAvailable")}; {t("notUsedForSelection")}.</span></div>
      </section>

      <section className="panel research-table-panel">
        <div className="panel-heading"><div><div className="eyebrow">{t("scoreBaselineUncertainty")}</div><h2>{t("evaluationDetails")}</h2></div><span className="panel-period">{scoreLabel[score]} · {selected.target_definition.units}</span></div>
        <div className="research-table-wrap"><table className="research-table"><thead><tr><th>{t("evalModel")}</th><th>{t("roleSelection")}</th><th>{t("walkForwardMean")}</th><th>{t("holdoutScore")}</th><th>{t("skillPersistence")}</th><th>{t("skillClimatology")}</th><th>{t("scoreDifferenceInterval")}</th></tr></thead><tbody>
          {selected.models.map((item) => <tr key={item.model}>
            <th scope="row">{modelNames[item.model] ?? item.model}</th><td>{item.role === "baseline" ? (item.selected_before_holdout ? "Selected baseline · pre-holdout" : "Baseline") : (item.selected_before_holdout ? "Pre-holdout selected candidate" : "Candidate")}</td>
            <td>{show(mean(item.walk_forward.folds.map((fold) => fold.metrics[score])), language)}</td><td>{show(item.holdout.metrics[score], language)}</td>
            <td>{show(item.skill_scores.vs_persistence, language)}</td><td>{show(item.skill_scores.vs_climatology, language)}</td>
            <td>{intervalText(item.uncertainty.metric_difference_interval_95, language)}<small>{item.uncertainty.method}</small></td>
          </tr>)}
        </tbody></table></div>
        <p className="uncertainty-note">{t("pairedScoreNote")}</p>
      </section>

      <section className="research-lower-grid">
        <article className="panel research-info-card"><div className="eyebrow">{t("methodDataAvailability")}</div><h2>{t("chronologicalEvaluation")}</h2><p>{state.data.evaluation.method}. {language === "es" ? "El modelo se selecciona antes del holdout final mediante:" : "The selected model is determined before the final holdout using:"} {state.data.evaluation.selection_method}.</p><dl><div><dt>{t("evalIssueTime")}</dt><dd>{state.data.evaluation.issue_time_rule}</dd></div><div><dt>{t("featureAvailability")}</dt><dd>{state.data.evaluation.release_rule} {state.data.provenance.release_lag_months === null ? "" : `${language === "es" ? "Demora de publicación" : "Release lag"}: ${state.data.provenance.release_lag_months} ${language === "es" ? "meses" : "months"} (${state.data.provenance.availability_policy}).`}</dd></div><div><dt>{t("spatialSplit")}</dt><dd>{state.data.evaluation.spatial_fold_rule}</dd></div><div><dt>{t("holdout")}</dt><dd>{state.data.evaluation.holdout_period.start} — {state.data.evaluation.holdout_period.end}</dd></div></dl></article>
        <article className="panel research-info-card"><div className="eyebrow">{t("limitsInterpretation")}</div><h2>{t("historicalSkillNotForecast")}</h2><ul>{state.data.evaluation.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}<li>{language === "es" ? "El evento de baja humedad usa un umbral estadístico definido con entrenamiento; no equivale a sequía agrícola, estrés, rendimiento ni daño verificados." : "The low-moisture event is a training-defined statistical threshold, not verified agricultural drought, crop stress, yield, or damage."}</li><li>{language === "es" ? "Los productos archivados y las demoras supuestas no demuestran habilidad operativa de pronóstico." : "Archived final products and assumed release timing do not establish operational forecast skill."}</li></ul></article>
      </section>
      <section className="panel research-info-card research-provenance"><div className="eyebrow">{t("sourceManifest")}</div><h2>{t("provenanceFingerprints")}</h2><div><span>{t("inputPanelHash")}</span><code>{state.data.provenance.input_panel_sha256}</code></div><div><span>{t("sourceManifestHash")}</span><code>{state.data.provenance.source_manifest_sha256}</code></div><p>{t("source")}: {state.data.provenance.source_doi}</p></section>
    </>}

    <SpatialHindcast />
    <div className="research-notice" role="note"><Activity size={15} /><span>{language === "es" ? "Los artefactos de pronóstico y su elegibilidad operativa se evalúan por separado. Las predicciones del holdout histórico no son pronósticos en vivo." : "Forecast artifacts and operational eligibility are handled separately. Historical holdout predictions are not live forecasts."}</span></div>
    <footer className="page-footer"><span><Database size={13} /> {language === "es" ? "ARTEFACTO DE EVALUACIÓN · " : "MODEL EVALUATION ARTIFACT · "}{state.status === "ready" ? (language === "es" ? "VALIDADO" : "VALIDATED") : t("evalNotAvailable")}</span><span>{t("historicalOutOfSample")}</span><span>ALPHA AGRO · {t("developedBy")} QUANT ALPHA</span></footer>
  </>;
}

function isValue(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function mean(values: Array<number | [number | null, number | null] | null | undefined>) {
  const numbers = values.filter(isValue);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}
function intervalText(interval: [number | null, number | null] | null, language: "en" | "es" = "en") {
  return interval ? `${show(interval[0], language)} ${language === "es" ? "a" : "to"} ${show(interval[1], language)}` : "—";
}
