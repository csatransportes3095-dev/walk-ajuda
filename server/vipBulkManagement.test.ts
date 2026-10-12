import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const router = fs.readFileSync(path.resolve(root, "server/routers/vipMemberships.ts"), "utf8");
const admin = fs.readFileSync(path.resolve(root, "client/src/pages/AdminVip.tsx"), "utf8");
const customers = fs.readFileSync(path.resolve(root, "client/src/pages/AdminCustomers.tsx"), "utf8");

describe("gestão VIP em massa", () => {
  it("oferece 7, 15, 30 dias e sem vencimento", () => {
    expect(admin).toContain("7 dias");
    expect(admin).toContain("15 dias");
    expect(admin).toContain("30 dias");
    expect(admin).toContain("Sem vencimento");
    expect(router).toContain("VIP_UNLIMITED_EXPIRES_AT_MS");
  });

  it("filtra por pedidos novos, todos com pedidos e sem pedidos", () => {
    expect(admin).toContain("Pedidos novos");
    expect(admin).toContain("Todos com pedidos");
    expect(admin).toContain("Sem pedidos");
    expect(router).toContain("hasOpenOrders");
    expect(router).toContain("hasOrders");
  });

  it("exige seleção explícita antes de ação em massa", () => {
    expect(admin).toContain("selectedIds");
    expect(admin).toContain("Selecionar filtrados");
    expect(admin).toContain('runBulk("activate")');
    expect(admin).toContain('runBulk("deactivate")');
  });

  it("não reduz validade maior já existente", () => {
    expect(router).toContain("Math.max(Number(existing.expiresAtMs || 0), Number(requestedExpiry))");
  });

  it("mostra VIP permanente sem zero dias", () => {
    expect(admin).toContain("SEM VENCIMENTO");
    expect(customers).toContain("SEM VENCIMENTO");
  });
});
