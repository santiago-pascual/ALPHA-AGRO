export type PlainLanguage = { spanish: string; english: string };

/** Describes only the sign of a validated anomaly; no risk threshold is implied. */
export function interpretAnomaly(anomalyMm: number | null): PlainLanguage {
  if (anomalyMm === null || !Number.isFinite(anomalyMm)) return {
    spanish: "No hay una anomalía mensual validada disponible para este período.",
    english: "No validated monthly anomaly is available for this period.",
  };
  if (anomalyMm < 0) return {
    spanish: "El modelo estima menos agua almacenada en el suelo que lo habitual para este momento del año.",
    english: "The model estimates less water stored in the soil than is typical for this time of year.",
  };
  if (anomalyMm > 0) return {
    spanish: "El modelo estima más agua almacenada en el suelo que lo habitual para este momento del año.",
    english: "The model estimates more water stored in the soil than is typical for this time of year.",
  };
  return {
    spanish: "La estimación coincide con la referencia mensual habitual.",
    english: "The estimate matches the usual monthly reference.",
  };
}

export function interpretStorage(): PlainLanguage {
  return {
    spanish: "Es una estimación del agua almacenada en el perfil de suelo analizado; por sí sola no indica si hay más o menos que lo habitual.",
    english: "This estimates water stored in the analyzed soil profile; on its own, it does not show whether conditions are wetter or drier than usual.",
  };
}

export function interpretForecastAnomaly(value: number): PlainLanguage {
  return interpretAnomaly(value);
}

export function interpretLowMoistureProbability(value: number, eventDefinition: string | undefined): PlainLanguage | null {
  if (!Number.isFinite(value) || value < 0 || value > 1 || !eventDefinition?.trim()) return null;
  return {
    spanish: `Es una probabilidad estimada para el evento definido por la investigación: ${eventDefinition}. No es una predicción de rendimiento ni una recomendación.`,
    english: `This is an estimated probability for the research-defined event: ${eventDefinition}. It is not a yield prediction or recommendation.`,
  };
}

export function interpretCellTrend(slopeMmPerDecade: number | null): PlainLanguage {
  if (slopeMmPerDecade === null || !Number.isFinite(slopeMmPerDecade)) return {
    spanish: "Esta celda no tiene una estimación de tendencia histórica elegible.",
    english: "This grid cell has no eligible historical trend estimate.",
  };
  if (slopeMmPerDecade < 0) return {
    spanish: "En esta celda, la serie histórica muestra una tendencia descendente en las anomalías estacionales de agua del suelo. No describe la humedad actual.",
    english: "For this cell, the historical series shows a downward trend in seasonal soil-water anomalies. It does not describe current moisture.",
  };
  if (slopeMmPerDecade > 0) return {
    spanish: "En esta celda, la serie histórica muestra una tendencia ascendente en las anomalías estacionales de agua del suelo. No describe la humedad actual.",
    english: "For this cell, the historical series shows an upward trend in seasonal soil-water anomalies. It does not describe current moisture.",
  };
  return {
    spanish: "En esta celda, la estimación no muestra un cambio lineal en las anomalías estacionales durante el período analizado. No describe la humedad actual.",
    english: "For this cell, the estimate shows no linear change in seasonal anomalies over the analyzed period. It does not describe current moisture.",
  };
}
