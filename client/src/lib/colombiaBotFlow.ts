/**
 * Decisões puras do fluxo de perguntas e cupom do ColombiaBot.
 * O cupom não é uma pergunta do produto e nunca grava em questionAnswers.
 */
export function sameBotSelectOption(answer: string, option: string): boolean {
  const normalize = (value: string) => value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  return normalize(answer) === normalize(option);
}

export type BotCouponChoice = "enter-code" | "skip" | "invalid";

export function resolveBotCouponChoice(answer: string): BotCouponChoice {
  if (sameBotSelectOption(answer, "SIM, TENHO UM CUPOM")) return "enter-code";
  if (sameBotSelectOption(answer, "NÃO TENHO CUPOM")) return "skip";
  return "invalid";
}

export function isUsableBotCouponCode(code: string): boolean {
  return code.trim().length > 0;
}

export type BotResumeStep = "questions" | "documents" | "coupon" | "payment";

export function resolveBotResumeStep({
  hasUnansweredQuestions,
  hasMissingRequiredDocuments,
  wasAtPayment,
}: {
  hasUnansweredQuestions: boolean;
  hasMissingRequiredDocuments: boolean;
  wasAtPayment: boolean;
}): BotResumeStep {
  // Uma marcação antiga de pagamento jamais dispensa respostas ou anexos.
  if (hasUnansweredQuestions) return "questions";
  if (hasMissingRequiredDocuments) return "documents";
  return wasAtPayment ? "payment" : "coupon";
}
