import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const access = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");
const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");
const incoming = readFileSync(new URL("./h2-auto-incoming-otp.ts", import.meta.url), "utf8");

// Behavior, concurrency and rollback are exercised against real MySQL in
// customerOtpDeliveryMysql.test.ts. These retain the migration wiring checks.
describe("H2 login OTP cooldown migration wiring", () => {
  it("locks both cooldown keys for one current code without duplicating sends", () => {
    expect(access).toContain('channel === "both" ? ["email", "whatsapp"] : [channel]');
    expect(access).toContain('WHERE limitKey=${key} FOR UPDATE');
    expect(access).toContain('state:"channel_cooldown"');
    expect(access).toContain('if (channel !== "whatsapp") await deliverOwnSiteCode(email,code,"customer-login")');
    expect(access).toContain("await ensureIncomingWhatsappOtpQueue(db)");
    expect(access).toMatch(/enqueueIncomingWhatsappOtp\([\s\S]*?\},\s*tx\)/);
    expect(access).toContain('whatsappPrepared = true');
    expect(access).toContain("codeDigest=${codeHash}");
    expect(access).toContain("usedAt=NULL");
  });
  it("uses one combined request and one shared resend countdown on the login", () => {
    expect(login).toContain('savedCooldown(cleanPhone,"email")');
    expect(login).toContain('savedCooldown(cleanPhone,"whatsapp")');
    expect(login).toContain('Math.max(remainingEmail, remainingWhatsapp)');
    expect(login).toContain('send("both")');
    expect(login).toContain('SOLICITAR NOVO CÓDIGO');
    expect(login).toContain('RECEBER CÓDIGO');
    expect(login).toContain('if (result.resendBlocked)');
    expect(login).toContain('if (scope === "all")');
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
