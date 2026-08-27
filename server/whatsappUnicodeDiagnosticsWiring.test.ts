import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("instrumentação Unicode de WhatsApp", () => {
  it("mantém a consulta de diagnóstico do pré-molde restrita ao administrador e somente leitura", () => {
    const router = fs.readFileSync(path.join(projectRoot, "server/routers/whatsappTemplates.ts"), "utf8");

    expect(router).toContain("unicodeDiagnostics: adminProcedure.query");
    expect(router).toContain("statusKey IN ('pedido_entregue', 'entregue')");
    expect(router).toContain("@@character_set_client");
    expect(router).toContain("information_schema.TABLES");
    expect(router).toContain("information_schema.COLUMNS");
    expect(router).not.toMatch(/unicodeDiagnostics:[\s\S]{0,2800}(?:INSERT|UPDATE|DELETE|ALTER)\s/i);
  });

  it("abre o teste UTF-8 pelo mesmo formato de URL WhatsApp sem envio automático", () => {
    const settings = fs.readFileSync(path.join(projectRoot, "client/src/pages/AdminWhatsappTemplates.tsx"), "utf8");

    expect(settings).toContain('const isolatedUnicodeMessage = "TESTE UTF-8 🔐 ⚠️ 🎥 📱 ✅ ❌ ℹ️"');
    expect(settings).toContain("const isolatedUrlSnapshot = snapshotWhatsappUrl(unicodeTestPhone, isolatedUnicodeMessage)");
    expect(settings).toContain("window.open(isolatedUrlSnapshot.url");
    expect(settings).not.toContain("createWhatsappMessageUrl(digits, isolatedUnicodeMessage)");
    expect(settings).not.toContain("fetch(\"https://wa.me");
  });

  it("expõe o payload real e a URL do modal de pedidos apenas para diagnóstico", () => {
    const orders = fs.readFileSync(path.join(projectRoot, "client/src/pages/AdminOrders.tsx"), "utf8");

    expect(orders).toContain("Diagnóstico temporário — payload real antes de abrir wa.me");
    expect(orders).toContain("payload: snapshotUnicodeText(waModalMsg)");
    expect(orders).toContain("decodedUrlPayload: snapshotUnicodeText");
    expect(orders).toContain('href={`https://wa.me/${waModalOrder.waPhone}?text=${encodeURIComponent(waModalMsg)}`}');
    expect(orders).not.toContain("fetch(\"https://wa.me");
  });
});
