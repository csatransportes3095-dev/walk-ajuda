import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchExactBlockingOption, readBotQuestionId } from "../client/src/lib/questionBlockingMatch";

const guard = readFileSync("client/src/components/QuestionBlockingManifestGuard.tsx", "utf8");
const bot = readFileSync("client/src/components/ColombiaBot.tsx", "utf8");

describe("Manifesto: escopo correto de perguntas e cupom", () => {
  it("NÃO TENHO CUPOM jamais coincide com NÃO, inclusive com opções acentuadas", () => {
    const options = [{label:"SIM"}, {label:"NÃO", blocking:true}];
    expect(matchExactBlockingOption("NÃO TENHO CUPOM",options)).toBeUndefined();
    expect(matchExactBlockingOption("Não",options)).toEqual(options[1]);
    expect(matchExactBlockingOption("NAO",options)).toEqual(options[1]);
    expect(matchExactBlockingOption("SIM",options)).toEqual(options[0]);
  });

  it("exige resposta exata em vez de correspondência pelo começo", () => {
    const options = [{label:"NÃO"}, {label:"SIM"}];
    expect(matchExactBlockingOption("NÃO TENHO CUPOM",options)).toBeUndefined();
    expect(guard).toContain("matchExactBlockingOption(answerHit.answer, options)");
    expect(guard).toContain("if (!clickedOption) return;");
    expect(guard).not.toContain("clickedText.startsWith");
  });

  it("bloqueio global não captura botões do ColombiaBot", () => {
    expect(bot).toContain("<div data-colombia-bot className=");
    expect(guard).toContain('event.target.closest("[data-colombia-bot]")');
    expect(guard).toContain("if (event.target instanceof Element");
  });

  it("continua aplicando regras bloqueantes ao formulário manual", () => {
    expect(guard).toContain("rule.questionId === currentQuestion.id");
    expect(guard).toContain("opt.blocking === true");
    expect(guard).toContain("setBlocked({");
  });

  it("aceita somente IDs inteiros de perguntas", () => {
    expect(readBotQuestionId("12")).toBe(12);
    expect(readBotQuestionId("")).toBeNull();
    expect(readBotQuestionId("1abc")).toBeNull();
  });
});
