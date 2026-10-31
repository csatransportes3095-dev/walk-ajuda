import type { H2AutoConfirmation } from "./h2AutoConfirmation";
import type { H2AutoTree } from "./h2AutoTree";

/**
 * Mensagens curtas para WhatsApp. Somente a apresentação muda:
 * nunca altera gatilhos, opções, IDs, destinos, regras ou permissões.
 */
export const H2_AUTO_SHORT_CONFIRMATION: H2AutoConfirmation = {
  identificationWelcome:
    "⚡ *H2 COLOMBIANO* 🇨🇴\n📋 *COMO DESEJA CONTINUAR?*\n\n1️⃣ *JÁ SOU CLIENTE*\n2️⃣ *AINDA NÃO SOU CLIENTE*\n3️⃣ *MINHAS INDICAÇÕES*\n\n⌨️ Digite *1, 2 ou 3*.\n🏠 *MENU* para início.",
  existingCustomerPrompt:
    "✅ *JÁ SOU CLIENTE*\n\n📱 Digite seu telefone\ncom DDD (11 números).\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  newCustomerPrompt:
    "🆕 *NOVO CLIENTE*\n\n📱 Informe o telefone\ncom DDD do seu indicador.\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  phonePrompt:
    "💰 *MINHAS INDICAÇÕES*\n\n📱 Informe seu telefone\ncadastrado com DDD.\n\n🔙 *0* para voltar.\n🏠 *MENU* para início.",
  phoneInvalid:
    "⚠️ Telefone inválido.\nDigite 11 números com DDD.",
  phoneNotFound:
    "⚠️ Não foi possível confirmar\nseu acesso. Confira o DDD.",
  referrerPhoneInvalid:
    "⚠️ Indicador inválido.\nDigite 11 números com DDD.",
  referrerNotFound:
    "⚠️ Não foi possível confirmar\no indicador informado.",
  referralsPhoneInvalid:
    "⚠️ Telefone inválido.\nDigite 11 números com DDD.",
  referralsPhoneNotFound:
    "⚠️ Não foi possível confirmar\no acesso às indicações.",
  noIndicatorMessage:
    "🔐 *INDICADOR OBRIGATÓRIO*\n\n📱 Informe o telefone\ncom DDD de um indicador\ncadastrado e autorizado.\n\n🏠 *MENU* para início.",
  codeSent:
    "📧 *CÓDIGO ENVIADO*\n\n🔢 Digite os 6 números\nenviados ao seu e-mail.\n⏳ Válido por 10 minutos.\n\n🔙 *0* para voltar.",
  codePrompt:
    "🔢 Digite o código de\n6 números do e-mail.\n\n🔙 *0* para voltar.",
  codeInvalid:
    "⚠️ Código inválido ou\nexpirado. Confira o e-mail.\n\n🔙 *0* para voltar.",
  codeResendWait:
    "⏳ Aguarde 1 minuto\npara pedir outro código.",
  codeRateLimit:
    "⏳ Muitas tentativas.\nTente mais tarde.",
  codeRequestWait:
    "⏳ Aguarde e tente novamente.",
  codeSendFailed:
    "⚠️ Código não enviado.\nTente novamente.",
  customerProfileUpdate:
    "📝 *ATUALIZE SEU CADASTRO*\n\n✅ Complete os dados pendentes:\nhttps://h2colombiano.com/login\n\n📱 Depois, volte aqui.\n🏠 *MENU* para início.",
  customerAccessNotConfirmed:
    "🚫 *ACESSO NÃO CONFIRMADO*\n\n📱 Confira seu telefone\ncom DDD. Se persistir,\nsolicite atendimento.",
  referrerRateLimit:
    "⏳ Muitas tentativas.\nAguarde e tente novamente.",
  referralHumanHelp:
    "👨‍💻 *ATENDIMENTO HUMANO*\n\n✅ Encaminhado à equipe.\n⏳ Espera média: 5 minutos.\n🕒 Atendimento: 11h às 23h.\n\n🏠 *MENU* para início.",
};

export const H2_AUTO_SHORT_MEDIA = {
  audioFallback:
    "🎤 Áudio recebido.\nSomente o atendente ouve.\n✍️ Digite sua dúvida ou aguarde.",
  photoReply:
    "📸 Foto recebida.\n✍️ Digite o que precisa\nou aguarde atendimento.",
  videoReply:
    "🎥 Vídeo recebido.\n✍️ Digite o que precisa\nou aguarde atendimento.",
  documentReply:
    "📄 Documento recebido.\n✍️ Digite sua solicitação\nou aguarde atendimento.",
  stickerReply:
    "📎 Figurinha recebida.\n✍️ Escreva sua dúvida.\n🏠 *MENU* para início.",
  unknownReply:
    "📎 Mídia recebida.\n✍️ Digite o que precisa\nou aguarde atendimento.",
} as const;

export const H2_AUTO_SHORT_ORDER_NOT_FOUND =
  "📦 *PEDIDOS*\n\nNenhum pedido localizado\npara este cadastro.\n🏠 *MENU* para início.";

