import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path, "utf8");
describe("H2 Ads order link wiring", () => {
  it("mantém a persistência isolada em tabela h2ads própria", () => {
    const migration = read("drizzle/0143_h2ads_order_links.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `h2ads_order_links`");
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|ALTER)\b/i);
  });
  it("não cria caminho para alterar status do pedido pelo H2ADS", () => {
    const router = read("server/h2adsOrderLinkRouter.ts");
    expect(router).not.toContain("updateLastOrderStatus");
    expect(router).not.toContain("addOrderStatus");
  });
  it("sincroniza visualmente status e produto sem mexer no fluxo da instância", () => {
    const component = read("client/src/components/H2AdsOrderLinkControl.tsx");
    const page = read("client/src/pages/H2Ads.tsx");
    expect(component).toContain("refetchInterval: 15_000");
    expect(component).toContain("Status do pedido");
    expect(component).toContain("Produto");
    expect(component).toContain("Opção");
    expect(component).toContain("Buscar pedido, cliente, telefone ou produto");
    expect(page).toContain("<H2AdsOrderLinkControl instanceId={instance.id} />");
  });
  it("remove o vínculo ao excluir a instância", () => {
    const service = read("server/h2ads.ts");
    expect(service).toContain("DELETE FROM h2ads_order_links WHERE instanceId = ${id}");
  });
});
