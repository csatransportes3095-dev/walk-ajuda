import { describe, expect, it } from "vitest";
import { whatsappLoginHref } from "../client/src/components/CustomerOtpLogin";
import { readFileSync } from "node:fs";

const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");

describe("H2 WhatsApp app-specific redirect without changing OTP", () => {
  it("targets the Normal WhatsApp package on Android", () => {
    const link = whatsappLoginHref("5511999999999", "normal", true);
    expect(link).toContain("scheme=whatsapp;package=com.whatsapp;end");
    expect(link).not.toContain("com.whatsapp.w4b");
    expect(link).toContain("phone=5511999999999");
    expect(link).toContain("text=Preciso");
  });
  it("targets the Business package on Android and preserves desktop fallback", () => {
    expect(whatsappLoginHref("5511999999999", "business", true)).toContain("package=com.whatsapp.w4b");
    expect(whatsappLoginHref("5511999999999", "normal", false)).toMatch(/^https:\/\/wa\.me\//);
  });
  it("keeps one original red request button and does not auto-redirect after server call", () => {
    expect(login).toContain("RECEBER PELO WHATSAPP");
    expect(login).toContain("ABRIR WHATSAPP NORMAL");
    expect(login).toContain("ABRIR WHATSAPP BUSINESS");
    expect(login).toContain("requestCode.mutateAsync({phone: cleanPhone, channel})");
    expect(login).toContain("remainingWhatsapp > 0");
    expect(login).toContain("remainingEmail > 0");
    expect(login).not.toContain("window.location.assign(`https://wa.me/");
    expect(login).not.toContain("chooseWhatsappApp");
  });
});
