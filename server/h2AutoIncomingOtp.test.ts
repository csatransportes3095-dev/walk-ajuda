import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("./h2-auto-incoming-otp.ts", import.meta.url), "utf8");
const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");
const access = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

describe("Customer-initiated WhatsApp OTP", () => {
  it("only releases a challenge for a matching authenticated incoming sender", () => {
    expect(server).toContain('"/api/h2-auto/otp/incoming"');
    expect(server).toContain("await authorizedOtpDevice(req)");
    expect(server).toContain("q.recipient_key=${recipientKey}");
    expect(server).toContain("c.phoneKey=q.phone_key AND c.codeDigest=q.code_digest");
    expect(server).toContain("c.usedAt IS NULL");
    expect(server).toContain("q.sent_at IS NULL");
    expect(server).toContain("c.attempts<5");
    expect(server).toContain("payload_encrypted");
    expect(server).toContain("otp/incoming");
    expect(server).toContain('const handoffState=String(req.body?.handoffState||"legacy_android_action_accepted")');
    expect(server).toContain("deliveryConfirmed:false");
    expect(server).toContain("Legacy sent_at names the one-shot Android handoff");
    expect(routes).toContain("registerH2AutoIncomingOtpRoutes(app)");
  });
  it("does not send WhatsApp code when customer selects email", () => {
    expect(access).toContain('if (channel === "email") await deliverOwnSiteCode(email,code)');
    expect(access).toContain("else await enqueueIncomingWhatsappOtp(");
    expect(access).toMatch(/enqueueIncomingWhatsappOtp\([\s\S]*?\},\s*tx\)/);
    expect(login).toContain('channel}');
  });
  it("does not pretend opening WhatsApp is proof of delivery", () => {
    expect(login).toContain("Toque em Enviar na mensagem preenchida no WhatsApp.");
    expect(login).toContain("após receber a mensagem");
    expect(login).toContain("ABRIR WHATSAPP E ENVIAR MENSAGEM");
    expect(login).toContain("Preciso receber meu código");
    expect(login).toContain("RECEBER POR E-MAIL");
    expect(login).toContain("RECEBER PELO WHATSAPP");
  });
});
