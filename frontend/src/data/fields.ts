import type { DashboardDataset, TrendCell } from "../types";
import { coordinateError, findEligibleCell, gridCellId, type CoordinatePoint } from "./location";

export const SAVED_FIELDS_KEY = "alpha-agro.saved-fields.v1";
const STORAGE_VERSION = 1;

export type SavedField = CoordinatePoint & {
  id: string;
  name: string;
  gridCellId: string | null;
  createdAt: string;
  description?: string;
};
export type SavedFieldStore = { fields: SavedField[]; activeFieldId: string | null; warning: string | null };
type StorageLike = Pick<Storage, "getItem" | "setItem">;

const emptyStore = (warning: string | null = null): SavedFieldStore => ({ fields: [], activeFieldId: null, warning });
const storageOrNull = (): StorageLike | null => {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
};

function parseField(value: unknown): SavedField | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim() || typeof row.name !== "string" || !row.name.trim() || row.name.length > 80) return null;
  const point = { latitude: row.latitude as number, longitude: row.longitude as number };
  if (coordinateError(point)) return null;
  if (row.gridCellId !== null && (typeof row.gridCellId !== "string" || !/^gldas-noah-v2\.1:-?\d+\.\d{4}:-?\d+\.\d{4}$/.test(row.gridCellId))) return null;
  if (typeof row.createdAt !== "string" || !Number.isFinite(Date.parse(row.createdAt))) return null;
  if (row.description !== undefined && (typeof row.description !== "string" || row.description.length > 400)) return null;
  return {
    id: row.id, name: row.name.trim(), latitude: point.latitude, longitude: point.longitude,
    gridCellId: row.gridCellId as string | null, createdAt: new Date(row.createdAt).toISOString(),
    ...(typeof row.description === "string" && row.description.trim() ? { description: row.description.trim() } : {}),
  };
}

export function readSavedFieldStore(storage: StorageLike | null = storageOrNull()): SavedFieldStore {
  if (!storage) return emptyStore("No se pudo acceder al almacenamiento local de este dispositivo. / Local device storage is unavailable.");
  try {
    const saved = storage.getItem(SAVED_FIELDS_KEY);
    if (saved === null) return emptyStore();
    const raw: unknown = JSON.parse(saved);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("format");
    const row = raw as Record<string, unknown>;
    if (row.version !== STORAGE_VERSION || !Array.isArray(row.fields)) throw new Error("version");
    const fields = row.fields.map(parseField).filter((field): field is SavedField => field !== null);
    const uniqueFields = fields.filter((field, index) => fields.findIndex((candidate) => candidate.id === field.id) === index);
    const activeFieldId = typeof row.activeFieldId === "string" && uniqueFields.some((field) => field.id === row.activeFieldId) ? row.activeFieldId : null;
    const warning = uniqueFields.length !== row.fields.length || (row.activeFieldId !== null && row.activeFieldId !== undefined && activeFieldId === null)
      ? "Algunos campos guardados estaban dañados o desactualizados y se omitieron. / Some saved fields were invalid or outdated and were skipped."
      : null;
    return { fields: uniqueFields, activeFieldId, warning };
  } catch {
    return emptyStore("No se pudieron leer los campos guardados. Podés quitarlos o crear una nueva lista. / Saved fields could not be read; you can remove them or create a new list.");
  }
}

export function writeSavedFieldStore(store: SavedFieldStore, storage: StorageLike | null = storageOrNull()): string | null {
  if (!storage) return "No se pudieron guardar los campos en este dispositivo. / Fields could not be saved on this device.";
  try {
    storage.setItem(SAVED_FIELDS_KEY, JSON.stringify({ version: STORAGE_VERSION, fields: store.fields, activeFieldId: store.activeFieldId }));
    return null;
  } catch {
    return "El navegador no pudo guardar los cambios. Revisá el espacio disponible. / The browser could not save changes; check available storage.";
  }
}

export function createSavedField(input: {
  name: string; point: CoordinatePoint; dataset: DashboardDataset | null; description?: string; now?: Date; id?: string;
}): SavedField {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new Error("Ingresá un nombre de hasta 80 caracteres. / Enter a name up to 80 characters.");
  const issue = coordinateError(input.point);
  if (issue) throw new Error(issue);
  if (input.description && input.description.length > 400) throw new Error("La descripción debe tener 400 caracteres o menos. / Description must be 400 characters or fewer.");
  const eligibleCell: TrendCell | null = input.dataset ? findEligibleCell(input.point, input.dataset.cells, input.dataset.resolutionDegrees) : null;
  if (input.dataset && !eligibleCell) throw new Error("Este punto no está dentro de una celda histórica elegible. / This point is outside the eligible historical grid.");
  const id = input.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `field-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  return {
    id, name, latitude: input.point.latitude, longitude: input.point.longitude,
    gridCellId: eligibleCell && input.dataset ? gridCellId(eligibleCell) : null,
    createdAt: (input.now ?? new Date()).toISOString(),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  };
}

export function addSavedField(store: SavedFieldStore, field: SavedField): SavedFieldStore {
  if (store.fields.some((item) => item.id === field.id)) throw new Error("El identificador del campo ya existe. / Field identifier already exists.");
  return { ...store, fields: [...store.fields, field], activeFieldId: field.id, warning: null };
}

export function renameSavedField(store: SavedFieldStore, id: string, name: string): SavedFieldStore {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 80) throw new Error("Ingresá un nombre de hasta 80 caracteres. / Enter a name up to 80 characters.");
  if (!store.fields.some((field) => field.id === id)) return store;
  return { ...store, fields: store.fields.map((field) => field.id === id ? { ...field, name: cleanName } : field), warning: null };
}

export function selectSavedField(store: SavedFieldStore, id: string | null): SavedFieldStore {
  if (id !== null && !store.fields.some((field) => field.id === id)) return store;
  return { ...store, activeFieldId: id, warning: null };
}

export function deleteSavedField(store: SavedFieldStore, id: string): SavedFieldStore {
  return { ...store, fields: store.fields.filter((field) => field.id !== id), activeFieldId: store.activeFieldId === id ? null : store.activeFieldId, warning: null };
}

export function sameGridCellGroups(fields: SavedField[]): SavedField[][] {
  const byCell = new Map<string, SavedField[]>();
  for (const field of fields) {
    if (!field.gridCellId) continue;
    byCell.set(field.gridCellId, [...(byCell.get(field.gridCellId) ?? []), field]);
  }
  return [...byCell.values()].filter((group) => group.length > 1);
}
