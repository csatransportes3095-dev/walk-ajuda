/**
 * H2 AUTO: generic response used only after no approved FAQ, flow or
 * locally configured reply matches. This text is operator editable in ADM.
 * The registration line is conditional on a successful learning-queue write.
 */
export const H2_AUTO_UNKNOWN_REPLY_DEFAULT =
  "⚡ *H2 COLOMBIANO* 🇨🇴\n\n" +
  "🤖 Ainda não tenho uma resposta cadastrada para essa pergunta.\n\n" +
  "📝 Sua pergunta foi registrada para análise.\n\n" +
  "💬 Pode enviar outra pergunta. Continuamos por aqui.";

/** Lines starting with 📝 describe an actual registration, never a promise. */
export function renderH2AutoUnknownReply(text: string, recorded: boolean): string {
  const value = text.trim() || H2_AUTO_UNKNOWN_REPLY_DEFAULT;
  if (recorded) return value;
  return value.split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith("📝"))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * No fallback for contact credentials, shortcuts, greeting-only messages
 * or authentication/management commands. Phone, OTP and navigation retain
 * their existing handlers.
 */
export function isH2AutoUnknownTextEligible(input: string): boolean {
  if (typeof input !== "string") return false;
  const text = input.trim();
  if (text.length < 3 || text.length > 280 || !/[a-z\u00c0-\u00ff]/i.test(text)) return false;
  if (/^(?:menu|in[ií]cio|0|voltar|retomar|voltar automatico|\/h2(?:\s.*)?|\/h3(?:\s.*)?|[0-9]+)$/i.test(text)) return false;
  if (/^(?:oi|ol[aá]|bom dia|boa tarde|boa noite|obrigad[ao]|ok|sim|n[aã]o)$/i.test(text)) return false;
  if (/\d{5,}|https?:\/\/|www\.|@/i.test(text)) return false;
  return true;
}

/** The APK uses exact/contains after accent and whitespace normalization. */
function legacyNormalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}
export type H2AutoLocalTextRule = {
  enabled?: boolean;
  mode?: string;
  trigger?: string;
  reply?: string;
};
export function matchesH2AutoLocalReply(text: string, rules: H2AutoLocalTextRule[]): boolean {
  const incoming = legacyNormalize(text);
  if (!incoming) return false;
  return rules.some(rule => {
    if (!rule || rule.enabled === false || !rule.reply?.trim()) return false;
    return (rule.trigger || "").split(",").some(raw => {
      const word = legacyNormalize(raw.trim());
      if (!word) return false;
      return rule.mode === "contains"
        ? word.length >= 2 && incoming.includes(word)
        : word === incoming;
    });
  });
}
