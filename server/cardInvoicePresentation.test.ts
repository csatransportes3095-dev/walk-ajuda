import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const detail = readFileSync(resolve(root, "client/src/pages/CartaoDetailPage.tsx"), "utf8");
const history = readFileSync(resolve(root, "client/src/pages/CartaoHistoricoPage.tsx"), "utf8");
const router = readFileSync(resolve(root, "server/routers/cartoes.ts"), "utf8");
const billing = readFileSync(resolve(root, "server/cardsBilling.ts"), "utf8");

describe("Visor e pagamento de faturas", () => {
  it("explica total, baixas e saldo da competência atual", () => {
    expect(detail).toContain("Fatura de {faturaAtualCompetencia}");
    expect(detail).toContain('label: "Pagamentos"');
    expect(detail).toContain('label: "Saldo a pagar"');
    expect(detail).toContain("faturaAtualInvoice.closingDate");
    expect(detail).toContain("faturaAtualInvoice.dueDate");
  });

  it("encaminha do histórico para o pagamento da fatura exata", () => {
    expect(history).toContain("?pagar=${fatura.invoiceId}");
    expect(history).toContain("Registrar pagamento vencido");
    expect(detail).toContain("requestedPaymentInvoiceId");
    expect(detail).toContain("invoiceSolicitadaParaPagamento");
  });

  it("envia e persiste a data somente no novo pagamento", () => {
    expect(detail).toContain("dataPagamento: data");
    expect(router).toContain("dataPagamento: z.string().regex");
    expect(router).toContain("input.dataPagamento");
    expect(billing).toContain("dataPagamento?: string");
    expect(billing).toContain("dataPagamento)\n    VALUES");
  });
});
