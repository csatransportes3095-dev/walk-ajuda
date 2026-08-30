import { describe, expect, it } from "vitest";
import { canShowH2AdsOrderForLink, getExactH2AdsCustomerNumberSearch, matchesH2AdsOrderSearch, normalizeH2AdsOrderSearch } from "../shared/h2adsOrderSearch";

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

  it("interpreta *451 como cadastro exato 451", () => {
    expect(getExactH2AdsCustomerNumberSearch("*451")).toBe(451);
    expect(getExactH2AdsCustomerNumberSearch("451")).toBeNull();
    expect(getExactH2AdsCustomerNumberSearch("#451")).toBeNull();
  });

  it("encontra somente o cadastro exato quando usa *", () => {
    expect(matchesH2AdsOrderSearch(order, "*451")).toBe(true);
    expect(matchesH2AdsOrderSearch({ ...order, customerNumber: 1451 }, "*451")).toBe(false);
    expect(matchesH2AdsOrderSearch({ ...order, customerNumber: 999, orderNumber: 451 }, "*451")).toBe(false);
    expect(matchesH2AdsOrderSearch({ ...order, customerNumber: 999, phone: "11945100000" }, "*451")).toBe(false);
  });

  it("mantém busca normal por nome, telefone, pedido e produto", () => {
    expect(matchesH2AdsOrderSearch(order, "Francisco Daniel")).toBe(true);
    expect(matchesH2AdsOrderSearch(order, "999998888")).toBe(true);
    expect(matchesH2AdsOrderSearch(order, "#1204")).toBe(true);
    expect(matchesH2AdsOrderSearch(order, "nome completo")).toBe(true);
  });

  it("não aceita resultado sem correspondência", () => {
    expect(matchesH2AdsOrderSearch(order, "777777")).toBe(false);
  });
  it("libera pedido entregue apenas dentro de busca do H2ADS", () => {
    expect(canShowH2AdsOrderForLink("pedido_entregue", false, false)).toBe(false);
    expect(canShowH2AdsOrderForLink("pedido_entregue", false, true)).toBe(true);
    expect(canShowH2AdsOrderForLink("entregue", false, true)).toBe(true);
    expect(canShowH2AdsOrderForLink("login_de_acesso", false, true)).toBe(true);
    expect(canShowH2AdsOrderForLink("cancelado", false, true)).toBe(false);
    expect(canShowH2AdsOrderForLink("pedido_entregue", true, false)).toBe(true);
  });

});
