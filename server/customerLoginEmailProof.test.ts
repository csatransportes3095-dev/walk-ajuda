import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueLoginEmailProof, assertLoginEmailProof } from "./customerLoginEmailProof";

const PHONE = "11987654321";
const EMAIL = "cliente@example.test";

describe("signed customer login email verification", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "site-test-only-very-long-secret-01234567890123456789");
    vi.useRealTimers();
  });

  it("survives independent calls and binds the exact phone and email", () => {
    const proof = issueLoginEmailProof(PHONE, EMAIL.toUpperCase());
    expect(assertLoginEmailProof(PHONE, proof)).toMatchObject({ phone: PHONE, email: EMAIL });
    expect(() => assertLoginEmailProof("11900000000", proof)).toThrow();
  });

  it("rejects tampering and expired email proofs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T02:50:00.000Z"));
    const proof = issueLoginEmailProof(PHONE, EMAIL);
    const parts = proof.split(".");
    expect(() => assertLoginEmailProof(PHONE, [parts[0], parts[1], "0".repeat(64)].join("."))).toThrow();
    vi.advanceTimersByTime(20 * 60 * 1000 + 1);
    expect(() => assertLoginEmailProof(PHONE, proof)).toThrow();
    vi.useRealTimers();
  });

  it("rejects missing signing secret instead of creating bypass", () => {
    vi.stubEnv("JWT_SECRET", "");
    expect(() => issueLoginEmailProof(PHONE, EMAIL)).toThrow();
  });
});
