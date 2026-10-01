import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("status flows by product", () => {
  it("keeps global statuses and adds independent flow tables", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain('mysqlTable("orderStatusTypes"');
    expect(schema).toContain('mysqlTable("orderStatusFlows"');
    expect(schema).toContain('mysqlTable("orderStatusFlowItems"');
    expect(schema).toContain('mysqlTable("productStatusFlows"');
    expect(schema).toContain('mysqlTable("orderStatusFlowAssignments"');
  });

  it("freezes public orders and validates transitions in the backend", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("assignOrderStatusFlow");
    expect(routers).toContain("persistedOrder.orderStatusId");
    expect(routers).toContain("Este status não pertence à sequência configurada para este pedido.");
  });

  it("filters the admin choices and customer progress by product flow", () => {
    const orders = read("client/src/pages/AdminOrders.tsx");
    const tracking = read("client/src/pages/OrderTracking.tsx");
    expect(orders).toContain("statusFlowOrderMapQuery");
    expect(orders).toContain("getStatusOrderForOrder(order)");
    expect(tracking).toContain("statusFlowForOrderQuery");
    expect(tracking).toContain("productFlowKeys");
  });

  it("exposes the status sequence manager", () => {
    const app = read("client/src/App.tsx");
    expect(app).toContain('path={"/admin/status-flows"}');
    expect(fs.existsSync(path.join(root, "client/src/pages/AdminStatusFlows.tsx"))).toBe(true);
  });
});
