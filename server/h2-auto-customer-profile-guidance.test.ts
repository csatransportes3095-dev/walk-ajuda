import { describe, expect, it } from "vitest";
import {
  h2AutoCustomerNeedsProfileUpdate,
  selectH2AutoCustomerByPhone,
  H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE,
  H2_AUTO_CUSTOMER_PROFILE_UPDATE_MESSAGE,
} from "./h2-auto-customer-profile-guidance";

const complete = {
  name: "Cliente Teste", email: "cliente@example.com", cpf: "52998224725",
  cep: "06454000", street: "Rua Teste", addressNumber: "10",
  neighborhood: "Centro", city: "Barueri", uf: "SP",
  profilePhotoUrl: "https://example.com/foto.jpg",
};

describe("H2 AUTO: cadastro completo x atualização do perfil", () => {
  it("does not require address complement, including empty or missing legacy field", () => {
    expect(h2AutoCustomerNeedsProfileUpdate(complete)).toBe(false);
    expect(h2AutoCustomerNeedsProfileUpdate({ ...complete, addressComplement: "" })).toBe(false);
    expect(h2AutoCustomerNeedsProfileUpdate({ ...complete, addressComplement: null })).toBe(false);
  });

  it("only marks missing required site fields as needing an update", () => {
    for (const field of ["profilePhotoUrl", "cep", "email", "cpf"] as const) {
      expect(h2AutoCustomerNeedsProfileUpdate({ ...complete, [field]: "" })).toBe(true);
    }
  });

  it("reserves /login guidance strictly for actually incomplete records", () => {
    expect(H2_AUTO_CUSTOMER_PROFILE_UPDATE_MESSAGE).toContain("https://h2colombiano.com/login");
    expect(H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE).not.toContain("https://h2colombiano.com/login");
    expect(H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE).not.toMatch(/completar|atualizar|cadastro incompleto/i);
    expect(H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE).not.toMatch(/cadastro encontrado|cliente localizado/i);
  });

  it("accepts exact phone, optional 55 DDI and legacy ninth-digit variation", () => {
    const customers = [{ id: 42, phone: "11982396550" }];
    expect(selectH2AutoCustomerByPhone(customers, "11982396550")?.id).toBe(42);
    expect(selectH2AutoCustomerByPhone(customers, "+55 (11) 98239-6550")?.id).toBe(42);
    expect(selectH2AutoCustomerByPhone([{ id: 42, phone: "1182396550" }], "11982396550")?.id).toBe(42);
    expect(selectH2AutoCustomerByPhone([{ id: 42, phone: "11982396550" }], "1182396550")?.id).toBe(42);
  });

  it("rejects invalid, unrecognized and ambiguous phone matches", () => {
    expect(selectH2AutoCustomerByPhone([{ id: 1, phone: "21982396550" }], "11982396550")).toBeNull();
    expect(selectH2AutoCustomerByPhone([{ id: 1, phone: "11982396550" }], "123")).toBeNull();
    expect(selectH2AutoCustomerByPhone([
      { id: 1, phone: "11982396550" }, { id: 2, phone: "1182396550" },
    ], "11982396550")).toBeNull();
  });
});
