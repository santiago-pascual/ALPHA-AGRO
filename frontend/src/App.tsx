import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  CloudRain,
  Database,
  ChartNoAxesCombined,
  Leaf,
  LoaderCircle,
  Map,
  Menu,
  Sprout,
  Wheat,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { demoDataset } from "./data/demo";
import { loadValidatedTrend } from "./data/loadTrend";
import { TrendMap, type RegionSelection } from "./components/TrendMap";
import { PredictiveResearchPage } from "./components/PredictiveResearch";
import type { DashboardDataset, DataMode, MonthlyObservation } from "./types";

type Page = "overview" | "methodology" | "predictive";
type ChartMeasure = "storage" | "anomaly";
type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: DashboardDataset }
  | { status: "error"; message: string };

function formatNumber(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : value.toFixed(digits);
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", {
    ...(options ?? { month: "short", year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(value + "T00:00:00Z"));
}

function shortDate(value: string) {
  return value.slice(0, 4);
}

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [mode, setMode] = useState<DataMode>("demo");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [rangeYears, setRangeYears] = useState(20);
  const [measure, setMeasure] = useState<ChartMeasure>("storage");
  const [region, setRegion] = useState<RegionSelection>("all");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (mode !== "real") {
      setLoadState({ status: "idle" });
      return;
    }
    let active = true;
    setLoadState({ status: "loading" });
    loadValidatedTrend().then(
      (data) => active && setLoadState({ status: "ready", data }),
      (error: unknown) =>
        active &&
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not read validated trend output.",
        }),
    );
    return () => {
      active = false;
    };
  }, [mode, reloadKey]);

  const dataset =
    mode === "demo"
      ? demoDataset
      : loadState.status === "ready"
        ? loadState.data
        : null;

  const visibleSeries = useMemo(() => {
    if (!dataset) return [];
    const lastYear = Number(dataset.end.slice(0, 4));
    return dataset.series.filter((item) => Number(item.month.slice(0, 4)) > lastYear - rangeYears);
  }, [dataset, rangeYears]);

  const chooseMode = (next: DataMode) => {
    setMode(next);
    setPage("overview");
  };

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (menuOpen ? " sidebar-open" : "")}>
        <a className="brand" href="#overview" aria-label="Alpha Agro home" onClick={() => setPage("overview")}>
          <span className="brand-mark"><Activity size={20} strokeWidth={2.2} /></span>
          <span className="brand-wordmark">
            <b>ALPHA AGRO</b>
            <small>BY QUANT ALPHA</small>
          </span>
        </a>

        <div className="side-kicker">WORKSPACE</div>
        <nav className="side-nav" aria-label="Alpha Agro main navigation">
          <button
            className={"nav-item" + (page === "overview" ? " active" : "")}
            onClick={() => {
              setPage("overview");
              setMenuOpen(false);
            }}
            aria-current={page === "overview" ? "page" : undefined}
          >
            <Map size={17} /><span>Overview</span><span className="nav-index">01</span>
          </button>
          <button
            className={"nav-item" + (page === "methodology" ? " active" : "")}
            onClick={() => {
              setPage("methodology");
              setMenuOpen(false);
            }}
            aria-current={page === "methodology" ? "page" : undefined}
          >
            <BookOpen size={17} /><span>Methods & data</span>
          </button>
          <button
            className={"nav-item" + (page === "predictive" ? " active" : "")}
            aria-label="Predictive research"
            title="Predictive research"
            onClick={() => {
              setPage("predictive");
              setMenuOpen(false);
            }}
            aria-current={page === "predictive" ? "page" : undefined}
          >
            <ChartNoAxesCombined size={17} /><span>Predictive research</span><span className="nav-index">R&amp;D</span>
          </button>
        </nav>

        <div className="side-divider" />
        <div className="side-kicker">REGION</div>
        <div className="region-mini">
          <span className="region-pin"><Map size={15} /></span>
          <span><b>Argentine Pampas</b><small>South America · 0.25°</small></span>
        </div>
        <div className="side-note">
          <span className="note-icon"><CircleHelp size={15} /></span>
          <p>Regional model data offers context. It does not resolve conditions at an individual field.</p>
        </div>
        <div className="sidebar-bottom">
          <span className="sidebar-bottom-mark">QUANT ALPHA</span>
          <span>NASA SPACE APPS CHALLENGE 2026</span>
          <span>Be An Earth System Trend Detective!</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <span>ALPHA AGRO</span><span className="crumb-slash">/</span>
            <b>{page === "overview" ? "PAMPAS OVERVIEW" : page === "methodology" ? "METHODS & DATA" : "PREDICTIVE RESEARCH"}</b>
          </div>
          <div className="topbar-right">
            <div className="source-switch" aria-label="Data source mode">
              <button
                className={mode === "demo" ? "selected" : ""}
                onClick={() => chooseMode("demo")}
                aria-pressed={mode === "demo"}
              >
                <span className="source-dot demo-dot" /> DEMO
              </button>
              <button
                className={mode === "real" ? "selected" : ""}
                onClick={() => chooseMode("real")}
                aria-pressed={mode === "real"}
              >
                <span className="source-dot real-dot" /> REAL DATA
              </button>
            </div>
            <div className="top-date"><span>PERIOD</span><b>{dataset ? dataset.start.slice(0, 4) + " — " + dataset.end.slice(0, 4) : mode === "demo" ? "2006 — 2025" : "NOT LOADED"}</b></div>
          </div>
        </header>

        <main className="content">
          {page === "overview" ? (
            <>
              <section className="page-intro">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> EARTH SYSTEMS / SOIL WATER</div>
                  <h1>Alpha Agro <em>· Pampas</em></h1>
                  <p><strong>From Earth data to agricultural insight.</strong> NASA-powered Earth system intelligence for agriculture. Historical GLDAS analysis, read with uncertainty in view; no operational forecasts are provided.</p>
                </div>
                <div className="intro-meta">
                  <span className="period-label">ANALYSIS WINDOW</span>
                  <b>{dataset ? formatDate(dataset.start, { month: "short", year: "numeric" }).toUpperCase() : mode === "demo" ? "JAN 2006" : "PERIOD NOT LOADED"} {dataset && <i>→</i>} {dataset ? formatDate(dataset.end, { month: "short", year: "numeric" }).toUpperCase() : ""}</b>
                  <span>{dataset ? `${dataset.months} monthly records · ${dataset.source}` : mode === "demo" ? "240 synthetic monthly records · DEMO" : "Validated historical analysis not loaded"}</span>
                </div>
              </section>

              {mode === "demo" && <DemoNotice />}

              {mode === "real" && loadState.status === "loading" ? (
                <section className="state-card" aria-live="polite">
                  <LoaderCircle className="spin" size={22} />
                  <div><b>Reading validated historical analysis</b><span>Loading /data/trend_analysis.json · no forecast is included</span></div>
                </section>
              ) : mode === "real" && loadState.status === "error" ? (
                <EmptyState
                  message={loadState.message}
                  onRetry={() => setReloadKey((key) => key + 1)}
                />
              ) : dataset ? (
                <>
                  <OverviewMetrics dataset={dataset} />
                  <div className="dashboard-grid">
                    <TrendMap dataset={dataset} region={region} onRegionChange={setRegion} />
                    <TrendPanel dataset={dataset} />
                  </div>
                  <TimeSeries
                    dataset={dataset}
                    observations={visibleSeries}
                    rangeYears={rangeYears}
                    onRangeChange={setRangeYears}
                    measure={measure}
                    onMeasureChange={setMeasure}
                  />
                  <AgricultureContext />
                  <footer className="page-footer">
                    <span><Database size={13} /> SOURCE: {mode === "demo" ? "SYNTHETIC DEMONSTRATION" : dataset.source.toUpperCase()}</span>
                    <span>HISTORICAL ANALYSIS · NO OPERATIONAL FORECAST · NOT FIELD MEASUREMENTS</span>
                    <span>ALPHA AGRO · DEVELOPED BY QUANT ALPHA</span>
                  </footer>
                </>
              ) : null}
            </>
          ) : page === "methodology" ? (
            <MethodologyPage dataset={dataset} mode={mode} />
          ) : (
            <PredictiveResearchPage />
          )}
        </main>
      </div>
    </div>
  );
}

