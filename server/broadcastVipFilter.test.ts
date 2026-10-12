import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const admin = fs.readFileSync(path.resolve(root, "client/src/pages/AdminBroadcast.tsx"), "utf8");
const routers = fs.readFileSync(path.resolve(root, "server/routers.ts"), "utf8");

describe("filtro Clientes VIP no Envio em Massa", () => {
  it("expõe VIP ativo na lista comum de clientes", () => {
    expect(routers).toContain("getVipMembershipSnapshotMap");
    expect(routers).toContain("isVip: Boolean(vipMembershipMap.get(Number(c.id))?.active)");
  });

  it("adiciona Clientes VIP no WhatsApp", () => {
    expect(admin).toContain("Clientes VIP");
    expect(admin).toContain("waTargetType === 'vip'");
    expect(admin).toContain("customers.filter(c => (c as any).isVip)");
  });

  it("adiciona Clientes VIP no E-mail", () => {
    expect(admin).toContain("targetType === 'vip'");
    expect(admin).toContain("cliente(s) VIP ativo(s) selecionado(s)");
    expect(admin).toContain("apenas os que possuem e-mail cadastrado");
  });

  it("converte o filtro VIP em destinatários selecionados no backend existente", () => {
    expect(admin).toContain("targetType === 'vip' ? customers.filter(c => (c as any).isVip).map(c => c.phone)");
  });
});
