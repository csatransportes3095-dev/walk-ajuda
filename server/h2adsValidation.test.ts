import { describe, expect, it } from "vitest";
import { H2ADS_NAME_MIN_LENGTH, validateH2AdsName } from "../shared/h2adsValidation";

describe("validação de nome H2 Ads", () => {
  it("exige ao menos dois caracteres úteis no nome da instância", () => {
    expect(H2ADS_NAME_MIN_LENGTH).toBe(2);
    expect(validateH2AdsName(" 1 ", "instância")).toBe("Informe um nome de instância com pelo menos 2 caracteres.");
    expect(validateH2AdsName("  ", "instância")).toBe("Informe um nome de instância com pelo menos 2 caracteres.");
  });

  it("aceita nomes válidos após remover espaços externos", () => {
    expect(validateH2AdsName(" 01 ", "instância")).toBeNull();
    expect(validateH2AdsName("SP", "grupo")).toBeNull();
  });
});
