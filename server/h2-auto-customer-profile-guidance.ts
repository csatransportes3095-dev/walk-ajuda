import { getMissingCustomerProfileFields } from "./customerProfileRequirements";

/**
 * Keep the WhatsApp eligibility check aligned with the existing /login gate.
 * Only a matching, non-deleted, non-blocked customer may be assessed.
 * Never disclose which personal field is missing over WhatsApp.
 */
export function h2AutoCustomerNeedsProfileUpdate(customer: unknown): boolean {
  return getMissingCustomerProfileFields(customer).length > 0;
}

export const H2_AUTO_CUSTOMER_PROFILE_UPDATE_MESSAGE =
  "⚠️ *H2 COLOMBIANO* 🇨🇴\n" +
  "📝 *ATUALIZAÇÃO DE CADASTRO*\n\n" +
  "Para continuar seu atendimento,\n" +
  "é necessário completar ou\n" +
  "atualizar seu cadastro.\n\n" +
  "🔗 *ACESSE SEU CADASTRO:*\n" +
  "https://h2colombiano.com/login\n\n" +
  "✅ Faça login e preencha\n" +
  "os dados que estiverem pendentes.\n\n" +
  "📱 Depois, volte ao WhatsApp\n" +
  "e informe seu telefone com DDD.\n\n" +
  "👨‍💻 Se não conseguir acessar,\n" +
  "solicite atendimento humano.\n\n" +
  "🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴";

/**
 * Unknown, ambiguous and otherwise unauthorized phone numbers keep one generic
 * response; do not reveal whether a specific phone is on file.
 */
export const H2_AUTO_CUSTOMER_NOT_CONFIRMED_MESSAGE =
  "⚠️ *H2 COLOMBIANO* 🇨🇴\n" +
  "🚫 *CADASTRO NÃO VALIDADO*\n\n" +
  "Não foi possível confirmar\n" +
  "seu acesso com esse telefone.\n\n" +
  "📱 Confira o número com DDD.\n\n" +
  "📝 Se precisa completar ou\n" +
  "atualizar seu cadastro, acesse:\n" +
  "https://h2colombiano.com/login\n\n" +
  "✅ Faça login e confira seus dados.\n" +
  "Depois, retorne ao WhatsApp.\n\n" +
  "👨‍💻 Se não conseguir acessar,\n" +
  "solicite atendimento humano.\n\n" +
  "🛡️ *EQUIPE H2 COLOMBIANO* 🇨🇴";
