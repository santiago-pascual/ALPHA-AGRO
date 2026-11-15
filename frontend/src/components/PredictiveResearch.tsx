import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Database, LoaderCircle, LockKeyhole, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadPredictiveEvaluation } from "../data/loadPredictive";
import type { EvaluationScope, EvaluationTarget, PredictiveEvaluation, ScoreName } from "../types/predictive";

type LoadState = { status: "loading" } | { status: "ready"; data: PredictiveEvaluation } | { status: "error"; message: string };
const scoreLabel: Record<ScoreName, string> = { rmse: "RMSE", mae: "MAE", brier: "Brier score" };
const modelNames: Record<string, string> = {
  seasonal_climatology: "Seasonal climatology", persistence: "Persistence", autoregressive_ridge: "Autoregressive Ridge",
  ridge: "Ridge", xgboost: "XGBoost", xgboost_hmm: "XGBoost + filtered HMM states",
};
const targetNames: Record<EvaluationTarget, string> = { storage: "Soil-water storage", anomaly: "Storage anomaly", low_moisture: "Low-moisture probability" };
const formatter = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });
const show = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : formatter.format(value);

export function PredictiveResearchPage() {
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

  return <>
    <section className="page-intro predictive-intro">
      <div><div className="eyebrow"><span className="eyebrow-line" /> RESEARCH / RETROSPECTIVE MODEL EVALUATION</div>
        <h1>Predictive <em>research</em></h1>
        <p>Chronological out-of-sample evaluation of historical soil-water targets. This page does not issue live forecasts.</p>
      </div>
      <div className="research-status"><span className="status-mark" /><b>HISTORICAL EVALUATION</b><small>NO OPERATIONAL FORECAST</small></div>
    </section>

    <div className="research-notice" role="note"><Activity size={16} /><span>Model scores will appear only after a schema-valid evaluation artifact is installed. No illustrative or DEMO scores are shown here.</span><code>predictive_evaluation_v1</code></div>

    <section className="research-controls panel" aria-label="Evaluation filters">
      <label><span>Evaluation support</span><select value={scope} onChange={(event) => setScope(event.target.value as EvaluationScope)}><option value="regional">Regional average</option><option value="spatial">Spatial cells</option></select></label>
      <label><span>Prediction horizon</span><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as 1 | 2 | 3)}><option value={1}>1 month ahead</option><option value={2}>2 months ahead</option><option value={3}>3 months ahead</option></select></label>
      <label><span>Target</span><select value={target} onChange={(event) => setTarget(event.target.value as EvaluationTarget)}><option value="storage">Soil-water storage</option><option value="anomaly">Storage anomaly</option><option value="low_moisture">Low-moisture probability</option></select></label>
    </section>

    {state.status === "loading" && <section className="research-state panel" aria-live="polite"><LoaderCircle className="spin" size={21} /><div><b>Checking for validated evaluation</b><span>Reading /data/predictive_evaluation_v1.json</span></div></section>}
    {state.status === "error" && <section className="research-state research-error panel" role="status"><AlertTriangle size={20} /><div><b>Historical evaluation unavailable</b><span>{state.message}</span><code>frontend/public/data/predictive_evaluation_v1.json</code><button className="button-secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={13} /> Retry file check</button></div></section>}
    {state.status === "ready" && !selected && <section className="research-state panel" role="status"><Database size={20} /><div><b>No evaluated result for this selection</b><span>The artifact has no {scope} result for {horizon} month(s) ahead and {targetNames[target].toLowerCase()}. No value is substituted.</span></div></section>}
    {selected && state.status === "ready" && <>
      <section className="research-meta-grid">
        <article className="panel research-meta-card"><span>OBSERVATION PERIOD</span><b>{selected.models[0].holdout.period.start} — {selected.models[0].holdout.period.end}</b><small>Holdout: {state.data.evaluation.holdout_month_count} target months · {selected.models[0].holdout.n_rows.toLocaleString()} evaluated rows</small></article>
        <article className="panel research-meta-card"><span>SUPPORT & TARGET</span><b>{selected.scope_definition}</b><small>{targetNames[selected.target]} · {selected.target_definition.units} · {selected.horizon_months} month horizon</small></article>
        <article className="panel research-meta-card"><span>INPUT PROVENANCE</span><b>{state.data.provenance.source_product} {state.data.provenance.source_version}</b><small>{state.data.provenance.source_file_count} source files · {state.data.provenance.geography} · {state.data.provenance.grid_resolution_degrees}° grid</small></article>
      </section>
      <section className="panel research-chart-panel">
        <div className="panel-heading research-chart-heading"><div><div className="eyebrow">MODEL COMPARISON / {scoreLabel[score].toUpperCase()}</div><h2>{targetNames[selected.target]} · {selected.horizon_months}-month horizon</h2></div><span className="historical-chip">OUT-OF-SAMPLE · HISTORICAL</span></div>
        <div className="chart-key-row"><span><i className="key-walk" /> Walk-forward mean</span><span><i className="key-hold" /> Untouched holdout</span><small>Lower {scoreLabel[score]} is better · {selected.target_definition.units}</small></div>
        <div className="research-chart" role="img" aria-label={`${scoreLabel[score]} comparison for walk-forward and holdout periods`}>
          {chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
            <CartesianGrid stroke="#283334" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#9aa69e", fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={52} />
            <YAxis tick={{ fill: "#84928b", fontSize: 9 }} width={52} domain={[0, "auto"]} />
            <Tooltip contentStyle={{ background: "#121a1a", border: "1px solid #364342", borderRadius: 5, color: "#e1e8df", fontSize: 11 }} formatter={(value, name) => [show(typeof value === "number" ? value : null), name === "walkForward" ? "Walk-forward mean" : "Untouched holdout"]} />
            <Legend formatter={(value) => value === "walkForward" ? "Walk-forward mean" : "Untouched holdout"} />
            <Bar dataKey="walkForward" name="walkForward" fill="#79a48b" radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Bar dataKey="holdout" name="holdout" fill="#d3b883" radius={[3, 3, 0, 0]} maxBarSize={32} />
          </BarChart></ResponsiveContainer> : <div className="chart-empty">No finite scores are available for this selection.</div>}
        </div>
        <div className="selection-labels"><span><b>Pre-holdout selection</b> Marked model selected using walk-forward results only.</span><span><b>Holdout winner</b> {holdoutWinner ? `${modelNames[holdoutWinner.model] ?? holdoutWinner.model} · descriptive lowest score` : "Not available"}; holdout is not used for model selection.</span></div>
      </section>

      <section className="panel research-table-panel">
        <div className="panel-heading"><div><div className="eyebrow">SCORES / BASELINES / UNCERTAINTY</div><h2>Evaluation details</h2></div><span className="panel-period">{scoreLabel[score]} · {selected.target_definition.units}</span></div>
        <div className="research-table-wrap"><table className="research-table"><thead><tr><th>Model</th><th>Role / selection</th><th>Walk-forward mean</th><th>Holdout score</th><th>Skill vs persistence</th><th>Skill vs climatology</th><th>95% score-difference interval</th></tr></thead><tbody>
          {selected.models.map((item) => <tr key={item.model}>
            <th scope="row">{modelNames[item.model] ?? item.model}</th><td>{item.selected_before_holdout ? "Pre-holdout selected" : item.role === "baseline" ? "Baseline" : "Candidate"}</td>
            <td>{show(mean(item.walk_forward.folds.map((fold) => fold.metrics[score])))}</td><td>{show(item.holdout.metrics[score])}</td>
            <td>{show(item.skill_scores.vs_persistence)}</td><td>{show(item.skill_scores.vs_climatology)}</td>
            <td>{intervalText(item.uncertainty.metric_difference_interval_95)}<small>{item.uncertainty.method}</small></td>
          </tr>)}
        </tbody></table></div>
        <p className="uncertainty-note">Intervals are uncertainty in paired score differences against the named baseline, not predictive intervals for future soil moisture. Skill values are shown only when provided by the validated artifact.</p>
      </section>

      <section className="research-lower-grid">
        <article className="panel research-info-card"><div className="eyebrow">METHOD / DATA AVAILABILITY</div><h2>Chronological evaluation</h2><p>{state.data.evaluation.method}. The selected model is determined before the final holdout using: {state.data.evaluation.selection_method}.</p><dl><div><dt>Issue time</dt><dd>{state.data.evaluation.issue_time_rule}</dd></div><div><dt>Feature availability</dt><dd>{state.data.evaluation.release_rule} {state.data.provenance.release_lag_months === null ? "" : `Release lag: ${state.data.provenance.release_lag_months} months (${state.data.provenance.availability_policy}).`}</dd></div><div><dt>Spatial split rule</dt><dd>{state.data.evaluation.spatial_fold_rule}</dd></div><div><dt>Holdout</dt><dd>{state.data.evaluation.holdout_period.start} — {state.data.evaluation.holdout_period.end}</dd></div></dl></article>
        <article className="panel research-info-card"><div className="eyebrow">LIMITS / INTERPRETATION</div><h2>Historical skill is not a forecast</h2><ul>{state.data.evaluation.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}<li>The low-moisture event is a training-defined statistical threshold, not verified agricultural drought, crop stress, yield, or damage.</li><li>Archived final products and assumed release timing do not establish operational forecast skill.</li></ul></article>
      </section>
      <section className="panel research-info-card research-provenance"><div className="eyebrow">SOURCE MANIFEST / REPRODUCIBILITY</div><h2>Provenance fingerprints</h2><div><span>Input panel SHA-256</span><code>{state.data.provenance.input_panel_sha256}</code></div><div><span>Source manifest SHA-256</span><code>{state.data.provenance.source_manifest_sha256}</code></div><p>Source: {state.data.provenance.source_doi}</p></section>
    </>}

    <section className="forecast-explorer panel" aria-labelledby="forecast-heading"><div className="forecast-icon"><LockKeyhole size={18} /></div><div className="forecast-copy"><div className="eyebrow">SEPARATE WORKSPACE / DISABLED</div><h2 id="forecast-heading">Forecast Explorer</h2><p>Reserved for a separately validated <code>forecast_v1.json</code> with an explicit issue time, data-availability cutoff, forecast horizon, and predictive intervals.</p><small>Historical holdout predictions shown above are not live forecasts.</small></div><button disabled aria-disabled="true">Forecast unavailable</button></section>
    <footer className="page-footer"><span><Database size={13} /> MODEL EVALUATION ARTIFACT · {state.status === "ready" ? "VALIDATED" : "NOT AVAILABLE"}</span><span>RETROSPECTIVE OUT-OF-SAMPLE SCORES · NO LIVE FORECASTS</span></footer>
  </>;
}

function isValue(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function mean(values: Array<number | [number | null, number | null] | null | undefined>) {
  const numbers = values.filter(isValue);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}
function intervalText(interval: [number | null, number | null] | null) {
  return interval ? `${show(interval[0])} to ${show(interval[1])}` : "—";
}
