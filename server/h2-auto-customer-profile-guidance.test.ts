import { describe, expect, it } from "vitest";
import {
  h2AutoCustomerNeedsProfileUpdate,
  H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE,
} from "./h2-auto-customer-profile-guidance";

const complete = {
  name: "Cliente Teste", email: "cliente@example.com", cpf: "52998224725",
  cep: "06454000", street: "Rua Teste", addressNumber: "10",
  neighborhood: "Centro", city: "Barueri", uf: "SP",
  profilePhotoUrl: "https://example.com/foto.jpg",
};

describe("H2 AUTO: atualização de cadastro pelo login", () => {
  it("uses the existing site profile requirements, not a new arbitrary rule", () => {
    expect(h2AutoCustomerNeedsProfileUpdate(complete)).toBe(false);
    expect(h2AutoCustomerNeedsProfileUpdate({...complete,profilePhotoUrl:""})).toBe(true);
    expect(h2AutoCustomerNeedsProfileUpdate({...complete,cep:""})).toBe(true);
    expect(h2AutoCustomerNeedsProfileUpdate({...complete,email:""})).toBe(true);
    expect(h2AutoCustomerNeedsProfileUpdate({...complete,cpf:""})).toBe(true);
  });
  it("provides /login and explicit instructions without displaying customer details", () => {
    expect(H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE).toContain("https://h2colombiano.com/login");
    expect(H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE).toContain("atualizar");
    expect(H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE).toContain("retorne ao WhatsApp");
    expect(H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE).not.toContain(complete.email);
  });
  it("keeps a generic public message so callers cannot enumerate registered phones", () => {
    expect(H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE).not.toMatch(/seu cadastro foi encontrado|identificamos seu cadastro/i);
  });
});
