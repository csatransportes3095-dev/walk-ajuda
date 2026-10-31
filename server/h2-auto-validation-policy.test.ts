import { describe, expect, it } from "vitest";
import { validH2AutoPhone11, allowsH2AutoMenuReset, invalidH2AutoPhoneStageAnswer, h2AutoNavigationCommand, initialH2AutoChoiceStage, repeatedH2AutoChoice } from "./h2-auto-validation-policy";

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
  for (const stage of ["customer_phone", "referral_phone", "referrals_phone"]) {
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


describe("MENU e 0 são comandos de navegação, não resposta de telefone", () => {
  it("MENU retorna ao início em qualquer etapa ainda não bloqueada", () => {
    for (const command of ["MENU", "menu", "Início", "inicio", "manu"])
      expect(h2AutoNavigationCommand(command)).toBe("home");
  });
  it("0 retorna à etapa anterior; outros textos não são navegação", () => {
    expect(h2AutoNavigationCommand("0")).toBe("back");
    expect(h2AutoNavigationCommand("voltar")).toBe("back");
    expect(h2AutoNavigationCommand("11987654321")).toBeNull();
    expect(h2AutoNavigationCommand("texto qualquer")).toBeNull();
  });
});

describe("H2 AUTO - escolha inicial e repetição",()=> {
  it("encaminha primeira escolha sem repetir menu",()=>{
    expect(initialH2AutoChoiceStage("2")).toBe("referral_phone");
    expect(initialH2AutoChoiceStage("1")).toBe("customer_phone");
    expect(initialH2AutoChoiceStage("3")).toBe("referrals_phone");
    expect(initialH2AutoChoiceStage("MENU")).toBeNull();
  });
  it("repetição de 2 não é telefone inválido nem liberação",()=>{
    expect(repeatedH2AutoChoice("referral_phone","2")).toBe(true);
    expect(repeatedH2AutoChoice("referral_phone","11993425306")).toBe(false);
    expect(repeatedH2AutoChoice("blocked","2")).toBe(false);
    expect(repeatedH2AutoChoice("customer_phone","1")).toBe(true);
    expect(repeatedH2AutoChoice("referrals_phone","3")).toBe(true);
  });
  it("indicador com 11 dígitos válidos não recebe erro de formato",()=>{
    const phone="11993425306";
    expect(validH2AutoPhone11(phone)).toBe(true);
    expect(invalidH2AutoPhoneStageAnswer("referral_phone",phone)).toBe(false);
    expect(repeatedH2AutoChoice("referral_phone",phone)).toBe(false);
  });
});
