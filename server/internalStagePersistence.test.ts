import { describe, expect, it } from "vitest";
import fs from "node:fs";

const schema = fs.readFileSync("drizzle/schema.ts", "utf8");
const db = fs.readFileSync("server/db.ts", "utf8");
const routers = fs.readFileSync("server/routers.ts", "utf8");
const admin = fs.readFileSync("client/src/pages/AdminOrders.tsx", "utf8");

describe("persistencia das etapas internas", () => {
  it("persiste por registrationId + subOrderIndex", () => {
    expect(schema).toContain('subOrderIndex: int("subOrderIndex").notNull().default(0)');
    expect(db).toContain("setOrderStageForOrder(registrationId: number, subOrderIndex: number, stageId: number)");
    expect(db).toContain("ORDER BY osh.id DESC");
  });

  it("mantem endpoints antigos e adiciona endpoints por subpedido", () => {
    expect(routers).toContain("setOrderStageForOrder: adminProcedure");
    expect(routers).toContain("getOrderStagesBatchByOrder: adminProcedure");
    expect(routers).toContain("getOrderStagesBatch: adminProcedure");
  });

  it("card usa a chave completa e confirma pelo servidor", () => {
    expect(admin).toContain("const stageOrderKey = getOrderKey(order)");
    expect(admin).toContain("pendingStageByOrder[stageOrderKey] ?? batchEntry?.stageId ?? null");
    expect(admin).toContain("setOrderStageForOrder.useMutation");
    expect(admin).toContain("subOrderIndex: order.subOrderIndex ?? 0");
    expect(admin).toContain("placeholderData: previousData => previousData");
  });
});
