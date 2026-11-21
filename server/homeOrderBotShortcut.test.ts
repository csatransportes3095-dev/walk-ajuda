import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cards = readFileSync("client/src/pages/HomeRouteCards.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const home = readFileSync("client/src/pages/Home.tsx", "utf8");

describe("Card principal individual do assistente de pedidos", () => {
  it("adiciona apenas um atalho para a rota existente do ColombiaBot", () => {
    expect(cards).toContain('label: "ASSISTENTE DE PEDIDOS"');
    expect(cards).toContain('href: "/bot"');
    expect(app).toContain('<Route path={"/bot"} component={Home} />');
    expect(home).toContain("setShowColombiaBot(true)");
  });
  it("respeita a configuracao do ADM e nao inicia o bot quando desativado", () => {
    expect(cards).toContain('settings.bot_assistant_enabled !== "0"');
    expect(cards).toContain("Boolean(settings &&");
    expect(cards).toContain("showOrderBotCard ? [...HOME_ROUTE_CARDS, HOME_ORDER_BOT_CARD] : HOME_ROUTE_CARDS");
    expect(cards).not.toContain("updateSettings");
  });
  it("preserva os cinco acessos principais e mantem a autenticacao de cliente", () => {
    for (const path of ["/login", "/acompanhar", "/gastos", "/emprestimo", "/indicacoes"]) {
      expect(cards).toContain('href:"' + path + '"');
    }
    expect(app).toContain("<UnifiedCustomerGate>");
  });
});
