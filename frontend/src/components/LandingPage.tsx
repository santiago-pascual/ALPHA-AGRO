import { useState } from "react";
import { Activity, ArrowDown, ArrowRight, BookOpen, ChartNoAxesCombined, Database, MapPin, Sprout } from "lucide-react";
import type { DataMode } from "../types";

export type LandingPageName = "overview" | "methodology" | "relationships" | "predictive";

type LandingPageProps = {
  onOpen: (page: LandingPageName, mode: DataMode) => void;
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
    action: { label: "Open methods & data", page: "methodology" as const, mode: "demo" as const },
  },
  {
    eyebrow: "03 · THE HISTORY",
    title: "Read the seasonal record with uncertainty in view.",
    text: "The overview presents monthly storage and anomalies alongside trend estimates, confidence intervals, HAC significance, and data coverage. Select REAL DATA to load the validated JSON; if it is absent or invalid, the page stays empty and explains why.",
    action: { label: "Open REAL DATA overview", page: "overview" as const, mode: "real" as const },
  },
  {
    eyebrow: "04 · RELATIONSHIPS",
    title: "Associations need aligned data and careful interpretation.",
    text: "Open the validated environmental-relationships artifact to inspect rainfall, evapotranspiration, temperature, and runoff associations by region and lead time. If the approved artifact is missing, the page reports that state without inventing correlations. Shared model inputs limit causal interpretation.",
    action: { label: "Open environmental relationships", page: "relationships" as const, mode: "real" as const },
  },
  {
    eyebrow: "05 · THE MAP",
    title: "Compare supported cells, then check what is missing.",
    text: "The spatial view uses cell estimates from the validated artifact, reports the study-grid coverage, and marks cells without eligible trends. Its selectable Pampas subregions are descriptive groupings, not farm boundaries.",
    action: { label: "Open spatial overview", page: "overview" as const, mode: "real" as const },
  },
  {
    eyebrow: "06 · PREDICTIVE RESEARCH",
    title: "Walk-forward selection comes before holdout comparison.",
    text: "Seasonal climatology remains the selected model because selection uses pooled pre-holdout walk-forward results. A lower XGBoost or HMM score on some holdout comparisons is descriptive; choosing from the holdout would contaminate the evaluation. These are historical tests, not live forecasts.",
    action: { label: "Open predictive research", page: "predictive" as const, mode: "demo" as const },
  },
  {
    eyebrow: "07 · LIMITS & NEXT STEPS",
    title: "Use the signal as context, not as a crop forecast.",
    text: "The current application does not predict yield, damage, or field-level moisture. Prospective forecasts remain unavailable until a future backend provides a versioned artifact and verified eligibility. Missing data and uncertainty stay visible.",
    action: { label: "Review methods & limitations", page: "methodology" as const, mode: "demo" as const },
  },
];

