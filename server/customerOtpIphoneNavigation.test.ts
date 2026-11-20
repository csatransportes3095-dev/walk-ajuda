import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const login = readFileSync("client/src/components/CustomerOtpLogin.tsx", "utf8");

describe("H2 OTP iOS Safari WhatsApp navigation", () => {
  it("never opens about:blank or delayed popup for WhatsApp", () => {
    expect(login).not.toContain("window.open(");
    expect(login).not.toContain('window.open("about:blank"');
    expect(login).not.toContain("whatsappTab");
    expect(login).not.toContain("whatsappNavigationStarted");
  });
  it("offers a real link and preserves code-entry state on original tab", () => {
    expect(login).toContain('saveOtpDraft(cleanPhone, "code", channel)');
    expect(login).toContain('data-testid="h2-otp-whatsapp-separate-tab"');
    expect(login).toContain('data-testid="h2-otp-open-whatsapp"');
    expect(login).toContain('target="_blank" rel="noopener noreferrer"');
    expect(login).toContain('onChange={e => setCode(e.target.value.replace(/\\D/g, "").slice(0, 6))}');
    expect(login).toContain('const result = await requestCode.mutateAsync({phone: cleanPhone, channel});');
  });
  it("keeps email and existing OTP server validation unchanged", () => {
    expect(login).toContain('onClick={() => void send("email")}');
    expect(login).toContain('await verifyCode.mutateAsync({ phone: cleanPhone, code: digits })');
  });
});
