import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildOrderH2EmailAddress } from "./h2OrderEmailGenerator";

const root = process.cwd();
const orders = fs.readFileSync(path.resolve(root, "client/src/pages/AdminOrders.tsx"), "utf8");
const generator = fs.readFileSync(path.resolve(root, "client/src/components/AdminEmailGenerator.tsx"), "utf8");
const runtime = fs.readFileSync(path.resolve(root, "client/src/main.tsx"), "utf8");
const quickEnhancer = fs.readFileSync(path.resolve(root, "client/src/components/AdminOrderLoginQuickEnhancer.tsx"), "utf8");
const legacyPatch = fs.readFileSync(path.resolve(root, "scripts/patch-order-email-generator-link-20260915.mjs"), "utf8");

describe("gerador H2 vinculado ao codigo principal do cliente", () => {
  it("monta o endereco com customerNumber no ultimo segmento antes do dominio", () => {
    expect(buildOrderH2EmailAddress("h2walk", "uyowa", 599, "h2colombiano.com"))
      .toBe("h2walk.uyowa.599@h2colombiano.com");
  });

  it("o botao Gerar H2 do pedido usa a mutation autoritativa do backend", () => {
    expect(orders).toContain("trpc.loginData.generateOrderH2Email.useMutation()");
    expect(orders).toContain("generateOrderH2EmailMut.mutateAsync({ registrationId: order.id })");
    expect(orders).toContain("generateOrderH2EmailMut.mutateAsync({ registrationId: ar.registrationId })");
    expect(orders).not.toContain("window.open(buildH2EmailGeneratorUrl(order)");
    expect(orders).not.toContain("window.open(buildH2EmailGeneratorUrl(ar)");
  });

  it("nao monta mais o sufixo H2 com numero aleatorio no campo Login 2", () => {
    expect(runtime).not.toContain("AdminOrderH2EmailQuickFix");
    expect(quickEnhancer).not.toContain('else if (text.includes("LOGIN 2") && text.includes("EMAIL")) injectEmailButton(label)');
  });

  it("o patch legado nao usa order.id como fallback de customerNumber", () => {
    expect(legacyPatch).not.toContain("customerNumber: String(order.customerNumber || order.id)");
    expect(legacyPatch).toContain("/admin/gerador-emails?");
  });

  it("o gerador principal continua aleatorio quando aberto manualmente", () => {
    expect(generator).toContain("const suffix = orderParams.fromOrder ? resolvedCustomerNumber! : randomNumber();");
  });
});
