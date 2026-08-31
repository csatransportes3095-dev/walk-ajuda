import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const root=path.resolve(import.meta.dirname,"..");
const indexSource=fs.readFileSync(path.join(root,"server/_core/index.ts"),"utf8");
const router=fs.readFileSync(path.join(root,"server/routers/loans.ts"),"utf8");
const worker=fs.readFileSync(path.join(root,"workers/windows/browser-session.mjs"),"utf8");
const admin=fs.readFileSync(path.join(root,"client/src/pages/AdminLoans.tsx"),"utf8");
describe("production hardening release",()=>{
 it("binds exact Render port",()=>{expect(indexSource).toContain('server.listen(port, "0.0.0.0"');expect(indexSource).not.toContain('findAvailablePort');});
 it("keeps Zoho debug route absent",()=>{expect(indexSource).not.toContain('/api/zoho-test-session');expect(indexSource).not.toContain('TEST_walk1');});
 it("protects Google sorry",()=>{expect(worker).toContain('createGoogleSorryPrivacyGuard');expect(worker).toContain('declarativeNetRequest');expect(worker).toContain('/sorry');expect(worker).toContain('googleSorryPrivacyGuard: "enabled"');});
 it("keeps daily fee isolated and maximum preserving",()=>{expect(router).toContain("AND l.paymentType = 'diario'");expect(router).toContain("Math.max(storedFee, input.feeAmount, automaticFee)");expect(router).toContain("Math.max(nextStoredFee, nextAutomaticFee)");});
 it("allows ADM manual fee without time gate",()=>{expect(admin).not.toContain('A taxa de atraso fica disponível após 18h.');expect(admin).toContain('data-testid="manual-late-fee-button"');});
});
