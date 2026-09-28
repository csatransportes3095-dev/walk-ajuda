/**
 * Normalização central das mensagens enviadas ao WhatsApp.
 *
 * Alguns fluxos antigos já precisavam reparar U+FFFD (losango com ?).
 * Mantemos os ícones como escapes Unicode ASCII para não depender da codificação
 * do arquivo-fonte durante leitura, minificação ou geração do bundle.
 */
export const WHATSAPP_ICON = {
  lock: "\uD83D\uDD10",
  warning: "\u26A0\uFE0F",
  video: "\uD83C\uDFA5",
  paid: "\u2705",
  pending: "\u23F3",
  party: "\uD83C\uDF89",
  card: "\uD83D\uDCB3",
  user: "\uD83D\uDC64",
  phone: "\uD83D\uDCF1",
  money: "\uD83D\uDCB0",
  ticket: "\uD83C\uDF9F\uFE0F",
  trophy: "\uD83C\uDFC6",
  clipboard: "\uD83D\uDCCB",
  chart: "\uD83D\uDCCA",
  numbers: "\uD83D\uDD22",
  link: "\uD83D\uDD17",
  globe: "\uD83C\uDF10",
  rocket: "\uD83D\uDE80",
} as const;

export function repairWhatsappReplacementIcons(value: string): string {
  let text = String(value ?? "");

  if (!text.includes("\uFFFD")) return text;

  // Se a mesma sequência quebrada virou mais de um U+FFFD, mantenha apenas um
  // para as regras contextuais recuperarem o marcador correto.
  text = text.replace(/\uFFFD{2,}/g, "\uFFFD");

  return text
    // Fluxos de acesso/status.
    .replace(/\uFFFD(?=\s*SEUS DADOS DE ACESSO ESTÃO PRONTOS!?)/gi, WHATSAPP_ICON.lock)
    .replace(/\uFFFD(?=\s*IMPORTANTE\b)/gi, WHATSAPP_ICON.warning)
    .replace(/\uFFFD(?=\s*VÍDEO\s*[—-])/gi, WHATSAPP_ICON.video)
    .replace(/\uFFFD(?=\s*Não tente acessar diretamente pelo aplicativo\b)/gi, WHATSAPP_ICON.warning)
    .replace(/\uFFFD(?=\s*\*?Acesso Liberado\b)/gi, WHATSAPP_ICON.lock)
    .replace(/\uFFFD(?=\s*\*?Acesse agora:\*?)/gi, WHATSAPP_ICON.globe)
    .replace(/\uFFFD(?=\s*\*?Como acessar:\*?)/gi, WHATSAPP_ICON.phone)
    .replace(/\uFFFD(?=\s*Link para agendar:)/gi, WHATSAPP_ICON.link)
    .replace(/(Tudo certo por aqui\.\s*)\uFFFD/gi, `$1${WHATSAPP_ICON.paid}`)
    .replace(/(_Equipe Walk Ajuda_\s*)\uFFFD/gi, `$1${WHATSAPP_ICON.rocket}`)
    .replace(/(Olá[^\n!]*!\s*)\uFFFD(?=\s*Seu pré-cadastro)/gi, `$1${WHATSAPP_ICON.party}`)

    // Sorteios.
    .replace(/\uFFFD(?=\s*\*?SORTEIO H2 COLOMBIANO\b)/gi, WHATSAPP_ICON.ticket)
    .replace(/\uFFFD(?=\s*\*?(TODOS OS ESCOLHIDOS|SOMENTE PAGOS|AGUARDANDO PAGAMENTO)\*?)/gi, WHATSAPP_ICON.clipboard)
    .replace(/\uFFFD(?=\s*\*?RESUMO\*?)/gi, WHATSAPP_ICON.chart)
    .replace(/\uFFFD(?=\s*Escolhidos:)/gi, WHATSAPP_ICON.ticket)
    .replace(/\uFFFD(?=\s*Pagos:)/gi, WHATSAPP_ICON.paid)
    .replace(/\uFFFD(?=\s*Aguardando:)/gi, WHATSAPP_ICON.pending)
    .replace(/\uFFFD(?=\s*Disponíveis:)/gi, WHATSAPP_ICON.numbers)
    .replace(/\uFFFD(?=\s*https:\/\/h2colombiano\.com\/sorteio)/gi, WHATSAPP_ICON.link)
    .replace(/\uFFFD(?=\s*PAGO\b)/gi, WHATSAPP_ICON.paid)
    .replace(/\uFFFD(?=\s*AGUARDANDO\b)/gi, WHATSAPP_ICON.pending)

    // Comissões - títulos.
    .replace(/\uFFFD(?=\s*\*?COMISSÃO PAGA\*?)/gi, WHATSAPP_ICON.paid)
    .replace(/\uFFFD(?=\s*\*?INDICAÇÃO CONFIRMADA\*?)/gi, WHATSAPP_ICON.party)
    .replace(/\uFFFD(?=\s*\*?DADOS PARA PAGAMENTO DA COMISSÃO\*?)/gi, WHATSAPP_ICON.card)

    // Comissões - campos.
    .replace(/\uFFFD(?=\s*\*?Cliente indicado:\*?)/gi, WHATSAPP_ICON.user)
    .replace(/\uFFFD(?=\s*\*?Telefone:\*?)/gi, WHATSAPP_ICON.phone)
    .replace(/\uFFFD(?=\s*\*?Valor pago:\*?)/gi, WHATSAPP_ICON.money)
    .replace(/\uFFFD(?=\s*\*?Valor da comissão:\*?)/gi, WHATSAPP_ICON.money)
    .replace(/\uFFFD(?=\s*\*?Comissão:\*?)/gi, WHATSAPP_ICON.money)
    .replace(/\uFFFD(?=\s*\*?Pagamento da comissão confirmado\.?\*?)/gi, WHATSAPP_ICON.paid)
    .replace(/(Obrigado pela indicação!\s*)\uFFFD/gi, `$1${WHATSAPP_ICON.party}`);
}

/**
 * Última barreira comum antes de criar qualquer URL wa.me.
 * Corrige marcadores conhecidos, normaliza Unicode e remove qualquer U+FFFD
 * residual para nunca enviar o losango quebrado ao WhatsApp.
 */
export function prepareWhatsappMessage(value: string): string {
  return repairWhatsappReplacementIcons(value)
    .replace(/\uFFFD/g, "")
    .normalize("NFC");
}

export function encodeWhatsappMessage(value: string): string {
  return encodeURIComponent(prepareWhatsappMessage(value));
}

/**
 * Compatibilidade do fluxo de comissões.
 */
export function repairCommissionWhatsappMessage(value: string): string {
  return prepareWhatsappMessage(value);
}
