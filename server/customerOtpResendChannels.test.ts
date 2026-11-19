import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const access = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");
const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");
const incoming = readFileSync(new URL("./h2-auto-incoming-otp.ts", import.meta.url), "utf8");

// Behavior, concurrency and rollback are exercised against real MySQL in
// customerOtpDeliveryMysql.test.ts. These retain the migration wiring checks.
describe("H2 login OTP cooldown migration wiring", () => {
  it("locks email and WhatsApp separately on the server, retaining a single current code", () => {
    expect(access).toContain('digest("otp-resend:" + channel, phone)');
    expect(access).toContain("SELECT windowStart FROM customerOtpLimits");
    expect(access).toContain("WHERE limitKey=${channelKey} FOR UPDATE");
    expect(access).toContain("Math.ceil(");
    expect(access).toContain('state:"channel_cooldown"');
    expect(access).toContain("SET windowStart=${now},hits=hits+1");
    expect(access).toContain("resendBlocked:true");
    expect(access).toContain('if (channel === "email") await deliverOwnSiteCode(email,code,"customer-login")');
    expect(access).toContain("await ensureIncomingWhatsappOtpQueue(db)");
    expect(access).toMatch(/enqueueIncomingWhatsappOtp\([\s\S]*?\},\s*tx\)/);
    expect(access).toContain("codeDigest=${codeHash}");
    expect(access).toContain("usedAt=NULL");
  });
  it("shows an independent countdown on each button and both resend choices", () => {
    expect(login).toContain('cooldownKey(phone: string, channel: OtpChannel)');
    expect(login).toContain('savedCooldown(cleanPhone,"email")');
    expect(login).toContain('savedCooldown(cleanPhone,"whatsapp")');
    expect(login).toContain("remainingEmail > 0");
    expect(login).toContain("remainingWhatsapp > 0");
    expect(login).toContain("formatOtpCooldown(remainingEmail)");
    expect(login).toContain("formatOtpCooldown(remainingWhatsapp)");
    expect(login).toContain('if (scope === "all")');
    expect(login).toContain("result.cooldownScope");
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
    const issuing = access.slice(access.indexOf("export async function requestCustomerCode"), access.indexOf("export async function verifyCustomerCode"));
    expect(issuing.indexOf('return {state:"channel_cooldown"')).toBeLessThan(issuing.indexOf("const code = generateOwnSiteCode()"));
    expect(issuing.indexOf("await ensureIncomingWhatsappOtpQueue(db)")).toBeLessThan(issuing.indexOf("db.transaction("));
    expect(issuing).toMatch(/enqueueIncomingWhatsappOtp\([\s\S]*?\},\s*tx\)/);
    expect(incoming).toContain("c.phoneKey=q.phone_key AND c.codeDigest=q.code_digest");
    expect(incoming).toContain("c.usedAt IS NULL");
    expect(incoming).toContain("q.sent_at IS NULL");
  });
});
