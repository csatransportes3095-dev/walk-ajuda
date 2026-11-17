import { describe, expect, it } from "vitest";
import { summarizeLoanDashboard, type LoanDashboardLedgerRow } from "./dashboardAccounting";

function row(overrides: Partial<LoanDashboardLedgerRow> = {}): LoanDashboardLedgerRow {
  return {
    loanId: 1,
    loanStatus: "aprovado",
    loanPrincipal: "1000.00",
    loanTotal: "1300.00",
    pixSentAt: "2026-11-17T12:00:00Z",
    installmentId: 1,
    installmentAmount: "650.00",
    installmentStatus: "pendente",
    installmentFee: null,
    installmentOriginalAmount: null,
    ...overrides,
  };
}

describe("ADM loan dashboard receivables", () => {
  it("reconciles principal plus 30% contracted interest", () => {
    const result = summarizeLoanDashboard([row(), row({ installmentId: 2 })]);
    expect([result.valorEmAberto, result.capitalAReceber, result.lucroAReceber, result.taxasAReceber]).toEqual([1300, 1000, 300, 0]);
  });

  it("removes paid installments without changing the rate", () => {
    const result = summarizeLoanDashboard([row({ installmentStatus: "pago" }), row({ installmentId: 2 })]);
    expect([result.valorEmAberto, result.capitalAReceber, result.lucroAReceber]).toEqual([650, 500, 150]);
  });

  it("does not count the historical installment after interest-only rollover", () => {
    const result = summarizeLoanDashboard([
      row({ installmentStatus: "pago_juros" }),
      row({ installmentId: 2 }),
      row({ installmentId: 3 }),
    ]);
    expect([result.valorEmAberto, result.capitalAReceber, result.lucroAReceber]).toEqual([1300, 1000, 300]);
  });

  it("shows late fees separately and infers historical fees if needed", () => {
    const result = summarizeLoanDashboard([row({ installmentAmount: "680.00", installmentOriginalAmount: "650.00" })]);
    expect([result.valorEmAberto, result.capitalAReceber, result.lucroAReceber, result.taxasAReceber]).toEqual([680, 500, 150, 30]);
  });

  it("does not include undisbursed approved loans without payments", () => {
    const result = summarizeLoanDashboard([row({ pixSentAt: null })]);
    expect([result.valorEmAberto, result.semPixConfirmado, result.semPixValorPendente]).toEqual([0, 1, 650]);
  });

  it("recognizes an older disbursed loan when a payment exists", () => {
    const result = summarizeLoanDashboard([row({ pixSentAt: null, installmentStatus: "pago" }), row({ pixSentAt: null, installmentId: 2 })]);
    expect([result.valorEmAberto, result.semPixConfirmado]).toEqual([650, 0]);
  });

  it("does not include pending or canceled loans", () => {
    const result = summarizeLoanDashboard([row({ loanStatus: "pendente" }), row({ loanId: 2, installmentId: 2, loanStatus: "cancelado" })]);
    expect(result.valorEmAberto).toBe(0);
  });

  it("includes unapproved proof installments until payment is confirmed", () => {
    expect(summarizeLoanDashboard([row({ installmentStatus: "em_analise" })]).valorEmAberto).toBe(650);
  });

  it("uses actual contractual rates for mixed loans", () => {
    const result = summarizeLoanDashboard([
      row({ installmentAmount: "1300.00" }),
      row({ loanId: 2, installmentId: 2, loanPrincipal: "500.00", loanTotal: "600.00", installmentAmount: "600.00" }),
    ]);
    expect([result.valorEmAberto, result.capitalAReceber, result.lucroAReceber]).toEqual([1900, 1500, 400]);
  });

  it("flags a paid-off contract that still has open installments", () => {
    const result = summarizeLoanDashboard([row({ loanStatus: "pago" })]);
    expect([result.valorEmAberto, result.inconsistencias]).toEqual([0, 1]);
  });

  it("preserves exact cents on uneven schedules", () => {
    const result = summarizeLoanDashboard([
      row({ installmentAmount: "433.33" }),
      row({ installmentId: 2, installmentAmount: "433.33" }),
      row({ installmentId: 3, installmentAmount: "433.34" }),
    ]);
    expect(result.valorEmAberto).toBe(1300);
    expect(result.capitalAReceber + result.lucroAReceber + result.taxasAReceber).toBe(1300);
  });
});
