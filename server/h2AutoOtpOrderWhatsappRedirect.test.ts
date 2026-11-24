import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildWhatsappMessageUrl } from "../shared/whatsappUrl";
import { buildNativeOtpWhatsappUrl } from "../client/src/components/CustomerOtpLogin";

const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");
const orders = readFileSync(new URL("../client/src/pages/AdminOrders.tsx", import.meta.url), "utf8");

describe("Login OTP sem aba intermediária", () => {
  it("preserva destinatário, mensagem do robô e opção web no desktop", () => {
    expect(orders).toContain("buildWhatsappMessageUrl(");
    expect(login).toContain('import { buildWhatsappMessageUrl } from "@shared/whatsappUrl"');
    const url = new URL(buildWhatsappMessageUrl("5511999999999", "Preciso receber meu código"));
    expect(url.origin).toBe("https://api.whatsapp.com");
    expect(url.pathname).toBe("/send");
    expect(url.searchParams.get("phone")).toBe("5511999999999");
    expect(url.searchParams.get("text")).toBe("Preciso receber meu código");
  });

  it("o destino nativo do iPhone contém a conversa e a mensagem, sem aba web", () => {
    const url = new URL(buildNativeOtpWhatsappUrl("5511999999999", "Preciso receber meu código"));
    expect(url.protocol).toBe("whatsapp:");
    expect(url.hostname).toBe("send");
    expect(url.searchParams.get("phone")).toBe("5511999999999");
    expect(url.searchParams.get("text")).toBe("Preciso receber meu código");
  });

  it("o botão único gera o código; outra ação abre o WhatsApp se desejar", () => {
    const send = login.slice(login.indexOf("async function send("), login.indexOf("async function confirm("));
    expect(send).toContain('await requestCode.mutateAsync({phone: cleanPhone, channel})');
    expect(send).toContain('setStep("code")');
    expect(send).toContain('saveOtpDraft(cleanPhone, "code", channel, whatsappPrepared)');
    expect(login).toContain("RECEBER CÓDIGO");
    expect(login).toContain('send("both")');
    expect(login).toContain("ABRIR WHATSAPP");
    expect(login).toContain("showWhatsappLink && (");
    expect(login).not.toContain("ABRIR WHATSAPP (SE NÃO ABRIU)");
    expect(login).not.toContain("ABRIR WHATSAPP NORMAL");
    expect(login).not.toContain("ABRIR WHATSAPP BUSINESS");
    expect(login).not.toContain('window.open(');
    expect(login).not.toContain('whatsappTab');
    expect(login).not.toContain('tab.document.body');
    expect(send).not.toMatch(/window\.location\.(assign|replace)|window\.location\s*=|window\.location\.href\s*=/);
  });
});