function DemoNotice() {
  return (
    <div className="demo-notice" role="note">
      <div className="demo-badge"><span /> DEMO</div>
      <p><b>Fictitious demonstration values.</b> These charts, trends and map cells are synthetic and are not NASA findings.</p>
      <span className="demo-notice-right">VALIDATED FILE NOT CONNECTED</span>
    </div>
  );
}

function OverviewMetrics({ dataset }: { dataset: DashboardDataset }) {
  const trend = dataset.regionalTrend.slopePerDecade;
  const ci = dataset.regionalTrend.ci95;
  const significant = dataset.regionalTrend.pValue !== null && dataset.regionalTrend.pValue < 0.05;
  const metrics = [
    {
      label: "REGIONAL STORAGE TREND",
      value: trend === null ? "—" : (trend > 0 ? "+" : "") + formatNumber(trend),
      unit: "mm / decade",
      detail: "HAC linear slope",
      icon: trend !== null && trend < 0 ? ArrowDownRight : ArrowUpRight,
      tone: trend !== null && trend < 0 ? "warm" : "cool",
    },
    {
      label: "MEAN DATA COVERAGE",
      value: (dataset.meanCoverage * 100).toFixed(1) + "%",
      unit: "of study area",
      detail: "Area-weighted monthly mean",
      icon: Check,
      tone: "green",
    },
    {
      label: "95% HAC INTERVAL",
      value: ci ? formatNumber(ci[0]) + " to " + formatNumber(ci[1]) : "—",
      unit: "mm / decade",
      detail: ci
        ? ci[0] <= 0 && ci[1] >= 0
          ? "Interval spans zero; direction unresolved"
          : "Interval excludes zero"
        : "Interval not available",
      icon: Activity,
      tone: "neutral",
    },
    {
      label: "SIGNIFICANCE",
      value: dataset.regionalTrend.pValue === null ? "Not available" : significant ? "p < 0.05" : "Not detected",
      unit: dataset.regionalTrend.pValue === null ? "" : "HAC p = " + formatNumber(dataset.regionalTrend.pValue, 3),
      detail: "Two-sided · Newey–West HAC",
      icon: significant ? Check : CircleHelp,
      tone: significant ? "green" : "neutral",
    },
  ];

  return (
    <section className="metrics-grid" aria-label="Regional overview metrics">
      {metrics.map(({ label, value, unit, detail, icon: Icon, tone }, index) => (
        <article className="metric-card" key={label}>
          <div className="metric-topline">
            <span>{label}</span><Icon size={16} className={"metric-icon " + tone} aria-hidden="true" />
          </div>
          <div className={"metric-value" + (index === 2 ? " metric-interval" : "")}>{value}</div>
          <div className="metric-unit">{unit || "\u00a0"}</div>
          <div className="metric-detail">{detail}</div>
        </article>
      ))}
    </section>
  );
}

