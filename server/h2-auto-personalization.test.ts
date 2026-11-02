import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  H2_AUTO_PERSONALIZATION_DEFAULT, classifyH2AutoPersonalizedQuestion,
  getH2AutoPersonalizedReply, h2AutoPersonalizationSchema,
} from "../shared/h2AutoPersonalization";

const access=readFileSync("server/h2-auto-access.ts","utf8");
const remote=readFileSync("server/h2-auto-remote.ts","utf8");

describe("H2 AUTO: respostas personalizadas com segurança", () => {
  it("vem desligado e não faz chamadas pagas", () => {
    expect(H2_AUTO_PERSONALIZATION_DEFAULT.enabled).toBe(false);
    expect(getH2AutoPersonalizedReply("Quero ver meu pedido")).toBeNull();
    expect(h2AutoPersonalizationSchema.parse({}).enabled).toBe(false);
    expect(remote).not.toContain("invokeLLM(");
  });
  it.each([
    ["Não recebi meu código", "codigo"],
    ["Quero acompanhar meu pedido", "acompanhar"],
    ["Quanto custa Uber carro?", "valores"],
    ["Como vejo minhas indicações?", "indicacoes"],
    ["Preciso agendar minha foto", "foto"],
    ["Quero falar com atendente", "atendimento"],
    ["Quero fazer pedido", "novo_pedido"],
    ["Preciso de ajuda", "ajuda"],
  ] as const)("interpreta pergunta pública %s", (input, expected) => {
    expect(classifyH2AutoPersonalizedQuestion(input)).toBe(expected);
  });
  it("não interpreta mensagens numéricas nem comandos protegidos", () => {
    for(const text of ["MENU", "0", "2", "/H2", "/h3", "11999999999", "123456", "000.000.000-00", "https://site.com", "cliente@site.com"])
      expect(classifyH2AutoPersonalizedQuestion(text)).toBeNull();
  });
  it("não usa nome antes de identidade confirmada e não inventa status", () => {
    const cfg={enabled:true,tone:"acolhedor" as const,verifiedName:true};
    const before=getH2AutoPersonalizedReply("Onde está meu pedido?",cfg,{verified:false,verifiedFirstName:"EMERSON"});
    const after=getH2AutoPersonalizedReply("Onde está meu pedido?",cfg,{verified:true,verifiedFirstName:"EMERSON APARECIDO"});
    expect(before?.message).not.toContain("EMERSON");
    expect(after?.message).toContain("EMERSON");
    expect(after?.message).toContain("exige a confirmação");
    expect(after?.message).not.toContain("Pedido entregue");
  });
  it("preserva a árvore, OTP, MENU/0, bloqueios e isolamento da configuração", () => {
    expect(access).toContain("if (blockedPhones.length");
    expect(access).toContain("if (s?.stage === \"blocked\")");
    expect(access).toContain("const navigation = h2AutoNavigationCommand(input)");
    expect(access).toContain("if (s.stage === \"customer_code\"");
    expect(access).toContain("await sendH2AutoOrderCode");
    expect(remote).toContain("savePersonalization: adminProcedure");
    expect(remote).toContain("'$.personalization'");
    expect(remote).toContain("personalization: h2AutoPersonalizationSchema.default(");
  });
  it("limita conteúdo e aceita somente configurações conhecidas", () => {
    expect(classifyH2AutoPersonalizedQuestion("a".repeat(300))).toBeNull();
    expect(h2AutoPersonalizationSchema.safeParse({enabled:true,tone:"livre",verifiedName:true}).success).toBe(false);
    expect(h2AutoPersonalizationSchema.safeParse({enabled:true,tone:"objetivo",verifiedName:true,apiKey:"nunca"}).success).toBe(false);
  });
});
