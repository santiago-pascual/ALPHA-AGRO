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
  Telescope,
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
import { loadValidatedTrend } from "./data/loadTrend";
import { TrendMap, type RegionSelection } from "./components/TrendMap";
import { PredictiveResearchPage } from "./components/PredictiveResearch";
import { LandingPage } from "./components/LandingPage";
import type { DashboardDataset, MonthlyObservation } from "./types";
import { ForecastPage } from "./components/ForecastPage";
import { findEligibleCell, gridCellId, type SelectedLocation } from "./data/location";
import { addSavedField, createSavedField, deleteSavedField, readSavedFieldStore, renameSavedField, selectSavedField, updateSavedFieldConfiguration, writeSavedFieldStore, type SavedFieldStore } from "./data/fields";
import { I18nProvider, LanguageSelector, useI18n } from "./i18n";
import { DEFAULT_CROP_CONFIGURATION, type CropConfiguration } from "./data/agronomy";

type Page = "landing" | "overview" | "forecast" | "about" | "research";
type ChartMeasure = "storage" | "anomaly";
type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: DashboardDataset }
  | { status: "error"; message: string };

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const locale = displayLocale();
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const locale = displayLocale();
  return new Intl.DateTimeFormat(locale, {
    ...(options ?? { month: "short", year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(value + "T00:00:00Z"));
}

function displayLocale() {
  try { return localStorage.getItem("alpha-agro.language.v1") === "es" ? "es-AR" : "en-US"; }
  catch { return document.documentElement.lang === "es" ? "es-AR" : "en-US"; }
}

function shortDate(value: string) {
  return value.slice(0, 4);
}

function DashboardApp() {
  const { t } = useI18n();
  const [page, setPage] = useState<Page>("landing");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const [rangeYears, setRangeYears] = useState(20);
  const [measure, setMeasure] = useState<ChartMeasure>("storage");
  const [region, setRegion] = useState<RegionSelection>("all");
  const [fieldStore, setFieldStore] = useState<SavedFieldStore>(() => readSavedFieldStore());
  const [transientLocation, setTransientLocation] = useState<SelectedLocation | null>(null);
  const [cropConfiguration, setCropConfiguration] = useState<CropConfiguration>(() => fieldStore.fields.find((field) => field.id === fieldStore.activeFieldId)?.cropConfiguration ?? DEFAULT_CROP_CONFIGURATION);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeSavedField = fieldStore.fields.find((field) => field.id === fieldStore.activeFieldId) ?? null;
  const selectedLocation: SelectedLocation | null = activeSavedField
    ? { latitude: activeSavedField.latitude, longitude: activeSavedField.longitude, source: "manual", accuracyMeters: null }
    : transientLocation;

  const persistFieldStore = (next: SavedFieldStore) => {
    const warning = writeSavedFieldStore(next);
    setFieldStore({ ...next, warning });
  };
  const handleLocationChange = (location: SelectedLocation | null) => {
    setTransientLocation(location);
    if (fieldStore.activeFieldId !== null) persistFieldStore(selectSavedField(fieldStore, null));
  };
  const handleFieldSelect = (id: string | null) => {
    setTransientLocation(null);
    const next = selectSavedField(fieldStore, id);
    persistFieldStore(next);
    setCropConfiguration(next.fields.find((field) => field.id === id)?.cropConfiguration ?? DEFAULT_CROP_CONFIGURATION);
  };
  const handleFieldAdd = (name: string, description: string) => {
    if (!selectedLocation) return;
    try {
      const cell = dataset ? findEligibleCell(selectedLocation, dataset.cells, dataset.resolutionDegrees) : null;
      const field = createSavedField({ name, description, point: selectedLocation, dataset, cropConfiguration });
      const next = addSavedField(fieldStore, field);
      if (cell && field.gridCellId !== gridCellId(cell)) throw new Error("El identificador de celda no coincide con la cobertura validada. / Grid cell does not match validated coverage.");
      setTransientLocation(null);
      persistFieldStore(next);
    } catch (error) {
      setFieldStore({ ...fieldStore, warning: error instanceof Error ? error.message : "No se pudo guardar el campo. / Field could not be saved." });
    }
  };
  const handleCropConfigurationChange = (configuration: CropConfiguration) => {
    setCropConfiguration(configuration);
    if (fieldStore.activeFieldId) persistFieldStore(updateSavedFieldConfiguration(fieldStore, fieldStore.activeFieldId, configuration));
  };
  const handleFieldRename = (id: string, name: string) => {
    try { persistFieldStore(renameSavedField(fieldStore, id, name)); }
    catch (error) { setFieldStore({ ...fieldStore, warning: error instanceof Error ? error.message : "No se pudo renombrar el campo. / Field could not be renamed." }); }
  };
  const handleFieldDelete = (id: string) => {
    if (fieldStore.activeFieldId === id) setTransientLocation(null);
    persistFieldStore(deleteSavedField(fieldStore, id));
  };

  useEffect(() => {
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
  }, [reloadKey]);

  const dataset = loadState.status === "ready" ? loadState.data : null;

  const visibleSeries = useMemo(() => {
    if (!dataset) return [];
    const lastYear = Number(dataset.end.slice(0, 4));
    return dataset.series.filter((item) => Number(item.month.slice(0, 4)) > lastYear - rangeYears);
  }, [dataset, rangeYears]);

  if (page === "landing") {
    return <LandingPage onOpen={(nextPage) => {
      setPage(nextPage);
      setMenuOpen(false);
    }} />;
  }

  return (
    <div className="app-shell">
      <aside className={"sidebar" + (menuOpen ? " sidebar-open" : "")}>
        <a className="brand" href="#home" aria-label={t("home")} onClick={() => setPage("landing")}>
          <span className="brand-mark"><Activity size={20} strokeWidth={2.2} /></span>
          <span className="brand-wordmark">
            <b>ALPHA AGRO</b>
            <small>BY QUANT ALPHA</small>
          </span>
        </a>

        <div className="side-kicker">{t("explore")}</div>
        <nav className="side-nav" aria-label={t("navLabel")}>
          <button
            className={"nav-item" + (page === "overview" ? " active" : "")}
            onClick={() => {
              setPage("overview");
              setMenuOpen(false);
            }}
            aria-current={page === "overview" ? "page" : undefined}
          >
            <Map size={17} /><span>{t("observatory")}</span><span className="nav-index">01</span>
          </button>
          <button className={"nav-item" + (page === "forecast" ? " active" : "")} onClick={() => { setPage("forecast"); setMenuOpen(false); }} aria-current={page === "forecast" ? "page" : undefined}>
            <Telescope size={17} /><span>{t("forecast")}</span><span className="nav-index">{t("noForecasts").toUpperCase()}</span>
          </button>
          <button
            className={"nav-item" + (page === "about" ? " active" : "")}
            onClick={() => {
              setPage("about");
              setMenuOpen(false);
            }}
            aria-current={page === "about" ? "page" : undefined}
          >
            <BookOpen size={17} /><span>{t("about")}</span>
          </button>
          <button
            className={"nav-item" + (page === "research" ? " active" : "")}
            aria-label={t("research")}
            title={t("research")}
            onClick={() => {
              setPage("research");
              setMenuOpen(false);
            }}
            aria-current={page === "research" ? "page" : undefined}
          >
            <ChartNoAxesCombined size={17} /><span>{t("research")}</span><span className="nav-index">R&amp;D</span>
          </button>
        </nav>

        <div className="side-divider" />
        <div className="side-kicker">{t("region")}</div>
        <div className="region-mini">
          <span className="region-pin"><Map size={15} /></span>
          <span><b>{t("regionName")}</b><small>{t("regionResolution")}</small></span>
        </div>
        <div className="side-note">
          <span className="note-icon"><CircleHelp size={15} /></span>
          <p>{t("regionNote")}</p>
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
            aria-label={menuOpen ? t("closeNav") : t("openNav")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            <span>ALPHA AGRO</span><span className="crumb-slash">/</span>
            <b>{page === "overview" ? t("observatoryTitle").toUpperCase() : page === "forecast" ? t("forecast").toUpperCase() : page === "about" ? t("about").toUpperCase() : t("research").toUpperCase()}</b>
          </div>
          <div className="topbar-right">
            <LanguageSelector />
            <div className="source-switch source-status" role="status"><span className="source-dot real-dot" />{loadState.status === "loading" ? t("loading") : loadState.status === "error" ? t("dataUnavailable") : dataset ? t("validatedData") : t("realOnly")}</div>
            <div className="top-date"><span>{t("period")}</span><b>{dataset ? dataset.start.slice(0, 4) + " — " + dataset.end.slice(0, 4) : t("notLoaded")}</b></div>
          </div>
        </header>

        <main className="content">
          {page === "overview" ? (
            <>
              <section className="page-intro">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> {t("earthSystems")}</div>
                  <h1>{t("observatoryTitle")}</h1>
                  <div className="study-region-label"><Map size={13} /> {t("studyRegionLabel")}</div>
                  <p><strong>{t("tagline")}</strong> {t("observatoryIntro")}</p>
                </div>
                <div className="intro-meta">
                  <span className="period-label">{t("analysisWindow")}</span>
                  <b>{dataset ? formatDate(dataset.start, { month: "short", year: "numeric" }).toUpperCase() : t("periodNotLoaded")} {dataset && <i>→</i>} {dataset ? formatDate(dataset.end, { month: "short", year: "numeric" }).toUpperCase() : ""}</b>
                  <span>{dataset ? `${dataset.months} ${t("monthlyRecords")} · ${dataset.source}` : t("validatedNotLoaded")}</span>
                </div>
              </section>

              {loadState.status === "loading" ? (
                <section className="state-card" aria-live="polite">
                  <LoaderCircle className="spin" size={22} />
                  <div><b>{t("historyLoading")}</b><span>{t("historyLoadingDetail")}</span></div>
                </section>
              ) : loadState.status === "error" ? (
                <EmptyState
                  message={loadState.message}
                  onRetry={() => setReloadKey((key) => key + 1)}
                />
              ) : dataset ? (
                <>
                  <OverviewMetrics dataset={dataset} />
                  <div className="dashboard-grid">
                    <TrendMap dataset={dataset} region={region} onRegionChange={setRegion} selectedLocation={selectedLocation} savedFields={fieldStore.fields} activeSavedFieldId={fieldStore.activeFieldId} />
                    <TrendPanel dataset={dataset} />
                  </div>
                  <TimeSeries
                    observations={visibleSeries}
                    rangeYears={rangeYears}
                    onRangeChange={setRangeYears}
                    measure={measure}
                    onMeasureChange={setMeasure}
                  />
                  <AgricultureContext />
                  <footer className="page-footer">
                    <span><Database size={13} /> {t("source")}: {dataset.source.toUpperCase()}</span>
                    <span>{t("historicalNoForecast")}</span>
                    <span>ALPHA AGRO · {t("developedBy")} QUANT ALPHA</span>
                  </footer>
                </>
              ) : null}
            </>
          ) : page === "about" ? (
            <MethodologyPage dataset={dataset} />
          ) : page === "forecast" ? (
            <ForecastPage dataset={dataset} selectedLocation={selectedLocation} onLocationChange={handleLocationChange} savedFields={fieldStore.fields} activeFieldId={fieldStore.activeFieldId} storageWarning={fieldStore.warning} cropConfiguration={cropConfiguration} onCropConfigurationChange={handleCropConfigurationChange} onFieldSelect={handleFieldSelect} onFieldAdd={handleFieldAdd} onFieldRename={handleFieldRename} onFieldDelete={handleFieldDelete} onViewHistory={() => setPage("overview")} />
          ) : (
            <PredictiveResearchPage />
          )}
        </main>
      </div>
    </div>
  );
}

function OverviewMetrics({ dataset }: { dataset: DashboardDataset }) {
  const { language, t } = useI18n();
  const trend = dataset.regionalTrend.slopePerDecade;
  const ci = dataset.regionalTrend.ci95;
  const significant = dataset.regionalTrend.pValue !== null && dataset.regionalTrend.pValue < 0.05;
  const metrics = [
    {
      label: t("regionalTrend"),
      value: trend === null ? "—" : (trend > 0 ? "+" : "") + formatNumber(trend),
      unit: "mm / decade",
      detail: t("trendEstimate"),
      icon: trend !== null && trend < 0 ? ArrowDownRight : ArrowUpRight,
      tone: trend !== null && trend < 0 ? "warm" : "cool",
    },
    {
      label: t("coverage"),
      value: formatNumber(dataset.meanCoverage * 100) + "%",
      unit: t("studyArea"),
      detail: t("areaWeightedMonthly"),
      icon: Check,
      tone: "green",
    },
    {
      label: t("hacInterval"),
      value: ci ? formatNumber(ci[0]) + (language === "en" ? " to " : " a ") + formatNumber(ci[1]) : "—",
      unit: "mm / decade",
      detail: ci
        ? ci[0] <= 0 && ci[1] >= 0
          ? t("intervalSpansZero")
          : t("intervalExcludesZero")
        : t("intervalUnavailable"),
      icon: Activity,
      tone: "neutral",
    },
    {
      label: t("significance"),
      value: dataset.regionalTrend.pValue === null ? t("notAvailable") : significant ? "p < 0.05" : t("notDetected"),
      unit: dataset.regionalTrend.pValue === null ? "" : "HAC p = " + formatNumber(dataset.regionalTrend.pValue, 3),
      detail: t("twoSidedHac"),
      icon: significant ? Check : CircleHelp,
      tone: significant ? "green" : "neutral",
    },
  ];

  return (
    <section className="metrics-grid" aria-label={t("observatoryTitle")}>
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
  const { language, t } = useI18n();
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
        <div><div className="eyebrow">{t("regionalEstimate")}</div><h2 id="trend-title">{t("trendSignal")}</h2></div>
        <span className="panel-period">2006—25</span>
      </div>
      <div className="trend-big">
        <div>
          <strong>{trend.slopePerDecade === null ? "—" : (trend.slopePerDecade > 0 ? "+" : "") + formatNumber(trend.slopePerDecade)}</strong>
          <span>mm / decade</span>
        </div>
        <span className={"signal-pill" + (trend.pValue !== null && trend.pValue < 0.05 ? " signal-green" : "")}>
          <i /> {trend.pValue !== null && trend.pValue < 0.05 ? t("signalDetected") : t("inconclusive")}
        </span>
      </div>
      <div className="ci-label">
        <span>{t("confidenceInterval")}</span>
        <b>{ci ? "[" + formatNumber(ci[0]) + (language === "en" ? ", " : "; ") + formatNumber(ci[1]) + "]" : t("intervalUnavailable")}</b>
      </div>
      <div className="ci-chart" role="img" aria-label={ci ? t("confidenceAria").replace("{low}", formatNumber(ci[0])).replace("{high}", formatNumber(ci[1])) : t("noConfidenceAria")}>
        <span className="ci-zero" style={{ left: zero + "%" }} />
        <span className="ci-range" style={{ left: left + "%", width: Math.max(0, right - left) + "%" }} />
        <span className="ci-point" style={{ left: point + "%" }} />
      </div>
      <div className="ci-axis"><span>{formatNumber(low, 0)}</span><span>0</span><span>{formatNumber(high, 0)}</span></div>
      <div className="trend-detail-grid">
        <div><span>{t("hacP")}</span><b>{formatNumber(trend.pValue, 3)}</b></div>
        <div><span>{t("seasonalSen")}</span><b>{trend.seasonalSenSlopePerDecade === null ? "—" : <>{formatNumber(trend.seasonalSenSlopePerDecade)} <small>mm/dec</small></>}</b></div>
        <div><span>{t("kendallTau")}</span><b>{formatNumber(trend.seasonalKendallTau, 3)}</b></div>
        <div><span>{t("confidenceLevel")}</span><b>95%</b></div>
      </div>
      <div className="panel-rule" />
      <div className="trend-explainer">
        <CircleHelp size={15} />
        <p>
          {ci && ci[0] <= 0 && ci[1] >= 0
            ? (language === "en" ? "The interval spans zero, so this record does not resolve a regional drying or wetting trend." : "El intervalo incluye cero; este registro no permite definir una tendencia regional de secamiento o humedecimiento.")
            : (language === "en" ? "Interpret this estimate alongside its interval, time window, and spatial support." : "Interpretá esta estimación junto con su intervalo, período y soporte espacial.")}
        </p>
      </div>
      <div className="method-tag"><span /> {t("methodOLS")} <span className="tag-sep">·</span> {t("hacLags")}</div>
    </section>
  );
}

function TimeSeries({
  observations,
  rangeYears,
  onRangeChange,
  measure,
  onMeasureChange,
}: {
  observations: MonthlyObservation[];
  rangeYears: number;
  onRangeChange: (years: number) => void;
  measure: ChartMeasure;
  onMeasureChange: (measure: ChartMeasure) => void;
}) {
  const { t } = useI18n();
  const chartData = observations.map((item) => ({
    ...item,
    label: shortDate(item.month),
    value: measure === "storage" ? item.storageMm : item.anomalyMm,
  }));

  return (
    <section className="panel time-panel" aria-labelledby="series-title">
      <div className="panel-heading series-heading">
        <div><div className="eyebrow">{t("monthlyObs")}</div><h2 id="series-title">{t("soilHistory")}</h2></div>
        <div className="chart-controls">
          <div className="segmented-control" role="group" aria-label={t("soilHistory")}>
            <button className={measure === "storage" ? "selected" : ""} onClick={() => onMeasureChange("storage")} aria-pressed={measure === "storage"}>{t("storage")}</button>
            <button className={measure === "anomaly" ? "selected" : ""} onClick={() => onMeasureChange("anomaly")} aria-pressed={measure === "anomaly"}>{t("anomaly")}</button>
          </div>
          <label className="select-wrap range-select">
            <span className="sr-only">{t("chartDateRange")}</span>
            <select value={rangeYears} onChange={(event) => onRangeChange(Number(event.target.value))}>
              <option value={20}>2006—2025</option>
              <option value={10}>{t("last10")}</option>
              <option value={5}>{t("last5")}</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </div>
      <div className="chart-legend">
        <span className="chart-key"><i /> {measure === "storage" ? t("storageDepth") : t("seasonalAnomaly")}</span>
        <span>{measure === "storage" ? t("mmWaterEquivalent") : t("mmFromMonthMean")}</span>
        <span className="chart-period">{observations.length} {t("monthlyValues")}</span>
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
                  typeof value === "number" ? formatNumber(value) + " mm" : t("noMonthlyMean"),
                  measure === "storage" ? t("storage") : t("anomaly"),
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
          <div className="chart-empty">{t("noMonthlyValues")}</div>
        )}
      </div>
      <div className="chart-caption">
        <span>{measure === "storage" ? t("layerSum") : t("anomalyBaseline")}</span>
        <span>{t("descriptiveBaseline")}</span>
      </div>
    </section>
  );
}

function AgricultureContext() {
  const { t } = useI18n();
  const crops = [
    {
      name: t("soybean"),
      icon: Sprout,
      season: t("springSummer"),
      copy: t("soybeanContext"),
    },
    {
      name: t("maize"),
      icon: Wheat,
      season: t("springSummer"),
      copy: t("maizeContext"),
    },
    {
      name: t("wheat"),
      icon: Leaf,
      season: t("autumnWinter"),
      copy: t("wheatContext"),
    },
  ];

  return (
    <section className="ag-section" aria-labelledby="ag-title">
      <div className="ag-heading">
        <div><div className="eyebrow">{t("agricultureContext")}</div><h2 id="ag-title">{t("trendMeaning")}</h2></div>
        <span className="context-only"><CircleHelp size={13} /> {t("contextOnly")}</span>
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
      <p className="ag-disclaimer"><AlertTriangle size={14} /> {t("agDisclaimer")}</p>
    </section>
  );
}

function EmptyState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <section className="empty-state" role="status">
      <span className="empty-icon"><Database size={21} /></span>
      <div className="eyebrow">{t("realUnavailable")}</div>
      <h2>{t("noTrendFile")}</h2>
      <p>{message}</p>
      <code>frontend/public/data/trend_analysis.json</code>
      <button className="button-secondary" onClick={onRetry}>{t("retry")}</button>
      <span className="empty-footnote">{t("emptyScientificValues")}</span>
    </section>
  );
}

