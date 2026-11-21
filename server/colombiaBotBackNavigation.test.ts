import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureColombiaBotChoice } from "../client/src/lib/colombiaBotNavigation";

const source = readFileSync("client/src/components/ColombiaBot.tsx", "utf8");

describe("ColombiaBot: Voltar recupera a escolha anterior", () => {
  it("volta da opção Nome Aleatório para a lista de serviços sem tela vazia", () => {
    const services = [
      { id: "welcome", type: "bot" },
      { id: "service", type: "options", answered: false, options: ["UBER CARRO", "UBER MOTO"] },
    ];
    const snapshot = captureColombiaBotChoice(services, "service");
    expect(snapshot).not.toBeNull();
    services[1].answered = true;
    expect(snapshot?.[1].answered).toBe(false);
    expect(snapshot?.[1].options).toEqual(["UBER CARRO", "UBER MOTO"]);
  });

  it("volta de um plano de garantia para o card da opção original", () => {
    const messages = [
      { id: "description", type: "bot", answered: false },
      { id: "chooseName", type: "storefront-options", answered: false, options: ["NOME ALEATÓRIO", "PRIMEIRO NOME"] },
      { id: "chooseWarranty", type: "storefront-guarantees", answered: false },
    ];
    const snap = captureColombiaBotChoice(messages, "chooseName");
    expect(snap?.find(m => m.id === "chooseName")?.answered).toBe(false);
    expect(captureColombiaBotChoice(messages, "chooseWarranty")?.at(-1)?.answered).toBe(false);
    expect(captureColombiaBotChoice(messages, "missing")).toBeNull();
    messages[1].answered = true;
    expect(captureColombiaBotChoice(messages, "chooseName")).toBeNull();
  });

  it("registra o checkpoint dentro do clique e não antes de criar as opções", () => {
    expect(source).not.toContain("saveSnapshot()");
    expect(source).toContain("const checkpoint = captureColombiaBotChoice(messages, messageId)");
    expect(source).toContain("history.current.push({");
    expect(source).toContain("handleChoice(msg.id, opt)");
    expect(source).toContain("handleChoice(msg.id, String(option.id))");
    expect(source).toContain("handleChoice(msg.id, String(model.id))");
    expect(source).toContain("cancelPendingAdvances();");
    expect(source).toContain("setMessages(snap.messages)");
    expect(source).toContain("callbacks.current = snap.callbacks");
  });

  it("não altera o motor de produtos, pagamento e envio", () => {
    expect(source).toContain("String(item.id) === optionId");
    expect(source).toContain("String(item.id) === modelId");
    expect(source).toContain("uploadOrderFileReliably");
    expect(source).toContain("submitMutation.mutateAsync");
    expect(source).toContain("isPersistedOrderResult");
  });
});