export const H2_AUTO_SHORT_TREE: Record<string, string> = {
  inicio:
    "⚡ *H2 COLOMBIANO* 🇨🇴\n📋 Você já é nosso cliente?",
  clientes:
    "📋 *JÁ SOU CLIENTE*\nEscolha uma opção:",
  novos:
    "🛒 *NOVO CLIENTE*\nEscolha uma opção:",
  indicador:
    "🛒 *NOVO PEDIDO*\nVocê tem um indicador válido?",
  pedido_novo:
    "✅ *FAZER PEDIDO*\n\n🔗 https://h2colombiano.com/pedidos\n📱 Informe o indicador\nno cadastro.",
  sem_indicador:
    "⚠️ *INDICADOR OBRIGATÓRIO*\n\nInforme um indicador válido.\n🏠 *MENU* para início.",
  acompanhar:
    "📦 *ACOMPANHAR PEDIDO*\nhttps://h2colombiano.com/acompanhar",
  foto:
    "📸 *AGENDAR FOTO*\n\nEscolha data e horário:\nhttps://h2colombiano.com/acompanhar",
  corridas:
    "🚗 *CONTROLE DE CORRIDAS*\nhttps://h2colombiano.com/gastos",
  emprestimos:
    "🏦 *EMPRÉSTIMOS*\nhttps://h2colombiano.com/emprestimo",
  valores:
    "💰 *VALORES*\nhttps://h2colombiano.com/pedidos",
  ajuda:
    "❓ *AJUDA E DÚVIDAS*\nhttps://h2colombiano.com/ajuda",
  atendente:
    "👨‍💻 *ATENDIMENTO HUMANO*\n\n✅ Encaminhado à equipe.\n⏳ Espera média: 5 minutos.\n🕒 Das 11h às 23h.\n🏠 *MENU* para início.",
};

/**
 * Para regras livres, remover apenas frases redundantes e excesso visual.
 * Não cortar textos desconhecidos: podem conter valores, instruções ou links.
 */
function wrapH2AutoMobileLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= 40 || /https?:\/\//.test(trimmed) || /\{\{?[^}]+\}\}?/.test(trimmed))
    return line;
  const words = trimmed.split(/\s+/);
  const parts: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) { current = word; continue; }
    if (current.length + word.length + 1 <= 40) {
      current += " " + word;
    } else {
      parts.push(current);
      current = word;
    }
  }
  if (current) parts.push(current);
  return parts.join("\n");
}

export function compactH2AutoFreeform(input: string): string {
  if (!input.trim()) return input;
  let value = input.replace(/\r\n/g, "\n").trim();
  value = value
    .replace(/Sua solicitação foi encaminhada(?: com sucesso)? para (?:nossa equipe de atendimento|nossa equipe|atendimento)[.!]?/gi,
      "✅ Solicitação encaminhada.")
    .replace(/Aproximadamente\s+(\d+)\s+minutos/gi, "⏳ Espera: $1 min")
    .replace(/Você pode digitar MENU para retornar ao atendimento automático[.!]?/gi,
      "🏠 Digite *MENU* para início.")
    .replace(/Digite MENU para voltar ao início[.!]?/gi, "🏠 Digite *MENU* para início.")
    .replace(/Digite MENU para recomeçar[.!]?/gi, "🏠 Digite *MENU* para início.")
    .replace(/Por favor,\s*/gi, "")
    .replace(/Sua solicitação foi encaminhada para nossa equipe[.!]?/gi,
      "✅ Encaminhado à equipe.")
    .replace(/O sistema informa que\s*/gi, "")
    .replace(/^[━─═]{5,}\s*$/gm, "")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
  // Somente quebra visual de linhas extensas. Não corta frases, URLs ou valores.
  return value.split("\n").map(wrapH2AutoMobileLine).join("\n");
}

export type H2AutoCopyConfig = {
  confirmation: H2AutoConfirmation;
  media: Record<string, unknown>;
  tree?: H2AutoTree;
  orderNoOrdersMessage: string;
  welcome: string;
  menu: string[];
  rules: Array<{ reply: string; trigger: string; mode: string; enabled: boolean }>;
};

export function applyH2AutoShortCopy<T extends H2AutoCopyConfig>(config: T): T {
  const nodes = config.tree?.nodes.map(node => {
    const standard = H2_AUTO_SHORT_TREE[node.id];
    if (!standard) return { ...node, text: compactH2AutoFreeform(node.text) };
    // Preserve links and placeholders added by the administrator even if the
    // surrounding original explanation is replaced by a short message.
    const extras = [
      ...(node.text.match(/https?:\/\/[^\s]+/g) || []),
      ...(node.text.match(/\{\{?[a-zA-Z_][a-zA-Z_0-9.]*\}\}?/g) || []),
    ].filter(part => !standard.includes(part));
    return { ...node, text: [standard, ...new Set(extras)].join("\n") };
  });
  const updated = {
    ...config,
    confirmation: { ...H2_AUTO_SHORT_CONFIRMATION },
    media: { ...config.media, ...H2_AUTO_SHORT_MEDIA },
    tree: config.tree ? {
      ...config.tree,
      footer: "⌨️ Digite a opção.\n🔙 *0* volta | *MENU* início.",
      nodes: nodes!,
    } : config.tree,
    orderNoOrdersMessage: H2_AUTO_SHORT_ORDER_NOT_FOUND,
    welcome: compactH2AutoFreeform(config.welcome),
    menu: config.menu.map(compactH2AutoFreeform),
    rules: config.rules.map(rule => ({ ...rule, reply: compactH2AutoFreeform(rule.reply) })),
  };
  return updated as T;
}
