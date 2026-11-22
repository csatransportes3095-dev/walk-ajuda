import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_DELIVERED_ORDER_WHATSAPP_TEMPLATE, renderDeliveredOrderWhatsappMessage } from "../shared/deliveredOrderWhatsapp";

const editor = readFileSync("client/src/components/OrderDeliveredGuide.tsx", "utf8");
const router = readFileSync("server/routers/deliveredOrderGuide.ts", "utf8");

describe("Mensagem editável WhatsApp - pedido entregue", () => {
  it("preserva separação de parágrafos e personaliza nome e link", () => {
    const link = "https://h2colombiano.com/pedido-entregue/abc123";
    const output = renderDeliveredOrderWhatsappMessage(DEFAULT_DELIVERED_ORDER_WHATSAPP_TEMPLATE, "Maria", link);
    expect(output).toContain("Olá, *Maria*!");
    expect(output).toContain(link);
    expect(output).toContain("\n\n");
    expect(output).not.toContain("{nome}");
    expect(output).not.toContain("{link}");
  });
  it("usa saudação genérica quando o nome não foi informado", () => {
    expect(renderDeliveredOrderWhatsappMessage("{nome}\n{link}", null, "URL")).toBe("cliente\nURL");
  });
  it("salva template privado com marcadores obrigatórios", () => {
    expect(router).toContain("getWhatsappMessage: adminProcedure");
    expect(router).toContain("saveWhatsappMessage: adminProcedure");
    expect(router).toContain('value.includes("{nome}")');
    expect(router).toContain('value.includes("{link}")');
    expect(router).toContain("WHATSAPP_MESSAGE_SETTING_KEY");
  });
  it("permite edição global sem afetar as orientações e impede envio de alterações não salvas", () => {
    expect(editor).toContain("MENSAGEM DO WHATSAPP — PEDIDO ENTREGUE");
    expect(editor).toContain("SALVAR MENSAGEM DO WHATSAPP");
    expect(editor).toContain("renderDeliveredOrderWhatsappMessage(waMessage, customerName, link)");
    expect(editor).toContain("waMessageDirty || waMessageQuery.isLoading");
    expect(editor).toContain("whitespace-pre-wrap");
  });
});
