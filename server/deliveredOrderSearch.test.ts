import { describe, expect, it } from "vitest";
import { matchesDeliveredOrderSearch } from "../client/src/lib/deliveredOrderSearch";

const delivered = {
  customerNumber: 410,
  customerName: "João Pedro da Silva",
  codeClientName: "JOAO PEDRO",
  customerEmail: "joao.silva@exemplo.com",
  phone: "+55 (11) 98765-4321",
};

describe("ADM Entregues - busca por cadastro, nome, email ou telefone", () => {
  it("localiza por *410 e 410 com correspondencia exata de cadastro", () => {
    expect(matchesDeliveredOrderSearch(delivered, "*410")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "410")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "  *410 ")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "*41")).toBe(false);
    expect(matchesDeliveredOrderSearch(delivered, "*999")).toBe(false);
    expect(matchesDeliveredOrderSearch({ ...delivered, customerNumber: null }, "*410")).toBe(false);
  });

  it("busca por nome completo ou parcial, sem diferenciar maiusculas e acentos", () => {
    expect(matchesDeliveredOrderSearch(delivered, "joao")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "PEDRO DA SILVA")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "joão")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "nome inexistente")).toBe(false);
    expect(matchesDeliveredOrderSearch({ ...delivered, customerName: null }, "JOAO PEDRO")).toBe(true);
  });

  it("busca por email e partes do endereco", () => {
    expect(matchesDeliveredOrderSearch(delivered, "JOAO.SILVA@EXEMPLO.COM")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "exemplo.com")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "outro@site.com")).toBe(false);
  });

  it("busca telefone com DDD e com ou sem +55, espacos e tracos", () => {
    expect(matchesDeliveredOrderSearch(delivered, "11987654321")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "+55 11 98765-4321")).toBe(true);
    expect(matchesDeliveredOrderSearch({ ...delivered, phone: "(11) 98765-4321" }, "+55 11 98765-4321")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "987654")).toBe(true);
    expect(matchesDeliveredOrderSearch(delivered, "11999999999")).toBe(false);
  });

  it("mantem lista quando pesquisa vazia e evita confundir codigo curto com telefone", () => {
    expect(matchesDeliveredOrderSearch(delivered, " ")).toBe(true);
    expect(matchesDeliveredOrderSearch({ ...delivered, customerNumber: 999 }, "410")).toBe(false);
    expect(matchesDeliveredOrderSearch(delivered, "*")).toBe(false);
  });
});
