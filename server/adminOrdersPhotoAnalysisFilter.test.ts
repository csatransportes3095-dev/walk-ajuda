import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AdminOrders.tsx"), "utf8");

describe("filtro Foto em análise no painel de pedidos", () => {
  it("mantém um filtro visível e dedicado no bloco Status", () => {
    expect(source).toContain('setFilterStatus("foto_em_analise_filter")');
    expect(source).toContain('Foto em análise');
  });

  it("usa o bucket operacional para aceitar os aliases históricos do status", () => {
    expect(source).toContain('filterStatus === "foto_em_analise_filter" && getOperationalBucket(o) === "em_analise"');
  });
});
