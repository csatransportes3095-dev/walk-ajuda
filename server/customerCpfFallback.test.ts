import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { customerPasswordRouter } from "./routers/customerPassword";
import { getMissingCustomerProfileFields } from "./customerProfileRequirements";

describe("Remoção do login alternativo por CPF", () => {
  it("não expõe a rota pública antiga de autenticação por CPF", () => {
    expect(Object.keys(customerPasswordRouter._def.procedures)).not.toContain("verifyCustomerCpf");
    const api = readFileSync("server/customerOtpAccess.ts", "utf8");
    expect(api).not.toContain("verifyCustomerCpfBirthDate");
    expect(api).not.toContain("verifyCustomerCpf(");
  });
  it("mantém telefone e código, sem formulário alternativo", () => {
    const component = readFileSync("client/src/components/CustomerOtpLogin.tsx", "utf8");
    expect(component).toContain("verifyCustomerCode.useMutation()");
    expect(component).not.toContain("verifyCustomerCpf");
    expect(component).not.toContain("h2-otp-cpf-login");
    expect(component).not.toContain("h2-cpf-birth-login");
  });
  it("não exige nascimento para completar cadastro", () => {
    const profile = { name: "Cliente de Teste", email: "customer@example.test", cpf: "90000000175", cep: "01000000", street: "Rua de Teste", addressNumber: "1", neighborhood: "Centro", city: "São Paulo", uf: "SP", profilePhotoUrl: "https://example.test/photo.png" };
    expect(getMissingCustomerProfileFields(profile)).not.toContain("birthDate");
    for (const path of ["client/src/components/OnlineRegistrationPanel.tsx", "client/src/components/PasswordGate.tsx", "client/src/pages/AtualizarCadastro.tsx", "client/src/pages/AdminCustomers.tsx", "client/src/pages/GastosLoginPage.tsx", "server/db.ts", "server/routers.ts", "server/routers/customerUpdate.ts", "server/routers/customerPassword.ts"]) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(/birthDate|BirthDate|Data de nascimento/);
    }
  });
});
