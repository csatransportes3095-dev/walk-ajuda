import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repairWhatsappReplacementIcons } from "../shared/whatsappMessageText";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("ícones de mensagens WhatsApp", () => {
  it("recupera apenas os marcadores operacionais conhecidos que chegaram como U+FFFD", () => {
    const legacyText = [
      "\uFFFD SEUS DADOS DE ACESSO ESTÃO PRONTOS!",
      "\uFFFD IMPORTANTE",
      "\uFFFD VÍDEO — COMO ENTRAR NA SUA CONTA",
      "\uFFFD Não tente acessar diretamente pelo aplicativo.",
    ].join("\n");

    expect(repairWhatsappReplacementIcons(legacyText)).toBe([
      "🔐 SEUS DADOS DE ACESSO ESTÃO PRONTOS!",
      "⚠️ IMPORTANTE",
      "🎥 VÍDEO — COMO ENTRAR NA SUA CONTA",
      "⚠️ Não tente acessar diretamente pelo aplicativo.",
    ].join("\n"));
  });

  it("não inventa ícones para conteúdo desconhecido", () => {
    expect(repairWhatsappReplacementIcons("\uFFFD Texto personalizado")).toBe("\uFFFD Texto personalizado");
  });

  it("aplica o reparo antes de abrir os três caminhos de template no painel", () => {
    const source = fs.readFileSync(path.join(projectRoot, "client/src/pages/AdminOrders.tsx"), "utf8");

    expect(source).toContain("repairWhatsappReplacementIcons(normalizeWhatsAppTrackingLinks(waOrderTemplate");
    expect(source).toContain("repairWhatsappReplacementIcons(normalizeWhatsAppTrackingLinks(waLoginTemplate");
    expect(source.match(/setWaModalMsg\(repairWhatsappReplacementIcons\(/g)).toHaveLength(2);
  });
});
