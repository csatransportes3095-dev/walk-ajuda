import type { H2AutoConfirmation } from "../shared/h2AutoConfirmation";
/** WhatsApp text remains short enough for a phone screen; no animated media required. */
export type H2AutoPhoneKind = "cadastro" | "indicador" | "indicacoes";
export type H2AutoPhoneFailure = "formato" | "nao_confirmado";
export const H2_AUTO_PHONE_MAX_ATTEMPTS = 3;

export function h2AutoPhoneFailureMessage(
  kind: H2AutoPhoneKind,
  reason: H2AutoPhoneFailure,
  attempts: number,
  templates?: H2AutoConfirmation,
): string {
  const used = Math.min(H2_AUTO_PHONE_MAX_ATTEMPTS, Math.max(1, Math.floor(attempts)));
  const remaining = H2_AUTO_PHONE_MAX_ATTEMPTS - used;
  const title = kind === "indicador" ? "INDICADOR NÃO VALIDADO" :
    kind === "indicacoes" ? "CONSULTA NÃO VALIDADA" : "CADASTRO NÃO VALIDADO";
  const defaultCause = reason === "formato"
    ? ["O telefone está fora do formato.", "Informe *11 números com DDD*,", "sem espaços ou símbolos."]
    : kind === "indicador"
      ? ["Não foi possível localizar", "ou autorizar o indicador", "com esse telefone."]
      : ["Não foi possível localizar", "ou confirmar um cadastro ativo", "com esse telefone."];

  const key: keyof H2AutoConfirmation = reason === "formato" ? (kind === "indicador" ? "referrerPhoneInvalid" : kind === "indicacoes" ? "referralsPhoneInvalid" : "phoneInvalid") : (kind === "indicador" ? "referrerNotFound" : kind === "indicacoes" ? "referralsPhoneNotFound" : "phoneNotFound");
  const cause = templates?.[key]?.trim() ? templates[key].split("\n") : defaultCause;

  if (remaining === 0) {
    return [
      "⛔ *ATENDIMENTO SUSPENSO*",
      "",
      ...cause,
      "",
      "🔢 *3 DE 3 TENTATIVAS UTILIZADAS*",
      "🔒 Por segurança, aguarde",
      "até a liberação pelo ADM.",
      "👨‍💻 Nossa equipe poderá ajudar.",
    ].join("\n");
  }
  return [
    "⚠️ *" + title + "*",
    "",
    ...cause,
    "",
    "🔢 *TENTATIVA " + used + " DE 3*",
    (remaining === 1 ? "🟠" : "🟡") + (remaining === 1 ? " *RESTA " : " *RESTAM ") + remaining +
      (remaining === 1 ? " TENTATIVA*" : " TENTATIVAS*"),
    "",
    "🔙 *0* para voltar.",
    "🏠 *MENU* para início.",
  ].join("\n");
}
