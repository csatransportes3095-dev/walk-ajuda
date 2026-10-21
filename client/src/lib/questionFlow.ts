/**
 * Fluxo condicional de perguntas. Sem regra = comportamento legado.
 * Este módulo não altera perguntas cadastradas e não executa efeitos de pedido.
 */
export type QuestionFlowAction = "continue" | "jump" | "finish" | "message";
export type QuestionFlowRule = {
  questionId: number;
  answer: string;
  action: QuestionFlowAction;
  targetQuestionId?: number | null;
  message?: string | null;
};
export type FlowQuestion = {
  id: number;
  parentQuestionId?: number | null;
  triggerOption?: string | null;
  sortOrder: number;
  isRequired?: number;
};

export function validateQuestionFlowRules(questions: FlowQuestion[], rules: QuestionFlowRule[]): string[] {
  const ids = new Set(questions.map(q => q.id));
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const r of rules) {
    const key = r.questionId + "\u0000" + r.answer;
    if (keys.has(key)) errors.push("Regra duplicada para pergunta e resposta");
    keys.add(key);
    if (!ids.has(r.questionId)) errors.push("Pergunta de origem inexistente");
    if (!r.answer.trim()) errors.push("Resposta vazia");
    if (r.action === "jump" && (!r.targetQuestionId || !ids.has(r.targetQuestionId))) {
      errors.push("Destino de salto inexistente");
    }
    if (r.action === "jump" && r.targetQuestionId === r.questionId) errors.push("Salto para a mesma pergunta");
  }
  return errors;
}

export function orderedVisibleQuestions(
  questions: FlowQuestion[],
  answers: Record<number, string>,
  rules: QuestionFlowRule[] = []
): { questions: FlowQuestion[]; ended: boolean; message: string | null } {
  const children = new Map<number | null, FlowQuestion[]>();
  for (const q of questions) {
    const parent = q.parentQuestionId ?? null;
    const list = children.get(parent) ?? [];
    list.push(q);
    children.set(parent, list);
  }
  for (const list of children.values()) list.sort((a,b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const legacy: FlowQuestion[] = [];
  const seen = new Set<number>();
  const walk = (parent: number | null) => {
    for (const q of children.get(parent) ?? []) {
      if (seen.has(q.id)) continue;
      if (parent !== null && q.triggerOption && answers[parent]?.trim() !== q.triggerOption) continue;
      seen.add(q.id);
      legacy.push(q);
      walk(q.id);
    }
  };
  walk(null);
  const ordered: FlowQuestion[] = [];
  const visited = new Set<number>();
  let index = 0;
  while (index < legacy.length) {
    const q = legacy[index];
    if (visited.has(q.id)) break;
    visited.add(q.id);
    ordered.push(q);
    const response = answers[q.id]?.trim();
    const rule = response ? rules.find(r => r.questionId === q.id && r.answer === response) : undefined;
    if (rule?.action === "finish" || rule?.action === "message") {
      return { questions: ordered, ended: true, message: rule.action === "message" ? (rule.message ?? "") : null };
    }
    if (rule?.action === "jump") {
      const next = legacy.findIndex(candidate => candidate.id === rule.targetQuestionId);
      // Rejeitar saltos para trás ou para perguntas que não pertencem ao ramo visível.
      if (next > index) { index = next; continue; }
    }
    index++;
  }
  return { questions: ordered, ended: false, message: null };
}
