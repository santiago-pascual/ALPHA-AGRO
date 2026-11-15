import { describe, expect, it } from "vitest";
import { interpretAnomaly, interpretCellTrend, interpretForecastAnomaly, interpretLowMoistureProbability, interpretStorage } from "./interpretation";

describe("plain-language scientific interpretation", () => {
  it("explains positive and negative validated anomalies without assigning risk", () => {
    expect(interpretAnomaly(-12).spanish).toContain("menos agua almacenada");
    expect(interpretAnomaly(-12).english).toContain("less water stored");
    expect(interpretAnomaly(8).spanish).toContain("más agua almacenada");
    expect(interpretAnomaly(8).english).toContain("more water stored");
    expect(interpretAnomaly(0).spanish).toContain("referencia mensual");
    expect(interpretForecastAnomaly(-1).english).toContain("less water stored");
  });
  it("describes missing evidence neutrally and never invents an anomaly threshold", () => {
    expect(interpretAnomaly(null).spanish).toContain("No hay");
    expect(interpretCellTrend(null).english).toContain("no eligible historical trend");
    expect(interpretLowMoistureProbability(0.5, undefined)).toBeNull();
    expect(interpretLowMoistureProbability(1.2, "event")).toBeNull();
    expect(interpretLowMoistureProbability(0.5, "test-defined event")?.spanish).toContain("test-defined event");
  });
  it("does not imply wetter or drier conditions from absolute storage alone", () => {
    expect(interpretStorage().spanish).toContain("por sí sola no indica");
    expect(interpretCellTrend(-2).spanish).toContain("No describe la humedad actual");
  });
});
