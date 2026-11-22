import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isSecurityPublicPath } from "./siteAccessPolicy";
import { resolveDeliveredGuideVideo } from "../client/src/lib/deliveredGuideVideo";

const editor = readFileSync("client/src/components/OrderConfirmationGuide.tsx", "utf8");
const customer = readFileSync("client/src/pages/OrderConfirmationGuidePage.tsx", "utf8");
const legacyEditor = readFileSync("client/src/components/OrderConfirmation.tsx", "utf8");
const legacyPage = readFileSync("client/src/pages/OrderConfirmationPage.tsx", "utf8");
const router = readFileSync("server/routers/orderConfirmation.ts", "utf8");
const delivered = readFileSync("server/routers/deliveredOrderGuide.ts", "utf8");
const admin = readFileSync("client/src/pages/AdminOrders.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const customerGate = readFileSync("client/src/components/UnifiedCustomerAccessGate.tsx", "utf8");
const sessionGate = readFileSync("client/src/components/SiteAccessSessionBoundary.tsx", "utf8");
const root = readFileSync("client/src/main.tsx", "utf8");
const guard = readFileSync("client/public/route-fallback-guard-v1.js", "utf8");
const html = readFileSync("client/index.html", "utf8");
const token = "a".repeat(48);

function redirects(pathname: string): string[] {
  const urls: string[] = [];
  vm.runInNewContext(guard, {
    window: {
      location: {
        pathname, search: "", hash: "", origin: "https://h2colombiano.com",
        replace: (url: string) => urls.push(url),
      },
    },
    URL,
  });
  return urls;
}

describe("CONFIRMAÇÃO DO PEDIDO - editor de orientações independente", () => {
  it("troca somente os dois botões do ADM", () => {
    expect(admin).toContain('import OrderConfirmationGuide from "@/components/OrderConfirmationGuide"');
    expect(admin).not.toContain("<OrderConfirmation\n");
    expect(admin).toContain("<OrderConfirmationGuide\n");
    expect(admin).toContain("<OrderDeliveredGuide");
    expect(editor).toContain("CONFIRMAÇÃO DO PEDIDO");
    expect(editor).toContain("FOTO / PRINT");
    expect(editor).toContain("VÍDEO POR URL");
    expect(editor).toContain("SALVAR ORIENTAÇÕES");
  });
  it("usa conteúdo independente e preserva questionários anteriores", () => {
    expect(router).toContain("order_confirmation_guide_global_v1");
    expect(delivered).toContain("delivered_order_guide_global_v1");
    expect(router).toContain("saveForOrder: adminProcedure");
    expect(router).toContain("getPublic: publicProcedure");
    expect(router).toContain("savePublic: publicProcedure");
    expect(router).toContain("completePublic: publicProcedure");
    expect(router).toContain("getPublicGuide: publicProcedure");
    expect(legacyEditor).toContain("DEFAULT_QUESTIONS");
    expect(legacyPage).toContain("FINALIZAR CONFIRMAÇÃO DO PEDIDO");
    expect(router).toContain("Não reescrever perguntas, respostas, token ou status antigos.");
  });
  it("reutiliza o token por pedido sem mudar status antigo", () => {
    expect(router).toContain("createGuideLinkForOrder: adminProcedure");
    expect(router).toContain("const current = await getByOrder(input.registrationId, input.subOrderIndex)");
    expect(router).toContain("WHERE id=<<dollar>>{current.id}".replace("<<dollar>>", "$"));
    expect(router).toContain('const token = randomBytes(24).toString("hex")');
    expect(editor).toContain('publicSiteUrl("/confirmacao-orientacoes/" + orderRecord.token)');
    expect(editor).toContain("trpc.orderConfirmation.createGuideLinkForOrder.useMutation()");
  });
  it("o novo link passa pelo filtro inicial", () => {
    expect(redirects("/confirmacao-orientacoes/" + token)).toEqual([]);
    expect(redirects("/confirmacao-orientacoes/" + "a".repeat(47))[0]).toContain("rota_invalida");
    expect(html).toContain("/route-fallback-guard-v1.js?v=20261122-confirmacao-orientacoes");
    expect(app).toContain('<Route path={"/confirmacao-orientacoes/:token"} component={OrderConfirmationGuidePage} />');
    expect(root).toContain("isConfirmationGuideLink");
    expect(sessionGate).toContain("confirmationGuideTokenRoute");
    expect(isSecurityPublicPath("/confirmacao-orientacoes/" + token)).toBe(true);
    expect(isSecurityPublicPath("/api/trpc/orderConfirmation.getPublicGuide")).toBe(true);
  });
  it("exige login central e autoriza apenas titular do pedido", () => {
    expect(customerGate).toContain("confirmacao-orientacoes");
    expect(customerGate).toContain("sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl())");
    expect(customerGate).toContain('window.location.replace("/login")');
    expect(customer).toContain('localStorage.getItem("cp_token")');
    expect(customer).toContain("trpc.orderConfirmation.getPublicGuide.useMutation()");
    expect(customer).toContain("guideRequest.mutate({ token, customerSessionToken })");
    expect(router).toContain("const session = await requireCustomerSession(input.customerSessionToken)");
    expect(router).toContain("sameDeliveredGuideCustomerPhone(session.phone, record.customerPhone)");
  });
  it("reproduz vídeo H2 e mantém fotos e links clicáveis", () => {
    expect(resolveDeliveredGuideVideo("https://h2colombiano.com/video/como-entrar-na-conta")?.kind).toBe("file");
    expect(editor).toContain('b.mediaType === "video" ? "" : b.imageUrl.trim()');
    expect(customer).toContain("<video src={video.url} controls playsInline");
    expect(customer).toContain("<iframe title=");
    expect(customer).toContain("splitDeliveredGuideLinks");
    expect(customer).toContain("block.imageUrl && <img");
    expect(router).toContain("isApprovedConfirmationImage");
    expect(router).toContain("resolveDeliveredGuideVideo");
  });
  it("não altera status de pedidos", () => {
    const section = router.slice(router.indexOf("getGlobalGuide: adminProcedure"),router.indexOf("getForOrder: adminProcedure"));
    expect(section).not.toContain("completedAt=NOW()");
    expect(section).not.toContain("status='completed'");
    expect(section).not.toContain("orderStatusHistory");
    expect(editor).toContain("Sem perguntas e sem alterar o status do pedido.");
  });
});
