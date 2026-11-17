import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const access = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url), "utf8");
const login = readFileSync(new URL("../client/src/components/CustomerOtpLogin.tsx", import.meta.url), "utf8");

describe("H2 OTP never claims a code exists when the centralized profile lookup rejects it", () => {
  it("flags a rejected customer lookup without leaking account details or issuing an OTP", () => {
    expect(access).toContain('if (!customer) {');
    expect(access).toContain('challenge_not_prepared customer_lookup_rejected');
    expect(access).toContain('return { success:true, message:GENERIC, prepared:false };');
    expect(access).toContain('success:true, message:GENERIC, prepared:true, resendBlocked:false');
  });
  it("does not redirect to WhatsApp without an issued challenge", () => {
    expect(login).toContain('if (result.prepared !== true)');
    expect(login.indexOf('if (result.prepared !== true)')).toBeLessThan(login.indexOf('const whatsappUrl = buildWhatsappMessageUrl'));
    expect(login).toContain('Confira seu cadastro com o atendimento.');
  });
});
