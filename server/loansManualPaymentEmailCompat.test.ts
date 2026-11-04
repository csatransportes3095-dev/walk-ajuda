import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loans = readFileSync(resolve(process.cwd(), "server/routers/loans.ts"), "utf8");
const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const loanClients = schema.slice(schema.indexOf('export const loanClients = mysqlTable("loanClients"'), schema.indexOf('export type LoanClient ='));

describe("H2 Loans - client email in payment confirmation", () => {
  it("does not query nonexistent loanClients.email in either confirmation flow", () => {
    expect(loanClients).not.toContain('email:');
    expect(loans).not.toContain("lc.email AS clientEmail");
    const compatibleSelects = loans.match(/lc\.phone AS clientPhone, NULL AS clientEmail/g) || [];
    expect(compatibleSelects).toHaveLength(2);
  });

  it("preserves the canonical customer email fallback and both notification paths", () => {
    expect(loans).toContain("async function resolveLoanClientEmail");
    expect(loans).toContain("SELECT email FROM customers");
    expect(loans).toContain("resolveLoanClientEmail(db, paymentRow.clientEmail, paymentRow.clientPhone)");
    expect(loans).toContain("resolveLoanClientEmail(db, inst.clientEmail, inst.clientPhone)");
  });

  it("does not change manual payment values or paid date logic", () => {
    const start = loans.indexOf("confirmInstallmentPaymentWithProof: ");
    const end = loans.indexOf("getProofsByLoan:", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const flow = loans.slice(start, end);
    expect(flow).toContain("amountPaid: z.number().positive()");
    expect(flow).toContain("paidAt: z.string()");
    expect(flow).toContain("UPDATE loanInstallments SET status='pago', paidAt=");
    expect(flow).toContain("INSERT INTO installmentProofs");
    expect(flow).toContain("resolveLoanClientEmail(db, inst.clientEmail, inst.clientPhone)");
  });
});
