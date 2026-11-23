import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const login = readFileSync("client/src/components/CustomerOtpLogin.tsx", "utf8");
const send = login.slice(login.indexOf("async function send("), login.indexOf("async function confirm("));

describe("H2 OTP iOS Safari - manter tela do código ao voltar do WhatsApp", () => {
  it("proíbe a aba temporária e qualquer redirecionamento automático", () => {
    expect(login).not.toContain('window.open(');
    expect(login).not.toContain('about:blank');
    expect(login).not.toContain('openWhatsappWaitingTab');
    expect(login).not.toContain('whatsappTab');
    expect(login).not.toContain('tab.document.');
    expect(send).not.toContain('location.replace(');
    expect(send).not.toContain('window.location');
    expect(send).not.toContain('buildWhatsappMessageUrl(');
  });

  it("mostra o formulário antes de oferecer o WhatsApp por ação explícita", () => {
    expect(send.indexOf('await requestCode.mutateAsync({phone: cleanPhone, channel})'))
      .toBeLessThan(send.indexOf('setStep("code")'));
    expect(send.indexOf('setStep("code")'))
      .toBeLessThan(send.indexOf('saveOtpDraft(cleanPhone, "code", channel, whatsappPrepared)'));
    expect(send).toContain('setShowWhatsappLink(whatsappPrepared)');
    expect(login).toContain('data-testid="h2-otp-whatsapp-direct"');
    expect(login).toContain('data-testid="h2-otp-open-whatsapp"');
    expect(login).toContain('href={whatsappUrl}');
    expect(login).toContain('target={nativeWhatsapp ? undefined : "_blank"}');
    expect(login).toContain('rel={nativeWhatsapp ? undefined : "noopener noreferrer"}');
    expect(login).toContain('autoComplete="one-time-code"');
    expect(login).toContain('onChange={e => setCode(e.target.value.replace(/\\D/g, "").slice(0, 6))}');
  });

  it("usa o aplicativo instalado no iPhone, sem criar uma aba em branco", () => {
    expect(login).toContain('whatsapp://send?phone=');
    expect(login).toContain('return /iPhone|iPad|iPod|Android/i.test(ua)');
    expect(login).toContain('buildWhatsappMessageUrl(supportNumber, "Preciso receber meu código")');
    expect(login).toContain('buildNativeOtpWhatsappUrl(supportNumber, "Preciso receber meu código")');
  });

  it("recupera a tela do código mesmo se Safari recarregar a página", () => {
    expect(login).toContain('const OTP_DRAFT_TTL_MS = 10 * 60 * 1000;');
    expect(login).toContain('for (const kind of ["session", "local"] as const)');
    expect(login).toContain('kind === "session" ? window.sessionStorage : window.localStorage');
    expect(login).toContain('whatsappPrepared: draft.whatsappPrepared === true');
    expect(login).toContain('matchingDraft?.step || "phone"');
    expect(login).toContain('clearOtpDraft();');
    expect(login).toContain('await verifyCode.mutateAsync({ phone: cleanPhone, code: digits })');
  });
});
