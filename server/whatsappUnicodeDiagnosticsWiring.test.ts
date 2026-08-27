import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("instrumentação Unicode de WhatsApp", () => {
  it("mantém a consulta de diagnóstico restrita ao administrador e somente leitura", () => {
    const router = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf8");

    expect(router).toContain("getWhatsappUnicodeDiagnostics: adminProcedure.query");
    expect(router).toContain("@@character_set_client");
    expect(router).toContain("information_schema.TABLES");
    expect(router).toContain("information_schema.COLUMNS");
    expect(router).not.toMatch(/getWhatsappUnicodeDiagnostics:[\s\S]{0,2600}(?:INSERT|UPDATE|DELETE|ALTER)\s/i);
  });

  it("abre o teste UTF-8 pelo mesmo formato de URL WhatsApp sem envio automático", () => {
    const settings = fs.readFileSync(path.join(projectRoot, "client/src/pages/AdminSettings.tsx"), "utf8");

    expect(settings).toContain('const isolatedUnicodeMessage = "TESTE UTF-8 🔐 ⚠️ 🎥 📱 ✅ ❌ ℹ️"');
    expect(settings).toContain("createWhatsappMessageUrl(digits, isolatedUnicodeMessage)");
    expect(settings).toContain("window.open(createWhatsappMessageUrl");
    expect(settings).not.toContain("fetch(\"https://wa.me");
  });
});
