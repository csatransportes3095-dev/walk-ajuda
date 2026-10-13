import { describe, expect, it } from "vitest";
import { sitePolicy } from "./siteAccessPolicy";
const decision=(mode:"public"|"restricted"|"blocked",path:string,admin=false,visitor=false)=>sitePolicy({mode,path,isAdmin:admin,isAuthorizedVisitor:visitor});
describe("site access policy",()=>{
  it("preserves public mode",()=>{expect(decision("public","/acompanhar")).toBe("pass");expect(decision("public","/api/trpc/orders.list")).toBe("pass");});
  it("restricts API and pages even when called directly",()=>{expect(decision("restricted","/acompanhar")).toBe("challenge");expect(decision("restricted","/api/trpc/products.listActive")).toBe("challenge");expect(decision("restricted","/api/upload/client-file")).toBe("challenge");});
  it("denies ordinary visitors in blocked mode",()=>{expect(decision("blocked","/")).toBe("deny");expect(decision("blocked","/api/trpc/products.listActive")).toBe("deny");});
  it("keeps ADM recovery available without granting its permissions",()=>{expect(decision("blocked","/admin/login")).toBe("pass");expect(decision("blocked","/api/trpc/adminAuth.login")).toBe("pass");});
  it("keeps authenticated owner and authorized visitors in appropriate modes",()=>{expect(decision("blocked","/api/trpc/products.listActive",true)).toBe("pass");expect(decision("restricted","/pedidos",false,true)).toBe("pass");});
  it("does not broadly exempt API routes",()=>{expect(decision("blocked","/api/h2ads/worker/claim")).toBe("deny");expect(decision("blocked","/api/trpc/customerPassword.login")).toBe("deny");});
});