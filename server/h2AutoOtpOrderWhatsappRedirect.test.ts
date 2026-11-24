import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildWhatsappMessageUrl } from "../shared/whatsappUrl";
import { buildNativeOtpWhatsappUrl } from "../client/src/components/CustomerOtpLogin";
const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx",import.meta.url),"utf8");
const orders = readFileSync(new URL("../client/src/pages/AdminOrders.tsx",import.meta.url),"utf8");
describe("H2 OTP: abertura automática de WhatsApp após solicitação",()=>{
  it("preserva a mensagem H2 e a numeração internacional",()=>{
    expect(orders).toContain('buildWhatsappMessageUrl(');
    const url=new URL(buildWhatsappMessageUrl("5511999999999","Preciso receber meu código"));
    expect(url.origin).toBe("https://api.whatsapp.com");
    expect(url.searchParams.get("phone")).toBe("5511999999999");
    expect(url.searchParams.get("text")).toBe("Preciso receber meu código");
    const native=new URL(buildNativeOtpWhatsappUrl("5511999999999","Preciso receber meu código"));
    expect(native.protocol).toBe("whatsapp:");
    expect(native.hostname).toBe("send");
    expect(native.searchParams.get("phone")).toBe("5511999999999");
  });
  it("um único clique produz a solicitação e redireciona sem aba temporária",()=>{
    const send=login.slice(login.indexOf("async function send("),login.indexOf("async function confirm("));
    expect(login).toContain('send("both")');
    expect(send).toContain('await requestCode.mutateAsync({phone: cleanPhone, channel})');
    expect(send).toContain('window.location.assign(whatsappUrl)');
    expect(send).toContain('window.open(whatsappUrl, "_blank")');
    expect(send).not.toContain('window.open("",');
    expect(send).toContain('saveOtpDraft(cleanPhone, "code", channel, whatsappPrepared)');
    expect(login).toContain('setShowWhatsappLink(true)');
    expect(login).toContain('href={whatsappUrl}');
    expect(login).not.toContain('openWhatsappWaitingTab');
    expect(login).not.toContain('Preparando seu código');
  });
});
