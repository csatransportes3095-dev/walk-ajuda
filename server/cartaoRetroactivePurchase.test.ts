import { describe, expect, it } from "vitest";
import { historicalPaidInvoice, historicalPaymentDate } from "./cartaoRetroactiveRules";

describe("compra retroativa no cartao", () => {
  const invoices = [
    { competencia: "2026-08", status: "PAGA", paidAt: "2026-09-02 10:30:00", dueDate: "2026-09-02" },
    { competencia: "2026-09", status: "VENCIDA", paidAt: null, dueDate: "2026-10-02" },
    { competencia: "2026-10", status: "ABERTA", paidAt: null, dueDate: "2026-11-02" },
    { competencia: "2026-11", status: "ABERTA", paidAt: null, dueDate: "2026-12-02" },
  ];

  it("marca como paga apenas parcela de fatura passada que ja estava paga", () => {
    expect(historicalPaidInvoice(invoices, "2026-10", "2026-08")?.competencia).toBe("2026-08");
    expect(historicalPaidInvoice(invoices, "2026-10", "2026-09")).toBeNull();
  });

  it("nao marca fatura atual nem futura como paga automaticamente", () => {
    expect(historicalPaidInvoice(invoices, "2026-10", "2026-10")).toBeNull();
    expect(historicalPaidInvoice(invoices, "2026-10", "2026-11")).toBeNull();
  });

  it("preserva uma data de pagamento historica disponivel", () => {
    expect(historicalPaymentDate(invoices[0], "2026-08-02")).toBe("2026-09-02 10:30:00");
  });

  it("tem fallback deterministico para historico sem paidAt", () => {
    expect(historicalPaymentDate({ dueDate: "2026-09-02" }, "2026-08-02")).toBe("2026-09-02 12:00:00");
    expect(historicalPaymentDate({}, "2026-08-02")).toBe("2026-08-02 12:00:00");
  });
});