function TrendPanel({ dataset }: { dataset: DashboardDataset }) {
  const trend = dataset.regionalTrend;
  const ci = trend.ci95;
  const low = ci ? Math.min(-30, ci[0]) : -30;
  const high = ci ? Math.max(30, ci[1]) : 30;
  const span = high - low;
  const zero = ((0 - low) / span) * 100;
  const left = ci ? ((ci[0] - low) / span) * 100 : zero;
  const right = ci ? ((ci[1] - low) / span) * 100 : zero;
  const point = trend.slopePerDecade === null ? zero : ((trend.slopePerDecade - low) / span) * 100;

  return (
    <section className="panel trend-panel" aria-labelledby="trend-title">
      <div className="panel-heading">
        <div><div className="eyebrow">Regional estimate</div><h2 id="trend-title">Trend signal</h2></div>
        <span className="panel-period">2006—25</span>
      </div>
      <div className="trend-big">
        <div>
          <strong>{trend.slopePerDecade === null ? "—" : (trend.slopePerDecade > 0 ? "+" : "") + formatNumber(trend.slopePerDecade)}</strong>
          <span>mm / decade</span>
        </div>
        <span className={"signal-pill" + (trend.pValue !== null && trend.pValue < 0.05 ? " signal-green" : "")}>
          <i /> {trend.pValue !== null && trend.pValue < 0.05 ? "SIGNAL DETECTED" : "INCONCLUSIVE"}
        </span>
      </div>
      <div className="ci-label">
        <span>95% HAC CONFIDENCE INTERVAL</span>
        <b>{ci ? "[" + formatNumber(ci[0]) + ", " + formatNumber(ci[1]) + "]" : "Unavailable"}</b>
      </div>
      <div className="ci-chart" role="img" aria-label={ci ? "Confidence interval from " + formatNumber(ci[0]) + " to " + formatNumber(ci[1]) + " millimeters per decade, centered at zero" : "Confidence interval not available"}>
        <span className="ci-zero" style={{ left: zero + "%" }} />
        <span className="ci-range" style={{ left: left + "%", width: Math.max(0, right - left) + "%" }} />
        <span className="ci-point" style={{ left: point + "%" }} />
      </div>
      <div className="ci-axis"><span>{formatNumber(low, 0)}</span><span>0</span><span>{formatNumber(high, 0)}</span></div>
      <div className="trend-detail-grid">
        <div><span>HAC p-value</span><b>{formatNumber(trend.pValue, 3)}</b></div>
        <div><span>Seasonal Sen slope</span><b>{trend.seasonalSenSlopePerDecade === null ? "—" : <>{formatNumber(trend.seasonalSenSlopePerDecade)} <small>mm/dec</small></>}</b></div>
        <div><span>Seasonal Kendall τ</span><b>{formatNumber(trend.seasonalKendallTau, 3)}</b></div>
        <div><span>Confidence level</span><b>95%</b></div>
      </div>
      <div className="panel-rule" />
      <div className="trend-explainer">
        <CircleHelp size={15} />
        <p>
          {ci && ci[0] <= 0 && ci[1] >= 0
            ? "The interval spans zero, so this record does not resolve a regional drying or wetting trend."
            : "Interpret this estimate alongside its interval, time window, and spatial support."}
        </p>
      </div>
      <div className="method-tag"><span /> OLS + MONTH EFFECTS <span className="tag-sep">·</span> HAC 12 LAGS</div>
    </section>
  );
}

