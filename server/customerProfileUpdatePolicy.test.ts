import { describe, expect, it } from "vitest";
import {
  evaluateCustomerProfileUpdateState,
  type CustomerProfileUpdatePolicy,
} from "./customerProfileUpdatePolicy";

const validCustomer = {
  id: 901001,
  name: "Cliente de Teste",
  phone: "11987654321",
  email: "cliente.teste@example.invalid",
  cpf: "529.982.247-25",
  city: "São Paulo",
  uf: "SP",
  profilePhotoUrl: "https://example.invalid/test-photo.jpg",
};

function policy(
  enabled: boolean,
  fields: CustomerProfileUpdatePolicy["fields"],
  revision = 1,
): CustomerProfileUpdatePolicy {
  return {
    version: 1,
    enabled,
    fields,
    revision,
    updatedAt: "2026-08-27T00:00:00.000Z",
    updatedBy: "admin-test",
  };
}

describe("customer profile update policy", () => {
  it("obriga foto ausente mesmo com a política desligada", () => {
    const state = evaluateCustomerProfileUpdateState(
      { ...validCustomer, profilePhotoUrl: "" },
      policy(false, []),
    );

    expect(state.effectiveFields).toEqual(["profilePhotoUrl"]);
    expect(state.missingFields).toEqual(["profilePhotoUrl"]);
    expect(state.pending).toBe(true);
  });

  it("não cria pendência individual quando a política está desligada e a foto existe", () => {
    const state = evaluateCustomerProfileUpdateState(validCustomer, policy(false, []), 0);

    expect(state.effectiveFields).toEqual([]);
    expect(state.missingFields).toEqual([]);
    expect(state.pending).toBe(false);
  });

  it("mantém nome e CPF selecionados como obrigação de uma nova revisão", () => {
    const selectedPolicy = policy(true, ["name", "cpf"], 4);
    const pending = evaluateCustomerProfileUpdateState(validCustomer, selectedPolicy, 3);
    const completed = evaluateCustomerProfileUpdateState(validCustomer, selectedPolicy, 4);

    expect(pending.effectiveFields).toEqual(["name", "cpf"]);
    expect(pending.missingFields).toEqual([]);
    expect(pending.pending).toBe(true);
    expect(completed.pending).toBe(false);
  });

  it("reativação posterior reabre a exigência mesmo após conclusão anterior", () => {
    const reactivated = evaluateCustomerProfileUpdateState(
      validCustomer,
      policy(true, ["email"], 8),
      7,
    );

    expect(reactivated.pending).toBe(true);
    expect(reactivated.missingFields).toEqual([]);
  });

  it("normaliza campos permitidos e ignora duplicados ou IDs desconhecidos", () => {
    const state = evaluateCustomerProfileUpdateState(
      validCustomer,
      policy(true, ["phone", "cpf", "phone", "unknown-field"] as CustomerProfileUpdatePolicy["fields"]),
      2,
    );

    expect(state.configuredFields).toEqual(["phone", "cpf"]);
    expect(state.effectiveFields).toEqual(["phone", "cpf"]);
  });

  it("identifica valores inválidos de CPF e nome provisório", () => {
    const state = evaluateCustomerProfileUpdateState(
      {
        ...validCustomer,
        name: "CLIENTE RECUPERADO 901001",
        cpf: "111.111.111-11",
      },
      policy(true, ["name", "cpf"], 2),
      1,
    );

    expect(state.missingFields).toEqual(["name", "cpf"]);
    expect(state.pending).toBe(true);
  });

  it("desativar a política remove a pendência de revisão sem apagar dados", () => {
    const state = evaluateCustomerProfileUpdateState(validCustomer, policy(false, [], 9), 1);

    expect(state.enabled).toBe(false);
    expect(state.effectiveFields).toEqual([]);
    expect(state.pending).toBe(false);
    expect(validCustomer).toMatchObject({ name: "Cliente de Teste", cpf: "529.982.247-25" });
  });
});
