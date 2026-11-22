/**
 * Regras puras do checkout do ColombiaBot.
 * O navegador mostra a estimativa; o servidor revalida cupom e calcula o total oficial.
 */
import { formatBrazilMoney, parseBrazilMoney } from "@shared/vipPricing";
import { sameBotSelectOption } from "./colombiaBotFlow";

export type BotDiscount = { type: string; value: number } | null;

export function getBotCheckoutTotals(basePrice: string | null | undefined, coupon: BotDiscount) {
  const baseValue = Math.max(0, parseBrazilMoney(basePrice));
  const amount = Number(coupon?.value || 0);
  const discountValue = coupon && Number.isFinite(amount) && amount > 0
    ? Math.min(baseValue, coupon.type === "percentage" ? baseValue * amount / 100 : amount)
    : 0;
  return {
    base: formatBrazilMoney(baseValue),
    discount: formatBrazilMoney(discountValue),
    total: formatBrazilMoney(Math.max(0, baseValue - discountValue)),
    hasCoupon: discountValue > 0,
  };
}

export type BotBlockedChoice = {
  title: string;
  message: string;
  buttonLabel: string;
  question: string;
  answer: string;
};

export function findBotBlockedChoice(
  question: { id: number; question: string; options: string | null },
  answer: string,
  rawRules: unknown,
): BotBlockedChoice | null {
  let configured: any[] = [];
  try {
    const parsed = typeof rawRules === "string" ? JSON.parse(rawRules) : rawRules;
    if (Array.isArray(parsed)) configured = parsed;
  } catch { /* keep empty */ }
  const rule = configured.find(item =>
    item?.enabled !== false &&
    Number(item?.questionId) === question.id &&
    sameBotSelectOption(String(item?.answer || ""), answer));
  if (rule) return {
    title: String(rule.title || "Antes de continuar"),
    message: String(rule.message || "Esta resposta não permite continuar com o pedido."),
    buttonLabel: String(rule.buttonLabel || "Voltar e alterar resposta"),
    question: question.question,
    answer,
  };

  try {
    const opts = JSON.parse(question.options || "");
    if (Array.isArray(opts)) {
      const choice = opts.find(item =>
        item && typeof item === "object" &&
        item.blocking === true && sameBotSelectOption(String(item.label || ""), answer));
      if (choice) return {
        title: "Antes de continuar",
        message: String(choice.blockingMessage || "Esta resposta não permite continuar com este pedido."),
        buttonLabel: "Voltar e alterar resposta",
        question: question.question,
        answer,
      };
    }
  } catch { /* legacy comma-separated options have no blocking metadata */ }
  return null;
}

export function sameBotProgressOwner(
  savedPhone: string | null | undefined,
  sessionPhone: string | null | undefined,
): boolean {
  const normalize = (value: string | null | undefined) => String(value || "").replace(/\D/g, "");
  const saved = normalize(savedPhone);
  const current = normalize(sessionPhone);
  return Boolean(saved && current && saved === current);
}