function TimeSeries({
  dataset,
  observations,
  rangeYears,
  onRangeChange,
  measure,
  onMeasureChange,
}: {
  dataset: DashboardDataset;
  observations: MonthlyObservation[];
  rangeYears: number;
  onRangeChange: (years: number) => void;
  measure: ChartMeasure;
  onMeasureChange: (measure: ChartMeasure) => void;
}) {
  const chartData = observations.map((item) => ({
    ...item,
    label: shortDate(item.month),
    value: measure === "storage" ? item.storageMm : item.anomalyMm,
  }));

  return (
    <section className="panel time-panel" aria-labelledby="series-title">
      <div className="panel-heading series-heading">
        <div><div className="eyebrow">Monthly observations</div><h2 id="series-title">Soil-water history</h2></div>
        <div className="chart-controls">
          <div className="segmented-control" role="group" aria-label="Time series measure">
            <button className={measure === "storage" ? "selected" : ""} onClick={() => onMeasureChange("storage")} aria-pressed={measure === "storage"}>Storage</button>
            <button className={measure === "anomaly" ? "selected" : ""} onClick={() => onMeasureChange("anomaly")} aria-pressed={measure === "anomaly"}>Anomaly</button>
          </div>
          <label className="select-wrap range-select">
            <span className="sr-only">Select chart date range</span>
            <select value={rangeYears} onChange={(event) => onRangeChange(Number(event.target.value))}>
              <option value={20}>2006—2025</option>
              <option value={10}>Last 10 years</option>
              <option value={5}>Last 5 years</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </div>
      <div className="chart-legend">
        <span className="chart-key"><i /> {measure === "storage" ? "0–100 cm storage" : "Seasonal anomaly"}</span>
        <span>{measure === "storage" ? "mm water equivalent" : "mm from calendar-month mean"}</span>
        <span className="chart-period">{observations.length} monthly values</span>
      </div>
      <div className="chart-wrap">
        {chartData.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="seriesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9fc595" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#9fc595" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#263235" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="label"
                interval={rangeYears === 5 ? 5 : rangeYears === 10 ? 11 : 23}
                tick={{ fill: "#748184", fontSize: 11 }}
                axisLine={{ stroke: "#344144" }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                width={48}
                tick={{ fill: "#748184", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => Math.round(value).toString()}
                domain={measure === "anomaly" ? [-100, 100] : ["auto", "auto"]}
              />
              <Tooltip
                cursor={{ stroke: "#82978a", strokeDasharray: "4 4" }}
                contentStyle={{ background: "#141c1d", border: "1px solid #344144", borderRadius: 8, color: "#e8ece3" }}
                labelStyle={{ color: "#a5b3ad", marginBottom: 4 }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.month ? formatDate(payload[0].payload.month, { month: "long", year: "numeric" }) : ""}
                formatter={(value) => [
                  typeof value === "number" ? formatNumber(value) + " mm" : "No monthly mean",
                  measure === "storage" ? "Storage" : "Anomaly",
                ]}
              />
              {measure === "anomaly" && <ReferenceLine y={0} stroke="#80908b" strokeDasharray="4 4" />}
              <Area
                type="monotone"
                dataKey="value"
                stroke="#a5c99b"
                strokeWidth={1.8}
                fill="url(#seriesFill)"
                connectNulls={false}
                activeDot={{ r: 4, stroke: "#c9d9bd", strokeWidth: 2, fill: "#14201b" }}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">No valid monthly values in this date range.</div>
        )}
      </div>
      <div className="chart-caption">
        <span>{measure === "storage" ? "Layer sum: 0–10 + 10–40 + 40–100 cm" : "Anomaly baseline uses calendar-month climatology"}</span>
        <span>{dataset.mode === "demo" ? "Illustrative synthetic series" : "Full-period descriptive baseline"}</span>
      </div>
    </section>
  );
}

function AgricultureContext() {
  const crops = [
    {
      name: "Soybean",
      icon: Sprout,
      season: "SPRING / SUMMER",
      copy: "Root-zone moisture context can help frame seasonal water availability during crop development.",
    },
    {
      name: "Maize",
      icon: Wheat,
      season: "SPRING / SUMMER",
      copy: "Regional moisture patterns are one part of a wider picture that includes rainfall, soil, and management.",
    },
    {
      name: "Wheat",
      icon: Leaf,
      season: "AUTUMN / WINTER",
      copy: "Cool-season soil-water history can provide background context for crop monitoring conversations.",
    },
  ];

  return (
    <section className="ag-section" aria-labelledby="ag-title">
      <div className="ag-heading">
        <div><div className="eyebrow">Agricultural context</div><h2 id="ag-title">What these trends can—and can’t—say</h2></div>
        <span className="context-only"><CircleHelp size={13} /> CONTEXT ONLY · NOT A FORECAST</span>
      </div>
      <div className="ag-grid">
        {crops.map(({ name, icon: Icon, season, copy }) => (
          <article className="ag-card" key={name}>
            <div className="ag-card-top"><span className="crop-icon"><Icon size={16} /></span><span>{season}</span></div>
            <h3>{name}</h3>
            <p>{copy}</p>
          </article>
        ))}
      </div>
      <p className="ag-disclaimer"><AlertTriangle size={14} /> Regional GLDAS soil water is not a field measurement or a validated yield, stress, or damage model.</p>
    </section>
  );
}

function EmptyState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="empty-state" role="status">
      <span className="empty-icon"><Database size={21} /></span>
      <div className="eyebrow">REAL DATA UNAVAILABLE</div>
      <h2>No validated trend file is connected</h2>
      <p>{message}</p>
      <code>frontend/public/data/trend_analysis.json</code>
      <button className="button-secondary" onClick={onRetry}>Retry file check</button>
      <span className="empty-footnote">DEMO values are hidden while REAL DATA mode is selected.</span>
    </section>
  );
}

