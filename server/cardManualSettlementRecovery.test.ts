import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const router = readFileSync(resolve(root, "server/routers/cartoes.ts"), "utf8");
const detail = readFileSync(resolve(root, "client/src/pages/CartaoDetailPage.tsx"), "utf8");
const history = readFileSync(resolve(root, "client/src/pages/CartaoHistoricoPage.tsx"), "utf8");

describe("Recuperação de baixa manual de cartão", () => {
  it("restaura somente um gasto manual sem cancelar pagamentos reais", () => {
    expect(router).toContain("restaurarBaixaManual: ccProtected");
    expect(router).toContain("Não cancela nenhum cc_pagamentos");
    expect(router).toContain("UPDATE cc_gastos SET paga = 0");
    expect(router).toContain("await refreshInvoice(Number(gasto[0].invoiceId))");
  });

  it("oferece a restauração apenas quando a fatura requer revisão", () => {
    expect(history).toContain("g.paga === 1 && fatura.requiresReview");
    expect(history).toContain("Restaurar como pendente");
    expect(history).toContain("Nenhum pagamento real será cancelado");
  });

  it("refaz a leitura do cartão após pagamento para remover o aviso quitado", () => {
    expect(detail).toContain("refetch: refetchCartao");
    expect(detail).toContain("await refetchCartao()");
    expect(detail).toContain("utils.cartoes.cartoes.get.invalidate({ id })");
  });

  it("separa pagamentos registrados de baixas antigas sem recalcular o saldo", () => {
    expect(detail).toContain("faturaAtualPagamentosRegistrados");
    expect(detail).toContain("faturaAtualBaixasAntigas");
    expect(detail).toContain("baixas antigas sem pagamento registrado");
    expect(detail).toContain("nenhum saldo será alterado automaticamente");
  });

  it("não oferece pagamento duplicado quando o valor já foi registrado para a mesma fatura", () => {
    expect(detail).toContain("faturaEmAtrasoComPagamentoRegistrado");
    expect(detail).toContain("não registre ou pague novamente");
  });
});
