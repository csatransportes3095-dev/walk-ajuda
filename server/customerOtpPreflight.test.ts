import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {validSiteCode} from "../shared/siteAccessCodePolicy";
import {generateOwnSiteCode} from "./siteAccessOwnCodes";

describe("OTP admin readiness check",()=>{
  it("generates exactly six digits using the existing H2 generator",()=>{
    expect(validSiteCode(generateOwnSiteCode())).toBe(true);
  });
  it("shows an ADM-only manual check without changing the legacy password panel",()=>{
    const page=readFileSync(new URL("../client/src/pages/AdminCustomerPasswordPage.tsx",import.meta.url),"utf8");
    expect(page).toContain("otpPreflight.useQuery(undefined,{enabled:false,retry:false})");
    expect(page).toContain("void preflight.refetch()");
    expect(page).toContain("<CustomerOtpReadinessCard />");
    expect(page).toContain("mode.data?.passwordless ? <AdminCustomerAccessPage /> : <LegacyCustomerPasswordAdmin />");
    expect(page).toContain("Esta verificação não envia códigos nem ativa o novo login.");
    expect(page).toContain("Ainda falta testar o recebimento e a confirmação de um código real.");
  });
  it("restricts database readiness to administrator, no code/email sent",()=>{
    const source=readFileSync(new URL("./routers/customerPassword.ts",import.meta.url),"utf8");
    const section=source.slice(source.indexOf("  otpPreflight: adminProcedure.query("),source.indexOf("  requestCustomerCode:"));
    expect(section).toContain("ensureCustomerOtpTables(db)");
    expect(section).toContain("generateOwnSiteCode()");
    expect(section).toContain("enabled:isCustomerOtpModeEnabled()");
    expect(section).not.toContain("deliverOwnSiteCode(");
    expect(section).not.toContain("randomBytes(");
  });
});