function MethodologyPage({ dataset, mode }: { dataset: DashboardDataset | null; mode: DataMode }) {
  return (
    <>
      <section className="page-intro methods-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> DOCUMENTATION / PROVENANCE</div>
          <h1>Methods & <em>data</em></h1>
          <p>What is measured, how the trend is estimated, and where interpretation stops.</p>
        </div>
        <div className="methods-source-mark"><Database size={18} /><span>NASA EARTH SCIENCE</span><b>GLDAS · NOAH v2.1</b></div>
      </section>
      {mode === "demo" && <DemoNotice />}
      {mode === "real" && loadUnavailableMessage(dataset)}
      <section className="methods-grid">
        <article className="panel method-card method-wide">
          <div className="eyebrow">01 / INPUT</div>
          <h2>Modeled soil-water storage</h2>
          <p>GLDAS Noah v2.1 monthly fields estimate water stored in successive soil layers. This dashboard sums the 0–10 cm, 10–40 cm, and 40–100 cm layers to represent 0–100 cm storage.</p>
          <div className="method-facts">
            <div><span>PRODUCT</span><b>GLDAS Noah v2.1 · monthly</b></div>
            <div><span>VARIABLES</span><b>SoilMoi0_10cm_inst, SoilMoi10_40cm_inst, SoilMoi40_100cm_inst</b></div>
            <div><span>UNITS</span><b>kg m⁻² ≡ mm water equivalent</b></div>
            <div><span>GRID</span><b>0.25° · model grid cells</b></div>
          </div>
        </article>
        <article className="panel method-card">
          <div className="eyebrow">02 / COVERAGE</div>
          <h2>Missingness stays visible</h2>
          <p>A cell contributes only when all three layers are valid. Regional coverage is the valid spherical cell area divided by the supplied study-grid area.</p>
          <div className="coverage-method">
            <div><span>Mean coverage</span><b>{dataset ? (dataset.meanCoverage * 100).toFixed(1) + "%" : "—"}</b></div>
            <div><span>Minimum monthly coverage</span><b>{dataset ? (dataset.minimumCoverage * 100).toFixed(1) + "%" : "—"}</b></div>
            <div><span>Missing profiles</span><b>{dataset ? (dataset.missingProfileFraction * 100).toFixed(1) + "%" : "—"}</b></div>
          </div>
        </article>
        <article className="panel method-card">
          <div className="eyebrow">03 / TREND ESTIMATION</div>
          <h2>Seasonality & serial dependence</h2>
          <p>OLS estimates a linear slope with calendar-month fixed effects. Newey–West HAC covariance uses a Bartlett kernel and up to 12 monthly lags.</p>
          <div className="method-code">slope → mm / decade<br />CI → 95% normal approximation<br />p → two-sided HAC test</div>
        </article>
        <article className="panel method-card">
          <div className="eyebrow">04 / ROBUSTNESS</div>
          <h2>Seasonal Sen & spatial tests</h2>
          <p>Seasonal Sen slope pairs observations from the same calendar month across years. Cell-level HAC p-values use Benjamini–Hochberg adjustment; spatial dependence limits FDR interpretation.</p>
          <div className="method-code">Seasonal Sen · mm / decade<br />BH q-value · approximate under spatial dependence</div>
        </article>
        <article className="panel method-card">
          <div className="eyebrow">05 / PROVENANCE</div>
          <h2>Source, period & status</h2>
          <div className="provenance-list">
            <div><span>Data source</span><b>{dataset?.source ?? (mode === "demo" ? "Synthetic demonstration dataset" : "Not loaded")}</b></div>
            <div><span>Period</span><b>{dataset ? formatDate(dataset.start, { month: "short", year: "numeric" }) + " — " + formatDate(dataset.end, { month: "short", year: "numeric" }) : mode === "demo" ? "Jan 2006 — Dec 2025 · synthetic" : "Not loaded"}</b></div>
            <div><span>Records</span><b>{dataset ? `${dataset.months} monthly` : mode === "demo" ? "240 monthly · synthetic" : "Not loaded"}</b></div>
            <div><span>Geographic coverage</span><b>{dataset ? `${dataset.latitudeCount} × ${dataset.longitudeCount} cells · ${dataset.eligibleCells} trend estimates · ${dataset.resolutionDegrees}°` : "Not loaded"}</b></div>
            <div><span>Study-grid rule</span><b>{dataset && dataset.mode === "real" ? dataset.boundaryRule : dataset ? "Synthetic demo grid · not validated" : "Not loaded"}</b></div>
            <div><span>Area weighting</span><b>{dataset && dataset.mode === "real" ? dataset.areaWeighting : dataset ? "Synthetic demo metadata" : "Not loaded"}</b></div>
            <div><span>Input files</span><b>{dataset && dataset.mode === "real" ? `${dataset.inputFiles.length} files with SHA-256 provenance` : dataset ? "No source files · synthetic demo" : "Not loaded"}</b></div>
            <div><span>Analysis status</span><b>{mode === "demo" ? "DEMO · synthetic only" : dataset ? "Historical retrospective · no forecast" : "Validated output not loaded"}</b></div>
          </div>
          {dataset && dataset.mode === "real" && (
            <details className="provenance-files">
              <summary>Inspect source-file checksums ({dataset.inputFiles.length})</summary>
              <ul>
                {dataset.inputFiles.map((file) => (
                  <li key={file.filename}><code>{file.filename}</code><code>{file.sha256}</code></li>
                ))}
              </ul>
            </details>
          )}
        </article>
        <article className="panel method-card limitations-card">
          <div className="eyebrow">06 / LIMITATIONS</div>
          <h2>Interpret with care</h2>
          <ul>
            <li>The Pampas extent is a provisional rectangle, not a crop-field boundary or fractional polygon mask.</li>
            <li>GLDAS is modeled regional hydrology, not an in-situ soil probe or field measurement.</li>
            <li>Full-period climatology is retrospective; it is not a valid real-time forecast baseline.</li>
            <li>Trend patterns cannot establish crop stress, yield effects, or crop damage.</li>
          </ul>
        </article>
      </section>
      <section className="source-footer panel">
        <div className="source-symbol"><CloudRain size={19} /></div>
        <div><b>NASA Global Land Data Assimilation System</b><span>GLDAS Noah Land Surface Model · Version 2.1 · Historical analysis only</span></div>
        <a href="https://doi.org/10.5067/SXAVCZFAQLNO" target="_blank" rel="noreferrer">DATASET DOI <ArrowUpRight size={14} /></a>
      </section>
      <footer className="page-footer"><span><Database size={13} /> PROVENANCE IS PART OF THE RESULT</span><span>METHOD NOTES REFLECT THE ANALYSIS OUTPUT CONTRACT</span><span>ALPHA AGRO · DEVELOPED BY QUANT ALPHA</span></footer>
    </>
  );
}

function loadUnavailableMessage(dataset: DashboardDataset | null) {
  if (dataset) {
    return (
      <div className="inline-source-status">
        <span className="source-dot real-dot" /> Loaded validated historical analysis · schema 1.0 · {dataset.months} months · no operational forecast
      </div>
    );
  }
  return (
    <div className="inline-source-status pending-status">
      <span className="source-dot real-dot" /> Real data selected. Overview remains empty until a validated JSON file is available.
    </div>
  );
}

export default App;
