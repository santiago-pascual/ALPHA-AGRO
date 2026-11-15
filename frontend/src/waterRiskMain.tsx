/// <reference types="vite/client" />

import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { readWaterRisk, type ArchivedCell } from "./data/loadWaterRisk";

function WaterRisk() {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [horizon, setHorizon] = useState("14");
  const [cells, setCells] = useState<ArchivedCell[]>([]);
  const [dataState, setDataState] = useState("Cargando el archivo histórico…");
  useEffect(() => {
    const controller = new AbortController();
    fetch(import.meta.env.BASE_URL + "data/water_risk_v1.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Archivo no disponible");
        return readWaterRisk(await response.json());
      })
      .then((values) => {
        setCells(values);
        setDataState("Archivo histórico de NASA GLDAS Noah 2.1");
      })
      .catch(() => {
        if (!controller.signal.aborted) setDataState("Archivo histórico no disponible");
      });
    return () => controller.abort();
  }, []);

  const latitude = Number(lat);
  const longitude = Number(lon);
  const inside = lat.trim() && lon.trim() && latitude >= -38 && latitude < -30 &&
    longitude >= -64 && longitude < -57;
  const selected = inside ? cells.find((cell) =>
    cell.latitude === -37.875 + 0.25 * Math.floor((latitude + 38) * 4) &&
    cell.longitude === -63.875 + 0.25 * Math.floor((longitude + 64) * 4)) : undefined;

  return (
    <main style={{ maxWidth: 660, margin: "2rem auto", padding: "0 1rem", fontFamily: "system-ui", lineHeight: 1.6 }}>
      <a href={import.meta.env.BASE_URL}>Alpha Agro</a>
      <h1>Agua en el suelo</h1>
      <fieldset style={{ display: "grid", gap: ".6rem" }}>
        <legend>Ubicación y cultivo</legend>
        <label>Latitud <input type="number" inputMode="decimal" step="any" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label>Longitud <input type="number" inputMode="decimal" step="any" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
        <label>Cultivo <select defaultValue="soybean"><option value="soybean">Soja</option><option value="maize">Maíz</option><option value="wheat">Trigo</option></select></label>
        <label>Horizonte <select value={horizon} onChange={(e) => setHorizon(e.target.value)}><option value="14">14 días</option><option value="28">28 días</option></select></label>
      </fieldset>
      <section aria-live="polite">
        <h2>Evidencia insuficiente para {horizon} días</h2>
        <p>No se pudo verificar el estado actual del suelo ni la confiabilidad de un pronóstico. El cambio, su incertidumbre y la probabilidad de condiciones más secas de lo normal no están disponibles.</p>
        <p>El cultivo elegido no activa recomendaciones de siembra. Una caída del agua almacenada por sí sola no indica degradación del suelo.</p>
        <p>{dataState}</p>
        {selected && <p>
          Último dato archivado para la celda de 0,25° ({selected.latitude}°, {selected.longitude}°).
          {" "}{selected.historical_storage_mm.toFixed(1)} mm de agua en los primeros 100 cm del suelo el
          {" "}{selected.observation_day_utc} (UTC).
          {" "}Han pasado {Math.max(0, Math.floor((Date.now() - Date.parse(selected.observation_day_utc)) / 86_400_000) - 1)} días completos desde el cierre de esa ventana.
        </p>}
        {lat && lon && !selected && <p>{inside ? "Sin datos históricos para esta celda." : "La ubicación está fuera del área de estudio provisional."}</p>}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<WaterRisk />);
