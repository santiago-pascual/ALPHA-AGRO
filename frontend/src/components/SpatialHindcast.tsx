import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";

type Indicator = { anomaly_mm: number | null; below_normal: boolean | null; consecutive_below_normal_months: number | null };
type Cell = { cell_id: string; latitude: number; longitude: number; area_m2: number; valid: boolean;
  value: number | null; interval: [number, number] | null; indicators: Indicator };
type Series = { horizon_months: number; target: string; target_month: string; units: string;
  last_observation_month: string; observed_region_anomaly_mm: number;
  availability: { assumed: boolean; available_at: string; observation_end: string;
    provider_publication_at: null; soil_granule_id: string }; cells: Cell[];
  calibration: { kind: string; nominal_level?: number; months: number };
  holdout: { metrics: { area_weighted_coverage?: number; brier?: number } } };
type Artifact = { schema_version: string; status: string; operationally_eligible: boolean; issue_time: string;
  model: { id: string; version: string }; source: { grid_count: number; pilot_subset: boolean; release_lag_months: number };
  limitations: string[]; results: Series[] };

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const monthly = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const targets = { storage: "Soil-water storage", anomaly: "Storage anomaly", low_moisture: "Low-moisture probability" };

export function readSpatialHindcast(input: unknown): Artifact {
  if (!input || typeof input !== "object") throw new Error("Unexpected spatial artifact.");
  const artifact = input as Artifact;
  if (artifact.schema_version !== "spatial_hindcast_v1" || artifact.status !== "retrospective_simulation"
      || artifact.operationally_eligible !== false || artifact.source?.pilot_subset !== false
      || artifact.source.grid_count !== 896 || artifact.source.release_lag_months !== 5
      || artifact.model?.id !== "seasonal_climatology" || !artifact.model.version
      || !Number.isFinite(Date.parse(artifact.issue_time)) || !artifact.issue_time.endsWith("+00:00")
      || !Array.isArray(artifact.limitations) || !artifact.limitations.every((x) => typeof x === "string")
      || !Array.isArray(artifact.results) || artifact.results.length !== 9) {
    throw new Error("Expected the validated full-grid retrospective contract.");
  }
  const seen = new Set<string>();
  let grid: Set<string> | undefined;
  for (const result of artifact.results) {
    if (![1, 2, 3].includes(result.horizon_months) || !Object.prototype.hasOwnProperty.call(targets, result.target)
        || !monthly(result.target_month) || !monthly(result.last_observation_month)
        || !finite(result.observed_region_anomaly_mm) || !finite(result.calibration?.months)
        || !result.holdout?.metrics) throw new Error("Invalid retrospective series metadata.");
    const origin = new Date(artifact.issue_time);
    const expected = new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth() + result.horizon_months, 1)).toISOString().slice(0, 7);
    const access = Date.parse(result.availability?.available_at);
    const observed = Date.parse(result.availability?.observation_end);
    if (expected !== result.target_month || !finite(access) || !finite(observed) || observed > access
        || access > Date.parse(artifact.issue_time) || result.availability.assumed !== true
        || result.availability.provider_publication_at !== null || !result.availability.soil_granule_id) {
      throw new Error("Invalid issue time, target horizon, or availability evidence.");
    }
    const key = result.horizon_months + ":" + result.target;
    if (seen.has(key)) throw new Error("Duplicate spatial series.");
    seen.add(key);
    const probability = result.target === "low_moisture";
    if (result.units !== (probability ? "probability" : "mm") || !Array.isArray(result.cells)
        || result.cells.length !== artifact.source.grid_count) throw new Error("Invalid forecast units or grid.");
    const cells = new Set<string>();
    for (const c of result.cells) {
      const row = (c.latitude + 37.875) * 4;
      const column = (c.longitude + 63.875) * 4;
      const id = c.latitude.toFixed(4) + "," + c.longitude.toFixed(4);
      if (!Number.isInteger(row) || row < 0 || row >= 32 || !Number.isInteger(column) || column < 0 || column >= 28
          || c.cell_id !== id || cells.has(id) || !finite(c.area_m2) || c.area_m2 <= 0 || typeof c.valid !== "boolean") {
        throw new Error("Missing, duplicate or misaligned GLDAS cell.");
      }
      if ((c.valid && !finite(c.value)) || (!c.valid && (c.value !== null || c.interval !== null))
          || (probability && (c.interval !== null || (c.value !== null && (c.value < 0 || c.value > 1))))
          || (!probability && c.valid && (!Array.isArray(c.interval) || c.interval.length !== 2
             || !c.interval.every(finite) || c.value === null || c.interval[0] > c.value || c.interval[1] < c.value))) {
        throw new Error("Invalid mask, probability, or interval.");
      }
      if (!c.indicators || (c.indicators.anomaly_mm !== null && !finite(c.indicators.anomaly_mm))
          || (c.indicators.below_normal !== null && typeof c.indicators.below_normal !== "boolean")
          || (c.indicators.consecutive_below_normal_months !== null
              && (!Number.isInteger(c.indicators.consecutive_below_normal_months)
                  || c.indicators.consecutive_below_normal_months < 0 || c.indicators.consecutive_below_normal_months > 12))) {
        throw new Error("Invalid observed soil-water indicator.");
      }
      cells.add(id);
    }
    if (grid && [...cells].some((id) => !grid?.has(id))) throw new Error("Spatial series use different cells.");
    grid = cells;
  }
  return artifact;
}

