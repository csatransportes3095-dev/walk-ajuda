import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { h2AutoNaturalNewCustomerIntent, initialH2AutoChoiceStage, h2AutoNavigationCommand } from "./h2-auto-validation-policy";

describe("H2 AUTO: cliente indicado falando naturalmente",()=>{
  it.each([
    "Foi indicado pelo amigo",
    "Fui indicado pelo meu amigo",
    "Indicou vc pra fazer uma conta",
    "Meu amigo me indicou",
    "Queria uma conta",
    "Quero criar uma conta",
    "Quero fazer meu cadastro",
    "Ainda nao sou cliente",
    "sou novo cliente",
  ])("leva frase de novo cliente ao telefone do indicador: %s",input=>{
    expect(h2AutoNaturalNewCustomerIntent(input)).toBe(true);
  });
  it.each([
    "Ja sou cliente","ja tenho cadastro","quero fazer login na minha conta",
    "Quero acompanhar meu pedido","Indiquei uma pessoa","Quero minhas indicacoes",
    "Quero consultar comissao","nao fui indicado por ninguem",
    "Nao tenho indicador","Meu cadastro incompleto","Quero cancelar minha conta",
    "meu codigo 123456","119978307371","MENU","0","2","/H2","/H3",
    "Como funciona a garantia?", "Qual o preco do Uber?"
  ])("nao confunde outros fluxos com um novo cliente: %s",input=>{
    expect(h2AutoNaturalNewCustomerIntent(input)).toBe(false);
  });
  it("preserva menu, telefone, codigo e indicador sem ativar atendimento automaticamente",()=>{
    const access=readFileSync("server/h2-auto-access.ts","utf8");
    expect(access).not.toContain('initialH2AutoChoiceStage(input) ??');
    expect(access).toContain('h2AutoNaturalNewCustomerIntent(input) ? "referral_phone" : null');
    expect(access).toContain('if (h2AutoNaturalNewCustomerIntent(input))');
    expect(access).toContain('repeatedH2AutoChoice(s.stage,input) || h2AutoNaturalNewCustomerIntent(input)');
    expect(access).toContain('resolveReferralDeclaration(');
    expect(access).toContain('if (s.stage === "customer_code"');
    expect(access).toContain('if (s?.stage === "blocked")');
    expect(initialH2AutoChoiceStage("2")).toBe("referral_phone");
    expect(h2AutoNavigationCommand("MENU")).toBe("home");
  });
});