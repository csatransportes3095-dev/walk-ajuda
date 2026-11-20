import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const login = readFileSync("client/src/components/CustomerOtpLogin.tsx", "utf8");

describe("H2 OTP iOS Safari WhatsApp navigation", () => {
  it("never opens about:blank, delayed popups or replaces the H2 tab", () => {
    expect(login).not.toMatch(/window\\.open\\s*\\(/);
    expect(login).not.toMatch(/window\\.location\\.(?:href|assign|replace)\\s*=|window\\.location\\.(?:assign|replace)\\s*\\(whatsappUrl/);
    expect(login).not.toMatch(/whatsappTab|whatsappNavigationStarted/);
  });
  it("only offers the WhatsApp link after preparing and persisting code-entry state", () => {
    expect(login).toContain('saveOtpDraft(cleanPhone, "code", channel)');
    expect(login).toContain('data-testid="h2-otp-whatsapp-separate-tab"');
    expect(login).toContain('data-testid="h2-otp-open-whatsapp"');
    expect(login).toContain('target="_blank" rel="noopener noreferrer"');
    expect(login).toContain('onChange={e => setCode(e.target.value.replace(/\\D/g, "").slice(0, 6))}');
    expect(login).toContain('const result = await requestCode.mutateAsync({phone: cleanPhone, channel});');
  });
  it("keeps the email route and OTP validation unchanged", () => {
    expect(login).toContain('onClick={() => void send("email")}');
    expect(login).toContain('await verifyCode.mutateAsync({ phone: cleanPhone, code: digits })');
  });
});
