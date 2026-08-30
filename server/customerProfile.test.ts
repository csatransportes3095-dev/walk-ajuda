import { describe, expect, it } from "vitest";
import {
  getMissingCustomerProfileFields,
  isCustomerProfileComplete,
} from "./customerProfile";

const completeCustomer = {
  name: "JOAO DA SILVA",
  phone: "11999999999",
  email: "joao@example.com",
  cpf: "52998224725",
  city: "SAO PAULO",
  uf: "SP",
  profilePhotoUrl: "https://example.com/foto.jpg",
};

describe("customerProfile", () => {
  it("considera perfil completo quando todos os dados obrigatorios sao validos", () => {
    expect(getMissingCustomerProfileFields(completeCustomer)).toEqual([]);
    expect(isCustomerProfileComplete(completeCustomer)).toBe(true);
  });

  it.each([
    ["name", ""],
    ["phone", ""],
    ["email", ""],
    ["cpf", ""],
    ["city", ""],
    ["uf", ""],
    ["profilePhotoUrl", ""],
  ] as const)("marca %s como pendente quando o ADM deixa o campo vazio", (field, value) => {
    const customer = { ...completeCustomer, [field]: value };
    expect(getMissingCustomerProfileFields(customer)).toContain(field);
    expect(isCustomerProfileComplete(customer)).toBe(false);
  });

  it("considera nome recuperado generico como pendente", () => {
    const customer = { ...completeCustomer, name: "CLIENTE RECUPERADO 8482" };
    expect(getMissingCustomerProfileFields(customer)).toContain("name");
  });

  it("considera CPF invalido como pendente", () => {
    const customer = { ...completeCustomer, cpf: "11111111111" };
    expect(getMissingCustomerProfileFields(customer)).toContain("cpf");
  });

  it("cobra cidade e UF na mesma regra usada por todos os modulos", () => {
    const customer = { ...completeCustomer, city: "", uf: "" };
    expect(getMissingCustomerProfileFields(customer)).toEqual(expect.arrayContaining(["city", "uf"]));
  });
});
