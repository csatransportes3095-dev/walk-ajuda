/**
 * Recupera marcadores operacionais conhecidos quando o texto que vai para o
 * WhatsApp já chegou com U+FFFD (�). A correção acontece no texto FINAL,
 * imediatamente antes de criar a URL wa.me, igual ao fluxo de status/pedidos.
 *
 * Não altera dados salvos nem templates no banco.
 */
export function repairWhatsappReplacementIcons(value: string): string {
  let text = String(value ?? "");

  if (!text.includes("\uFFFD")) return text;

  // Se a mesma sequência quebrada virou mais de um U+FFFD, mantenha apenas um
  // para que as regras contextuais abaixo consigam reconhecer o marcador.
  text = text.replace(/\uFFFD{2,}/g, "\uFFFD");

  return text
    // Fluxo já utilizado em pedidos/status.
    .replace(/\uFFFD(?=\s*SEUS DADOS DE ACESSO ESTÃO PRONTOS!?)/gi, "🔐")
    .replace(/\uFFFD(?=\s*IMPORTANTE\b)/gi, "⚠️")
    .replace(/\uFFFD(?=\s*VÍDEO\s*[—-])/gi, "🎥")
    .replace(/\uFFFD(?=\s*Não tente acessar diretamente pelo aplicativo\b)/gi, "⚠️")

    // Comissões — título das notificações.
    .replace(/\uFFFD(?=\s*\*?COMISSÃO PAGA\*?)/gi, "✅")
    .replace(/\uFFFD(?=\s*\*?INDICAÇÃO CONFIRMADA\*?)/gi, "🎉")
    .replace(/\uFFFD(?=\s*\*?DADOS PARA PAGAMENTO DA COMISSÃO\*?)/gi, "💳")

    // Comissões — campos internos.
    .replace(/\uFFFD(?=\s*\*?Cliente indicado:\*?)/gi, "👤")
    .replace(/\uFFFD(?=\s*\*?Telefone:\*?)/gi, "📱")
    .replace(/\uFFFD(?=\s*\*?Valor pago:\*?)/gi, "💰")
    .replace(/\uFFFD(?=\s*\*?Valor da comissão:\*?)/gi, "💰")
    .replace(/\uFFFD(?=\s*\*?Comissão:\*?)/gi, "💰")
    .replace(/\uFFFD(?=\s*\*?Pagamento da comissão confirmado\.?\*?)/gi, "✅")

    // Encerramento das mensagens de indicação/comissão.
    .replace(/(Obrigado pela indicação!\s*)\uFFFD/gi, "$1🎉");
}
