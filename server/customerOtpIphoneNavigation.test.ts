import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const login = readFileSync("client/src/components/CustomerOtpLogin.tsx","utf8");
const send = login.slice(login.indexOf("async function send("),login.indexOf("async function confirm("));
describe("H2 OTP iPhone: redirecionamento automático sem página em branco",()=>{
  it("não cria aba temporária nem tela de preparação",()=>{
    expect(login).not.toContain('window.open("",');
    expect(login).not.toContain('window.open("about:blank"');
    expect(login).not.toContain('openWhatsappWaitingTab');
    expect(login).not.toContain('tab.document.');
    expect(login).not.toContain('Preparando seu código');
    expect(login).not.toContain('whatsappTab');
  });
  it("solicita o desafio, salva a tela de 6 dígitos e abre automaticamente",()=>{
    expect(send.indexOf('await requestCode.mutateAsync({phone: cleanPhone, channel})'))
      .toBeLessThan(send.indexOf('saveOtpDraft(cleanPhone, "code", channel, whatsappPrepared)'));
    expect(send.indexOf('saveOtpDraft(cleanPhone, "code", channel, whatsappPrepared)'))
      .toBeLessThan(send.indexOf('window.location.assign(whatsappUrl)'));
    expect(send).toContain('flushSync(() => {');
    expect(send).toContain('setStep("code")');
    expect(send).toContain('window.location.assign(whatsappUrl)');
    expect(send).toContain('if (nativeWhatsapp)');
    expect(send).toContain('if (whatsappPrepared)');
    expect(send).toContain('setShowWhatsappLink(true)');
  });
  it("mantém recuperação sem recriar o código",()=>{
    expect(login).toContain('const OTP_DRAFT_TTL_MS = 10 * 60 * 1000');
    expect(login).toContain('kind === "session" ? window.sessionStorage : window.localStorage');
    expect(login).toContain('matchingDraft?.step || "phone"');
    expect(login).toContain('autoComplete="one-time-code"');
    expect(login).toContain('await verifyCode.mutateAsync({ phone: cleanPhone, code: digits })');
    expect(login).toContain('data-testid="h2-otp-open-whatsapp"');
    expect(login).toContain('WhatsApp não abriu? Abrir novamente');
  });
});
