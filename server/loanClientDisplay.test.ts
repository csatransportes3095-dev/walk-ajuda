import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const customerAccess = fs.readFileSync(path.join(root, "server/customerAccess.ts"), "utf8");
const loansRouter = fs.readFileSync(path.join(root, "server/routers/loans.ts"), "utf8");
const loansTab = fs.readFileSync(path.join(root, "client/src/pages/LoansTab.tsx"), "utf8");

describe("exibição de indicador e PIX na tela pública de empréstimos", () => {
  it("busca o indicador no cadastro principal sem mutação", () => {
    expect(customerAccess).toContain("referredBy, referredByPhone");
    expect(loansRouter).toContain("findMainCustomerByIdentity({ phone: session.phone, cpf: session.cpf }, db)");
    expect(loansRouter).toContain("referredBy: mainCustomer?.referredBy");
    expect(loansRouter).toContain("referredByPhone: mainCustomer?.referredByPhone");
    expect(loansRouter).not.toContain("UPDATE customers SET referredBy");
  });

  it("renderiza o card de quem indicou", () => {
    expect(loansTab).toContain("Quem indicou você");
    expect(loansTab).toContain("client.referredBy");
    expect(loansTab).toContain("client.referredByPhone");
  });

  it("mantém cópia separada para PIX de recebimento e PIX de pagamento", () => {
    expect(loansTab).toContain('copyPixKey(client.client_pix_key, "recebimento")');
    expect(loansTab).toContain('copyPixKey(pixConfig.pixKey, "pagamento")');
    expect(loansTab).toContain("Copiar chave PIX");
    expect(loansTab).toContain("Chave copiada");
  });
});
