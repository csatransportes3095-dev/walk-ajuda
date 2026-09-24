import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("sincronizacao da rota emprestimo com loanClients", () => {
  it("cria o espelho financeiro quando a rota emprestimo foi explicitamente liberada", () => {
    const access = read("server/customerAccess.ts");
    expect(access).toContain("explicitLoanPermission");
    expect(access).toContain("route='emprestimo' AND status='approved'");
    expect(access).toContain("INSERT INTO loanClients");
    expect(access).toContain("loanEnabled, allowedPaymentTypes");
  });

  it("reconcilia cadastros antigos ao iniciar/sincronizar sem depender do spreadsheetClient", () => {
    const loans = read("server/routers/loans.ts");
    const syncStart = loans.indexOf("syncFromGastos:");
    const syncEnd = loans.indexOf("autoApplyLateFees:", syncStart);
    const syncBlock = loans.slice(syncStart, syncEnd);
    expect(syncBlock).toContain("reconcileLegacyLoanPermissions(db)");
  });

  it("ativacao por telefone cria loanClient mesmo quando ele ainda nao existe", () => {
    const loans = read("server/routers/loans.ts");
    const start = loans.indexOf("toggleLoanByPhone:");
    const end = loans.indexOf("getFinancialAnalysis:", start);
    const block = loans.slice(start, end);
    expect(block).toContain("requireCompleteMainCustomerProfile(db, { phone })");
    expect(block).toContain("INSERT INTO loanClients");
    expect(block).not.toContain("spreadsheetClients WHERE id=");
  });

  it("controle de acesso nao exibe liberado sem vinculo financeiro", () => {
    const admin = read("client/src/pages/AdminLoans.tsx");
    expect(admin).toContain("const isEnabled = c.loanClientId !== null && !!c.loanEnabled;");
  });
});
