import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const runtime = readFileSync("client/src/main.tsx", "utf8");
const session = readFileSync("client/src/components/SiteAccessSessionBoundary.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");

describe("Pedido Entregue: link individual público não exige login", () => {
  it("ignora somente o manifesto global para a URL com token individual", () => {
    expect(runtime).toContain('const isDeliveredOrderGuideLink = /^\\/pedido-entregue\\/[a-f0-9]{48}\\/?$/.test(pathname);');
    expect(runtime).toContain("const bypassManifest = isDeliveredOrderGuideLink || isSiteAccessEntry");
    const valid = /^\/pedido-entregue\/[a-f0-9]{48}\/?$/;
    expect(valid.test("/pedido-entregue/" + "a".repeat(48))).toBe(true);
    expect(valid.test("/pedido-entregue/qualquer")).toBe(false);
    expect(valid.test("/pedido-entregue/" + "a".repeat(47))).toBe(false);
    expect(valid.test("/login")).toBe(false);
    expect(valid.test("/adm/placa")).toBe(false);
  });
  it("ignora a verificação de sessão somente para link individual válido", () => {
    expect(session).toContain("deliveredGuideTokenRoute");
    expect(session).toContain("||deliveredGuideTokenRoute;");
  });
  it("mantém acesso público isolado e página correta no App", () => {
    expect(app).toContain('path={"/pedido-entregue/:token"} component={DeliveredOrderGuidePage}');
    expect(app).toContain("isDirectPublicTokenRoute");
  });
});
