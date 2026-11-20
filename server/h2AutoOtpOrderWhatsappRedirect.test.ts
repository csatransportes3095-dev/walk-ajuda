import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildWhatsappMessageUrl } from "../shared/whatsappUrl";

const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../client/src/pages/AdminOrders.tsx", import.meta.url), "utf8");

describe("Login WhatsApp opens separately and preserves the code form", () => {
  it("uses the same shared URL builder as order resend, including type and app_absent", () => {
    expect(orders).toContain("buildWhatsappMessageUrl(");
    expect(login).toContain('import { buildWhatsappMessageUrl } from "@shared/whatsappUrl"');
    expect(login).not.toContain('window.open("about:blank", "_blank")');
    expect(login).not.toContain("whatsappTab.location.replace");
    expect(login).not.toContain("whatsappTab.close()");
    expect(login).toContain('target="_blank" rel="noopener noreferrer"');
    expect(login).toContain('<a href={buildWhatsappMessageUrl(supportNumber, "Preciso receber meu código")}');
    const url = new URL(buildWhatsappMessageUrl("5511999999999", "Preciso receber meu código"));
    expect(url.origin).toBe("https://api.whatsapp.com");
    expect(url.pathname).toBe("/send");
    expect(url.searchParams.get("phone")).toBe("5511999999999");
    expect(url.searchParams.get("text")).toBe("Preciso receber meu código");
    expect(url.searchParams.get("type")).toBe("phone_number");
    expect(url.searchParams.get("app_absent")).toBe("0");
  });
  it("opens WhatsApp from a direct user link after the server prepares the code", () => {
    const send = login.slice(login.indexOf("async function send("), login.indexOf("async function confirm("));
    expect(send).not.toContain('window.open("about:blank", "_blank")');
    expect(send).not.toContain("window.open(");
    expect(send).not.toContain("whatsappTab");
    expect(send).not.toMatch(/window\\.location\\.(assign|replace)|window\\.location\\s*=|window\\.location\\.href\\s*=/);
    expect(send).toContain('setStep("code")');
    expect(send).toContain('saveOtpDraft(cleanPhone, "code", channel)');
    expect(login).toContain('data-testid="h2-otp-open-whatsapp"');
    expect(login).toContain('target="_blank" rel="noopener noreferrer"');
  });
  it("does not create extra UI or alter the OTP handoff", () => {
    expect(login).toContain("RECEBER PELO WHATSAPP");
    expect(login).not.toContain("ABRIR WHATSAPP NORMAL");
    expect(login).not.toContain("ABRIR WHATSAPP BUSINESS");
    expect(login).toContain("requestCode.mutateAsync({phone: cleanPhone, channel})");
    expect(login).toContain("remainingEmail > 0");
    expect(login).toContain("remainingWhatsapp > 0");
  });
});
