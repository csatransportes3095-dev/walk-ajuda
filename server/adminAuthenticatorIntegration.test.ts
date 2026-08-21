import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.resolve(root, "client/src/App.tsx"), "utf8");
const dashboard = fs.readFileSync(path.resolve(root, "client/src/pages/AdminCodes.tsx"), "utf8");
const startScript = fs.readFileSync(path.resolve(root, "scripts/render-start.sh"), "utf8");
const router = fs.readFileSync(path.resolve(root, "server/routers.ts"), "utf8");
const authenticatorRouter = fs.readFileSync(path.resolve(root, "server/routers/adminAuthenticator.ts"), "utf8");
const authenticatorPage = fs.readFileSync(path.resolve(root, "client/src/pages/AdminAuthenticator.tsx"), "utf8");
const ordersPage = fs.readFileSync(path.resolve(root, "client/src/pages/AdminOrders.tsx"), "utf8");
const orderCodeBlock = fs.readFileSync(path.resolve(root, "client/src/components/OrderLoginAuthenticatorCode.tsx"), "utf8");
const clientLoginRoute = fs.readFileSync(path.resolve(root, "server/routers.ts"), "utf8");

const FINAL_STATUSES = ["entregue", "pedido_entregue", "login_de_acesso", "cancelado"];

describe("integração do autenticador privado", () => {
  it("protege a rota dentro do guard administrativo", () => {
    expect(app).toContain('<Route path={"/admin/authenticator"}>');
    expect(app).toContain('<AdminGuard><AdminAuthenticator /></AdminGuard>');
  });

  it("inclui o atalho somente no painel administrativo", () => {
    expect(dashboard).toContain("href: '/admin/authenticator'");
    expect(dashboard).toContain("label: 'Autenticador'");
  });

  it("registra o roteador e executa as migrações do cofre e do vínculo no boot", () => {
    expect(router).toContain("adminAuthenticator: adminAuthenticatorRouter");
    expect(startScript).toContain("pnpm run db:migrate:admin-authenticator-vault");
    expect(startScript).toContain("pnpm run db:migrate:admin-authenticator-order-links");
  });

  it("só permite direcionar chave a pedido em aberto", () => {
    expect(authenticatorRouter).toContain("searchOpenOrders: adminProcedure");
    expect(authenticatorRouter).toContain("linkToOrder: adminProcedure");
    expect(authenticatorRouter).toContain("ensureOpenOrder(input.registrationId)");
    for (const status of FINAL_STATUSES) expect(authenticatorRouter).toContain(`"${status}"`);
  });

  it("mostra o direcionamento no cofre e gera o código dentro dos Dados de Login", () => {
    expect(authenticatorPage).toContain("Direcionar chave para página de login");
    expect(authenticatorPage).toContain("Direcionar para login");
    expect(ordersPage).toContain("<OrderLoginAuthenticatorCode registrationId={order.id} />");
    expect(orderCodeBlock).toContain("AUTENTICADOR PRIVADO DO ADM");
    expect(orderCodeBlock).toContain("refetchInterval: isPageVisible ? 5000 : false");
  });

  it("não insere o código privado na rota de login do cliente", () => {
    expect(orderCodeBlock).not.toContain("getForClient");
    expect(authenticatorRouter).toContain("adminAuthenticatorOrderLinks");
    const customerRoute = clientLoginRoute.slice(clientLoginRoute.indexOf("getForClient: publicProcedure"), clientLoginRoute.indexOf("getAuthenticatorQrForClient: publicProcedure"));
    expect(customerRoute).not.toContain("getCodeForOrder");
    expect(customerRoute).not.toContain("adminAuthenticatorOrderLinks");
  });
});
