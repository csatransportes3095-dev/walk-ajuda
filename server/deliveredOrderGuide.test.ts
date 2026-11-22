import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const admin = readFileSync("client/src/pages/AdminOrders.tsx", "utf8");
const editor = readFileSync("client/src/components/OrderDeliveredGuide.tsx", "utf8");
const page = readFileSync("client/src/pages/DeliveredOrderGuidePage.tsx", "utf8");
const router = readFileSync("server/routers/deliveredOrderGuide.ts", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const api = readFileSync("server/routers.ts", "utf8");

describe("Pedido Entregue: orientações visuais por pedido", () => {
  it("cadastra o texto e as imagens uma única vez, mas cria token separado por pedido", () => {
    expect(router).toContain("getGlobal: adminProcedure");
    expect(router).toContain("saveGlobal: adminProcedure");
    expect(router).toContain("publishGlobal: adminProcedure");
    expect(router).toContain("createLinkForOrder: adminProcedure");
    expect(router).toContain("getByOrder(input.registrationId, input.subOrderIndex)");
    expect(router).toContain("randomBytes(24)");
    expect(editor).toContain("GERAR LINK INDIVIDUAL DESTE PEDIDO");
    expect(editor).toContain("getForOrder.useQuery(orderKey");
    expect(editor).toContain('publicSiteUrl("/pedido-entregue/" + orderRecord.token)');
    expect(editor).not.toContain('publicSiteUrl("/pedido-entregue")');
  });
  it("abre apenas por token individual e usa o conteúdo global publicado", () => {
    expect(page).toContain('useRoute("/pedido-entregue/:token")');
    expect(page).toContain("getPublic.useQuery(");
    expect(page).not.toContain("getPublicGlobal");
    expect(router).toContain("const record = await getByToken(input.token)");
    expect(router).toContain("publicGlobalGuide(global)");
    expect(router).not.toContain("getPublicGlobal:");
  });
  it("não cria perguntas nem altera status do pedido", () => {
    expect(router).not.toContain("addOrderStatus");
    expect(page).not.toContain("saveAnswer");
  });

  it("insere terceiro botão ao lado das confirmações nas duas visões do ADM", () => {
    expect(admin.match(/<OrderDeliveredGuide/g)?.length).toBe(2);
    expect(admin).toContain('import OrderPhotoConfirmation');
    expect(admin).toContain('import OrderConfirmation');
  });
  it("tem editor de imagens/prints e textos, sem questionário nem alterar status", () => {
    expect(editor).toContain("ADICIONAR FOTO OU PRINT");
    expect(editor).toContain("ADICIONAR BLOCO");
    expect(editor).toContain("SALVAR ORIENTAÇÕES");
    expect(editor).toContain("/api/upload/admin-image");
    expect(router).not.toContain("addOrderStatus");
    expect(router).not.toContain("orderStatus");
    expect(page).not.toContain("saveAnswer");
  });
  it("mantém o guia em rascunho até publicar e limita acesso ao token publicado", () => {
    expect(router).toContain("status VARCHAR(16) NOT NULL DEFAULT 'draft'");
    expect(router).toContain("status='published' LIMIT 1");
    expect(router).toContain("getPublic: publicProcedure");
    expect(router).toContain("publish: adminProcedure");
    expect(router).toContain("unpublish: adminProcedure");
    expect(router).toContain("randomBytes(24)");
  });
  it("registra rota pública isolada e envio por WhatsApp", () => {
    expect(app).toContain('path={"/pedido-entregue/:token"}');
    expect(app).toContain("isDeliveredGuideRoute");
    expect(api).toContain("deliveredOrderGuide: deliveredOrderGuideRouter");
    expect(editor).toContain("buildWhatsappMessageUrl");
    expect(editor).toContain("COPIAR");
  });
});
