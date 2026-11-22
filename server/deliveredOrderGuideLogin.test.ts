import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sameDeliveredGuideCustomerPhone } from "./deliveredOrderGuidePhone";

const accessGate = readFileSync("client/src/components/UnifiedCustomerAccessGate.tsx", "utf8");
const page = readFileSync("client/src/pages/DeliveredOrderGuidePage.tsx", "utf8");
const router = readFileSync("server/routers/deliveredOrderGuide.ts", "utf8");

describe("Pedido Entregue: exigir login e retornar ao link correto", () => {
  it("pede login somente ao acessar link individual de Pedido Entregue", () => {
    expect(accessGate).toContain('^\\/pedido-entregue\\/[a-f0-9]{48}$');
    expect(accessGate).toContain('sessionStorage.setItem(RETURN_TO_KEY, currentRelativeUrl())');
    expect(accessGate).toContain('window.location.replace("/login")');
    expect(accessGate).toContain('isUnifiedCustomerRoute(url.pathname)');
    expect(accessGate).toContain('window.location.replace(returnTo)');
  });
  it("valida login e identidade no servidor antes de devolver orientacoes", () => {
    const check = router.indexOf('const session = await requireCustomerSession(input.customerSessionToken)');
    const find = router.indexOf('const record = await getByToken(input.token)', check);
    const owner = router.indexOf('sameDeliveredGuideCustomerPhone(session.phone, record.customerPhone)', find);
    expect(check).toBeGreaterThan(0);
    expect(find).toBeGreaterThan(check);
    expect(owner).toBeGreaterThan(find);
    expect(router).toContain('code: "FORBIDDEN"');
    expect(router).not.toContain("addOrderStatus");
  });
  it("envia token da sessao validada sem mudar editor global ou link individual", () => {
    expect(page).toContain("getPublic.useMutation(");
    expect(page).toContain("guideRequest.mutate({ token, customerSessionToken })");
    expect(router).toContain(".mutation(async ({ input }) => {");
    expect(page).toContain('localStorage.getItem("cp_token")');
    expect(router).toContain("saveGlobal: adminProcedure");
    expect(router).toContain("createLinkForOrder: adminProcedure");
  });
  it("aceita DDD e telefone brasileiro com ou sem o nono digito", () => {
    expect(sameDeliveredGuideCustomerPhone("11987654321", "1187654321")).toBe(true);
    expect(sameDeliveredGuideCustomerPhone("5511987654321", "(11) 8765-4321")).toBe(true);
    expect(sameDeliveredGuideCustomerPhone("11987654321", "21987654321")).toBe(false);
    expect(sameDeliveredGuideCustomerPhone("", "11987654321")).toBe(false);
    expect(sameDeliveredGuideCustomerPhone("11987654321", "")).toBe(false);
    expect(sameDeliveredGuideCustomerPhone("11987654321", "11987654322")).toBe(false);
  });
});
