import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {validSiteCode} from "../shared/siteAccessCodePolicy";
import {generateOwnSiteCode} from "./siteAccessOwnCodes";

describe("OTP admin readiness check",()=>{
  it("generates exactly six digits using the existing H2 generator",()=>{
    expect(validSiteCode(generateOwnSiteCode())).toBe(true);
  });
  it("keeps the customer ADM panel without an extra readiness button",()=>{
    const page=readFileSync(new URL("../client/src/pages/AdminCustomerPasswordPage.tsx",import.meta.url),"utf8");
    expect(page).not.toContain("CustomerOtpReadinessCard");
    expect(page).not.toContain("VERIFICAR PREPARAÇÃO");
    expect(page).toContain("return mode.data?.passwordless ? <AdminCustomerAccessPage /> : <LegacyCustomerPasswordAdmin />;");
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
