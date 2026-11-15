import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {
  H2_AUTO_UNKNOWN_REPLY_DEFAULT,
  renderH2AutoUnknownReply,
  isH2AutoUnknownTextEligible,
  matchesH2AutoLocalReply,
} from "../shared/h2AutoUnknownReply";

const remote=readFileSync("server/h2-auto-remote.ts","utf8");
const access=readFileSync("server/h2-auto-access.ts","utf8");
const adm=readFileSync("client/src/pages/AdminH2Auto.tsx","utf8");

describe("H2 AUTO: resposta sem regra editável pelo ADM",()=>{
  it("conserva integralmente o texto aprovado pelo operador",()=>{
    expect(H2_AUTO_UNKNOWN_REPLY_DEFAULT).toBe(
      "⚡ *H2 COLOMBIANO* 🇨🇴\n\n"+
      "🤖 Ainda não tenho uma resposta cadastrada para essa pergunta.\n\n"+
      "📝 Sua pergunta foi registrada para análise.\n\n"+
      "💬 Pode enviar outra pergunta. Continuamos por aqui."
    );
    expect(renderH2AutoUnknownReply(H2_AUTO_UNKNOWN_REPLY_DEFAULT,true))
      .toBe(H2_AUTO_UNKNOWN_REPLY_DEFAULT);
  });
  it("não promete registro sem gravação confirmada",()=>{
    const text=renderH2AutoUnknownReply(H2_AUTO_UNKNOWN_REPLY_DEFAULT,false);
    expect(text).not.toContain("Sua pergunta foi registrada");
    expect(text).toContain("Ainda não tenho uma resposta cadastrada");
    expect(text).toContain("Pode enviar outra pergunta");
  });
  it("preserva comandos, OTP, telefones e dados sensíveis",()=>{
    for(const input of ["MENU","0","/H2","/H3","123456","11999999999","oi","bom dia",
       "usuario@gmail.com","https://h2colombiano.com/login"])
      expect(isH2AutoUnknownTextEligible(input)).toBe(false);
    for(const input of ["Quanto custa o serviço?","Preciso de mais informações","Tem atendimento aos domingos?"])
      expect(isH2AutoUnknownTextEligible(input)).toBe(true);
  });
  it("prioriza respostas cadastradas em modos exato e contém",()=>{
    const rules=[
      {trigger:"Qual o valor?, quanto custa",reply:"Resposta cadastrada",mode:"exact",enabled:true},
      {trigger:"prazo",reply:"Prazo configurado",mode:"contains",enabled:true},
      {trigger:"desativada",reply:"Ignore",mode:"contains",enabled:false},
    ];
    expect(matchesH2AutoLocalReply("Qual o valor?",rules)).toBe(true);
    expect(matchesH2AutoLocalReply("Quanto custa",rules)).toBe(true);
    expect(matchesH2AutoLocalReply("Qual o prazo da foto?",rules)).toBe(true);
    expect(matchesH2AutoLocalReply("A regra desativada",rules)).toBe(false);
    expect(matchesH2AutoLocalReply("Outra pergunta desconhecida",rules)).toBe(false);
  });
  it("edita exclusivamente a mensagem no ADM, respeitando revisão",()=>{
    expect(remote).toContain("saveUnknownReplyText: adminProcedure");
    expect(remote).toContain("'$.unknownReplyText'");
    expect(remote).toContain("revision=revision+1");
    expect(remote).toContain("expectedRevision");
    expect(remote).toContain("unknownReplyText: saved.unknownReplyText");
    expect(adm).toContain("SALVAR MENSAGEM AUTOMÁTICA");
    expect(adm).toContain("saveUnknownReplyText.useMutation");
  });
  it("não intercepta FAQ aprovada, regras locais ou falhas de autenticação",()=>{
    expect(access).toContain("const personalized = getH2AutoPersonalizedReply");
    expect(access).toContain("const fallback = await unansweredResponse()");
    expect(access).toContain("matchesH2AutoLocalReply(input, configuredLocalRules)");
    expect(access).toContain("if (questionCollectionEnabled && safeH2AutoUnknownQuestion(input))");
    expect(access).toContain("renderH2AutoUnknownReply(unknownReplyText, captured)");
    expect(access).toContain("if (blockedPhones.length");
    expect(access).toContain("if (s?.stage === \"blocked\")");
    expect(access).toContain("if (s.stage === \"customer_code\"");
  });
});
