import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const otp = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers/customerPassword.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");

describe("optional WhatsApp channel uses the existing single customer OTP", () => {
  it("does not generate or verify a second code", () => {
    expect((otp.match(/generateOwnSiteCode\(\)/g) || []).length).toBe(1);
    expect(otp).toContain("const codeHash = digest(\"code:\"+phoneKey,code)");
    expect(otp).toContain("await deliverOwnSiteCode(email,code)");
    expect(otp).toContain("return code;");
    expect(otp).toContain("deliverSiteOtpWhatsApp(normalizeCustomerPhone(customer.phone), issuedCode, true)");
    expect(otp).not.toContain("console.log(code)");
  });

  it("does not send on resend cooldown or missing consent", () => {
    expect(otp).toContain("if (Number(current?.resendAfter || 0) > now) return null");
    expect(otp).toContain("if (issuedCode !== null && whatsappConsent === true)");
    expect(router).toContain("whatsappConsent: z.boolean().optional().default(false)");
    expect(router).toContain("requestCustomerCode(input.phone, ctx.req, input.whatsappConsent)");
  });

  it("does not display the opt-in when the provider is not configured", () => {
    expect(router).toContain("available: isSiteOtpWhatsAppAvailable()");
    expect(ui).toContain("whatsappOtpStatus?.available === true && (");
    expect(ui).toContain("const [whatsappConsent, setWhatsappConsent] = useState(false)");
    expect(ui).toContain("whatsappConsent: whatsappOtpStatus?.available === true && whatsappConsent");
  });

  it("keeps email authoritative even if WhatsApp fails", () => {
    const emailPos = otp.indexOf("await deliverOwnSiteCode(email,code)");
    const whatsappPos = otp.indexOf("await deliverSiteOtpWhatsApp(");
    expect(emailPos).toBeGreaterThan(-1);
    expect(whatsappPos).toBeGreaterThan(emailPos);
    expect(otp).toContain("WhatsApp optional delivery failed");
  });
});
