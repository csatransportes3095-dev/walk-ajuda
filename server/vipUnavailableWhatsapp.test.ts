import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const storefront = fs.readFileSync(path.resolve(root, "client/src/components/StorefrontProductCard.tsx"), "utf8");
const vipPage = fs.readFileSync(path.resolve(root, "client/src/pages/VipPage.tsx"), "utf8");

describe("VIP indisponível direciona para ADM no WhatsApp", () => {
  it("usa a configuração global vip_membership_enabled", () => {
    expect(storefront).toContain('vip_membership_enabled');
    expect(vipPage).toContain('vip_membership_enabled');
  });

  it("troca CTA da vitrine por WhatsApp quando contratação estiver indisponível", () => {
    expect(storefront).toContain("Falar com ADM no WhatsApp");
    expect(storefront).toContain("Tenho interesse em contratar o H2 VIP");
    expect(storefront).toContain("Gostaria de falar com um ADM para verificar a liberação.");
  });

  it("também oferece WhatsApp na própria página VIP indisponível", () => {
    expect(vipPage).toContain("VIP temporariamente indisponível");
    expect(vipPage).toContain("Falar com ADM no WhatsApp");
    expect(vipPage).toContain("unavailableWhatsappHref");
  });
});
