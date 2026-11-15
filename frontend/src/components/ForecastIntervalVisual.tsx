import type { ForecastArtifact } from "../types/forecast";

export function ForecastIntervalVisual({ artifact, valueLabel, intervalLabel, formatNumber, language }: {
  artifact: ForecastArtifact;
  valueLabel: string;
  intervalLabel: string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  language: "en" | "es";
}) {
  const interval = artifact.predictive_interval;
  if (!interval || artifact.units !== "mm") return null;
  const low = Math.min(interval.lower, artifact.value);
  const high = Math.max(interval.upper, artifact.value);
  const padding = Math.max((high - low) * 0.2, 0.5);
  const start = low - padding;
  const span = high - low + padding * 2;
  const left = ((interval.lower - start) / span) * 300;
  const right = ((interval.upper - start) / span) * 300;
  const point = ((artifact.value - start) / span) * 300;
  const aria = language === "es"
    ? `Estimación puntual ${formatNumber(artifact.value)} milímetros; intervalo del ${Math.round(interval.level * 100)} por ciento de ${formatNumber(interval.lower)} a ${formatNumber(interval.upper)} milímetros.`
    : `Point estimate ${formatNumber(artifact.value)} millimeters; ${Math.round(interval.level * 100)} percent interval from ${formatNumber(interval.lower)} to ${formatNumber(interval.upper)} millimeters.`;
  return <figure className="forecast-interval-figure">
    <svg viewBox="0 0 300 46" role="img" aria-label={aria} preserveAspectRatio="none">
      <line x1="0" y1="23" x2="300" y2="23" className="forecast-interval-track" />
      <line x1={left} y1="23" x2={right} y2="23" className="forecast-interval-range" />
      <line x1={left} y1="14" x2={left} y2="32" className="forecast-interval-cap" />
      <line x1={right} y1="14" x2={right} y2="32" className="forecast-interval-cap" />
      <circle cx={point} cy="23" r="5" className="forecast-interval-point" />
    </svg>
    <div className="forecast-interval-legend"><span>{intervalLabel}: {formatNumber(interval.lower, { maximumFractionDigits: 1 })}–{formatNumber(interval.upper, { maximumFractionDigits: 1 })} {artifact.units} ({Math.round(interval.level * 100)}%)</span><span>{valueLabel}: {formatNumber(artifact.value, { maximumFractionDigits: 1 })} {artifact.units}</span></div>
    <figcaption>{interval.method}</figcaption>
  </figure>;
}
