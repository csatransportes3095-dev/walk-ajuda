import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const router = fs.readFileSync(path.join(root, "server/routers/loans.ts"), "utf8");
const publicUi = fs.readFileSync(path.join(root, "client/src/pages/LoansTab.tsx"), "utf8");
const adminUi = fs.readFileSync(path.join(root, "client/src/pages/AdminLoans.tsx"), "utf8");

describe("daily late fee integration", () => {
  it("restricts automatic and manual late fees to daily loans", () => {
    expect(router).toContain("String(row.loanPaymentType || '') === 'diario'");
    expect(router).toContain("String(installment.loanPaymentType || '') !== 'diario'");
    expect(router).toContain("AND l.paymentType = 'diario'");
    expect(router).toContain("Taxa diária disponível somente em empréstimos com pagamento diário.");
  });
  it("never lowers a valid stored, manual or automatic fee", () => {
    expect(router).toContain("Math.max(storedFee, input.feeAmount, automaticFee)");
    expect(router).toContain("Math.max(storedFee, automaticFee)");
    expect(router).toContain("Math.max(nextStoredFee, nextAutomaticFee)");
  });
  it("uses minute-exact Sao Paulo bands and public daily-only panel", () => {
    expect(router).toContain('minute: Number(valueOf("minute"))');
    expect(publicUi).toContain("Das 18:01 até 20:00:");
    expect(publicUi).toContain("Das 20:01 até 23:58:");
    expect(publicUi).toContain("Às 23:59 e depois:");
    expect(publicUi).toContain('paymentType={loan.paymentType}');
  });
  it("keeps ADM manual button available on daily installments and correct midnight preset", () => {
    expect(adminUi).toContain('loan.paymentType === "diario" ? (');
    expect(adminUi).toContain("Math.max(feeTotal18_20");
  });
  it("uses the same central maximum fee formula in the ADM loan detail", () => {
    expect(router).toContain("const isDailyLoan = String(rows[0].paymentType || '') === 'diario';");
    expect(router).toContain("const effectiveFee = isDailyLoan ? Math.max(storedFee, automaticFee) : 0;");
    expect(router).toContain("lc.late_fee_disabled as clientLateFeeDisabled");
  });
});
