import { describe, it, expect } from "vitest";
import { orderedVisibleQuestions, validateQuestionFlowRules } from "./questionFlow";

const qs = [
  { id: 1, sortOrder: 1 },
  { id: 2, parentQuestionId: 1, triggerOption: "SIM", sortOrder: 2 },
  { id: 3, sortOrder: 3 },
  { id: 4, sortOrder: 4 },
];
describe("fluxo de perguntas", () => {
  it("preserva o fluxo atual sem configuração", () => {
    expect(orderedVisibleQuestions(qs, { 1: "SIM" }).questions.map(q => q.id)).toEqual([1, 2, 3, 4]);
  });
  it("oculta subperguntas sem gatilho correspondente", () => {
    expect(orderedVisibleQuestions(qs, { 1: "NÃO" }).questions.map(q => q.id)).toEqual([1, 3, 4]);
  });
  it("encerra somente o questionário na resposta definida", () => {
    const result = orderedVisibleQuestions(qs, { 1: "NÃO" }, [{ questionId: 1, answer: "NÃO", action: "finish" }]);
    expect(result.questions.map(q => q.id)).toEqual([1]);
    expect(result.ended).toBe(true);
  });
  it("pula perguntas intermediárias", () => {
    const result = orderedVisibleQuestions(qs, { 1: "SIM" }, [{ questionId: 1, answer: "SIM", action: "jump", targetQuestionId: 4 }]);
    expect(result.questions.map(q => q.id)).toEqual([1, 4]);
  });
  it("rejeita destino inexistente", () => {
    expect(validateQuestionFlowRules(qs, [{questionId: 1, answer: "SIM", action: "jump", targetQuestionId: 99}])).toContain("Destino de salto inexistente");
  });
});
