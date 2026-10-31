import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { generateOwnSiteCode } from "./siteAccessOwnCodes";
import { validSiteCode } from "../shared/siteAccessCodePolicy";
import {
  CUSTOMER_CODE_MS,
  CUSTOMER_SESSION_MS,
  requireOtpMigrationEnabled,
  requestCustomerCode,
  verifyCustomerCode,
  redeemNewRegistrationProof,
} from "./customerOtpAccess";

afterEach(() => vi.unstubAllEnvs());

describe("draft passwordless customer authentication stays closed until full migration", () => {
  it("uses the existing H2 six-digit generator and mail delivery, not a duplicate RNG", () => {
    const code = generateOwnSiteCode();
    expect(validSiteCode(code)).toBe(true);
    const source = readFileSync(new URL("./customerOtpAccess.ts", import.meta.url),"utf8");
    expect(source).toContain("const code = generateOwnSiteCode()");
    expect(source).toContain("await deliverOwnSiteCode(email,code)");
    expect(source).not.toContain("randomInt(");
  });

  it("does not allow OTP routes in production by default", async () => {
    vi.stubEnv("H2_CUSTOMER_OTP_V2_ENABLED", "");
    expect(() => requireOtpMigrationEnabled()).toThrow(/ainda não está disponível/);
    const req = { ip: "127.0.0.1" } as any;
    await expect(requestCustomerCode("11987654321", req)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    await expect(verifyCustomerCode("11987654321", "012345")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
    await expect(redeemNewRegistrationProof("11987654321", "invalid")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("allows feature flag only when explicitly enabled", () => {
    vi.stubEnv("H2_CUSTOMER_OTP_V2_ENABLED", "1");
    expect(() => requireOtpMigrationEnabled()).toThrow();
    vi.stubEnv("H2_CUSTOMER_OTP_V2_ENABLED", "true");
    expect(() => requireOtpMigrationEnabled()).not.toThrow();
  });

  it("uses 10-minute single-use email code and 24-hour bound session", () => {
    expect(CUSTOMER_CODE_MS).toBe(10 * 60 * 1000);
    expect(CUSTOMER_SESSION_MS).toBe(24 * 60 * 60 * 1000);
  });
});
