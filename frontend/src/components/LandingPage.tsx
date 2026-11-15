import { useState } from "react";
import { Activity, ArrowDown, ArrowRight, BookOpen, CalendarClock, ChartNoAxesCombined, CircleHelp, Crosshair, Database, LockKeyhole, MapPin, Sprout } from "lucide-react";
import { LanguageSelector, useI18n } from "../i18n";

export type LandingPageName = "overview" | "forecast" | "about" | "research";

type LandingPageProps = {
  onOpen: (page: LandingPageName) => void;
};

const tourSteps = [
  {
    eyebrow: "01 · THE QUESTION",
    title: "Water is a moving part of the agricultural picture.",
    text: "Seasonal soil-water conditions vary across the Pampas. A regional Earth-system product can add context, but it cannot tell a producer what is happening in an individual field.",
  },
  {
    eyebrow: "02 · THE EVIDENCE",
    title: "Start with what NASA measured and modeled.",
    text: "The historical view uses GLDAS Noah v2.1 monthly soil-water layers. The product estimates land-surface conditions; it is not an in-situ probe. The methods screen explains units, grid support, coverage, and provenance.",
    action: { label: "Open about & data sources", page: "about" as const },
  },
  {
    eyebrow: "03 · THE HISTORY",
    title: "Read the seasonal record with uncertainty in view.",
    text: "The Observatory presents validated monthly storage and anomalies alongside trend estimates, confidence intervals, HAC significance, and data coverage. If the reviewed artifact is absent or invalid, the page stays empty and explains why.",
    action: { label: "Open Observatory", page: "overview" as const },
  },
  {
    eyebrow: "04 · RELATIONSHIPS",
    title: "Associations need aligned data and careful interpretation.",
    text: "The current front end has no connected cross-variable result artifact or relationship chart. It does not invent correlations between soil water, rainfall, temperature, or crop outcomes. Shared model inputs and common trends would also limit causal interpretation.",
  },
  {
    eyebrow: "05 · THE MAP",
    title: "Compare supported cells, then check what is missing.",
    text: "The spatial view uses cell estimates from the validated artifact, reports the study-grid coverage, and marks cells without eligible trends. Its selectable Pampas subregions are descriptive groupings, not farm boundaries.",
    action: { label: "Open spatial Observatory", page: "overview" as const },
  },
  {
    eyebrow: "06 · PREDICTIVE RESEARCH",
    title: "Walk-forward selection comes before holdout comparison.",
    text: "Seasonal climatology remains the selected model because selection uses pooled pre-holdout walk-forward results. A lower XGBoost or HMM score on some holdout comparisons is descriptive; choosing from the holdout would contaminate the evaluation. These are historical tests, not live forecasts.",
    action: { label: "Open Research & Methods", page: "research" as const },
  },
  {
    eyebrow: "07 · LIMITS & NEXT STEPS",
    title: "Use the signal as context, not as a crop forecast.",
    text: "The current application does not predict yield, damage, or field-level moisture. Prospective forecasts remain unavailable until a future backend provides a versioned artifact and verified eligibility. Missing data and uncertainty stay visible.",
    action: { label: "Review data sources & limitations", page: "about" as const },
  },
];

