import { describe, expect, it } from "vitest";
import { validH2AutoPhone11, allowsH2AutoMenuReset, invalidH2AutoPhoneStageAnswer } from "./h2-auto-validation-policy";

describe("H2 Auto strict 11-digit WhatsApp phone validation", () => {
  it("accepts mobile phone numbers with a two-digit DDD", () => {
    expect(validH2AutoPhone11("11987654321")).toBe(true);
    expect(validH2AutoPhone11("61991234567")).toBe(true);
  });
  it("rejects missing or excessive digits and nonnumeric answers", () => {
    for (const answer of ["", "11", "1198765432", "5511987654321",
      "+5511987654321", "(11) 98765-4321", "MENU", "zero", "0", "abc123"]) {
      expect(validH2AutoPhone11(answer)).toBe(false);
    }
  });
  it("rejects invalid DDD format, landlines and repeating placeholders", () => {
    for (const answer of ["00987654321", "10987654321",
      "11387654321", "99999999999"]) {
      expect(validH2AutoPhone11(answer)).toBe(false);
    }
  });
});

describe("H2 Auto phone challenge cannot be bypassed", () => {
  for (const stage of ["customer_phone", "referral_phone"]) {
    it(stage + " rejects MENU, 0, 6, and text", () => {
      for (const text of ["MENU", "inicio", "0", "6", "voltar", "não tenho"]) {
        expect(invalidH2AutoPhoneStageAnswer(stage, text)).toBe(true);
        expect(allowsH2AutoMenuReset(stage, text)).toBe(false);
      }
      expect(invalidH2AutoPhoneStageAnswer(stage, "11987654321")).toBe(false);
    });
  }
  it("keeps explicit MENU recovery only during verification-code stage", () => {
    expect(allowsH2AutoMenuReset("customer_code", "MENU")).toBe(true);
    expect(allowsH2AutoMenuReset("blocked", "MENU")).toBe(false);
    expect(allowsH2AutoMenuReset("customer", "MENU")).toBe(false);
  });
});
