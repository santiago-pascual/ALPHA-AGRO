import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChartNoAxesCombined, LoaderCircle, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadEnvironmentalRelationships } from "../data/loadRelationships";
import type { EnvironmentalRelationships, RelationshipRegion } from "../types/relationships";

type LoadState = { status: "loading" } | { status: "ready"; data: EnvironmentalRelationships } | { status: "error"; message: string };

const regionNames: Record<RelationshipRegion, string> = { full: "Full study box", north: "Northern half", south: "Southern half" };
const variableNames = {
  rainfall: "Rainfall",
  evapotranspiration: "Evapotranspiration",
  air_temperature: "Air temperature",
  surface_runoff: "Surface runoff",
  subsurface_runoff: "Subsurface runoff",
} as const;

function number(value: number) {
  return value.toFixed(3);
}

export function RelationshipsPage() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [region, setRegion] = useState<RelationshipRegion>("full");
  const [lag, setLag] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    loadEnvironmentalRelationships().then(
      (data) => active && setState({ status: "ready", data }),
      (error: unknown) => active && setState({ status: "error", message: error instanceof Error ? error.message : "Environmental relationship artifact could not be read." }),
    );
    return () => { active = false; };
  }, [attempt]);

  const rows = useMemo(() => state.status === "ready"
    ? state.data.associations.filter((item) => item.region === region && item.lag === lag)
    : [], [state, region, lag]);
  const chartRows = rows.map((item) => ({
    ...item,
    label: variableNames[item.variable],
    errorRange: [item.r - item.ci95[0], item.ci95[1] - item.r],
  }));

  return (
    <>
      <section className="page-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> EARTH SYSTEMS / ENVIRONMENTAL RELATIONSHIPS</div>
          <h1>Environmental <em>relationships</em></h1>
          <p>Explore retrospective associations between GLDAS soil-water anomalies and other model variables. Shared model physics and forcing mean these results are not independent validation and do not establish causality.</p>
        </div>
        <div className="intro-meta"><span className="period-label">ANALYSIS WINDOW</span><b>JAN 2006 <i>→</i> DEC 2025</b><span>240 monthly observations · versioned scientific artifact</span></div>
      </section>

      {state.status === "loading" && <section className="state-card" role="status" aria-live="polite"><LoaderCircle className="spin" size={22} /><div><b>Loading validated relationship results</b><span>Checking /data/environmental_relationships_v1.json</span></div></section>}
      {state.status === "error" && <section className="state-card relationship-error" role="status"><AlertTriangle size={21} /><div><b>Environmental relationship results unavailable</b><span>{state.message}</span><code>frontend/release-data/environmental_relationships_v1.json</code><button className="button-secondary" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={13} /> Retry file check</button></div></section>}
      {state.status === "ready" && <>
        <section className="relationship-meta-grid" aria-label="Relationship data provenance">
          <article className="panel relationship-meta"><span>RESPONSE</span><b>{state.data.response_variable}</b><small>0–100 cm modeled storage</small></article>
          <article className="panel relationship-meta"><span>JOINT DATA COVERAGE</span><b>{(Math.min(...Object.values(state.data.minimum_joint_coverage)) * 100).toFixed(1)}% minimum</b><small>Lowest of full, north, and south areas</small></article>
          <article className="panel relationship-meta"><span>INPUT SUPPORT</span><b>{state.data.observation_period.months} months · 0.25°</b><small>{state.data.source_product} {state.data.source_version}</small></article>
          <article className="panel relationship-meta"><span>INPUT FINGERPRINT</span><b>240 source records</b><small>{state.data.input_manifest.filename}</small><details><summary>View full manifest SHA-256</summary><code>{state.data.input_manifest.sha256}</code></details></article>
        </section>

        <section className="panel relationships-panel" aria-labelledby="relationships-chart-title">
          <div className="panel-heading"><div><div className="eyebrow">DE-TRENDED ANOMALY ASSOCIATIONS</div><h2 id="relationships-chart-title"><ChartNoAxesCombined size={17} /> Driver links by lead time</h2></div><span className="historical-chip">RETROSPECTIVE · NOT CAUSAL</span></div>
          <div className="relationship-controls">
            <label><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value as RelationshipRegion)}>{Object.entries(regionNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Driver lead</span><select value={lag} onChange={(event) => setLag(Number(event.target.value))}>{Array.from({ length: 7 }, (_, value) => <option value={value} key={value}>{value === 0 ? "Same month" : `${value} month${value === 1 ? "" : "s"} earlier`}</option>)}</select></label>
            <span className="relationship-unit">Pearson r · dimensionless</span>
          </div>
          {chartRows.length ? <>
            <div className="relationship-chart" role="img" aria-label={`Detrended association correlations for ${regionNames[region]}, driver lead ${lag} months, with pointwise 95 percent block-bootstrap intervals`}>
              <ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} layout="vertical" margin={{ top: 8, right: 26, left: 10, bottom: 8 }}>
                <CartesianGrid stroke="#2b3535" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[-1, 1]} tick={{ fill: "#83908a", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#465251" }} />
                <YAxis type="category" dataKey="label" width={135} tick={{ fill: "#b7c1ba", fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#121a1a", border: "1px solid #364342", borderRadius: 5, color: "#e1e8df", fontSize: 11 }} formatter={(value, _name, item) => {
                  const row = item.payload as typeof chartRows[number];
                  return [`r = ${number(Number(value))} · 95% interval ${number(row.ci95[0])} to ${number(row.ci95[1])} · HAC p ${Number(row.p_hac).toExponential(2)} · BH q ${Number(row.q_hac).toExponential(2)}`, "Association"];
                }} />
                <Bar dataKey="r" fill="#76a48b" radius={[0, 3, 3, 0]} maxBarSize={24}>
                  <ErrorBar dataKey="errorRange" direction="x" stroke="#e0c98f" strokeWidth={1.5} width={4} />
                </Bar>
              </BarChart></ResponsiveContainer>
            </div>
            <p className="relationship-chart-note">Intervals are pointwise 95% circular moving-block bootstrap intervals. HAC p-values use a 12-month bandwidth; q-values apply Benjamini–Hochberg across the tested associations. Statistical dependence across regions, lags, and shared model variables remains a limitation.</p>
            <div className="sr-only"><table><caption>Environmental associations for {regionNames[region]} and {lag} month lead</caption><thead><tr><th>Variable</th><th>Correlation r</th><th>95% interval</th><th>HAC p</th><th>BH q</th><th>Pairs</th></tr></thead><tbody>{rows.map((row) => <tr key={row.variable}><th>{variableNames[row.variable]}</th><td>{number(row.r)}</td><td>{number(row.ci95[0])} to {number(row.ci95[1])}</td><td>{row.p_hac.toExponential(3)}</td><td>{row.q_hac.toExponential(3)}</td><td>{row.n}</td></tr>)}</tbody></table></div>
          </> : <div className="chart-empty" role="status">No validated results are available for this region and lag selection.</div>}
        </section>

        <section className="panel relationship-method" aria-label="Relationship limitations and provenance">
          <div><div className="eyebrow">METHOD / INTERPRETATION</div><p>{state.data.method}</p><small>Minimum joint coverage is reported by region; {state.data.distinct_joint_masks} distinct joint data mask(s) were used. Positive lag means the explanatory driver leads the soil-water response. Correlation is not a causal effect.</small></div>
          <a href={`https://doi.org/${state.data.source_doi.replace(/^https?:\/\/doi\.org\//, "")}`} target="_blank" rel="noreferrer">NASA GLDAS source DOI</a>
        </section>
        <footer className="page-footer"><span>NASA GLDAS NOAH v2.1 · SOURCE MANIFEST · SHA-256</span><span>RETROSPECTIVE ASSOCIATIONS · NOT CAUSAL · NOT A FORECAST</span><span>ALPHA AGRO · DEVELOPED BY QUANT ALPHA</span></footer>
      </>}
    </>
  );
}