function MethodologyPage({ dataset }: { dataset: DashboardDataset | null }) {
  const { language, t } = useI18n();
  return (
    <>
      <section className="page-intro methods-intro">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> {t("docsProvenance")}</div>
          <h1>{t("methodsTitle")}</h1>
          <p>{t("whatMeasured")}</p>
        </div>
        <div className="methods-source-mark"><Database size={18} /><span>{language === "es" ? "CIENCIAS DE LA TIERRA NASA" : "NASA EARTH SCIENCE"}</span><b>GLDAS · NOAH v2.1</b></div>
      </section>
      {loadUnavailableMessage(dataset)}
      <section className="methods-grid">
        <article className="panel method-card method-wide">
          <div className="eyebrow">01 / {t("product")}</div>
          <h2>{t("modeledStorage")}</h2>
          <p>{t("inputDesc")}</p>
          <div className="method-facts">
            <div><span>{t("product")}</span><b>GLDAS Noah v2.1 · {language === "es" ? "mensual" : "monthly"}</b></div>
            <div><span>{t("variables")}</span><b>SoilMoi0_10cm_inst, SoilMoi10_40cm_inst, SoilMoi40_100cm_inst</b></div>
            <div><span>{t("units")}</span><b>kg m⁻² ≡ {t("mmWaterEquivalent")}</b></div>
            <div><span>{t("grid")}</span><b>0.25° · {language === "es" ? "celdas de la grilla del modelo" : "model grid cells"}</b></div>
          </div>
        </article>
        <article className="panel method-card">
          <div className="eyebrow">02 / {t("coverage")}</div>
          <h2>{t("missingness")}</h2>
          <p>{t("coverageRule")}</p>
          <div className="coverage-method">
            <div><span>{t("coverage")}</span><b>{dataset ? formatNumber(dataset.meanCoverage * 100) + "%" : "—"}</b></div>
            <div><span>{t("minimumCoverage")}</span><b>{dataset ? formatNumber(dataset.minimumCoverage * 100) + "%" : "—"}</b></div>
            <div><span>{t("missingProfiles")}</span><b>{dataset ? formatNumber(dataset.missingProfileFraction * 100) + "%" : "—"}</b></div>
          </div>
        </article>
        <article className="panel method-card">
          <div className="eyebrow">03 / {language === "es" ? "ESTIMACIÓN DE TENDENCIA" : "TREND ESTIMATION"}</div>
          <h2>{t("seasonalitySerial")}</h2>
          <p>{t("olsDesc")}</p>
          <div className="method-code">{language === "es" ? "Pendiente → mm / década" : "Slope → mm / decade"}<br />{language === "es" ? "IC → aproximación normal del 95%" : "CI → 95% normal approximation"}<br />{language === "es" ? "p → prueba HAC bilateral" : "p → two-sided HAC test"}</div>
        </article>
        <article className="panel method-card">
          <div className="eyebrow">04 / {language === "es" ? "ROBUSTEZ" : "ROBUSTNESS"}</div>
          <h2>{t("seasonalRobustness")}</h2>
          <p>{t("seasonalDesc")}</p>
          <div className="method-code">Sen estacional · mm / década<br />{language === "es" ? "Valor q BH · aproximado con dependencia espacial" : "BH q-value · approximate under spatial dependence"}</div>
        </article>
        <article className="panel method-card">
          <div className="eyebrow">05 / {language === "es" ? "PROCEDENCIA" : "PROVENANCE"}</div>
          <h2>{t("sourcePeriodStatus")}</h2>
          <div className="provenance-list">
            <div><span>{t("source")}</span><b>{dataset ? language === "es" && dataset.source === "GLDAS Noah v2.1 monthly regional exports" ? "GLDAS Noah v2.1 · exportaciones regionales mensuales" : dataset.source : t("notLoaded")}</b></div>
            <div><span>{t("period")}</span><b>{dataset ? formatDate(dataset.start, { month: "short", year: "numeric" }) + " — " + formatDate(dataset.end, { month: "short", year: "numeric" }) : t("notLoaded")}</b></div>
            <div><span>{t("records")}</span><b>{dataset ? `${dataset.months} ${t("monthlyRecords")}` : t("notLoaded")}</b></div>
            <div><span>{t("geographicCoverage")}</span><b>{dataset ? `${dataset.latitudeCount} × ${dataset.longitudeCount} ${language === "es" ? "celdas ·" : "cells ·"} ${dataset.eligibleCells} ${language === "es" ? "estimaciones de tendencia ·" : "trend estimates ·"} ${dataset.resolutionDegrees}°` : t("notLoaded")}</b></div>
            <div><span>{t("studyGridRule")}</span><b>{dataset ? language === "es" && dataset.boundaryRule === "all cells in the supplied grid; no polygon overlap fraction applied" ? "Todas las celdas de la grilla provista; sin fracción de superposición poligonal" : dataset.boundaryRule : t("notLoaded")}</b></div>
            <div><span>{t("areaWeighting")}</span><b>{dataset ? language === "es" && dataset.areaWeighting === "exact spherical regular-grid cell area from latitude bounds" ? "Área esférica exacta de celdas regulares calculada con límites de latitud" : dataset.areaWeighting : t("notLoaded")}</b></div>
            <div><span>{t("inputFiles")}</span><b>{dataset ? `${dataset.inputFiles.length} ${language === "es" ? "archivos con procedencia SHA-256" : "files with SHA-256 provenance"}` : t("notLoaded")}</b></div>
            <div><span>{t("analysisStatus")}</span><b>{dataset ? t("historicalRetrospective") : t("validatedNotLoaded")}</b></div>
          </div>
          {dataset && (
            <details className="provenance-files">
              <summary>{t("checksumLabel")} ({dataset.inputFiles.length})</summary>
              <ul>
                {dataset.inputFiles.map((file) => (
                  <li key={file.filename}><code>{file.filename}</code><code>{file.sha256}</code></li>
                ))}
              </ul>
            </details>
          )}
        </article>
        <article className="panel method-card limitations-card">
          <div className="eyebrow">06 / {t("limitations")}</div>
          <h2>{t("interpretCare")}</h2>
          <ul>{t("limitationsList").split("|").map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      </section>
      <section className="source-footer panel">
        <div className="source-symbol"><CloudRain size={19} /></div>
        <div><b>NASA Global Land Data Assimilation System</b><span>GLDAS Noah Land Surface Model · {language === "es" ? "Versión 2.1 · solo análisis histórico" : "Version 2.1 · Historical analysis only"}</span></div>
        <a href="https://doi.org/10.5067/SXAVCZFAQLNO" target="_blank" rel="noreferrer">{t("datasetDoi")} <ArrowUpRight size={14} /></a>
      </section>
      <footer className="page-footer"><span><Database size={13} /> {language === "es" ? "LA PROCEDENCIA ES PARTE DEL RESULTADO" : "PROVENANCE IS PART OF THE RESULT"}</span><span>{language === "es" ? "LAS NOTAS METODOLÓGICAS REFLEJAN EL CONTRATO DE SALIDA" : "METHOD NOTES REFLECT THE ANALYSIS OUTPUT CONTRACT"}</span><span>ALPHA AGRO · {t("developedBy")} QUANT ALPHA</span></footer>
    </>
  );
}

function loadUnavailableMessage(dataset: DashboardDataset | null) {
  const { t } = useI18n();
  if (dataset) {
    return (
      <div className="inline-source-status">
        <span className="source-dot real-dot" /> {t("dataLoadedStatus").replace("{months}", String(dataset.months))}
      </div>
    );
  }
  return (
    <div className="inline-source-status pending-status">
      <span className="source-dot real-dot" /> {t("realOnlyStatus")}
    </div>
  );
}

function App() {
  return <I18nProvider><DashboardApp /></I18nProvider>;
}

export default App;
