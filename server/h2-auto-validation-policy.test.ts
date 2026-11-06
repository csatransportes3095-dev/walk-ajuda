import { describe, expect, it } from "vitest";
import { validH2AutoPhone11, normalizeH2AutoPhone11, allowsH2AutoMenuReset, invalidH2AutoPhoneStageAnswer, isH2AutoFreeTextDuringPhoneStage, isH2AutoGreeting, h2AutoNavigationCommand, initialH2AutoChoiceStage, repeatedH2AutoChoice, h2AutoNaturalNewCustomerIntent, h2AutoNaturalExistingCustomerIntent, h2AutoNaturalReferralsIntent, h2AutoGreetingWelcome } from "./h2-auto-validation-policy";

describe("H2 Auto strict 11-digit WhatsApp phone validation", () => {
  it("accepts mobile phone numbers with a two-digit DDD", () => {
    expect(validH2AutoPhone11("11987654321")).toBe(true);
    expect(validH2AutoPhone11("61991234567")).toBe(true);
  });
  it("rejects missing or excessive digits and nonnumeric answers", () => {
    for (const answer of ["", "11", "1198765432", "fone: 11987654321", "11987654321 21987654321", "MENU", "zero", "0", "abc123"]) {
      expect(validH2AutoPhone11(answer)).toBe(false);
    }
  });
  it("normalizes common formats in all three customer phone stages", () => {
    for(const phone of ["11 98765-4321","(11) 98765-4321","+55 (11) 98765-4321","55 11 98765-4321","0055 11 98765-4321","11.98765.4321"]) {
      expect(normalizeH2AutoPhone11(phone)).toBe("11987654321");
      for(const stage of ["customer_phone","referral_phone","referrals_phone"])
        expect(invalidH2AutoPhoneStageAnswer(stage,phone)).toBe(false);
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


describe("H2 AUTO: primeiras mensagens livres sem repetir menu",()=> {
  it("não confunde conta 99 com cadastro de novo cliente",()=>{
    expect(h2AutoNaturalNewCustomerIntent("Queria uma conta 99")).toBe(false);
    expect(h2AutoNaturalNewCustomerIntent("Está fazendo conta 99")).toBe(false);
  });
  it("reconhece saudações, inclusive com H2, sem abrir cadastro",()=>{
    for (const greeting of ["Bom dia", "Boa tarde", "Boa noite", "Boa tarde H2", "Oi H2"])
      expect(isH2AutoGreeting(greeting)).toBe(true);
    expect(h2AutoNaturalNewCustomerIntent("Boa tarde H2")).toBe(false);
  });
  it.each([
    "Quero acompanhar meu pedido",
    "Como posso acompanhar meu pedido?",
    "Quero consultar o meu pedido",
    "Qual status do meu pedido?",
    "Já sou cliente",
    "Já tenho cadastro",
  ])("solicita telefone do cliente antes de consultar: %s",input=>{
    expect(h2AutoNaturalExistingCustomerIntent(input)).toBe(true);
    expect(h2AutoNaturalReferralsIntent(input)).toBe(false);
  });
  it.each([
    "Quero ver minhas indicações",
    "Minhas indicações",
    "Quero consultar minhas comissões",
  ])("encaminha indicações para confirmação separada: %s",input=>{
    expect(h2AutoNaturalReferralsIntent(input)).toBe(true);
    expect(h2AutoNaturalExistingCustomerIntent(input)).toBe(false);
  });
  it.each([
    "Ainda não sou cliente","Quero criar uma conta","Fui indicado",
    "MENU","0","1","2","3","119978307371","123456",
    "/H2","/H3","Quanto custa o Uber?","Qual o valor do táxi?",
  ])("não atribui indevidamente identidade de cliente: %s",input=>{
    expect(h2AutoNaturalExistingCustomerIntent(input)).toBe(false);
    expect(h2AutoNaturalReferralsIntent(input)).toBe(false);
  });
  it("saudação usa o texto atual do ADM sem inventar outra árvore",()=>{
    const current = "MENU DO ADM";
    expect(h2AutoGreetingWelcome("Boa noite",current)).toContain("Boa noite!");
    expect(h2AutoGreetingWelcome("Boa noite",current)).toContain("Como posso ajudar?");
    expect(h2AutoGreetingWelcome("Boa noite",current)).not.toContain(current);
    expect(h2AutoGreetingWelcome("Boa noite",current)).toContain("*MENU*");
    expect(h2AutoGreetingWelcome("Quero acompanhar meu pedido",current)).toBe(current);
  });
  it("repetir pedido ao informar telefone não conta como número inválido",()=>{
    expect(repeatedH2AutoChoice("customer_phone","Quero acompanhar meu pedido")).toBe(true);
    expect(repeatedH2AutoChoice("referrals_phone","Quero minhas indicações")).toBe(true);
    expect(repeatedH2AutoChoice("referral_phone","Quero acompanhar meu pedido")).toBe(false);
    expect(repeatedH2AutoChoice("customer_code","Quero acompanhar meu pedido")).toBe(false);
    expect(repeatedH2AutoChoice("blocked","Quero acompanhar meu pedido")).toBe(false);
  });
});

describe("H2 AUTO: texto livre durante pedido de telefone",()=>{
  it("não transforma pergunta em tentativa de indicador",()=>{
    for (const stage of ["customer_phone","referrals_phone","referral_phone"])
      expect(isH2AutoFreeTextDuringPhoneStage(stage,"Teria como fazer conta 99?")).toBe(true);
    expect(isH2AutoFreeTextDuringPhoneStage("referral_phone","11993425306")).toBe(false);
  });
});
