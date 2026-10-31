import { describe, expect, it } from "vitest";
import { H2_AUTO_TREE_DEFAULT, h2AutoTreeSchema } from "../shared/h2AutoTree";
import { H2_AUTO_CONFIRMATION_DEFAULTS, h2AutoConfirmationSchema } from "../shared/h2AutoConfirmation";
import {
  applyH2AutoShortCopy,
  compactH2AutoFreeform,
  H2_AUTO_SHORT_MEDIA,
  H2_AUTO_SHORT_CONFIRMATION,
} from "../shared/h2AutoShortReplies";

function example() {
  const tree=structuredClone(H2_AUTO_TREE_DEFAULT);
  const order=tree.nodes.find(n=>n.id==="pedido_novo")!;
  order.text += "\nhttps://example.org/link?cliente=1\n{nome}";
  return {
    tree,
    confirmation: {...H2_AUTO_CONFIRMATION_DEFAULTS},
    media: {enabled:true,transcribeAudio:false,cooldownSeconds:60,maxAudioSeconds:30,
      ...H2_AUTO_SHORT_MEDIA},
    orderNoOrdersMessage:"Cadastro localizado com sucesso, mas não encontramos nenhum pedido associado a este cadastro no momento.",
    welcome:"Olá! Por favor, informe o que precisa.",
    menu:["1️⃣ Pedido","2️⃣ Status",...Array(7).fill("")],
    rules:[{trigger:"MENU",mode:"exact",enabled:true,
      reply:"Sua solicitação foi encaminhada para nossa equipe. Digite MENU para voltar ao início."}],
    blocked:"11988887777",
    pauseMinutes:60,
    ordersEnabled:true,
    identificationEnabled:true,
  };
}

describe("H2 AUTO — mensagens curtas em todos os grupos",()=>{
  it("mantém todos os campos de confirmação válidos e números obrigatórios",()=>{
    expect(h2AutoConfirmationSchema.safeParse(H2_AUTO_SHORT_CONFIRMATION).success).toBe(true);
    expect(H2_AUTO_SHORT_CONFIRMATION.identificationWelcome).toContain("1️⃣");
    expect(H2_AUTO_SHORT_CONFIRMATION.identificationWelcome).toContain("2️⃣");
    expect(H2_AUTO_SHORT_CONFIRMATION.identificationWelcome).toContain("3️⃣");
    expect(H2_AUTO_SHORT_CONFIRMATION.codeSent).toContain("10 minutos");
    expect(H2_AUTO_SHORT_CONFIRMATION.existingCustomerPrompt).toContain("11 números");
    expect(H2_AUTO_SHORT_CONFIRMATION.newCustomerPrompt).toContain("indicador");
  });

  it("preserva permissões, opções, links, variáveis, gatilhos e configurações de aparelho",()=>{
    const config=example();
    const changed=applyH2AutoShortCopy(config);
    expect(h2AutoTreeSchema.safeParse(changed.tree).success).toBe(true);
    expect(changed.tree.nodes.map(n=>({id:n.id,mode:n.mode,options:n.options})))
      .toEqual(config.tree.nodes.map(n=>({id:n.id,mode:n.mode,options:n.options})));
    expect(changed.tree.start).toBe(config.tree.start);
    expect(changed.tree.enabled).toBe(config.tree.enabled);
    expect(changed.blocked).toBe(config.blocked);
    expect(changed.pauseMinutes).toBe(config.pauseMinutes);
    expect(changed.ordersEnabled).toBe(config.ordersEnabled);
    expect(changed.media.enabled).toBe(config.media.enabled);
    expect(changed.rules[0].trigger).toBe("MENU");
    expect(changed.rules[0].mode).toBe("exact");
    expect(changed.rules[0].enabled).toBe(true);
    expect(changed.menu[0]).toContain("1️⃣");
    expect(changed.tree.nodes.find(n=>n.id==="pedido_novo")?.text).toContain("https://example.org/link?cliente=1");
    expect(changed.tree.nodes.find(n=>n.id==="pedido_novo")?.text).toContain("{nome}");
    expect(changed.tree.nodes.find(n=>n.id==="pedido_novo")?.text).toContain("\n");
  });

  it("encurta frases de rotina sem alterar texto crítico desconhecido",()=>{
    expect(compactH2AutoFreeform("Sua solicitação foi encaminhada para nossa equipe. Digite MENU para voltar ao início."))
      .toContain("Solicitação encaminhada");
    const source="Cliente {nome} — R$ 350,00\nhttps://h2colombiano.com/pedidos";
    expect(compactH2AutoFreeform(source)).toBe(source);
  });
});
