import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isH2AutoHelpRequest, normalizeH2AutoPhone11 } from "./h2-auto-validation-policy";

const access = readFileSync("server/h2-auto-access.ts", "utf8");
const orders = readFileSync("server/h2-auto-orders.ts", "utf8");
const verified = readFileSync("server/h2-auto-verified-customer.ts", "utf8");

describe("H2 AUTO: cliente verificado não depende de lista privada do site", () => {
  it("a consulta de pedidos preserva a OTP e vínculo do cliente", () => {
    expect(orders).toContain("getH2AutoVerifiedAccessCustomer(id,conversation,now)");
    expect(orders).toContain('error:"authentication_required"');
    expect(orders).toContain("s.used_at IS NOT NULL");
    expect(verified).toContain("a.stage IN ('customer','customer_menu')");
    expect(verified).toContain("sha256(currentEmail.trim().toLowerCase())");
    expect(verified).toContain("sha256(String(currentPhone))");
  });
  it("não mistura autorização privada do site com cliente WhatsApp", () => {
    expect(orders).not.toContain("isOwnSiteEmailAuthorized");
    expect(verified).not.toContain("isOwnSiteEmailAuthorized");
    expect(access).not.toContain("isOwnSiteEmailAuthorized");
  });
  it("o contato não cadastrado continua sem acesso nem código", () => {
    expect(orders).toContain("if(!customer)return reply(res,200,notFound)");
    expect(access).toContain("if (!customer) return respond");
    expect(orders).toContain("await sendH2AutoOrderCode(customer.email,code,settings.ttl)");
  });
  it("a dúvida ? não é um número nem uma tentativa de código", () => {
    expect(isH2AutoHelpRequest("?")).toBe(true);
    expect(isH2AutoHelpRequest("??")).toBe(true);
    expect(isH2AutoHelpRequest("ajuda")).toBe(true);
    expect(isH2AutoHelpRequest("119914949926")).toBe(false);
    expect(normalizeH2AutoPhone11("11999999999")).toBe("11999999999");
    const phoneStart = access.indexOf('if (s.stage === "customer_phone" || s.stage === "referrals_phone")');
    const helpPhone = access.indexOf("if (isH2AutoHelpRequest(input))",phoneStart);
    const phoneFail = access.indexOf("if (invalidH2AutoPhoneStageAnswer",phoneStart);
    expect(helpPhone).toBeGreaterThan(phoneStart);
    expect(helpPhone).toBeLessThan(phoneFail);
    const codeStart=access.indexOf('if (s.stage === "customer_code" || s.stage === "referrals_code")');
    const helpOtp=access.indexOf("if (isH2AutoHelpRequest(input))",codeStart);
    const failedOtp=access.indexOf("code_attempts=LEAST(code_attempts+1,5)",codeStart);
    expect(helpOtp).toBeGreaterThan(codeStart);
    expect(helpOtp).toBeLessThan(failedOtp);
  });
});
