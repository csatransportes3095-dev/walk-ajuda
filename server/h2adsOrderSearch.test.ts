import { describe, expect, it } from "vitest";
import { matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "../shared/h2adsOrderSearch";

const order = {
  id: 987,
  orderNumber: 1204,
  customerNumber: 451,
  customerName: "Francisco Daniel Sousa Rodrigues",
  phone: "11999998888",
  serviceName: "UBER APP",
  serviceOption: "NOME COMPLETO",
  latestStatus: "em_andamento",
};

describe("H2ADS order search", () => {
  it("remove prefixos * e # da busca numérica", () => {
    expect(normalizeH2AdsOrderSearch("*451")).toBe("451");
    expect(normalizeH2AdsOrderSearch("#451")).toBe("451");
  });

  it("encontra pelo número do cadastro com *", () => {
    expect(matchesH2AdsOrderSearch(order, "*451")).toBe(true);
  });

  it("encontra por nome, telefone, pedido e produto", () => {
    expect(matchesH2AdsOrderSearch(order, "Francisco Daniel")).toBe(true);
    expect(matchesH2AdsOrderSearch(order, "999998888")).toBe(true);
    expect(matchesH2AdsOrderSearch(order, "#1204")).toBe(true);
    expect(matchesH2AdsOrderSearch(order, "nome completo")).toBe(true);
  });

  it("não aceita resultado sem correspondência", () => {
    expect(matchesH2AdsOrderSearch(order, "777777")).toBe(false);
  });
});