function display(value: number | null | undefined, probability: boolean) {
  return value == null ? "Unavailable" : probability ? (value * 100).toFixed(1) + "%" : value.toFixed(1) + " mm";
}

export function SpatialHindcast() {
  const { language } = useI18n();
  const [artifact, setArtifact] = useState<Artifact>();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [horizon, setHorizon] = useState(1);
  const [target, setTarget] = useState("storage");
  const [cell, setCell] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/data/spatial_hindcast_v1.json", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("No validated spatial hindcast is installed.");
        return readSpatialHindcast(await response.json());
      })
      .then((value) => { if (active) setArtifact(value); },
            () => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, []);
  const series = artifact?.results.find((item) => item.horizon_months === horizon && item.target === target);
  const grid = useMemo(() => series?.cells.slice().sort((a, b) => b.latitude - a.latitude || a.longitude - b.longitude) ?? [], [series]);
  const selected = grid.find((item) => item.cell_id === cell);
  const valid = grid.filter((item) => item.valid);
  const minimum = Math.min(...valid.map((item) => item.value ?? 0));
  const maximum = Math.max(...valid.map((item) => item.value ?? 0));
  const area = valid.reduce((sum, item) => sum + item.area_m2, 0);
  const mean = area ? valid.reduce((sum, item) => sum + (item.value ?? 0) * item.area_m2, 0) / area : null;
  const probability = target === "low_moisture";
  return <section className="panel phase7-hindcast" aria-labelledby="hindcast-title">
    <h2 id="hindcast-title">{language === "es" ? "Hindcast espacial histórico · experimental" : "Historical Spatial Hindcast — Experimental"}</h2>
    {!artifact || !series ? <p role="status">{status === "loading" ? (language === "es" ? "Cargando hindcasts espaciales históricos…" : "Loading historical spatial hindcasts…") : (language === "es" ? "No hay un hindcast espacial validado disponible." : "No validated spatial hindcast is available.")}</p> : <>
      <div className="phase7-controls">
        <label>Target <select value={target} onChange={(event) => setTarget(event.target.value)}>
          {Object.entries(targets).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Horizon <select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>
          {[1, 2, 3].map((n) => <option key={n} value={n}>{n} month{n === 1 ? "" : "s"}</option>)}
        </select></label>
        <label>Inspect <select value={cell} onChange={(event) => setCell(event.target.value)}>
          <option value="">Area-weighted grid summary</option>
          {valid.map((item) => <option key={item.cell_id} value={item.cell_id}>{item.cell_id}</option>)}
        </select></label>
      </div>
      <div className="phase7-grid-head"><span>North ↑</span><span>East →</span></div>
      <div className="phase7-map" aria-label="Pampas 0.25 degree GLDAS grid">
        {grid.map((item) => {
          const fraction = item.value === null || maximum === minimum ? 0.5 : (item.value - minimum) / (maximum - minimum);
          return <button key={item.cell_id} type="button" tabIndex={-1} disabled={!item.valid}
            title={item.cell_id + " · " + display(item.value, probability)}
            aria-label={item.cell_id + " · " + display(item.value, probability)}
            onClick={() => setCell(item.cell_id)}
            style={item.valid ? { backgroundColor: "hsl(" + (25 + 163 * fraction) + " 40% " + (44 + 11 * fraction) + "%)" } : undefined}
            className={cell === item.cell_id ? "phase7-selected" : ""} />;
        })}
      </div>
      <div className="phase7-grid-head"><span>Min {display(minimum, probability)}</span><span>Gray = masked</span><span>Max {display(maximum, probability)}</span></div>
      <dl className="phase7-metrics">
        <div><dt>{selected ? selected.cell_id : "Area-weighted cell estimates"}</dt><dd>{display(selected ? selected.value : mean, probability)}</dd></div>
        <div><dt>Issue time</dt><dd>{artifact.issue_time.slice(0, 10)} UTC month end</dd></div>
        <div><dt>Target month</dt><dd>{series.target_month}</dd></div>
        <div><dt>Model</dt><dd>Seasonal climatology · {artifact.model.version}</dd></div>
        <div><dt>Last observation under assumed lag</dt><dd>{series.last_observation_month}</dd></div>
        <div><dt>Availability evidence</dt><dd>{series.availability.soil_granule_id}; five-month lag assumed</dd></div>
        <div><dt>{selected ? "Observed cell anomaly" : "Observed regional anomaly"}</dt><dd>{display(selected ? selected.indicators.anomaly_mm : series.observed_region_anomaly_mm, false)}</dd></div>
        {selected && <div><dt>Consecutive below-normal months</dt><dd>{selected.indicators.consecutive_below_normal_months ?? "Unavailable"} (up to 12 checked)</dd></div>}
        <div><dt>{probability ? "Probability quality" : "Uncertainty"}</dt><dd>{probability
          ? "Raw frequency; calibration unverified"
          : selected?.interval ? selected.interval.map((x) => display(x, false)).join(" to ") + " · pooled nominal 90%"
            : "Pooled 90% residual interval; select a cell"}</dd></div>
      </dl>
      <ul>{artifact.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      <p>Soybean, maize and wheat use the same generic soil-water indicators. Crop-specific decision support is pending.</p>
    </>}
  </section>;
}
