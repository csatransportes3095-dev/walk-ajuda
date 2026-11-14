import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const access = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");
const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");
const incoming = readFileSync(new URL("./h2-auto-incoming-otp.ts", import.meta.url), "utf8");

describe("H2 login OTP channel-specific 60-second cooldown", () => {
  it("locks email and WhatsApp separately on the server, retaining a single current code", () => {
    expect(access).toContain('digest("otp-resend:" + channel, phone)');
    expect(access).toContain("SELECT windowStart FROM customerOtpLimits");
    expect(access).toContain("WHERE limitKey=${channelKey} FOR UPDATE");
    expect(access).toContain("Math.ceil(");
    expect(access).toContain("retryAfterSeconds > 0");
    expect(access).toContain("SET windowStart=${now},hits=hits+1");
    expect(access).toContain("resendBlocked:true");
    expect(access).toContain("if (channel === \"email\") await deliverOwnSiteCode(email,code)");
    expect(access).toContain('if (channel === "whatsapp" && newlyIssued)');
    expect(access).toContain("codeDigest=${codeHash}");
    expect(access).toContain("usedAt=NULL");
  });
  it("shows an independent countdown on each button and both resend choices", () => {
    expect(login).toContain('cooldownKey(phone: string, channel: OtpChannel)');
    expect(login).toContain('savedCooldown(cleanPhone,"email")');
    expect(login).toContain('savedCooldown(cleanPhone,"whatsapp")');
    expect(login).toContain("remainingEmail > 0");
    expect(login).toContain("remainingWhatsapp > 0");
    expect(login).toContain('String(remainingEmail).padStart(2,"0")');
    expect(login).toContain('String(remainingWhatsapp).padStart(2,"0")');
    expect(login).toContain('void send("email")');
    expect(login).toContain('void send("whatsapp")');
    expect(login).toContain("PEDIR OUTRO PELO WHATSAPP");
    expect(login).toContain("PEDIR OUTRO POR E-MAIL");
    expect(login).toContain("if (result.resendBlocked)");
    expect(login).toContain("if (channel === \"whatsapp\")");
    expect(login).toContain("bg-[#8B0000]");
    expect(login).toContain("bg-cyan-500");
  });
  it("does not issue a code on a cooldown request or permit an old code to be fetched", () => {
    expect(access.indexOf("if (!newlyIssued) return")).toBeLessThan(access.indexOf("await enqueueIncomingWhatsappOtp({"));
    expect(incoming).toContain("c.phoneKey=q.phone_key AND c.codeDigest=q.code_digest");
    expect(incoming).toContain("c.usedAt IS NULL");
    expect(incoming).toContain("q.sent_at IS NULL");
  });
});
