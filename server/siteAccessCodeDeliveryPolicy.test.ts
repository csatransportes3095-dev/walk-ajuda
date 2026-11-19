import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const email = "session-policy@example.test";
const transport = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: transport.createTransport } }));
import { deliverOwnSiteCode } from "./siteAccessCodeDelivery";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SMTP_PASS", "isolated-test-password");
  vi.stubEnv("SMTP_USER", "mail@example.test");
  vi.stubEnv("SMTP_FROM", "mail@example.test");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network is forbidden in this test"); }));
  transport.sendMail.mockResolvedValue({ accepted: [email], messageId: "isolated-message" });
  transport.createTransport.mockReturnValue({ sendMail: transport.sendMail, close: transport.close });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Email copy for independently configured customer sessions", () => {
  it.each([undefined, "site-access"] as const)("preserves the separate 24-hour site-access wording for %s", async purpose => {
    await deliverOwnSiteCode(email, "000012", purpose);
    const message = transport.sendMail.mock.calls[0][0];
    expect(message.text).toBe("Seu código para acessar o site H2 Colombiano: 000012\n\nDigite ou cole os 6 números. Este código é de uso único e vale por 10 minutos. Após confirmar, seu acesso vale por até 24 horas, ou até você sair.\n\nNão compartilhe. Se não solicitou o acesso, ignore esta mensagem.");
    expect(message.html).toContain("Após a confirmação, o acesso vale por até 24 horas, ou até você sair.");
    expect(transport.close).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not promise a fixed 24-hour session in the customer-login email", async () => {
    const result = await deliverOwnSiteCode(email, "000012", "customer-login");
    expect(result).toEqual({ channel: "smtp", messageId: "isolated-message" });
    const message = transport.sendMail.mock.calls[0][0];
    for (const payload of [message.text, message.html]) {
      expect(payload).toContain("000012");
      expect(payload).toContain("10 minutos");
      expect(payload.toLowerCase()).toContain("uso único");
      expect(payload).toContain("duração definida pelo administrador");
      expect(payload).not.toContain("24 horas");
    }
    expect(message.subject).toBe("H2 Colombiano - Código de acesso");
    expect(message.to).toBe(email);
    expect(transport.sendMail).toHaveBeenCalledOnce();
    expect(transport.close).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves password recovery wording and never grants a customer session", async () => {
    await deliverOwnSiteCode(email, "000012", "password-recovery");
    const message = transport.sendMail.mock.calls[0][0];
    expect(message.subject).toBe("H2 Colombiano - Recuperação de senha");
    expect(message.text).toBe("Código para recuperar a senha do H2 Colombiano: 000012\n\nEste código vale por 10 minutos e pode ser usado uma única vez para alterar sua senha. Não concede acesso nem libera serviços.\n\nSe não solicitou, ignore este e-mail.");
    expect(message.html).toContain("Este código não libera serviços nem autoriza acessos.");
    expect(message.html).not.toContain("duração definida pelo administrador");
    expect(fetch).not.toHaveBeenCalled();
  });
});
