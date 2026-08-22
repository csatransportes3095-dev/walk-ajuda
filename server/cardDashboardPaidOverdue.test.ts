import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dashboard = readFileSync(resolve(root, "client/src/pages/CartaoDashboardPage.tsx"), "utf8");
const router = readFileSync(resolve(root, "server/routers/cartoes.ts"), "utf8");

describe("Alerta de fatura vencida no painel geral", () => {
  it("consulta somente pagamentos vinculados por fatura, sem escrever dados", () => {
    expect(router).toContain("SELECT invoiceId, ROUND(SUM(valorPago), 2) AS totalPago");
    expect(router).toContain("WHERE cartaoId = ${Number(c.id)} AND invoiceId IS NOT NULL");
    expect(router).toContain("pagamentosFaturas");
  });

  it("não mostra nem soma alerta vencido quando o pagamento integral já está registrado", () => {
    expect(dashboard).toContain("const faturaTemPagamentoIntegral");
    expect(dashboard).toContain(".filter((invoice) => !faturaTemPagamentoIntegral(c, invoice))");
    expect(dashboard).toContain("if (faturaTemPagamentoIntegral(c, invoice)) continue;");
    expect(dashboard).toContain("const atrasoQuitadoRegistrado");
  });
});
