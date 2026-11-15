import { describe, expect, it } from "vitest";
import { addSavedField, createSavedField, deleteSavedField, readSavedFieldStore, renameSavedField, SAVED_FIELDS_KEY, sameGridCellGroups, selectSavedField, updateSavedFieldConfiguration, writeSavedFieldStore } from "./fields";
import { adaptTrendAnalysis } from "./loadTrend";
import { trendAnalysisFixture } from "./__fixtures__/trendAnalysis.fixture";

const dataset = adaptTrendAnalysis(trendAnalysisFixture);
function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(SAVED_FIELDS_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("saved field storage and actions", () => {
  it("creates, selects, renames, persists, and deletes a field without storing GPS accuracy", () => {
    const storage = memoryStorage();
    const field = createSavedField({ name: "Campo Marcos Paz", point: { latitude: -34, longitude: -60 }, dataset, description: "Lote norte", now: new Date("2026-11-15T12:00:00Z"), id: "field-one" });
    expect(field.gridCellId).toMatch(/^gldas-noah-v2\.1:/);
    expect(field).not.toHaveProperty("accuracyMeters");
    let store = addSavedField(readSavedFieldStore(storage), field);
    expect(store.activeFieldId).toBe(field.id);
    expect(writeSavedFieldStore(store, storage)).toBeNull();
    store = readSavedFieldStore(storage);
    expect(store.fields[0]).toMatchObject({ name: "Campo Marcos Paz", description: "Lote norte", gridCellId: field.gridCellId });
    store = renameSavedField(store, field.id, "Campo 1");
    store = selectSavedField(store, null);
    expect(store.fields[0].name).toBe("Campo 1");
    expect(store.activeFieldId).toBeNull();
    store = deleteSavedField(store, field.id);
    expect(store.fields).toHaveLength(0);
    expect(store.activeFieldId).toBeNull();
  });

  it("rejects invalid coordinates and names but can save a location without scientific coverage", () => {
    expect(() => createSavedField({ name: "Bad", point: { latitude: 91, longitude: 0 }, dataset })).toThrow();
    expect(() => createSavedField({ name: "   ", point: { latitude: -34, longitude: -60 }, dataset })).toThrow();
    expect(createSavedField({ name: "Outside coverage", point: { latitude: -35, longitude: -64 }, dataset }).gridCellId).toBeNull();
  });

  it("skips malformed or outdated local records without crashing", () => {
    const storage = memoryStorage("not json");
    const recovered = readSavedFieldStore(storage);
    expect(recovered.fields).toEqual([]);
    expect(recovered.warning).toContain("No se pudieron leer");
    const outdated = memoryStorage(JSON.stringify({ version: 99, fields: [], activeFieldId: null }));
    expect(readSavedFieldStore(outdated).warning).toContain("No se pudieron leer");
    const partiallyBroken = memoryStorage(JSON.stringify({ version: 1, activeFieldId: "bad", fields: [{ id: "bad" }] }));
    expect(readSavedFieldStore(partiallyBroken).fields).toEqual([]);
    expect(readSavedFieldStore(partiallyBroken).warning).toContain("se omitieron");
  });

  it("groups fields that resolve to one GLDAS grid cell", () => {
    const first = createSavedField({ name: "Campo A", point: { latitude: -34, longitude: -60 }, dataset, id: "a" });
    const second = createSavedField({ name: "Campo B", point: { latitude: -33.99, longitude: -59.99 }, dataset, id: "b" });
    expect(first.gridCellId).toBe(second.gridCellId);
    expect(sameGridCellGroups([first, second])).toHaveLength(1);
  });

  it("persists the farmer's crop context with a saved field and reads legacy fields safely", () => {
    const storage = memoryStorage();
    const field = createSavedField({ name: "Field A", point: { latitude: -34, longitude: -60 }, dataset, id: "field-a" });
    let store = addSavedField(readSavedFieldStore(storage), field);
    store = updateSavedFieldConfiguration(store, field.id, { crop: "wheat", growthStage: "vegetative", waterManagement: "irrigated" });
    expect(writeSavedFieldStore(store, storage)).toBeNull();
    expect(readSavedFieldStore(storage).fields[0].cropConfiguration).toEqual({ crop: "wheat", growthStage: "vegetative", waterManagement: "irrigated" });

    const legacy = memoryStorage(JSON.stringify({ version: 1, fields: [{ ...field, cropConfiguration: undefined }], activeFieldId: field.id }));
    expect(readSavedFieldStore(legacy).fields[0].cropConfiguration).toBeUndefined();
  });
});
