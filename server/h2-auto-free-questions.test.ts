import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {getH2AutoPersonalizedReply,h2AutoPersonalizationSchema} from "../shared/h2AutoPersonalization";
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
  it("mantém limites por resposta, mas não limita a quantidade por aparelho",()=>{
    expect(h2AutoPersonalizationSchema.safeParse({...cfg,faq:[{id:"faq_a",question:"Oi",answer:"Resposta"}]}).success).toBe(false);
    expect(h2AutoPersonalizationSchema.safeParse({...cfg,faq:Array.from({length:65},(_,i)=>({id:"faq_"+i,question:"Pergunta de teste",answer:"Resposta de teste",enabled:true}))}).success).toBe(true);
  });
  it("o ADM usa perguntas digitadas e permite adicionar e excluir",()=>{
    const ui=readFileSync("client/src/pages/AdminH2Auto.tsx","utf8");
    expect(ui).toContain("+ ADICIONAR PERGUNTA E RESPOSTA");
    expect(ui).toContain('placeholder="Digite uma pergunta como o cliente escreveria..."');
    expect(ui).not.toContain("H2_AUTO_PERSONALIZATION_EXAMPLES.map");
    expect(ui).toContain("personalization.faq.filter");
  });
});