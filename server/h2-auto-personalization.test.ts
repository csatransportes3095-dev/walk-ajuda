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
    const cfg=h2AutoPersonalizationSchema.parse({
      enabled:true,tone:"acolhedor",verifiedName:true,
      faq:[{id:"faq_pedido",question:"Onde está meu pedido?",variations:"",
        answer:"A consulta de um pedido exige a confirmação do cadastro.",enabled:true}],
    });
    const before=getH2AutoPersonalizedReply("Onde está meu pedido?",cfg,{verified:false,verifiedFirstName:"EMERSON"});
    const after=getH2AutoPersonalizedReply("Onde está meu pedido?",cfg,{verified:true,verifiedFirstName:"EMERSON APARECIDO"});
    expect(before?.message).not.toContain("EMERSON");
    expect(after?.message).toContain("EMERSON");
    expect(after?.message).toContain("exige a confirmação");
    expect(after?.message).not.toContain("Pedido entregue");
  });
  it.each([
    "Quero saber os valores", "Quanto custa Uber carro?", "Qual a garantia?",
    "Tem cocô?", "Quero falar com atendente",
  ])("sem FAQ aprovada não cria resposta fixa para: %s", (question) => {
    const config=h2AutoPersonalizationSchema.parse({enabled:true,faq:[]});
    expect(getH2AutoPersonalizedReply(question,config)).toBeNull();
  });
  it("não sugere menu de preços inexistente", () => {
    const source=readFileSync("shared/h2AutoPersonalization.ts","utf8");
    expect(source).not.toContain("PUBLIC_GUIDANCE");
    expect(source).not.toContain("escolha *Tabela de preço*");
    expect(access).toContain("const fallback = await unansweredResponse()");
    expect(access).toContain("recordH2AutoUnknownQuestion(deviceId, input)");
  });
  it("substitui a arvore e preserva OTP, MENU/0 e bloqueios", () => {
    expect(access).toContain("if (blockedPhones.length");
    expect(access).toContain("if (s?.stage === \"blocked\")");
    expect(access).toContain("const treeEnabled = false");
    expect(access).not.toContain("treeEnabled = live[0]?.tree_on !== \"false\"");
    expect(access).toContain('state:"tree_disabled",audience:"new_open",message:""');
    expect(access).not.toContain('state:"tree_disabled",audience:"new_open",message:initialMessage');
    expect(access).not.toContain('if (isMenu && !treeEnabled)');
    expect(access).toContain("if (h2AutoNaturalExistingCustomerIntent(input))");
    expect(access).toContain("const openingPersonalization = getH2AutoPersonalizedReply");
    expect(access).not.toContain('state:"personalized"');
    expect(access).not.toContain('state: "personalized"');
    expect(access).toContain("const navigation = h2AutoNavigationCommand(input)");
    expect(access).toContain("if (s.stage === \"customer_code\"");
    expect(access).toContain("await sendH2AutoOrderCode");
    expect(access).toContain('const fallback = await unansweredResponse()');
    expect(access).toContain('state:"choice",message:personalized.message');
    expect(access).toContain('recordH2AutoUnknownQuestion(deviceId, input)');
    expect(access).toContain('await enableLearningOnce(deviceId)');
    expect(access).toContain("h2_auto_learning_optin_20261105");
    expect(access).toContain('if (s?.stage === "blocked")');
    expect(access).toContain('const selectedInitialStage = initialH2AutoChoiceStage(input)');
    const personalizedSource=readFileSync("shared/h2AutoPersonalization.ts","utf8");
    expect(personalizedSource).toContain("Pode enviar outra pergunta. Continuamos por aqui.");
    expect(personalizedSource).not.toContain("🏠 *MENU* início | 🔙 *0* voltar");
    expect(remote).toContain("savePersonalization: adminProcedure");
    expect(remote).toContain("'$.personalization'");
    expect(remote).toContain("personalization: h2AutoPersonalizationSchema.default(");
  });
  it("mantém o modo Desktop de leitura sem pausar respostas nem mudar outros controles", () => {
    const admin = readFileSync("client/src/pages/AdminH2Auto.tsx", "utf8");
    const remote = readFileSync("server/h2-auto-remote.ts", "utf8");
    expect(admin).toContain("WHATSAPP DESKTOP — LER SEM PAUSAR O ROBÔ");
    expect(admin).toContain('key:"desktopReadOnly"');
    expect(remote).toContain("desktopReadOnly: z.boolean().default(true)");
    expect(remote).toContain("desktopReadOnly: true,");
    expect(remote).toContain("restoreH2AutoDesktopReadingOnce(db)");
    expect(remote).toContain("H2_AUTO_DESKTOP_RESTORE_CAMPAIGN");
    expect(remote).toContain("saveSafetySwitch: adminProcedure");
    expect(remote).toContain("config_json=JSON_SET(config_json,'$.desktopReadOnly'");
    expect(remote).toContain("JSON_UNQUOTE(JSON_EXTRACT(config_json,'$.tree.enabled'))");
  });
  it("Desktop e autenticação ficam juntos com prazos rápidos e vencimento real", () => {
    const admin = readFileSync("client/src/pages/AdminH2Auto.tsx", "utf8");
    const access = readFileSync("server/h2-auto-access.ts", "utf8");
    const remote = readFileSync("server/h2-auto-remote.ts", "utf8");
    expect(admin).toContain("DESKTOP + PRAZO DE AUTENTICAÇÃO");
    expect(admin).toContain("AUTENTICAÇÃO — QUANDO PEDIR NOVAMENTE");
    for (const hours of [1,6,12,24,72,168,720]) {
      expect(admin).toContain("hours:"+hours+",label:");
    }
    expect(admin).toContain("SALVAR TEMPO DE AUTENTICAÇÃO");
    expect(remote).toContain('hours:z.number().int().min(1).max(720)');
    expect(remote).toContain("'$.identificationSessionHours'");
    expect(access).toContain("Number(s.expires_at) > now");
    expect(access).toContain("configuredHours*hour");
    expect(access).toContain("expires_at=\u0024{now+accessLifetime}");
  });
  it("limita conteúdo e aceita somente configurações conhecidas", () => {
    expect(classifyH2AutoPersonalizedQuestion("a".repeat(300))).toBeNull();
    expect(h2AutoPersonalizationSchema.safeParse({enabled:true,tone:"livre",verifiedName:true}).success).toBe(false);
    expect(h2AutoPersonalizationSchema.safeParse({enabled:true,tone:"objetivo",verifiedName:true,apiKey:"nunca"}).success).toBe(false);
  });
});
