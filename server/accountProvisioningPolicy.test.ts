import { describe, expect, it } from "vitest";
import { isOpenForAccountProvisioning, parseAccountProvisioningSearch } from "./accountProvisioningPolicy";

describe("criação rápida de conta por pedido", () => {
  it("aceita telefone, CPF, código de cadastro e número de pedido", () => {
    expect(parseAccountProvisioningSearch("11999999999")).toEqual({ kind: "phone_or_cpf", value: "11999999999" });
    expect(parseAccountProvisioningSearch("123.456.789-09")).toEqual({ kind: "phone_or_cpf", value: "12345678909" });
    expect(parseAccountProvisioningSearch("*397")).toEqual({ kind: "customer", value: "397" });
    expect(parseAccountProvisioningSearch("#4540000")).toEqual({ kind: "order", value: "4540000" });
  });

  it("rejeita pesquisas que não identificam um pedido ou cliente", () => {
    expect(() => parseAccountProvisioningSearch("*abc")).toThrow("Código de cadastro inválido");
    expect(() => parseAccountProvisioningSearch("#abc")).toThrow("Número do pedido inválido");
    expect(() => parseAccountProvisioningSearch("joao")).toThrow("Use telefone, CPF");
  });

  it("permite somente pedido não finalizado", () => {
    expect(isOpenForAccountProvisioning("foto_em_anal")).toBe(true);
    expect(isOpenForAccountProvisioning("conta_ativa")).toBe(true);
    expect(isOpenForAccountProvisioning("entregue")).toBe(false);
    expect(isOpenForAccountProvisioning("pedido_entregue")).toBe(false);
    expect(isOpenForAccountProvisioning("login_de_acesso")).toBe(false);
    expect(isOpenForAccountProvisioning("cancelado")).toBe(false);
  });
});
