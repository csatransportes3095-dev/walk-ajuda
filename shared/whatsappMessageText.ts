/**
 * Recupera marcadores operacionais conhecidos quando o texto que vai para o
 * WhatsApp ja chegou com U+FFFD (replacement character). A correcao acontece
 * no texto FINAL, imediatamente antes de criar a URL wa.me.
 *
 * Os icones abaixo ficam no codigo-fonte somente como escapes Unicode ASCII.
 * Assim nenhuma etapa de leitura/minificacao precisa interpretar bytes de emoji.
 */
const WHATSAPP_ICON = {
  lock: "\uD83D\uDD10",
  warning: "\u26A0\uFE0F",
  video: "\uD83C\uDFA5",
  paid: "\u2705",
  party: "\uD83C\uDF89",
  card: "\uD83D\uDCB3",
  user: "\uD83D\uDC64",
  phone: "\uD83D\uDCF1",
  money: "\uD83D\uDCB0",
} as const;

export function repairWhatsappReplacementIcons(value: string): string {
  let text = String(value ?? "");

  if (!text.includes("\uFFFD")) return text;

  // Se a mesma sequencia quebrada virou mais de um U+FFFD, mantenha apenas um
  // para que as regras contextuais abaixo reconhecam o marcador.
  text = text.replace(/\uFFFD{2,}/g, "\uFFFD");

  return text
    // Fluxo ja utilizado em pedidos/status.
    .replace(/\uFFFD(?=\s*SEUS DADOS DE ACESSO ESTÃO PRONTOS!?)/gi, WHATSAPP_ICON.lock)
    .replace(/\uFFFD(?=\s*IMPORTANTE\b)/gi, WHATSAPP_ICON.warning)
    .replace(/\uFFFD(?=\s*VÍDEO\s*[—-])/gi, WHATSAPP_ICON.video)
    .replace(/\uFFFD(?=\s*Não tente acessar diretamente pelo aplicativo\b)/gi, WHATSAPP_ICON.warning)

    // Comissoes - titulo das notificacoes.
    .replace(/\uFFFD(?=\s*\*?COMISSÃO PAGA\*?)/gi, WHATSAPP_ICON.paid)
    .replace(/\uFFFD(?=\s*\*?INDICAÇÃO CONFIRMADA\*?)/gi, WHATSAPP_ICON.party)
    .replace(/\uFFFD(?=\s*\*?DADOS PARA PAGAMENTO DA COMISSÃO\*?)/gi, WHATSAPP_ICON.card)

    // Comissoes - campos internos.
    .replace(/\uFFFD(?=\s*\*?Cliente indicado:\*?)/gi, WHATSAPP_ICON.user)
    .replace(/\uFFFD(?=\s*\*?Telefone:\*?)/gi, WHATSAPP_ICON.phone)
    .replace(/\uFFFD(?=\s*\*?Valor pago:\*?)/gi, WHATSAPP_ICON.money)
    .replace(/\uFFFD(?=\s*\*?Valor da comissão:\*?)/gi, WHATSAPP_ICON.money)
    .replace(/\uFFFD(?=\s*\*?Comissão:\*?)/gi, WHATSAPP_ICON.money)
    .replace(/\uFFFD(?=\s*\*?Pagamento da comissão confirmado\.?\*?)/gi, WHATSAPP_ICON.paid)

    // Encerramento das mensagens de indicacao/comissao.
    .replace(/(Obrigado pela indicação!\s*)\uFFFD/gi, `$1${WHATSAPP_ICON.party}`);
}

/**
 * Ultima barreira exclusiva das mensagens de comissao. Depois de recuperar os
 * marcadores conhecidos, U+FFFD e removido antes do encodeURIComponent.
 */
export function repairCommissionWhatsappMessage(value: string): string {
  return repairWhatsappReplacementIcons(value).replace(/\uFFFD/g, "");
}
