import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider, LanguageSelector, useI18n } from "./i18n";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => { if (root) act(() => root?.unmount()); root = undefined; document.body.innerHTML = ""; localStorage.clear(); document.documentElement.lang = ""; });

function renderI18n() {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  function TestContent() { const { language, t } = useI18n(); return <><LanguageSelector /><output>{language}|{t("generateForecast")}|{t("observatory")}</output></>; }
  act(() => root?.render(<I18nProvider><TestContent /></I18nProvider>));
  return host;
}

describe("application localization", () => {
  it("defaults to English on a first visit", () => {
    const host = renderI18n();
    expect(host.textContent).toContain("en|Generate forecast|Observatory");
    expect(document.documentElement.lang).toBe("en");
  });
  it("switches to Spanish immediately and persists the choice", () => {
    const host = renderI18n();
    act(() => host.querySelector<HTMLButtonElement>("button[aria-label='Spanish']")?.click());
    expect(host.textContent).toContain("es|Generar pronóstico|Observatorio");
    expect(localStorage.getItem("alpha-agro.language.v1")).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });
  it("restores Spanish from local storage on the next mount", () => {
    localStorage.setItem("alpha-agro.language.v1", "es");
    const host = renderI18n();
    expect(host.textContent).toContain("es|Generar pronóstico|Observatorio");
  });
});
