import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildWhatsappMessageUrl } from "../shared/whatsappUrl";

const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../client/src/pages/AdminOrders.tsx", import.meta.url), "utf8");

describe("Login WhatsApp em uma ação, preservando tela do código", () => {
  it("mantém builder e destino H2 AUTO sem alterar mensagens nem opções de canais", () => {
    expect(orders).toContain("buildWhatsappMessageUrl(");
    expect(login).toContain('import { buildWhatsappMessageUrl } from "@shared/whatsappUrl"');
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
  it("prepara popup na ação do usuário mas só navega após OTP ser criado", () => {
    const open = login.slice(login.indexOf("function openWhatsappWaitingTab()"), login.indexOf("async function send("));
    const send = login.slice(login.indexOf("async function send("), login.indexOf("async function confirm("));
    expect(open).toContain('window.open("", "_blank")');
    expect(open).toContain("tab.opener = null");
    expect(send.indexOf("openWhatsappWaitingTab()")).toBeLessThan(send.indexOf("await checkCustomer.mutateAsync("));
    expect(send.indexOf("await requestCode.mutateAsync({phone: cleanPhone, channel})")).toBeLessThan(send.indexOf("whatsappTab.location.replace("));
    expect(send).toContain('setStep("code")');
    expect(send).toContain('saveOtpDraft(cleanPhone, "code", channel)');
    expect(send).toContain("whatsappTab?.close()");
    expect(send).not.toMatch(/window\\.location\\.(assign|replace)|window\\.location\\s*=|window\\.location\\.href\\s*=/);
  });
  it("mantém canais e evita CTA extra como caminho principal", () => {
    expect(login).toContain("RECEBER PELO WHATSAPP");
    expect(login).toContain("RECEBER POR E-MAIL");
    expect(login).toContain("ABRIR WHATSAPP (SE NÃO ABRIU)");
    expect(login).toContain("showWhatsappFallback && (");
    expect(login).not.toContain("ABRIR WHATSAPP NORMAL");
    expect(login).not.toContain("ABRIR WHATSAPP BUSINESS");
    expect(login).toContain("remainingEmail > 0");
    expect(login).toContain("remainingWhatsapp > 0");
  });
});
