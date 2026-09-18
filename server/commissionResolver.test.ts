import { describe, expect, it } from "vitest";
import { normalizeCommissionText, resolveLegacyCommissionValue } from "./commissionResolver";

const candidates = [
  { id: 1, productId: 10, productName: "UBER TAXI", optionLabel: "PRIMEIRO NOME", commissionValue: 5000 },
  { id: 2, productId: 10, productName: "UBER TAXI", optionLabel: "NOME ALEATORIO", commissionValue: 5000 },
  { id: 3, productId: 20, productName: "99 APP PARA MOTORISTA", optionLabel: "PRIMEIRO NOME", commissionValue: 6000 },
];

describe("commissionResolver", () => {
  it("normaliza abreviacao N/ usada em opcoes antigas", () => {
    expect(normalizeCommissionText("UBER TAXI N/ ALEATÓRIO")).toBe("uber taxi nome aleatorio");
  });

  it("resolve PRIMEIRO NOME usando produto e opcao sem confundir produtos", () => {
    expect(resolveLegacyCommissionValue({
      serviceName: "UBER TAXI",
      serviceOption: "PRIMEIRO NOME",
      candidates,
    })).toMatchObject({ value: 5000, candidateId: 1, reason: "matched" });
  });

  it("resolve opcao legada com prefixo do produto e N/", () => {
    expect(resolveLegacyCommissionValue({
      serviceName: "UBER TAXI",
      serviceOption: "UBER TAXI N/ ALEATORIO",
      candidates,
    })).toMatchObject({ value: 5000, candidateId: 2, reason: "matched" });
  });

  it("nao inventa valor quando a mesma opcao e ambigua entre produtos", () => {
    expect(resolveLegacyCommissionValue({
      serviceName: null,
      serviceOption: "PRIMEIRO NOME",
      candidates,
    })).toMatchObject({ value: 0, candidateId: null, reason: "ambiguous" });
  });

  it("ignora candidatos sem comissao configurada", () => {
    expect(resolveLegacyCommissionValue({
      serviceName: "CRLV ORIGINAL",
      serviceOption: "DADOS ORIGINAIS",
      candidates: [{ id: 9, productId: 9, productName: "CRLV ORIGINAL", optionLabel: "DADOS ORIGINAIS", commissionValue: 0 }],
    })).toMatchObject({ value: 0, reason: "not_found" });
  });
});