const tourStepsEs = [
  { eyebrow: "01 · LA PREGUNTA", title: "El agua es una parte cambiante del panorama agrícola.", text: "Las condiciones estacionales del agua del suelo varían en las Pampas. Un producto del sistema terrestre aporta contexto regional, pero no indica qué ocurre en un lote individual." },
  { eyebrow: "02 · LA EVIDENCIA", title: "Empezamos por lo que NASA modeló.", text: "La vista histórica usa capas mensuales de agua del suelo de GLDAS Noah v2.1. Es una estimación de condiciones terrestres, no una medición directa. Métodos explica unidades, grilla, cobertura y procedencia.", action: { label: "Acerca de y fuentes de datos", page: "about" as const } },
  { eyebrow: "03 · LA HISTORIA", title: "Leé el registro estacional con su incertidumbre a la vista.", text: "El Observatorio presenta almacenamiento y anomalías mensuales validadas, junto con tendencias, intervalos de confianza, significancia HAC y cobertura. Si falta el artefacto revisado, la página explica por qué.", action: { label: "Abrir Observatorio", page: "overview" as const } },
  { eyebrow: "04 · RELACIONES", title: "Las asociaciones exigen datos alineados e interpretación cuidadosa.", text: "La aplicación todavía no tiene un artefacto ni un gráfico conectado de relaciones entre variables. No inventa correlaciones entre agua del suelo, lluvia, temperatura o cultivos." },
  { eyebrow: "05 · EL MAPA", title: "Compará celdas disponibles y revisá lo que falta.", text: "La vista espacial usa estimaciones por celda del artefacto validado y señala dónde no hay tendencias elegibles. Las subregiones son agrupaciones descriptivas, no límites de campos.", action: { label: "Abrir el Observatorio espacial", page: "overview" as const } },
  { eyebrow: "06 · INVESTIGACIÓN PREDICTIVA", title: "La selección previa al holdout ocurre antes de la comparación final.", text: "La climatología estacional sigue seleccionada porque la elección usa resultados walk-forward anteriores al holdout. Los resultados del holdout describen pruebas históricas; no son pronósticos en vivo.", action: { label: "Abrir investigación y métodos", page: "research" as const } },
  { eyebrow: "07 · LÍMITES Y PRÓXIMOS PASOS", title: "Usá la señal como contexto, no como pronóstico del cultivo.", text: "La aplicación no predice rendimiento, daño ni humedad de un lote. Los pronósticos prospectivos requieren un artefacto versionado y elegibilidad verificada. La falta de datos y la incertidumbre se mantienen visibles.", action: { label: "Revisar fuentes y límites", page: "about" as const } },
];

