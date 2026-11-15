import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SelectedLocation } from "../data/location";
import type { SavedField } from "../data/fields";
import { SavedFieldsPanel } from "./SavedFieldsPanel";
import { I18nProvider } from "../i18n";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => { if (root) act(() => root?.unmount()); root = undefined; document.body.innerHTML = ""; });

const point: SelectedLocation = { latitude: -34, longitude: -60, source: "manual", accuracyMeters: null };
const field: SavedField = { id: "field-1", name: "Campo A", latitude: -34, longitude: -60, gridCellId: "gldas-noah-v2.1:-34.0000:-60.0000", createdAt: "2026-11-15T12:00:00.000Z" };
function renderPanel(fields: SavedField[] = []) {
  const props = { dataset: null, selectedLocation: point, fields, activeFieldId: null, storageWarning: null, onSelect: vi.fn(), onAdd: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() };
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  act(() => root?.render(<I18nProvider><SavedFieldsPanel {...props} /></I18nProvider>));
  return { container, props };
}
function click(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}
function inputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => { setter?.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("SavedFieldsPanel", () => {
  it("creates a named field from the validated selected point", () => {
    const { container, props } = renderPanel();
    click(container, "Add field");
    inputValue(container.querySelector<HTMLInputElement>("input[placeholder^='e.g.']")!, "Marcos Paz field");
    inputValue(container.querySelector<HTMLInputElement>("input[placeholder^='Personal reference']")!, "North area");
    click(container, "Save field");
    expect(props.onAdd).toHaveBeenCalledWith("Marcos Paz field", "North area");
  });
  it("selects, renames, and confirms deletion of a saved field accessibly", () => {
    const { container, props } = renderPanel([field]);
    click(container, "Campo A");
    expect(props.onSelect).toHaveBeenCalledWith("field-1");
    const rename = container.querySelector<HTMLButtonElement>("button[aria-label*='Rename field Campo A']")!;
    act(() => rename.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    inputValue(container.querySelector<HTMLInputElement>(".saved-field-rename input")!, "Campo Mercedes");
    const saveRename = container.querySelector<HTMLButtonElement>(".saved-field-rename button[type='submit']")!;
    act(() => saveRename.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onRename).toHaveBeenCalledWith("field-1", "Campo Mercedes");
    const deleteButton = container.querySelector<HTMLButtonElement>("button[aria-label*='Delete field Campo A']")!;
    act(() => deleteButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    click(container, "Yes");
    expect(props.onDelete).toHaveBeenCalledWith("field-1");
  });
});
