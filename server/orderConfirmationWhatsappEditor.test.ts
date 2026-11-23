import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_ORDER_CONFIRMATION_WHATSAPP_TEMPLATE, renderOrderConfirmationWhatsappMessage } from "../shared/orderConfirmationWhatsapp";

const editor = readFileSync("client/src/components/OrderConfirmationGuide.tsx", "utf8");
const router = readFileSync("server/routers/orderConfirmation.ts", "utf8");
const deliveredRouter = readFileSync("server/routers/deliveredOrderGuide.ts", "utf8");

describe("Mensagem WhatsApp editável — CONFIRMAÇÃO DO PEDIDO", () => {
  it("preserva Enter, linhas em branco e marcadores de nome/link", () => {
    const input = "⚡ H2\n\nOlá {nome}!\nAcesse:\n{link}\n\n✅";
    const url = "https://h2colombiano.com/confirmacao-orientacoes/abc123";
    const rendered = renderOrderConfirmationWhatsappMessage(input, "  Maria  da   Silva ", url);
    expect(rendered).toBe("⚡ H2\n\nOlá Maria da Silva!\nAcesse:\n" + url + "\n\n✅");
    expect(rendered).not.toContain("{nome}");
    expect(rendered).not.toContain("{link}");
  });
  it("mantém o texto anterior como padrão até que ADM personalize", () => {
    expect(DEFAULT_ORDER_CONFIRMATION_WHATSAPP_TEMPLATE).toContain("{nome}");
    expect(DEFAULT_ORDER_CONFIRMATION_WHATSAPP_TEMPLATE).toContain("{link}");
    expect(renderOrderConfirmationWhatsappMessage("{nome}\n{link}", null, "URL")).toBe("cliente\nURL");
  });
  it("persiste em chave própria do módulo, sem usar a de Pedido Entregue", () => {
    expect(router).toContain('order_confirmation_whatsapp_message_v1');
    expect(router).toContain("getWhatsappMessage: adminProcedure");
    expect(router).toContain("saveWhatsappMessage: adminProcedure");
    expect(router).toContain('value.includes("{nome}")');
    expect(router).toContain('value.includes("{link}")');
    expect(deliveredRouter).toContain('delivered_order_guide_whatsapp_message_v1');
    expect(router).not.toContain('delivered_order_guide_whatsapp_message_v1');
  });
  it("editor exibe prévia e impede WhatsApp com mensagem sem salvar", () => {
    expect(editor).toContain("MENSAGEM DO WHATSAPP — CONFIRMAÇÃO DO PEDIDO");
    expect(editor).toContain("PRÉ-VISUALIZAÇÃO NO CELULAR");
    expect(editor).toContain("SALVAR MENSAGEM DO WHATSAPP");
    expect(editor).toContain("whitespace-pre-wrap");
    expect(editor).toContain("renderOrderConfirmationWhatsappMessage(waMessage, customerName, link)");
    expect(editor).toContain("waMessageDirty || waMessageQuery.isLoading");
    expect(editor).toContain("trpc.orderConfirmation.saveWhatsappMessage.useMutation");
    expect(editor).toContain("trpc.orderConfirmation.getWhatsappMessage.useQuery");
    expect(editor).toContain("saveGlobalGuide.useMutation");
    expect(editor).toContain("PUBLICAR ORIENTAÇÕES");
    expect(editor).toContain("GERAR LINK INDIVIDUAL DESTE PEDIDO");
  });
});
