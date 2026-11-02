import { describe, it, expect } from "vitest";
import { classifyTransport, formatTransportCnpj, isValidTransportCnpj, normalizeTransportCnpj, normalizeTransportUf } from "../shared/transportes";

describe("transportes: normalização sem duplicar", () => {
  it("normaliza pontuação para a mesma chave única", () => {
    expect(normalizeTransportCnpj("04.252.011/0001-10")).toBe("04252011000110");
    expect(normalizeTransportCnpj("04252011000110")).toBe("04252011000110");
  });
  it("valida dígitos verificadores sem fingir consulta à Receita", () => {
    expect(isValidTransportCnpj("04.252.011/0001-10")).toBe(true);
    expect(isValidTransportCnpj("04.252.011/0001-11")).toBe(false);
    expect(isValidTransportCnpj("11.111.111/1111-11")).toBe(false);
    expect(isValidTransportCnpj("123")).toBe(false);
  });
  it("formata sem perder zero inicial", () => {
    expect(formatTransportCnpj("04252011000110")).toBe("04.252.011/0001-10");
  });
  it("mantém SP de entrada e não inventa UF desconhecida", () => {
    expect(normalizeTransportUf("sp")).toBe("SP");
    expect(normalizeTransportUf("inexistente")).toBe("ND");
  });
  it("reconhece ônibus, cargas e transportes escolares", () => {
    expect(classifyTransport("Viação ônibus")).toBe("onibus");
    expect(classifyTransport("Transportadora de cargas")).toBe("carga");
    expect(classifyTransport("Transporte escolar")).toBe("escolar");
  });
});