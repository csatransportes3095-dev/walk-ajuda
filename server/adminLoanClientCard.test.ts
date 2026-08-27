import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const adminLoans = fs.readFileSync(path.join(root, "client/src/pages/AdminLoans.tsx"), "utf8");
const loansRouter = fs.readFileSync(path.join(root, "server/routers/loans.ts"), "utf8");

describe("cards de dados do cliente no ADM de empréstimos", () => {
  it("usa a fonte principal para quem indicou", () => {
    expect(loansRouter).toContain("c.referredBy as clientReferredBy");
    expect(loansRouter).toContain("c.referredByPhone as clientReferredByPhone");
  });

  it("renderiza cards separados para os dados solicitados", () => {
    expect(adminLoans).toContain("function ClientInfoCard");
    expect(adminLoans).toContain('label="Nome do cliente"');
    expect(adminLoans).toContain('H2 Score / nível');
    expect(adminLoans).toContain('label="Telefone"');
    expect(adminLoans).toContain('label="CPF"');
    expect(adminLoans).toContain('label="Chave PIX do cliente"');
    expect(adminLoans).toContain('label="Quem indicou"');
  });

  it("liga cópia ao telefone, CPF e chave PIX do cliente", () => {
    expect(adminLoans).toContain('copyField={`${loan.id}-phone`}');
    expect(adminLoans).toContain('copyField={`${loan.id}-cpf`}');
    expect(adminLoans).toContain('copyField={`${loan.id}-pix`}');
    expect(adminLoans).toContain("navigator.clipboard.writeText(value)");
    expect(adminLoans).toContain("Chave PIX do cliente");
  });
});
