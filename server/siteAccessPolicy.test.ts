import { describe, expect, it } from "vitest";
import { siteAccessDecision, safeReturnUrl, isSecurityPublicPath } from "./siteAccessPolicy";
const decision = (mode: "public"|"restricted"|"blocked",pathname:string,hasAdminSession=false,hasAuthorizedSession=false) => siteAccessDecision({mode,pathname,hasAdminSession,hasAuthorizedSession});
describe("Seguranca do Site - regras de servidor", () => {
  it("mantem o site publico sem excecoes", () => {
    expect(decision("public","/acompanhar")).toBe("allow");
    expect(decision("public","/api/trpc/products.listActive")).toBe("allow");
  });
  it("protege rotas e APIs diretas", () => {
    for(const p of ["/", "/acompanhar", "/api/trpc/products.listActive", "/api/upload/client-file", "/link/foto-cliente"]) {
      expect(decision("restricted",p)).toBe("challenge");
      expect(decision("blocked",p)).toBe("deny");
    }
  });
  it("deixa o visitante autorizado entrar somente no modo restrito",()=>{
    expect(decision("restricted","/acompanhar",false,true)).toBe("allow");
    expect(decision("blocked","/acompanhar",false,true)).toBe("deny");
  });
  it("bloqueia portal e endpoints de autenticação do visitante no modo fechado",()=>{
    for (const p of ["/site-access","/api/site-access/request","/api/site-access/verify","/api/site-access/session","/api/site-access/logout"]) {
      expect(decision("blocked",p)).toBe("deny");
      expect(decision("restricted",p)).toBe("allow");
    }
  });
  it("preserva emergencia do ADM com autenticação propria",()=>{
    expect(decision("blocked","/admin/login")).toBe("allow");
    expect(decision("blocked","/api/trpc/adminAuth.login")).toBe("allow");
    expect(decision("blocked","/api/trpc/siteSecurity.setMode",true)).toBe("allow");
  });
  it("nao admite bypass de APIs e batches",()=>{
    expect(isSecurityPublicPath("/api/trpc/adminAuth.check,products.listActive")).toBe(false);
    expect(isSecurityPublicPath("/api/trpc/customerPassword.login")).toBe(false);
    expect(isSecurityPublicPath("/api/trpc/siteSecurity.setMode")).toBe(false);
    expect(decision("blocked","/api/trpc/products.listActive",false,false)).toBe("deny");
  });
  it("preserva endpoints autenticados dos workers sem expor rotas arbitrarias",()=>{
    expect(isSecurityPublicPath("/api/h2ads/worker/heartbeat")).toBe(true);
    expect(isSecurityPublicPath("/api/h2ads/administration")).toBe(false);
  });
  it("restringe URL de retorno ao proprio site",()=>{
    expect(safeReturnUrl("//evil.example")).toBe("/");
    expect(safeReturnUrl("/\\evil")).toBe("/");
    expect(safeReturnUrl("/admin/login")).toBe("/");
    expect(safeReturnUrl("/pedidos?tab=1")).toBe("/pedidos?tab=1");
  });
});
