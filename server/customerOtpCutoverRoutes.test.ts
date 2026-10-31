import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("OTP-only shared customer route cutover",()=>{
  it("serves server-selected login and recovery routing, not localStorage permissions",()=>{
    const app=file("client/src/App.tsx");
    expect(app).toContain("customerPassword.authMode.useQuery");
    expect(app).toContain("<CustomerOtpSiteGate>{children}</CustomerOtpSiteGate>");
    expect(app).toContain('mode.data?.passwordless ? <Redirect to="/login" />');
    expect(app).toContain("<UnifiedCustomerGate>");
  });
  it("switches Gastos and Empréstimos to the same OTP component",()=>{
    const page=file("client/src/pages/GastosLoginPage.tsx");
    expect(page).toContain("CustomerOtpLogin");
    expect(page).toContain("utils.spreadsheet.verifySession.fetch");
    expect(page).toContain("session.clientId");
    expect(page).toContain("onLoginSuccess(value.token");
    expect(file("client/src/pages/GastosPage.tsx")).toContain("<GastosLoginPage");
    expect(file("client/src/pages/EmprestimoPage.tsx")).toContain("<GastosLoginPage");
  });
  it("uses OTP for Cadastro and never shows its legacy form in passwordless mode",()=>{
    const page=file("client/src/pages/AtualizarCadastro.tsx");
    expect(page).toContain('if (otpMode.data?.passwordless) {');
    expect(page).toContain('if (!token && step!=="done" && step!=="already_done") {');
    expect(page).toContain('if (token && step!=="profile" && step!=="done" && step!=="already_done") {');
    expect(page).toContain("<CustomerOtpLogin");
    expect(page).toContain('acceptToken(value.token)');
  });
  it("removes the password ADM when OTP mode is active, preserves route permissions",()=>{
    const adm=file("client/src/pages/AdminCustomerPasswordPage.tsx");
    const newPage=file("client/src/pages/AdminCustomerAccessPage.tsx");
    expect(adm).toContain("mode.data?.passwordless ? <AdminCustomerAccessPage />");
    expect(newPage).toContain("adminListPendingAccess");
    expect(newPage).toContain("adminDecideAccess");
  });
  it("issues browser sessions only after route-specific callback approves",()=>{
    const login=file("client/src/components/CustomerOtpLogin.tsx");
    expect(login.indexOf("await onAuthenticated(")).toBeLessThan(login.indexOf('localStorage.setItem("cp_token", result.token)'));
    expect(login).toContain("verifyCode.mutateAsync");
  });
  it("never sends an OTP-authenticated profile update into legacy password screens",()=>{
    const page=file("client/src/pages/AtualizarCadastro.tsx");
    expect(page).toContain('if (otpMode.data?.passwordless)');
    expect(page).toContain('if (token && step!=="profile"');
    expect(page).toContain("acceptToken(value.token)");
    expect(page).not.toContain('otpMode.data?.passwordless && !token && step!=="done"');
  });
  it("closes obsolete customer password discovery endpoints in OTP-only mode",()=>{
    const router=file("server/routers/customerPassword.ts");
    for (const method of ["checkStatus","checkStatusMutation","adminListPending","adminGetStatus"]) {
      const start=router.indexOf("  "+method+": ");
      expect(start).toBeGreaterThan(0);
      expect(router.slice(start,start+1100)).toContain("requireLegacyPasswordMode()");
    }
    const getModeAt=router.indexOf("  getMode: publicProcedure.query(async () => {");
    expect(getModeAt).toBeGreaterThan(0);
    expect(router.slice(getModeAt,getModeAt+180)).toMatch(/getMode:\s*publicProcedure\.query\(async \(\) => \{\s*requireLegacyPasswordMode\(\);/);
    const spreadsheet=file("server/routers/spreadsheet.ts");
    for (const method of ["checkPhone","getPasswordMode"]) {
      const start=spreadsheet.indexOf("  "+method+": ");
      expect(start).toBeGreaterThan(0);
      expect(spreadsheet.slice(start,start+900)).toContain("isCustomerOtpModeEnabled()");
    }
    expect(file("server/routers/customerUpdate.ts")).toContain('status: publicProcedure');
    const update=file("server/routers/customerUpdate.ts");
    const pos=update.indexOf("  status: publicProcedure");
    expect(update.slice(pos,pos+600)).toContain("isCustomerOtpModeEnabled()");
  });

  it("retains protected server OTP session and rejection of legacy customer password endpoints",()=>{
    const server=file("server/routers/customerPassword.ts");
    expect(server).toContain("getVerifiedCustomerOtpSession(db, cleanToken)");
    expect(server).toContain("requireLegacyPasswordMode()");
    expect(server).toContain("authMode: publicProcedure");
    const spending=file("server/routers/spreadsheet.ts");
    expect(spending).toContain("getVerifiedCustomerOtpSession(db,cleanToken)");
    expect(file("server/routers/loans.ts")).toContain("getVerifiedCustomerOtpSession(db,token)");
    expect(file("server/routers/customerUpdate.ts")).toContain("getVerifiedCustomerOtpSession(db,cleanToken)");
  });
});