export function LandingPage({ onOpen }: LandingPageProps) {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const step = activeStep === null ? null : tourSteps[activeStep];

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <a className="landing-brand" href="#home" aria-label="Alpha Agro home">
          <span className="landing-brand-mark"><Activity size={19} /></span>
          <span><b>Alpha Agro</b><small>DEVELOPED BY QUANT ALPHA</small></span>
        </a>
        <nav className="landing-nav" aria-label="Alpha Agro landing navigation">
          <a href="#study">Study region</a>
          <a href="#capabilities">What it shows</a>
          <a href="#guided-demo">Guided demo</a>
        </nav>
        <button className="landing-nav-cta" onClick={() => onOpen("overview", "demo")}>Open dashboard <ArrowRight size={14} /></button>
      </header>

      <main>
        <section className="landing-hero" id="home" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> NASA SPACE APPS CHALLENGE 2026 · QUANT ALPHA</div>
            <h1 id="landing-title">From Earth data<br /><em>to agricultural insight.</em></h1>
            <p className="landing-description">NASA-powered Earth system intelligence for agriculture. Explore historical soil-water conditions across the Argentine Pampas, with uncertainty and data provenance in view.</p>
            <div className="landing-actions">
              <button className="landing-primary" onClick={() => onOpen("overview", "demo")}>Explore dashboard <ArrowRight size={16} /></button>
              <button className="landing-secondary" onClick={() => onOpen("overview", "real")}><Database size={15} /> Load validated GLDAS data</button>
            </div>
            <a className="landing-tour-link" href="#guided-demo" onClick={() => setActiveStep(0)}>Start the guided demo <ArrowDown size={13} /></a>
            <p className="landing-mode-note">DEMO values are synthetic and labeled. REAL DATA requires a valid <code>trend_analysis.json</code>; it never falls back to DEMO.</p>
          </div>
          <div className="landing-hero-aside" aria-label="Study summary">
            <div className="landing-aside-top"><span className="landing-status-mark" /><span>STUDY REGION · SCHEMATIC LOCATOR</span></div>
            <div className="landing-aside-map" aria-hidden="true">
              <div className="map-grid-lines" />
              <span className="map-region-label">ARGENTINE<br />PAMPAS</span>
              <span className="map-pin-mark"><MapPin size={17} /></span>
            </div>
            <div className="landing-aside-facts">
              <div><span>NASA PRODUCT</span><b>GLDAS Noah v2.1</b></div>
              <div><span>HISTORICAL PERIOD</span><b>2006–2025 · monthly</b></div>
              <div><span>STUDY SUPPORT</span><b>0.25° model grid</b></div>
            </div>
          </div>
          <a className="landing-scroll" href="#study"><span>Explore the study</span><ArrowDown size={14} /></a>
        </section>

        <section className="landing-section problem-section" id="study" aria-labelledby="study-title">
          <div className="landing-section-heading">
            <div className="eyebrow"><span className="eyebrow-line" /> THE STUDY</div>
            <h2 id="study-title">Regional context for a region shaped by water.</h2>
          </div>
          <div className="landing-problem-copy">
            <p>Rainfall, evaporation, and soil-water storage vary over time and space. Agricultural decisions happen at the field scale, while NASA’s land-surface models represent broader grid cells.</p>
            <p>Alpha Agro makes the historical evidence easier to inspect. It shows what the data support, where coverage is missing, and how much uncertainty remains—without turning a regional signal into a yield or damage prediction.</p>
            <div className="landing-region-line"><MapPin size={15} /><span>ARGENTINE PAMPAS</span><i>·</i><span>South America</span></div>
          </div>
        </section>

        <section className="landing-section" id="capabilities" aria-labelledby="capabilities-title">
          <div className="landing-section-heading">
            <div className="eyebrow"><span className="eyebrow-line" /> APPLICATION</div>
            <h2 id="capabilities-title">A transparent path from data to interpretation.</h2>
          </div>
          <div className="landing-capability-grid">
            <article className="landing-capability">
              <span className="landing-capability-icon"><Activity size={18} /></span>
              <div className="eyebrow">01 / HISTORY</div>
              <h3>Seasonal soil-water trends</h3>
              <p>Inspect monthly 0–100 cm modeled storage, anomalies, HAC trends, confidence intervals, and coverage. The validated adapter retains source files and checksums.</p>
              <span className="landing-capability-status">GLDAS NOAH v2.1 · 2006–2025</span>
            </article>
            <article className="landing-capability">
              <span className="landing-capability-icon"><MapPin size={18} /></span>
              <div className="eyebrow">02 / SPACE</div>
              <h3>Spatial variation & support</h3>
              <p>Explore grid-cell trend estimates and select Pampas subregions. Missing cells remain visible; the 0.25° model grid is not a field boundary.</p>
              <span className="landing-capability-status">CELL ESTIMATES · COVERAGE · ATTRIBUTION</span>
            </article>
            <article className="landing-capability">
              <span className="landing-capability-icon"><ChartNoAxesCombined size={18} /></span>
              <div className="eyebrow">03 / RESEARCH</div>
              <h3>Predictive model comparisons</h3>
              <p>Compare chronological folds, holdout results, and baselines only when the validated evaluation artifact is included. Historical hindcasts are not live forecasts.</p>
              <span className="landing-capability-status">SEPARATE FROM OPERATIONAL FORECASTS</span>
            </article>
          </div>
          <div className="landing-crops-note"><Sprout size={17} /><p>Context may be relevant to soybean, maize, and wheat monitoring. The application does not forecast crop yield, stress, or damage.</p></div>
        </section>

        <section className="landing-demo-section" id="guided-demo" aria-labelledby="guided-demo-title">
          <div className="landing-demo-heading">
            <div><div className="eyebrow"><span className="eyebrow-line" /> NASA SPACE APPS DEMONSTRATION</div><h2 id="guided-demo-title">A seven-step field guide to the evidence.</h2></div>
            <p>Follow the story from regional water uncertainty to what a responsible forecast would still need.</p>
          </div>
          {step ? (
            <div className="guided-demo-card" aria-live="polite">
              <div className="guided-demo-progress" aria-label={`Step ${activeStep! + 1} of ${tourSteps.length}`}>
                {tourSteps.map((item, index) => <span key={item.eyebrow} className={index <= activeStep! ? "complete" : ""} />)}
              </div>
              <div className="eyebrow">{step.eyebrow} <span>· STEP {activeStep! + 1} OF {tourSteps.length}</span></div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <div className="guided-demo-controls">
                <button className="landing-secondary" onClick={() => setActiveStep((value) => Math.max(0, (value ?? 0) - 1))} disabled={activeStep === 0}>Previous</button>
                {step.action && <button className="landing-secondary" onClick={() => onOpen(step.action!.page, step.action!.mode)}>{step.action.label} <ArrowRight size={14} /></button>}
                {activeStep! < tourSteps.length - 1
                  ? <button className="landing-primary" onClick={() => setActiveStep((value) => Math.min(tourSteps.length - 1, (value ?? 0) + 1))}>Next step <ArrowRight size={14} /></button>
                  : <button className="landing-primary" onClick={() => { setActiveStep(null); onOpen("overview", "demo"); }}>Open dashboard in DEMO <ArrowRight size={14} /></button>}
                <button className="guided-demo-close" onClick={() => setActiveStep(null)}>Close guide</button>
              </div>
            </div>
          ) : (
            <div className="landing-demo-prompt">
              <div className="landing-demo-prompt-icon"><BookOpen size={19} /></div>
              <div><b>Start with the question. End with the limits.</b><p>The walkthrough uses the actual dashboard screens where available and labels missing research artifacts explicitly.</p></div>
              <button className="landing-primary" onClick={() => setActiveStep(0)}>Start guided demo <ArrowRight size={14} /></button>
            </div>
          )}
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand landing-footer-brand"><span className="landing-brand-mark"><Activity size={17} /></span><span><b>Alpha Agro</b><small>DEVELOPED BY QUANT ALPHA</small></span></div>
        <div><b>Be An Earth System Trend Detective!</b><span>NASA Space Apps Challenge 2026</span></div>
        <a href="https://doi.org/10.5067/SXAVCZFAQLNO" target="_blank" rel="noreferrer">GLDAS DATASET DOI <ArrowRight size={13} /></a>
      </footer>
    </div>
  );
}
