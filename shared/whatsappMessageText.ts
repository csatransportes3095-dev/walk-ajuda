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
  fire: "\uD83D\uDD25",
  gift: "\uD83C\uDF81",
  star: "\u2B50",
  camera: "\uD83D\uDCF8",
  car: "\uD83D\uDE97",
  calendar: "\uD83D\uDCC5",
  bell: "\uD83D\uDD14",
  megaphone: "\uD83D\uDCE2",
  document: "\uD83D\uDCC4",
  key: "\uD83D\uDD11",
  shield: "\uD83D\uDEE1\uFE0F",
  search: "\uD83D\uDD0D",
  pin: "\uD83D\uDCCC",
  target: "\uD83C\uDFAF",
  lightning: "\u26A1",
  cross: "\u274C",
  check: "\u2714\uFE0F",
  unlock: "\uD83D\uDD13",
  redCircle: "\uD83D\uDD34",
  greenCircle: "\uD83D\uDFE2",
  yellowCircle: "\uD83D\uDFE1",
} as const;

const WHATSAPP_ICON_PERCENT: Record<keyof typeof WHATSAPP_ICON, string> = {
  lock: "%F0%9F%94%90",
  warning: "%E2%9A%A0%EF%B8%8F",
  video: "%F0%9F%8E%A5",
  paid: "%E2%9C%85",
  pending: "%E2%8F%B3",
  party: "%F0%9F%8E%89",
  card: "%F0%9F%92%B3",
  user: "%F0%9F%91%A4",
  phone: "%F0%9F%93%B1",
  money: "%F0%9F%92%B0",
  ticket: "%F0%9F%8E%9F%EF%B8%8F",
  trophy: "%F0%9F%8F%86",
  clipboard: "%F0%9F%93%8B",
  chart: "%F0%9F%93%8A",
  numbers: "%F0%9F%94%A2",
  link: "%F0%9F%94%97",
  globe: "%F0%9F%8C%90",
  rocket: "%F0%9F%9A%80",
  fire: "%F0%9F%94%A5",
  gift: "%F0%9F%8E%81",
  star: "%E2%AD%90",
  camera: "%F0%9F%93%B8",
  car: "%F0%9F%9A%97",
  calendar: "%F0%9F%93%85",
  bell: "%F0%9F%94%94",
  megaphone: "%F0%9F%93%A2",
  document: "%F0%9F%93%84",
  key: "%F0%9F%94%91",
  shield: "%F0%9F%9B%A1%EF%B8%8F",
  search: "%F0%9F%94%8D",
  pin: "%F0%9F%93%8C",
  target: "%F0%9F%8E%AF",
  lightning: "%E2%9A%A1",
  cross: "%E2%9D%8C",
  check: "%E2%9C%94%EF%B8%8F",
  unlock: "%F0%9F%94%93",
  redCircle: "%F0%9F%94%B4",
  greenCircle: "%F0%9F%9F%A2",
  yellowCircle: "%F0%9F%9F%A1",
};

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
    // Recupera também o ícone que aparece antes de cada número vendido.
    .replace(/\uFFFD(?=\s*\*\d{1,3}\*[^\n]*\bPAGO\b)/gi, WHATSAPP_ICON.paid)
    .replace(/\uFFFD(?=\s*\*\d{1,3}\*[^\n]*\bAGUARDANDO\b)/gi, WHATSAPP_ICON.pending)
    .replace(/(LISTA ATUALIZADA\*\s*\n)\uFFFD(?=\s*\*)/gi, `$1${WHATSAPP_ICON.trophy}`)
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
  // O URL final é mantido em ASCII puro. Os ícones conhecidos viram marcadores
  // ASCII antes do encode e depois são recolocados como bytes UTF-8 percent-encoded.
  // Assim nenhuma etapa entre o navegador, wa.me e WhatsApp precisa transportar
  // emoji literal e não há espaço para ele virar U+FFFD.
  let prepared = prepareWhatsappMessage(value);
  const tokens = Object.entries(WHATSAPP_ICON).map(([name, icon], index) => {
    const token = `__H2WA_ICON_${index}_${name.toUpperCase()}__`;
    prepared = prepared.split(icon).join(token);
    return { name: name as keyof typeof WHATSAPP_ICON, token };
  });

  let encoded = encodeURIComponent(prepared);
  for (const { name, token } of tokens) {
    encoded = encoded.split(token).join(WHATSAPP_ICON_PERCENT[name]);
  }
  return encoded;
}

/**
 * Compatibilidade do fluxo de comissões.
 */
export function repairCommissionWhatsappMessage(value: string): string {
  return prepareWhatsappMessage(value);
}
