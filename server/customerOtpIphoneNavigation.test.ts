import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const login = readFileSync("client/src/components/CustomerOtpLogin.tsx", "utf8");

describe("H2 OTP iOS Safari - um clique e retorno ao codigo", () => {
  it("abre uma aba apenas dentro do clique antes de aguardar o servidor", () => {
    const opener = login.slice(login.indexOf("function openWhatsappWaitingTab()"), login.indexOf("async function send("));
    const send = login.slice(login.indexOf("async function send("), login.indexOf("async function confirm("));
    expect(opener).toContain('window.open("", "_blank")');
    expect(opener).toContain("tab.document.title");
    expect(opener).toContain("tab?.close()");
    expect(send.indexOf("openWhatsappWaitingTab()")).toBeLessThan(send.indexOf("await checkCustomer.mutateAsync("));
    expect(send).not.toContain("window.open(");
  });
  it("so redireciona a segunda aba apos registrar o codigo e preserva formulario", () => {
    const send = login.slice(login.indexOf("async function send("), login.indexOf("async function confirm("));
    expect(send.indexOf('saveOtpDraft(cleanPhone, "code", channel)')).toBeLessThan(send.indexOf("whatsappTab.location.replace("));
    expect(send).toContain('setStep("code")');
    expect(send).toContain('whatsappTab.location.replace(buildWhatsappMessageUrl(supportNumber, "Preciso receber meu código"))');
    expect(login).toContain('data-testid="h2-otp-open-whatsapp"');
    expect(login).toContain('target="_blank" rel="noopener noreferrer"');
    expect(login).toContain('onChange={e => setCode(e.target.value.replace(/\\D/g, "").slice(0, 6))}');
  });
  it("mantem recuperação para bloqueio de popup e recarga da aba original", () => {
    expect(login).toContain('setShowWhatsappFallback(!redirected)');
    expect(login).toContain('initialState.step === "code" && initialState.channel === "whatsapp"');
    expect(login).toContain('showWhatsappFallback && (');
    expect(login).toContain("ABRIR WHATSAPP (SE NÃO ABRIU)");
    expect(login).toContain('onClick={() => void send("both")}');
    expect(login).toContain("await verifyCode.mutateAsync({ phone: cleanPhone, code: digits })");
  });
});
