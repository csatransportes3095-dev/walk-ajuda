import { describe, expect, it } from "vitest";
import { getMissingCustomerProfileFields } from "./customerProfileRequirements";

const complete = {
  name: "JOAO DA SILVA", email: "joao@example.com", cpf: "52998224725",
  cep: "06454000", street: "RUA A", addressNumber: "10", neighborhood: "CENTRO",
  city: "BARUERI", uf: "SP", profilePhotoUrl: "https://example.com/foto.jpg", phone: "11999999999",
};

describe("customerProfileRequirements", () => {
  it("não transforma telefone em campo de atualização", () => {
    const fields = getMissingCustomerProfileFields({ ...complete, phone: "" });
    expect(fields).not.toContain("phone");
    expect(fields).toEqual([]);
  });

  it("usa uma única lista de dados realmente obrigatórios", () => {
    const fields = getMissingCustomerProfileFields({ ...complete, profilePhotoUrl: "", addressNumber: "" });
    expect(fields).toEqual(expect.arrayContaining(["profilePhotoUrl", "addressNumber"]));
  });
});
