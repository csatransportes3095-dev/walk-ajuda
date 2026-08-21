import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.resolve(root, "client/src/App.tsx"), "utf8");
const dashboard = fs.readFileSync(path.resolve(root, "client/src/pages/AdminCodes.tsx"), "utf8");
const startScript = fs.readFileSync(path.resolve(root, "scripts/render-start.sh"), "utf8");
const router = fs.readFileSync(path.resolve(root, "server/routers.ts"), "utf8");
const page = fs.readFileSync(path.resolve(root, "client/src/pages/AdminAuthenticator.tsx"), "utf8");

describe("integração do autenticador privado", () => {
  it("protege a rota dentro do guard administrativo", () => {
    expect(app).toContain('<Route path={"/admin/authenticator"}>');
    expect(app).toContain('<AdminGuard><AdminAuthenticator /></AdminGuard>');
  });

  it("inclui o atalho somente no painel administrativo", () => {
    expect(dashboard).toContain("href: '/admin/authenticator'");
    expect(dashboard).toContain("label: 'Autenticador'");
  });

  it("registra o roteador e executa a migração no boot da produção", () => {
    expect(router).toContain("adminAuthenticator: adminAuthenticatorRouter");
    expect(startScript).toContain("pnpm run db:migrate:admin-authenticator-vault");
  });

  it("oculta códigos quando a tela sai de foco e depois de um minuto", () => {
    expect(page).toContain('if (document.hidden) setRevealedEntryId(null);');
    expect(page).toContain('setTimeout(() => setRevealedEntryId(null), 60_000)');
  });
});
