import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const router = fs.readFileSync(path.join(root, "server/routers/loans.ts"), "utf8");
const publicUi = fs.readFileSync(path.join(root, "client/src/pages/LoansTab.tsx"), "utf8");
const adminUi = fs.readFileSync(path.join(root, "client/src/pages/AdminLoans.tsx"), "utf8");

describe("daily late fee production integration", () => {
  it("restricts automatic and manual daily rules to daily loans", () => {
    expect(router).toContain("String(row.loanPaymentType || '') === 'diario'");
    expect(router).toContain("String(installment.loanPaymentType || '') !== 'diario'");
    expect(router).toContain("AND l.paymentType = 'diario'");
  });

  it("never lowers a stored, manual, or automatic valid fee", () => {
    expect(router).toContain("Math.max(storedFee, input.feeAmount, automaticFee)");
    expect(router).toContain("Math.max(storedFee, automaticFee)");
    expect(router).toContain("Math.max(nextStoredFee, nextAutomaticFee)");
  });

  it("uses minute-exact Sao Paulo bands and daily-only public panel", () => {
    expect(router).toContain('minute: Number(valueOf("minute"))');
    expect(publicUi).toContain("Das 18:01 até 20:00:");
    expect(publicUi).toContain("Das 20:01 até 23:58:");
    expect(publicUi).toContain("Às 23:59 e depois:");
    expect(publicUi).toContain('paymentType={loan.paymentType}');
  });

  it("keeps ADM manual fee available without time gate and correct final preset", () => {
    expect(adminUi).toContain('data-testid="manual-late-fee-button"');
    expect(adminUi).toContain("Math.max(feeTotal18_20");
    expect(adminUi).not.toContain("A taxa de atraso fica disponível após 18h.");
  });
});
