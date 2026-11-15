import { useState, type FormEvent } from "react";
import { Check, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import type { DashboardDataset } from "../types";
import type { SelectedLocation } from "../data/location";
import type { SavedField } from "../data/fields";
import { sameGridCellGroups } from "../data/fields";
import { formatCoordinate } from "../data/location";

const formatCreatedAt = (value: string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));

type Props = {
  dataset: DashboardDataset | null;
  selectedLocation: SelectedLocation | null;
  fields: SavedField[];
  activeFieldId: string | null;
  storageWarning: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (name: string, description: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

export function SavedFieldsPanel({ dataset, selectedLocation, fields, activeFieldId, storageWarning, onSelect, onAdd, onRename, onDelete }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const duplicateGroups = sameGridCellGroups(fields);

  const submitNewField = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLocation) { setFormError("Primero elegí un punto en el mapa. / Select a map point first."); return; }
    if (!name.trim()) { setFormError("Ingresá un nombre para el campo. / Enter a field name."); return; }
    onAdd(name, description);
    setName(""); setDescription(""); setFormError(null); setAddOpen(false);
  };

  const saveRename = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    if (!editName.trim()) { setFormError("El nombre no puede quedar vacío. / Field name cannot be empty."); return; }
    onRename(id, editName); setEditingId(null); setFormError(null);
  };

  return (
    <section className="saved-fields-panel panel" aria-labelledby="saved-fields-title">
      <div className="panel-heading saved-fields-heading">
        <div><div className="eyebrow">TUS CAMPOS · THIS DEVICE ONLY</div><h2 id="saved-fields-title">Campos guardados</h2></div>
        <button className="button-secondary" type="button" onClick={() => { setAddOpen((open) => !open); setFormError(null); }}><Plus size={14} /> Agregar campo · Add field</button>
      </div>
      <p className="saved-fields-intro">Guardá puntos de referencia para volver a ellos. Los datos quedan en este navegador y dispositivo; no se suben a Alpha Agro. / Save reference points for later. They stay in this browser and device and are not uploaded to Alpha Agro.</p>
      {storageWarning && <p className="saved-fields-warning" role="status">{storageWarning}</p>}
      {addOpen && <form className="saved-field-form" onSubmit={submitNewField}>
        <div className="saved-field-current-point"><MapPin size={15} /><span>{selectedLocation ? `${formatCoordinate(selectedLocation.latitude, "latitude")} · ${formatCoordinate(selectedLocation.longitude, "longitude")}` : "Elegí un punto elegible en el mapa o ingresá coordenadas. / Select an eligible map point or enter coordinates."}</span></div>
        <label><span>Nombre del campo · Field name</span><input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Campo Marcos Paz" /></label>
        <label><span>Descripción opcional · Optional description</span><input maxLength={400} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Referencia personal, sin datos sensibles" /></label>
        {formError && <p className="saved-fields-warning" role="alert">{formError}</p>}
        <div className="saved-field-actions"><button className="button-primary" type="submit">Guardar campo · Save field</button><button className="button-secondary" type="button" onClick={() => { setAddOpen(false); setFormError(null); }}>Cancelar · Cancel</button></div>
      </form>}
      {fields.length === 0 ? <div className="saved-fields-empty"><MapPin size={16} /><span>Aún no guardaste campos. Elegí un punto elegible y agregalo para encontrarlo fácilmente después. / No fields saved yet. Choose an eligible point and add it to find it again later.</span></div> : <ul className="saved-field-list" aria-label="Saved fields / Campos guardados">
        {fields.map((field) => <li key={field.id} className={activeFieldId === field.id ? "saved-field-row is-active" : "saved-field-row"}>
          {editingId === field.id ? <form className="saved-field-rename" onSubmit={(event) => saveRename(event, field.id)}>
            <label><span>Renombrar · Rename</span><input autoFocus maxLength={80} value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <button className="field-icon-button" aria-label={`Guardar nombre de ${field.name}`} type="submit"><Check size={15} /></button>
            <button className="field-icon-button" aria-label="Cancelar renombrado" type="button" onClick={() => { setEditingId(null); setFormError(null); }}>×</button>
          </form> : <>
            <button className="saved-field-select" type="button" aria-pressed={activeFieldId === field.id} onClick={() => onSelect(field.id)}>
              <span className="saved-field-check">{activeFieldId === field.id ? <Check size={14} /> : <MapPin size={14} />}</span>
              <span className="saved-field-details"><b>{field.name}</b><small>{formatCoordinate(field.latitude, "latitude")} · {formatCoordinate(field.longitude, "longitude")}</small><small>Guardado · Saved {formatCreatedAt(field.createdAt)}</small>{field.gridCellId && <small>Celda GLDAS · {field.gridCellId}</small>}{field.description && <small>{field.description}</small>}</span>
              <span className="saved-field-active-label">{activeFieldId === field.id ? "ACTIVO · ACTIVE" : "USAR · SELECT"}</span>
            </button>
            <div className="saved-field-row-actions">
              <button className="field-icon-button" type="button" aria-label={`Renombrar ${field.name} / Rename ${field.name}`} onClick={() => { setEditingId(field.id); setEditName(field.name); setFormError(null); }}><Pencil size={14} /></button>
              {deleteId === field.id ? <span className="saved-field-confirm" role="group" aria-label={`Confirmar eliminación de ${field.name}`}><span>¿Eliminar? / Delete?</span><button type="button" onClick={() => { onDelete(field.id); setDeleteId(null); }}>Sí · Yes</button><button type="button" onClick={() => setDeleteId(null)}>No</button></span> : <button className="field-icon-button danger" type="button" aria-label={`Eliminar ${field.name} / Delete ${field.name}`} onClick={() => setDeleteId(field.id)}><Trash2 size={14} /></button>}
            </div>
          </>}
          {formError && editingId === field.id && <p className="saved-fields-warning" role="alert">{formError}</p>}
        </li>)}
      </ul>}
      {duplicateGroups.map((group) => <div className="same-cell-note" role="note" key={group[0].gridCellId}>
        <p>Estos campos comparten una misma celda de la grilla del modelo GLDAS. Alpha Agro no puede distinguir sus estimaciones de agua en el suelo a la resolución actual.</p>
        <p lang="en">These fields share the same satellite-model grid cell, so Alpha Agro cannot distinguish their soil-water estimates at the current resolution.</p>
        <small>{group.map((field) => field.name).join(" · ")} · {dataset?.resolutionDegrees ?? "—"}°</small>
      </div>)}
      <p className="saved-fields-footnote">Un punto guardado no define el perímetro del campo ni representa una medición dentro del lote. / A saved point does not define a farm boundary or represent an in-field measurement.</p>
    </section>
  );
}
