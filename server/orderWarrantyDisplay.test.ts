import { describe, expect, it } from "vitest";
import fs from "node:fs";

const router = fs.readFileSync("server/routers.ts", "utf8");
const admin = fs.readFileSync("client/src/pages/AdminOrders.tsx", "utf8");

describe("garantia no card do pedido", () => {
  it("resolve garantia fixa e tier no backend", () => {
    expect(router).toContain("const resolveOrderWarranty = (order: any)");
    expect(router).toContain("fixedWarranty");
    expect(router).toContain("uniqueTierIds.length !== 1");
    expect(router).toContain("warrantyDisplay: resolveOrderWarranty(o)");
  });

  it("preserva garantia explicita ja salva no serviceOption", () => {
    expect(router).toContain("Garantia: ${explicit[1].trim()}");
  });

  it("card usa warrantyDisplay quando serviceOption nao contem Garantia", () => {
    expect(admin).toContain("warrantyDisplay?: string | null");
    expect(admin).toContain("garantiaMatch ? garantiaMatch[2] : (order.warrantyDisplay || null)");
  });
});
