import { useEffect, useState } from "react";
import { CloudRain, LoaderCircle, MapPin } from "lucide-react";
import { CircleMarker, MapContainer, ScaleControl, TileLayer, useMapEvents } from "react-leaflet";
import { readAgriculturalWater, type AgriculturalWater, selectMoisture } from "../data/loadAgriculturalWater";

type Position = [number, number];

const CROPS = {
  soybean: { name: "Soja", context: "La ventana de siembra, el grupo de madurez y el agua útil del lote condicionan la decisión." },
  maize: { name: "Maíz", context: "La fecha de siembra y el agua útil del perfil importan al comparar planteos tempranos y tardíos." },
  wheat: { name: "Trigo", context: "Textura, profundidad efectiva y agua almacenada al inicio del ciclo condicionan la decisión." },
};

function MapSelection({ onSelect }: { onSelect: (position: Position) => void }) {
  useMapEvents({ click: ({ latlng }) => onSelect([latlng.lat, latlng.lng]) });
  return null;
}

export function AgriculturalForecast({ onResearch }: { onResearch: () => void }) {
  const [artifact, setArtifact] = useState<AgriculturalWater>();
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [position, setPosition] = useState<Position>();
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [crop, setCrop] = useState<keyof typeof CROPS>("soybean");
  const [horizon, setHorizon] = useState("14");
  useEffect(() => {
    const controller = new AbortController();
    fetch(import.meta.env.BASE_URL + "data/agricultural_water_v1.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("SMAP unavailable");
        return readAgriculturalWater(await response.json());
      })
      .then((data) => { if (!controller.signal.aborted) setArtifact(data); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [reload]);

  const select = ([lat, lon]: Position) => {
    setPosition([lat, lon]);
    setLatitude(lat.toFixed(4));
    setLongitude(lon.toFixed(4));
  };
  const estimate = artifact && position ? selectMoisture(artifact, ...position) : undefined;
  const ageHours = artifact ? Math.floor((Date.now() - Date.parse(artifact.source.observed_end)) / 3_600_000) : null;
  return <>
    <section className="page-intro">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> HUMEDAD DEL SUELO / PAMPA</div>
        <h1>Pronóstico agrícola</h1>
        <p>Elegí un punto en el mapa para consultar la humedad de la zona radicular y el estado del pronóstico.</p>
      </div>
    </section>
    <div className="dashboard-grid agricultural-grid">
      <section className="panel map-panel" aria-labelledby="agricultural-map-title">
        <div className="panel-heading map-heading"><h2 id="agricultural-map-title">Ubicación</h2></div>
        <div className="map-frame">
          <MapContainer center={[-34.2, -60.5]} zoom={6} minZoom={5} maxZoom={11} className="pampas-map" aria-label="Mapa de selección de ubicación">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ScaleControl position="bottomright" imperial={false} />
            <MapSelection onSelect={select} />
            {position && <CircleMarker center={position} radius={7} pathOptions={{ color: "#eddfae" }} />}
          </MapContainer>
        </div>
        <form className="agricultural-controls" onSubmit={(event) => {
          event.preventDefault();
          if (latitude.trim() && longitude.trim()) select([Number(latitude), Number(longitude)]);
        }}>
          <label>Latitud<input type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} required /></label>
          <label>Longitud<input type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} required /></label>
          <button type="submit"><MapPin size={15} /> Buscar</button>
        </form>
      </section>
      <section className="panel agricultural-results" aria-live="polite">
        <h2>Humedad y disponibilidad</h2>
        <div className="agricultural-controls">
          <label>Cultivo<select value={crop} onChange={(event) => setCrop(event.target.value as keyof typeof CROPS)}>
            {Object.entries(CROPS).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
          </select></label>
          <label>Horizonte<select value={horizon} onChange={(event) => setHorizon(event.target.value)}>
            <option value="14">14 días</option><option value="28">28 días</option>
          </select></label>
        </div>
        {artifact ? <>
          <h3>Última estimación cargada</h3>
          {estimate ? <p><strong>{(estimate.value * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% de humedad volumétrica</strong> en 0–100 cm. Centro de celda {estimate.latitude.toFixed(3)}°, {estimate.longitude.toFixed(3)}°.</p>
            : <p>{position ? "Sin una celda válida para esta ubicación." : "Seleccioná una ubicación para consultar su celda SMAP."}</p>}
          <p>NASA SMAP L4 V008 · 9 km · fin de la ventana {artifact.source.observed_end.replace("T", " ").slice(0, 16)} UTC · hace {ageHours} h.</p>
        </> : failed ? <div className="state-card"><p>No se pudo cargar una estimación SMAP validada.</p><button type="button" onClick={() => { setFailed(false); setReload((key) => key + 1); }}>Reintentar</button></div>
          : <p><LoaderCircle size={15} className="spin" /> Cargando estimación SMAP…</p>}
        <h3><CloudRain size={17} /> Pronóstico a {horizon} días no disponible</h3>
        <p>Se necesita una evaluación histórica y validación al momento de emisión para mostrar humedad esperada, cambio, incertidumbre o probabilidad de un período seco.</p>
        <h3>Contexto de siembra</h3>
        <p>{CROPS[crop].context} La humedad estimada para una celda de 9 km no determina el agua útil de un lote.</p>
        <button type="button" onClick={onResearch}>Ver la evaluación histórica de 1–3 meses</button>
      </section>
    </div>
  </>;
}
