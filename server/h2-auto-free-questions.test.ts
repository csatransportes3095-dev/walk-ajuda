import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {getH2AutoPersonalizedReply,h2AutoPersonalizationSchema} from "../shared/h2AutoPersonalization";
import {safeH2AutoUnknownQuestion} from "./h2-auto-learning";
const cfg=h2AutoPersonalizationSchema.parse({enabled:true,tone:"profissional",faq:[
  {id:"pergunta_a",question:"Qual é o prazo para agendar foto?",variations:"Quanto demora o agendamento?\nPrazo para agendar foto",answer:"Confira o agendamento no seu pedido.",enabled:true},
  {id:"pergunta_b",question:"Como entrar no cadastro?",variations:"Como faço cadastro?",answer:"Acesse o cadastro pelo menu.",enabled:true}
]});
describe("H2 AUTO: perguntas livres sem opções",()=>{
  it("responde frase exata e alternativa cadastrada",()=>{
    expect(getH2AutoPersonalizedReply("Qual é o prazo para agendar foto?",cfg)?.message).toContain("Confira o agendamento");
    expect(getH2AutoPersonalizedReply("Prazo para agendar foto",cfg)?.topic).toBe("personalizada");
  });
  it("não captura código, telefone, MENU, 0 ou comandos de pausa",()=>{
    for(const x of ["123456","11999999999","MENU","0","/H2","/h3"])
      expect(getH2AutoPersonalizedReply(x,cfg)).toBeNull();
  });
  it("mantém desativação e perguntas desconhecidas no fluxo atual",()=>{
    expect(getH2AutoPersonalizedReply("Qual é o prazo para agendar foto?",{...cfg,enabled:false})).toBeNull();
    expect(getH2AutoPersonalizedReply("zzzz qqqq xxxx",cfg)).toBeNull();
  });
  it("rejeita respostas invalidas e permite crescimento da base por aparelho",()=>{
    expect(h2AutoPersonalizationSchema.safeParse({...cfg,faq:[{id:"faq_a",question:"Oi",answer:"Resposta"}]}).success).toBe(false);
    expect(h2AutoPersonalizationSchema.safeParse({...cfg,faq:Array.from({length:41},(_,i)=>({id:"faq_"+i,question:"Pergunta de teste",answer:"Resposta de teste",enabled:true}))}).success).toBe(true);
  });
  it("aceita e preserva as 1.000 subperguntas por pergunta principal",()=>{
    const lines=Array.from({length:1000},(_,i)=>"Como acesso minha conta na opcao "+i+"?");
    const variations=lines.join("\n");
    const config=h2AutoPersonalizationSchema.parse({
      enabled:true,
      faq:[{id:"login_site",question:"Como faço login no site?",variations,
        answer:"Informe seu telefone e confirme pelo e-mail.",enabled:true}],
    });
    expect(config.faq[0].variations.split(/\r?\n/)).toHaveLength(1000);
    expect(getH2AutoPersonalizedReply(lines[999],config)?.message).toContain("Informe seu telefone");
    const excess=[...lines,"A pergunta 1001 deve ser rejeitada"].join("\n");
    expect(h2AutoPersonalizationSchema.safeParse({...config,faq:[{...config.faq[0],variations:excess}]}).success).toBe(false);
  });
  it("reconhece subperguntas do serviço 99 mesmo com palavras adicionais",()=>{
    const config=h2AutoPersonalizationSchema.parse({
      enabled:true,
      faq:[
        {id:"conta_99",question:"Faz conta 99?",variations:"Faz conta 99?\nVocês trabalham com conta 99?",
          answer:"Atendemos solicitações 99 conforme disponibilidade.",enabled:true},
        {id:"conta_uber",question:"Faz conta Uber?",variations:"Vocês fazem Uber?",
          answer:"Atendemos solicitações Uber conforme disponibilidade.",enabled:true},
      ],
    });
    expect(getH2AutoPersonalizedReply("Quero saber se faz conta 99",config)?.message)
      .toContain("solicitações 99");
    expect(getH2AutoPersonalizedReply("Faz conta 99?",config)?.message)
      .toContain("solicitações 99");
    expect(getH2AutoPersonalizedReply("Faz conta Uber?",config)?.message)
      .toContain("solicitações Uber");
    expect(getH2AutoPersonalizedReply("Quero uma conta",config)).toBeNull();
    expect(getH2AutoPersonalizedReply("11999999999",config)).toBeNull();
  });
  it("registra dúvidas sem resposta com 99 sem capturar dados pessoais",()=>{
    for(const input of ["Faz 99", "Faz conta 99?", "Quero saber se faz conta 99"])
      expect(safeH2AutoUnknownQuestion(input)).not.toBeNull();
    for(const input of ["11999999999", "Qual código 123456?", "Meu CPF 12345678901 faz 99?",
      "Meu telefone 11999999999 faz conta 99?", "Meu e-mail email@example.com faz 99?"])
      expect(safeH2AutoUnknownQuestion(input)).toBeNull();
  });
  it("o ADM usa contador e limite de 1000 linhas, sem corte em 600 caracteres",()=>{
    const ui=readFileSync("client/src/pages/AdminH2Auto.tsx","utf8");
    const api=readFileSync("server/h2-auto-remote.ts","utf8");
    expect(ui).toContain("H2_AUTO_FAQ_MAX_VARIATION_LINES");
    expect(ui).toContain("H2_AUTO_FAQ_MAX_VARIATION_CHARS");
    expect(ui).not.toContain('maxLength={600} placeholder="Outras formas de perguntar');
    expect(api).toContain('variations:h2AutoFaqVariationsSchema.default("")');
  });
  it("o ADM usa perguntas digitadas e permite adicionar e excluir",()=>{
    const ui=readFileSync("client/src/pages/AdminH2Auto.tsx","utf8");
    expect(ui).toContain("+ ADICIONAR PERGUNTA E RESPOSTA");
    expect(ui).toContain('placeholder="Digite uma pergunta como o cliente escreveria..."');
    expect(ui).not.toContain("H2_AUTO_PERSONALIZATION_EXAMPLES.map");
    expect(ui).toContain("personalization.faq.filter");
  });
});