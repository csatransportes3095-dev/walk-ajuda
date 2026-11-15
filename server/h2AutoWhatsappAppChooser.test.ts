import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");
const access = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");

describe("H2 OTP WhatsApp app chooser only", () => {
  it("offers both installed WhatsApp packages through explicit user clicks on Android", () => {
    expect(login).toContain('pkg = app === "normal" ? "com.whatsapp" : "com.whatsapp.w4b"');
    expect(login).toContain("intent://send?phone=");
    expect(login).toContain("scheme=whatsapp;package=");
    expect(login).toContain("WHATSAPP NORMAL");
    expect(login).toContain("WHATSAPP BUSINESS");
    expect(login).toContain('onClick={() => setChooseWhatsappApp(false)}');
    expect(login).toContain('role="dialog"');
    expect(login).toContain('aria-modal="true"');
  });
  it("leaves the OTP request, email and independent countdowns intact", () => {
    expect(login).toContain("requestCode.mutateAsync({phone: cleanPhone, channel})");
    expect(login).toContain('if (channel === "whatsapp")');
    expect(login).toContain("setChooseWhatsappApp(true)");
    expect(login).toContain("RECEBER POR E-MAIL");
    expect(login).toContain("bg-cyan-500");
    expect(login).toContain("bg-[#8B0000]");
    expect(login).toContain("remainingEmail > 0");
    expect(login).toContain("remainingWhatsapp > 0");
    expect(login).toContain('encodeWhatsappMessage("Preciso receber meu código")');
    expect(access).toContain("CUSTOMER_CODE_MS = 10 * 60 * 1000");
    expect(access).toContain('digest("otp-resend:" + channel, phone)');
  });
});
