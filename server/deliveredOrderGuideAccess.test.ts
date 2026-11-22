import { describe, expect, it } from "vitest";
import { siteAccessDecision } from "./siteAccessPolicy";

const decide = (pathname: string, mode: "restricted" | "blocked" = "restricted") =>
  siteAccessDecision({ mode, pathname, hasAdminSession: false, hasAuthorizedSession: false });
const token = "a".repeat(48);

describe("Pedido Entregue: acesso público exclusivo por token", () => {
  it("abre o link individual e sua consulta de leitura sem login", () => {
    for (const mode of ["restricted", "blocked"] as const) {
      expect(decide("/pedido-entregue/" + token, mode)).toBe("allow");
      expect(decide("/api/trpc/deliveredOrderGuide.getPublic", mode)).toBe("allow");
    }
  });
  it("não libera listagem pública nem escrita no ADM ou outros módulos", () => {
    for (const path of [
      "/pedido-entregue",
      "/pedido-entregue/qualquer",
      "/pedido-entregue/" + "a".repeat(47),
      "/api/trpc/deliveredOrderGuide.getForOrder",
      "/api/trpc/deliveredOrderGuide.getGlobal",
      "/api/trpc/deliveredOrderGuide.saveGlobal",
      "/api/trpc/deliveredOrderGuide.createLinkForOrder",
      "/api/trpc/deliveredOrderGuide.getPublic,deliveredOrderGuide.getGlobal",
      "/api/trpc/products.listActive",
    ]) {
      expect(decide(path)).toBe("challenge");
      expect(decide(path, "blocked")).toBe("deny");
    }
  });
});