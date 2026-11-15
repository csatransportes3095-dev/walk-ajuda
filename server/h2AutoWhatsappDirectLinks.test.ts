import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");

describe("H2 WhatsApp app-specific redirect without changing OTP", () => {
  it("targets the Normal and Business installed Android packages directly", () => {
    expect(login).toContain('app === "normal" ? "com.whatsapp" : "com.whatsapp.w4b"');
    expect(login).toContain("scheme=whatsapp;package=");
    expect(login).toContain("intent://send?phone=");
    expect(login).toContain("https://wa.me/");
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
