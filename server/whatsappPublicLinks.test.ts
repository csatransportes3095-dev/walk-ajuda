import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { normalizePublicSiteLinks, normalizeWhatsAppTrackingLinks, publicSiteUrl, publicTrackingShareUrl, PUBLIC_SITE_ORIGIN } from "@shared/publicLinks";

const adminOrders = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AdminOrders.tsx"), "utf8");
const adminMedia = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/AdminMedia.tsx"), "utf8");
const serverIndex = fs.readFileSync(path.resolve(process.cwd(), "server/_core/index.ts"), "utf8");

describe("links públicos para WhatsApp", () => {
  it("usa h2colombiano.com como origem canônica", () => {
    expect(PUBLIC_SITE_ORIGIN).toBe("https://h2colombiano.com");
    expect(publicSiteUrl("/acompanhar")).toBe("https://h2colombiano.com/acompanhar");
    expect(publicSiteUrl("foto/teste")).toBe("https://h2colombiano.com/foto/teste");
  });

  it("converte o domínio legado e troca acompanhamento pelo link com miniatura", () => {
    expect(normalizePublicSiteLinks("Acesse https://walkajuda.com/acompanhar")).toBe("Acesse https://h2colombiano.com/acompanhar");
    expect(normalizePublicSiteLinks("https://www.walkajuda.com/foto/abc")).toBe("https://h2colombiano.com/foto/abc");
    expect(publicTrackingShareUrl()).toBe("https://h2colombiano.com/link/acompanhamento");
    expect(normalizeWhatsAppTrackingLinks("Acesse https://walkajuda.com/acompanhar")).toBe("Acesse https://h2colombiano.com/link/acompanhamento");
    expect(normalizeWhatsAppTrackingLinks("https://h2colombiano.com/acompanhar?origem=antiga")).toBe("https://h2colombiano.com/link/acompanhamento");
  });

  it("aplica o link com miniatura no envio de status, login e mídia", () => {
    expect(adminOrders).toContain("normalizeWhatsAppTrackingLinks(waOrderTemplate");
    expect(adminOrders).toContain("normalizeWhatsAppTrackingLinks(waLoginTemplate");
    expect(adminOrders).toContain("publicTrackingShareUrl()");
    expect(adminMedia).toContain("publicSiteUrl(`/foto/${data.slug}`)");
    expect(adminMedia).not.toContain("https://walkajuda.com/foto/${data.slug}");
  });

  it("entrega a miniatura pública com requisitos necessários ao WhatsApp", () => {
    expect(serverIndex).toContain("app.get(\"/link/acompanhamento\"");
    expect(serverIndex).toContain("getPublicPreviewMeta(\"tracking\", canonicalUrl)");
    expect(serverIndex).toContain("window.location.replace('/acompanhar')");
    expect(serverIndex).toContain("app.get(\"/foto-img/:slug\"");
    expect(serverIndex).toContain("redirect: 'follow'");
    expect(serverIndex).toContain("Content-Length");
    expect(serverIndex).toContain("maxPreviewBytes = 5 * 1024 * 1024");
    expect(serverIndex).toContain("startsWith('image/')");
  });
});
