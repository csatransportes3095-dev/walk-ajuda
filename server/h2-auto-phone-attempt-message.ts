/** WhatsApp text remains short enough for a phone screen; no animated media required. */
export type H2AutoPhoneKind = "cadastro" | "indicador" | "indicacoes";
export type H2AutoPhoneFailure = "formato" | "nao_confirmado";
export const H2_AUTO_PHONE_MAX_ATTEMPTS = 3;

export function h2AutoPhoneFailureMessage(
  kind: H2AutoPhoneKind,
  reason: H2AutoPhoneFailure,
  attempts: number,
): string {
  const used = Math.min(H2_AUTO_PHONE_MAX_ATTEMPTS, Math.max(1, Math.floor(attempts)));
  const remaining = H2_AUTO_PHONE_MAX_ATTEMPTS - used;
  const title = kind === "indicador" ? "INDICADOR NÃO VALIDADO" :
    kind === "indicacoes" ? "CONSULTA NÃO VALIDADA" : "CADASTRO NÃO VALIDADO";
  const cause = reason === "formato"
    ? ["O telefone está fora do formato.", "Informe *11 números com DDD*,", "sem espaços ou símbolos."]
    : kind === "indicador"
      ? ["Não foi possível localizar", "ou autorizar o indicador", "com esse telefone."]
      : ["Não foi possível localizar", "ou confirmar um cadastro ativo", "com esse telefone."];

  if (remaining === 0) {
    return [
      "🚨 *H2 COLOMBIANO* 🇨🇴",
      "⛔ *ATENDIMENTO SUSPENSO*",
      "",
      "❌ *MOTIVO:*",
      ...cause,
      "",
      "🔴 *3 DE 3 TENTATIVAS UTILIZADAS*",
      "",
      "🚫 Por segurança, o robô",
      "não responderá nesta conversa",
      "até a liberação pelo ADM.",
      "",
      "👨‍💻 Aguarde o atendimento",
      "de nossa equipe.",
      "",
      "🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴",
    ].join("\n");
  }
  return [
    "⚠️ *H2 COLOMBIANO* 🇨🇴",
    "🚨 *" + title + "*",
    "",
    "❌ *ERRO IDENTIFICADO:*",
    ...cause,
    "",
    "🔢 *TENTATIVA " + used + " DE 3*",
    (remaining === 1 ? "🟠" : "🟡") + " *RESTAM " + remaining +
      (remaining === 1 ? " TENTATIVA*" : " TENTATIVAS*"),
    "",
    "📱 Confira o número informado",
    "antes de tentar novamente.",
    "",
    "🔙 *0* para voltar.",
    "🏠 *MENU* para início.",
    "",
    "🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴",
  ].join("\n");
}