export function LandingPage({ onOpen }: LandingPageProps) {
  const { language, t } = useI18n();
  const activeTour = language === "es" ? tourStepsEs : tourSteps;
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const step = activeStep === null ? null : activeTour[activeStep];

  return (
    <div className="landing-shell">
      <header className="landing-header">
          <a className="landing-brand" href="#home" aria-label={t("home")}>
          <span className="landing-brand-mark"><Activity size={19} /></span>
          <span><b>Alpha Agro</b><small>{t("developedBy")} QUANT ALPHA</small></span>
        </a>
        <nav className="landing-nav" aria-label="Alpha Agro landing navigation">
          <a href="#study">{t("studyRegion")}</a>
          <a href="#capabilities">{t("whatItShows")}</a>
          <a href="#guided-demo">{t("guidedDemo")}</a>
        </nav>
        <LanguageSelector />
        <button className="landing-nav-cta" onClick={() => onOpen("overview")}>{t("landingOpen")} <ArrowRight size={14} /></button>
      </header>

      <main>
        <section className="landing-hero" id="home" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> NASA SPACE APPS CHALLENGE 2026 · QUANT ALPHA</div>
            <h1 id="landing-title">{language === "es" ? <>Inteligencia de la Tierra,<br /><em>para cada productor.</em></> : t("landingHero")}</h1>
            <p className="landing-description">{t("landingDesc")}</p>
            <p className="landing-tagline-english">{t("tagline")}</p>
            <div className="landing-actions">
              <button className="landing-primary" onClick={() => onOpen("overview")}>{t("landingOpen")} <ArrowRight size={16} /></button>
              <button className="landing-secondary" onClick={() => onOpen("forecast")}><Database size={15} /> {t("forecastStatus")}</button>
            </div>
            <a className="landing-tour-link" href="#guided-demo" onClick={() => setActiveStep(0)}>{language === "es" ? "Iniciar el recorrido guiado" : "Start the guided demo"} <ArrowDown size={13} /></a>
            <p className="landing-mode-note">{language === "es" ? "La interfaz pública muestra únicamente artefactos científicos validados. Los archivos faltantes o inválidos se indican explícitamente; no hay reemplazo con datos sintéticos." : "The public interface displays validated scientific artifacts only. Missing or invalid files produce an explicit unavailable state; there is no synthetic-data fallback."}</p>
          </div>
          <div className="landing-hero-aside" aria-label={t("studySummary")}>
            <div className="landing-aside-top"><span className="landing-status-mark" /><span>{language === "es" ? "REGIÓN DE ESTUDIO · UBICACIÓN ESQUEMÁTICA" : "STUDY REGION · SCHEMATIC LOCATOR"}</span></div>
            <div className="landing-aside-map" aria-hidden="true">
              <div className="map-grid-lines" />
              <span className="map-region-label">{language === "es" ? <>PAMPAS<br />ARGENTINAS</> : <>ARGENTINE<br />PAMPAS</>}</span>
              <span className="map-pin-mark"><MapPin size={17} /></span>
            </div>
            <div className="landing-aside-facts">
              <div><span>{language === "es" ? "PRODUCTO NASA" : "NASA PRODUCT"}</span><b>GLDAS Noah v2.1</b></div>
              <div><span>{language === "es" ? "PERÍODO HISTÓRICO" : "HISTORICAL PERIOD"}</span><b>{language === "es" ? "2006–2025 · mensual" : "2006–2025 · monthly"}</b></div>
              <div><span>{language === "es" ? "SOPORTE DEL ESTUDIO" : "STUDY SUPPORT"}</span><b>{language === "es" ? "Grilla de modelo 0.25°" : "0.25° model grid"}</b></div>
            </div>
          </div>
          <a className="landing-scroll" href="#study"><span>{language === "es" ? "Conocé el estudio" : "Explore the study"}</span><ArrowDown size={14} /></a>
        </section>

        <section className="landing-section landing-story-section" id="study" aria-labelledby="study-title">
          <div className="landing-section-heading">
            <div className="eyebrow"><span className="eyebrow-line" /> {language === "es" ? "NUESTRA HISTORIA" : "OUR STORY"}</div>
            <h2 id="study-title">{language === "es" ? "Una idea que nació cerca del campo." : "An idea rooted close to the field."}</h2>
            <p className="landing-story-english">{language === "es" ? "Una idea de producto arraigada en un lugar real y en el conocimiento práctico de un productor." : "A product idea rooted in a real place and a farmer’s practical knowledge."}</p>
          </div>
          <div className="landing-story-grid">
            <article className="landing-story-card">
              <span className="landing-story-place"><MapPin size={14} /> MARCOS PAZ · BUENOS AIRES</span>
              {language === "es" ? <><p>El abuelo del fundador fue productor de soja en Marcos Paz. Su experiencia práctica y su conocimiento del campo inspiraron Alpha Agro.</p><p>No llegó a completar la secundaria; eso no reduce el valor de su experiencia agrícola. El fundador reconoció una barrera más amplia: los análisis avanzados pueden ser difíciles de encontrar, pagar, entender o usar.</p><p>Las herramientas deberían encontrarse con el conocimiento del productor en un lenguaje claro. La experiencia agrícola no requiere un título técnico para ser valiosa.</p></> : <><p>Alpha Agro was inspired by the founder’s grandfather, a soybean farmer in Marcos Paz, Buenos Aires. His practical experience and knowledge of farming inspired the product.</p><p>He did not complete secondary school; that does not diminish the value of his agricultural experience. The founder recognized a broader barrier: advanced analysis can be hard to access, afford, understand, or use.</p><p>Tools should meet producers’ knowledge with clear language. Agricultural experience does not require a technical degree to be valuable.</p></>}
            </article>
            <article className="landing-access-card">
              <div className="eyebrow">{language === "es" ? "EL PROPÓSITO" : "THE PURPOSE"}</div>
              <h3>{t("heroMission")}</h3>
              <p>{language === "es" ? "Los pequeños y medianos productores no deberían necesitar conocimientos de programación, estadística o teledetección para consultar información ambiental." : "Small and medium-sized producers should not need expertise in programming, statistics, or satellite remote sensing to understand environmental information."}</p>
              <span>{language === "es" ? "CLARIDAD · CONTEXTO LOCAL · INCERTIDUMBRE VISIBLE" : "CLARITY · LOCAL CONTEXT · VISIBLE UNCERTAINTY"}</span>
            </article>
          </div>
          <div className="landing-region-line"><MapPin size={15} /><span>{language === "es" ? "PAMPAS ARGENTINAS" : "ARGENTINE PAMPAS"}</span><i>·</i><span>{language === "es" ? "Buenos Aires y alrededores" : "Buenos Aires and surrounding region"}</span></div>
        </section>

        <section className="landing-section landing-workflow-section" aria-labelledby="workflow-title">
          <div className="landing-section-heading">
            <div className="eyebrow"><span className="eyebrow-line" /> {language === "es" ? "CÓMO FUNCIONA" : "HOW IT IS INTENDED TO WORK"}</div>
            <h2 id="workflow-title">{language === "es" ? "Del mapa a una lectura más clara." : "From a map to a clearer reading."}</h2>
          </div>
          <div className="landing-workflow" aria-label={language === "es" ? "Pasos del producto Alpha Agro" : "Alpha Agro product steps"}>
            <article><span className="landing-workflow-icon"><Crosshair size={17} /></span><b>{language === "es" ? "01 · Elegir una zona" : "01 · Select an area"}</b><p>{language === "es" ? "Elegí un punto en una celda con tendencias históricas validadas. Es contexto de grilla, no un límite de lote." : "Choose a point in a cell with validated historical trends. It provides grid context, not a field boundary."}</p><small>{language === "es" ? "UBICACIÓN · COBERTURA DISPONIBLE" : "LOCATION · COVERAGE AVAILABLE"}</small></article>
            <article><span className="landing-workflow-icon"><Database size={17} /></span><b>{language === "es" ? "02 · Explorar el registro" : "02 · Explore the record"}</b><p>{language === "es" ? "Consultá estimaciones mensuales de GLDAS Noah. Son datos de un modelo terrestre de NASA, no mediciones directas del lote." : "Explore monthly GLDAS Noah estimates. They come from a NASA land model, not direct measurements of a field."}</p><small>{language === "es" ? "ANÁLISIS HISTÓRICO · 2006–2025" : "HISTORICAL ANALYSIS · 2006–2025"}</small></article>
            <article><span className="landing-workflow-icon"><CircleHelp size={17} /></span><b>{language === "es" ? "03 · Entender la incertidumbre" : "03 · Understand uncertainty"}</b><p>{language === "es" ? "Revisá cobertura, variación e intervalos para ver qué muestra la evidencia y cuáles son sus límites." : "Review coverage, variation, and intervals to understand what the evidence shows and where it is limited."}</p><small>{language === "es" ? "INCERTIDUMBRE Y PROCEDENCIA VISIBLES" : "VISIBLE UNCERTAINTY & PROVENANCE"}</small></article>
            <article className="landing-workflow-future"><span className="landing-workflow-icon"><LockKeyhole size={17} /></span><b>{language === "es" ? "04 · Pronósticos validados" : "04 · Validated forecasts"}</b><p>{language === "es" ? "La investigación prospectiva es una meta futura. Alpha Agro todavía no ofrece pronósticos operativos." : "Prospective research is a future goal. Alpha Agro does not yet offer operational forecasts."}</p><small><CalendarClock size={12} /> {language === "es" ? "A FUTURO · REQUIERE VALIDACIÓN" : "FUTURE · REQUIRES VALIDATION"}</small></article>
          </div>
            <p className="landing-workflow-english">{language === "es" ? "Elegí una zona con cobertura · explorá estimaciones históricas de NASA GLDAS · entendé la incertidumbre · consultá pronósticos solo si futuras investigaciones los validan." : "Choose a supported area · explore NASA GLDAS historical estimates · understand uncertainty · use forecasts only if future research validates them."}</p>
        </section>

        <section className="landing-section problem-section" aria-labelledby="study-context-title">
          <div className="landing-section-heading">
            <div className="eyebrow"><span className="eyebrow-line" /> {language === "es" ? "BASE CIENTÍFICA" : "SCIENTIFIC FOUNDATION"}</div>
            <h2 id="study-context-title">{language === "es" ? "Datos de NASA, investigación transparente e interpretación responsable." : "NASA data, transparent research, careful interpretation."}</h2>
          </div>
          <div className="landing-problem-copy">
            <p>{language === "es" ? "La lluvia, la evaporación y el agua del suelo cambian en el tiempo y el espacio. GLDAS representa condiciones en celdas de grilla más amplias que un lote." : "Rainfall, evaporation, and soil water change over time and space. GLDAS represents conditions in grid cells larger than a field."}</p>
            <p>{language === "es" ? "Alpha Agro busca facilitar la exploración de evidencia histórica: qué datos hay, dónde falta cobertura y cuánta incertidumbre queda. Un patrón regional no predice rendimiento ni daño." : "Alpha Agro aims to make historical evidence easier to explore: what data exist, where coverage is missing, and how much uncertainty remains. A regional pattern does not predict yield or damage."}</p>
            <p>{language === "es" ? "El Observatorio presenta estimaciones históricas del modelo terrestre NASA GLDAS. La investigación predictiva se muestra por separado; ningún hindcast se presenta como pronóstico operativo." : "The Observatory presents historical NASA GLDAS land-model estimates. Predictive research is separate; no hindcast is presented as an operational forecast."}</p>
            <div className="landing-region-line"><MapPin size={15} /><span>{language === "es" ? "PAMPAS ARGENTINAS" : "ARGENTINE PAMPAS"}</span><i>·</i><span>{language === "es" ? "América del Sur" : "South America"}</span></div>
          </div>
        </section>

        <section className="landing-section" id="capabilities" aria-labelledby="capabilities-title">
          <div className="landing-section-heading">
            <div className="eyebrow"><span className="eyebrow-line" /> {language === "es" ? "PLATAFORMA" : "APPLICATION"}</div>
            <h2 id="capabilities-title">{language === "es" ? "Un recorrido transparente de los datos a su interpretación." : "A transparent path from data to interpretation."}</h2>
          </div>
          <div className="landing-capability-grid">
            <article className="landing-capability">
              <span className="landing-capability-icon"><Activity size={18} /></span>
              <div className="eyebrow">01 / {language === "es" ? "HISTORIA" : "HISTORY"}</div>
              <h3>{language === "es" ? "Tendencias estacionales de agua en el suelo" : "Seasonal soil-water trends"}</h3>
              <p>{language === "es" ? "Consultá almacenamiento modelado mensual de 0–100 cm, anomalías, tendencias HAC, intervalos de confianza y cobertura. La integración validada conserva archivos y checksums de origen." : "Inspect monthly modeled 0–100 cm storage, anomalies, HAC trends, confidence intervals, and coverage. The validated adapter retains source files and checksums."}</p>
              <span className="landing-capability-status">GLDAS NOAH v2.1 · 2006–2025</span>
            </article>
            <article className="landing-capability">
              <span className="landing-capability-icon"><MapPin size={18} /></span>
              <div className="eyebrow">02 / {language === "es" ? "ESPACIO" : "SPACE"}</div>
              <h3>{language === "es" ? "Variación y soporte espacial" : "Spatial variation & support"}</h3>
              <p>{language === "es" ? "Explorá estimaciones por celda y seleccioná subregiones pampeanas. Las celdas sin datos siguen visibles; la grilla 0.25° no es el límite de un campo." : "Explore grid-cell trend estimates and select Pampas subregions. Missing cells remain visible; the 0.25° model grid is not a field boundary."}</p>
              <span className="landing-capability-status">{language === "es" ? "ESTIMACIONES · COBERTURA · ATRIBUCIÓN" : "CELL ESTIMATES · COVERAGE · ATTRIBUTION"}</span>
            </article>
            <article className="landing-capability">
              <span className="landing-capability-icon"><ChartNoAxesCombined size={18} /></span>
              <div className="eyebrow">03 / {language === "es" ? "INVESTIGACIÓN" : "RESEARCH"}</div>
              <h3>{language === "es" ? "Comparación de modelos predictivos" : "Predictive model comparisons"}</h3>
              <p>{language === "es" ? "Con un artefacto de evaluación validado, se comparan validaciones cronológicas, resultados holdout y líneas base. Los hindcasts históricos no son pronósticos en vivo." : "With a validated evaluation artifact, compare chronological folds, holdout results, and baselines. Historical hindcasts are not live forecasts."}</p>
              <span className="landing-capability-status">{language === "es" ? "SEPARADO DE LOS PRONÓSTICOS OPERATIVOS" : "SEPARATE FROM OPERATIONAL FORECASTS"}</span>
            </article>
          </div>
          <div className="landing-crops-note"><Sprout size={17} /><p>{language === "es" ? "Este contexto puede ser relevante para el seguimiento de soja, maíz y trigo. La aplicación no pronostica rendimiento, estrés ni daño en cultivos." : "This context may be relevant to soybean, maize, and wheat monitoring. The application does not forecast crop yield, stress, or damage."}</p></div>
        </section>

        <section className="landing-demo-section" id="guided-demo" aria-labelledby="guided-demo-title">
          <div className="landing-demo-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" /> NASA SPACE APPS · {language === "es" ? "DEMOSTRACIÓN" : "DEMONSTRATION"}</div><h2 id="guided-demo-title">{language === "es" ? "Un recorrido de siete pasos por la evidencia." : "A seven-step guide to the evidence."}</h2></div>
            <p>{language === "es" ? "Recorré la incertidumbre regional del agua y lo que aún requiere un pronóstico responsable." : "Follow regional water uncertainty and what a responsible forecast would still require."}</p>
          </div>
          {step ? (
            <div className="guided-demo-card" aria-live="polite">
              <div className="guided-demo-progress" aria-label={language === "es" ? `Paso ${activeStep! + 1} de ${activeTour.length}` : `Step ${activeStep! + 1} of ${activeTour.length}`}>
                  {activeTour.map((item, index) => <span key={item.eyebrow} className={index <= activeStep! ? "complete" : ""} />)}
              </div>
              <div className="eyebrow">{step.eyebrow} <span>· {language === "es" ? `PASO ${activeStep! + 1} DE ${activeTour.length}` : `STEP ${activeStep! + 1} OF ${activeTour.length}`}</span></div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <div className="guided-demo-controls">
                <button className="landing-secondary" onClick={() => setActiveStep((value) => Math.max(0, (value ?? 0) - 1))} disabled={activeStep === 0}>{language === "es" ? "Anterior" : "Previous"}</button>
                {step.action && <button className="landing-secondary" onClick={() => onOpen(step.action!.page)}>{step.action.label} <ArrowRight size={14} /></button>}
                {activeStep! < activeTour.length - 1
                  ? <button className="landing-primary" onClick={() => setActiveStep((value) => Math.min(activeTour.length - 1, (value ?? 0) + 1))}>{language === "es" ? "Siguiente paso" : "Next step"} <ArrowRight size={14} /></button>
                  : <button className="landing-primary" onClick={() => { setActiveStep(null); onOpen("overview"); }}>{t("landingOpen")} <ArrowRight size={14} /></button>}
                <button className="guided-demo-close" onClick={() => setActiveStep(null)}>{language === "es" ? "Cerrar recorrido" : "Close guide"}</button>
              </div>
            </div>
          ) : (
            <div className="landing-demo-prompt">
              <div className="landing-demo-prompt-icon"><BookOpen size={19} /></div>
              <div><b>{language === "es" ? "Empezá con la pregunta. Terminá con los límites." : "Start with the question. End with the limits."}</b><p>{language === "es" ? "El recorrido usa las pantallas reales disponibles y señala los artefactos de investigación faltantes." : "The walkthrough uses real dashboard screens where available and labels missing research artifacts."}</p></div>
              <button className="landing-primary" onClick={() => setActiveStep(0)}>{language === "es" ? "Iniciar recorrido guiado" : "Start guided demo"} <ArrowRight size={14} /></button>
            </div>
          )}
        </section>

        <section className="landing-mission-cta" aria-labelledby="mission-cta-title">
          <div><div className="eyebrow"><span className="eyebrow-line" /> {t("mission").toUpperCase()}</div><h2 id="mission-cta-title">{t("heroMission")}</h2><p>{language === "es" ? "La inteligencia de la Tierra debe ser comprensible, útil y honesta sobre lo que no puede decirnos." : "Earth intelligence should be understandable, useful, and honest about what it cannot tell us."}</p></div>
          <button className="landing-primary" onClick={() => onOpen("overview")}>{t("landingOpen")} <ArrowRight size={16} /></button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand landing-footer-brand"><span className="landing-brand-mark"><Activity size={17} /></span><span><b>Alpha Agro</b><small>{t("developedBy")} QUANT ALPHA</small></span></div>
        <div><b>Be An Earth System Trend Detective!</b><span>NASA Space Apps Challenge 2026</span></div>
        <a href="https://doi.org/10.5067/SXAVCZFAQLNO" target="_blank" rel="noreferrer">GLDAS DATASET DOI <ArrowRight size={13} /></a>
      </footer>
    </div>
  );
}
