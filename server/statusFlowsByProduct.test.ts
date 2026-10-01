import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = fs.readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
const db = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
const routers = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
const orders = fs.readFileSync(path.join(root, "client/src/pages/AdminOrders.tsx"), "utf8");
const tracking = fs.readFileSync(path.join(root, "client/src/pages/OrderTracking.tsx"), "utf8");
const app = fs.readFileSync(path.join(root, "client/src/App.tsx"), "utf8");

describe("sequências de status por produto", () => {
  it("mantém o catálogo global e adiciona tabelas independentes de sequência", () => {
    expect(schema).toContain('mysqlTable("orderStatusTypes"');
    expect(schema).toContain('mysqlTable("orderStatusFlows"');
    expect(schema).toContain('mysqlTable("orderStatusFlowItems"');
    expect(schema).toContain('mysqlTable("productStatusFlows"');
    expect(schema).toContain('mysqlTable("orderStatusFlowAssignments"');
  });

  it("congela o fluxo no nascimento do pedido e valida no servidor", () => {
    expect(routers).toContain("assignOrderStatusFlow");
    expect(routers).toContain("createdOrderStatus.id");
    expect(routers).toContain("Este status não pertence à sequência configurada para este pedido.");
    expect(db).toContain("resolveOrderStatusFlowForProduct");
  });

  it("preserva o fluxo padrão para pedidos e produtos sem configuração", () => {
    expect(db).toContain("getDefaultOrderStatusFlowId");
    expect(db).toContain("Padrão H2");
  });

  it("filtra os botões do ADM e a timeline do cliente pela sequência do pedido", () => {
    expect(orders).toContain("statusFlowOrderMapQuery");
    expect(orders).toContain("getStatusOrderForOrder(order)");
    expect(tracking).toContain("statusFlowForOrderQuery");
    expect(tracking).toContain("statusFlowForOrderQuery.data?.statusKeys");
  });

  it("expõe a tela administrativa de sequências", () => {
    expect(app).toContain('path={"/admin/status-flows"}');
    expect(fs.existsSync(path.join(root, "client/src/pages/AdminStatusFlows.tsx"))).toBe(true);
  });
});
