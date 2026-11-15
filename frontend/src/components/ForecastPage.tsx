import { AlertTriangle, CalendarClock, CircleHelp, Database, LockKeyhole, MapPin } from "lucide-react";

const forecastFile = "frontend/public/data/forecast_v1.json";

export function ForecastPage() {
  return <>
    <section className="page-intro forecast-intro">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> PROSPECTIVE SOIL-WATER OUTLOOK</div>
        <h1>Forecast <em>availability</em></h1>
        <p>Monthly forecasts are not available yet. Historical evaluation and retrospective simulations are not current forecasts.</p>
      </div>
      <div className="forecast-status" role="status"><span /><b>NOT OPERATIONALLY ELIGIBLE</b><small>NO VALIDATED FORECAST ARTIFACT</small></div>
    </section>

    <section className="forecast-unavailable panel" aria-labelledby="forecast-unavailable-title">
      <div className="forecast-unavailable-icon"><LockKeyhole size={19} /></div>
      <div>
        <div className="eyebrow">FORECAST WORKSPACE / UNAVAILABLE</div>
        <h2 id="forecast-unavailable-title">No prospective result is connected</h2>
        <p>The application will show a result only after a schema-valid <code>forecast_v1.json</code> includes issue time, an observation availability cutoff, predictive uncertainty, provenance, and verified operational eligibility. No historical hindcast is substituted.</p>
        <div className="forecast-file-path"><Database size={14} /><code>{forecastFile}</code></div>
      </div>
    </section>

    <section className="forecast-setup panel" aria-labelledby="forecast-setup-title">
      <div className="panel-heading"><div><div className="eyebrow">SUPPORTED CONFIGURATION</div><h2 id="forecast-setup-title">Monthly horizons</h2></div><span className="historical-chip">CONTROLS DISABLED</span></div>
      <div className="forecast-controls">
        <label><span>Study region</span><div className="forecast-fixed-field"><MapPin size={14} /> Argentine Pampas · regional model grid</div></label>
        <label><span>Forecast horizon</span><select disabled aria-label="Forecast horizon"><option>1 month ahead</option><option>2 months ahead</option><option>3 months ahead</option></select></label>
        <label><span>Target variable</span><select disabled aria-label="Forecast target"><option>Soil-water storage (mm)</option><option>Storage anomaly (mm)</option><option>Low-moisture probability</option></select></label>
      </div>
      <p className="forecast-controls-note"><CircleHelp size={14} /> The interface is prepared for the validated 1–3 month research horizons. Configuration stays locked until an eligible forecast artifact is available.</p>
    </section>

    <section className="forecast-requirements" aria-label="Forecast evidence requirements">
      <article className="panel"><CalendarClock size={17} /><div><b>Issue-time evidence</b><span>Observed inputs and their release times must be available by the recorded issue timestamp.</span></div></article>
      <article className="panel"><AlertTriangle size={17} /><div><b>Validation before display</b><span>Chronological evaluation, calibration, uncertainty, source versions, and quality flags must be documented.</span></div></article>
    </section>
    <footer className="page-footer"><span>MONTHLY HORIZONS · 1–3 MONTHS</span><span>NO LIVE FORECASTS · NO CROP-SPECIFIC ADVICE</span><span>ALPHA AGRO · DEVELOPED BY QUANT ALPHA</span></footer>
  </>;
}
