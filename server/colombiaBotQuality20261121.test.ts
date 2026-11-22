import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findBotBlockedChoice, getBotCheckoutTotals, sameBotProgressOwner } from "../client/src/lib/colombiaBotCheckout";

const bot = readFileSync("client/src/components/ColombiaBot.tsx", "utf8");
const backend = readFileSync("server/routers.ts", "utf8");
const home = readFileSync("client/src/pages/Home.tsx", "utf8");
const boot = readFileSync("scripts/render-start.sh", "utf8");

describe("ColombiaBot: checkout, ADM e experiencia segura", () => {
  it("mostra Pix com desconto uma vez, nunca acima do valor original", () => {
    expect(getBotCheckoutTotals("R$ 450,00", {type:"fixed", value:50}).total).toBe("R$ 400,00");
    expect(getBotCheckoutTotals("R$ 450,00", {type:"percentage", value:10}).total).toBe("R$ 405,00");
    expect(getBotCheckoutTotals("R$ 450,00", {type:"fixed", value:1000}).total).toBe("R$ 0,00");
    expect(getBotCheckoutTotals("R$ 450,00", null).discount).toBe("R$ 0,00");
    expect(bot).toContain("O servidor recalcula o cupom uma única vez.");
    expect(bot).toContain("originalPrice: getModelPrice(");
    expect(backend).toContain("if (input.botSubmissionKey) {");
    expect(backend).toContain("officialBase = parseMoney(botCatalogPrice);");
  });

  it("bloqueia somente resposta configurada da pergunta exata", () => {
    const question = {id:23,question:"Aceita as regras?",options:JSON.stringify([{label:"SIM"},{label:"NÃO",blocking:true}])};
    expect(findBotBlockedChoice(question,"NÃO",null)?.answer).toBe("NÃO");
    expect(findBotBlockedChoice(question,"SIM",null)).toBe(null);
    const rule = JSON.stringify([{enabled:true,questionId:23,answer:"SIM",title:"Atenção"}]);
    expect(findBotBlockedChoice(question,"Sim",rule)?.title).toBe("Atenção");
    expect(findBotBlockedChoice({...question,id:24},"SIM",rule)).toBe(null);
    expect(bot).toContain("findBotBlockedChoice(nextQ, val");
    expect(backend).toContain("Uma resposta não permite continuar com este pedido.");
  });

  it("rascunho pertence somente ao telefone confirmado", () => {
    expect(sameBotProgressOwner("11987654321","(11) 98765-4321")).toBe(true);
    expect(sameBotProgressOwner("11987654321","11987654322")).toBe(false);
    expect(sameBotProgressOwner("","11987654321")).toBe(false);
    expect(bot).toContain("sameBotProgressOwner(saved.clientPhone, clientPhone)");
  });

  it("solicita manifesto em planos com ou sem modelo de preço", () => {
    expect(bot).toContain("requestProductManifest([`option_manifest_${option.id}`]");
    expect(bot).toContain("requestProductManifest([`price_model_manifest_${model.id}`");
  });

  it("nao apaga rascunho ao tentar voltar sem historico e permite corrigir erro de envio", () => {
    expect(bot).toContain("Rascunho preservado.");
    expect(bot).toContain("submittingRef.current");
    expect(bot).toContain("markActionDone(actionId);");
    expect(bot).toContain("setSendError(`Erro ao enviar pedido:");
  });

  it("respeita ativacao do bot pelo ADM em /bot", () => {
    expect(home).toContain("if (matchBot && botEnabled && products");
    expect(home).toContain("botEnabled && showColombiaBot && (");
  });
  it("prepara somente as duas tabelas do Bot antes de iniciar a API", () => {
    const migration = "run_boot_step \"db-migrate-colombiabot\" pnpm exec tsx scripts/apply-colombiabot-reliability-migration.ts";
    expect(boot).toContain(migration);
    expect(boot.indexOf(migration)).toBeLessThan(boot.indexOf('exec node dist/index.js'));
  });

});
