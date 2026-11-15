import { useState, type FormEvent } from "react";
import { Check, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import type { DashboardDataset } from "../types";
import type { SelectedLocation } from "../data/location";
import type { SavedField } from "../data/fields";
import { sameGridCellGroups } from "../data/fields";
import { formatCoordinate } from "../data/location";
import { useI18n, type TranslationKey } from "../i18n";

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
  const { language, t, formatDate } = useI18n();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState<TranslationKey | null>(null);
  const duplicateGroups = sameGridCellGroups(fields);

  const submitNewField = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLocation) { setFormError("chooseMapPointError"); return; }
    if (!name.trim()) { setFormError("enterFieldNameError"); return; }
    onAdd(name, description);
    setName(""); setDescription(""); setFormError(null); setAddOpen(false);
  };

  const saveRename = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    if (!editName.trim()) { setFormError("emptyFieldNameError"); return; }
    onRename(id, editName); setEditingId(null); setFormError(null);
  };

  return (
    <section className="saved-fields-panel panel" aria-labelledby="saved-fields-title">
      <div className="panel-heading saved-fields-heading">
        <div><div className="eyebrow">{language === "es" ? "TUS CAMPOS · SOLO EN ESTE DISPOSITIVO" : "SAVED FIELDS · THIS DEVICE ONLY"}</div><h2 id="saved-fields-title">{t("savedFields")}</h2></div>
        <button className="button-secondary" type="button" onClick={() => { setAddOpen((open) => !open); setFormError(null); }}><Plus size={14} /> {t("addField")}</button>
      </div>
      <p className="saved-fields-intro">{t("fieldStoredHere")}</p>
      {storageWarning && <p className="saved-fields-warning" role="status">{storageWarning}</p>}
      {addOpen && <form className="saved-field-form" onSubmit={submitNewField}>
        <div className="saved-field-current-point"><MapPin size={15} /><span>{selectedLocation ? `${formatCoordinate(selectedLocation.latitude, "latitude")} · ${formatCoordinate(selectedLocation.longitude, "longitude")}` : t("choosePointPrompt")}</span></div>
        <label><span>{t("fieldName")}</span><input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("fieldNamePlaceholder")} /></label>
        <label><span>{t("optionalDescription")}</span><input maxLength={400} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("referencePlaceholder")} /></label>
        {formError && <p className="saved-fields-warning" role="alert">{t(formError)}</p>}
        <div className="saved-field-actions"><button className="button-primary" type="submit">{t("saveField")}</button><button className="button-secondary" type="button" onClick={() => { setAddOpen(false); setFormError(null); }}>{t("cancel")}</button></div>
      </form>}
      {fields.length === 0 ? <div className="saved-fields-empty"><MapPin size={16} /><span>{t("noSavedFields")}</span></div> : <ul className="saved-field-list" aria-label={t("savedFields")}>
        {fields.map((field) => <li key={field.id} className={activeFieldId === field.id ? "saved-field-row is-active" : "saved-field-row"}>
          {editingId === field.id ? <form className="saved-field-rename" onSubmit={(event) => saveRename(event, field.id)}>
            <label><span>{t("rename")}</span><input autoFocus maxLength={80} value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <button className="field-icon-button" aria-label={`${t("saveFieldName")} ${field.name}`} type="submit"><Check size={15} /></button>
            <button className="field-icon-button" aria-label={t("cancel")} type="button" onClick={() => { setEditingId(null); setFormError(null); }}>×</button>
          </form> : <>
            <button className="saved-field-select" type="button" aria-pressed={activeFieldId === field.id} onClick={() => onSelect(field.id)}>
              <span className="saved-field-check">{activeFieldId === field.id ? <Check size={14} /> : <MapPin size={14} />}</span>
              <span className="saved-field-details"><b>{field.name}</b><small>{formatCoordinate(field.latitude, "latitude")} · {formatCoordinate(field.longitude, "longitude")}</small><small>{language === "es" ? "Guardado" : "Saved"} {formatDate(field.createdAt, { dateStyle: "medium" })}</small>{field.gridCellId && <small>GLDAS · {field.gridCellId}</small>}{field.cropConfiguration && <small>{t(field.cropConfiguration.crop)} · {t(field.cropConfiguration.growthStage)} · {t(field.cropConfiguration.waterManagement)}</small>}{field.description && <small>{field.description}</small>}</span>
              <span className="saved-field-active-label">{activeFieldId === field.id ? t("active").toUpperCase() : t("useField").toUpperCase()}</span>
            </button>
            <div className="saved-field-row-actions">
              <button className="field-icon-button" type="button" aria-label={`${t("renameField")} ${field.name}`} onClick={() => { setEditingId(field.id); setEditName(field.name); setFormError(null); }}><Pencil size={14} /></button>
              {deleteId === field.id ? <span className="saved-field-confirm" role="group" aria-label={`${t("confirmFieldDelete")} ${field.name}`}><span>{t("confirmDelete")}?</span><button type="button" onClick={() => { onDelete(field.id); setDeleteId(null); }}>{language === "es" ? "Sí" : "Yes"}</button><button type="button" onClick={() => setDeleteId(null)}>{language === "es" ? "No" : "Cancel"}</button></span> : <button className="field-icon-button danger" type="button" aria-label={`${t("deleteField")} ${field.name}`} onClick={() => setDeleteId(field.id)}><Trash2 size={14} /></button>}
            </div>
          </>}
          {formError && editingId === field.id && <p className="saved-fields-warning" role="alert">{t(formError)}</p>}
        </li>)}
      </ul>}
      {duplicateGroups.map((group) => <div className="same-cell-note" role="note" key={group[0].gridCellId}>
        <p>{t("duplicateCell")}</p>
        <small>{group.map((field) => field.name).join(" · ")} · {dataset?.resolutionDegrees ?? "—"}°</small>
      </div>)}
      <p className="saved-fields-footnote">{t("pointNotBoundary")}</p>
    </section>
  );
}
