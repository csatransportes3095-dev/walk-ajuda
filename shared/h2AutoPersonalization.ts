import { z } from "zod";

/**
 * H2 AUTO: camada opcional de respostas contextuais, sem IA paga e sem acesso
 * a pedidos/códigos. Não substitui a árvore, MENU/0, validação ou handoff.
 */
export const h2AutoPersonalizationSchema = z.object({
  enabled: z.boolean().default(false),
  tone: z.enum(["acolhedor", "objetivo", "profissional"]).default("acolhedor"),
  verifiedName: z.boolean().default(true),
}).strict();

export type H2AutoPersonalization = z.infer<typeof h2AutoPersonalizationSchema>;
export type H2AutoPersonalizedTopic =
  | "atendimento" | "codigo" | "novo_pedido" | "acompanhar"
  | "indicacoes" | "valores" | "foto" | "emprestimos" | "gastos" | "ajuda";

export const H2_AUTO_PERSONALIZATION_DEFAULT: H2AutoPersonalization = {
  enabled: false,
  tone: "acolhedor",
  verifiedName: true,
};

/** Nenhuma informação do cliente é obtida a partir do nome da notificação. */
export type H2AutoPersonalizedContext = {
  verified?: boolean;
  verifiedFirstName?: string;
  stage?: "choice" | "customer_phone" | "authorized";
};

export type H2AutoPersonalizedAnswer = {
  topic: H2AutoPersonalizedTopic;
  message: string;
};

export const H2_AUTO_PERSONALIZATION_EXAMPLES = [
  "Quero acompanhar meu pedido",
  "Não recebi meu código",
  "Quanto custa o Uber carro?",
  "Como vejo minhas indicações?",
  "Preciso agendar minha foto",
  "Quero falar com atendente",
] as const;

function normalizeQuestion(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

function safeVerifiedFirstName(value: string | undefined): string {
  const first = String(value ?? "").trim().split(/\s+/)[0] ?? "";
  return /^\p{L}{2,25}$/u.test(first) ? first : "";
}

/** Somente intenção de FAQ público; nenhuma consulta ou alteração de pedido. */
export function classifyH2AutoPersonalizedQuestion(input: string): H2AutoPersonalizedTopic | null {
  if (typeof input !== "string" || input.length > 280) return null;
  const raw = input.trim();
  if (!raw || /\b(?:https?:\/\/|www\.)/i.test(raw) || raw.includes("@")) return null;
  const text = normalizeQuestion(raw);
  // Códigos, telefones, CPF, CNPJ e comandos continuam com os fluxos existentes.
  if (/\d{5,}/.test(text) || /^(?:menu|inicio|início|0|[1-9]|10|\/h2|\/h3)$/i.test(text))
    return null;
  if (/\b(?:atendente|pessoa real|atendimento humano|falar com alguem|falar com uma pessoa)\b/.test(text))
    return "atendimento";
  if (/\b(?:codigo|e-mail|email|verificacao|confirmacao)\b/.test(text))
    return "codigo";
  if (/\b(?:novo pedido|fazer pedido|comprar conta|fazer cadastro|me cadastrar)\b/.test(text))
    return "novo_pedido";
  if (/\b(?:status|acompanhar|acompanhamento|andamento|meu pedido|meus pedidos|entrega do pedido)\b/.test(text))
    return "acompanhar";
  if (/\b(?:indicacoes|indicacao|indiquei|indicador|comissao|comissoes|receber comissao)\b/.test(text))
    return "indicacoes";
  if (/\b(?:preco|precos|valor|valores|quanto custa|tabela)\b/.test(text))
    return "valores";
  if (/\b(?:agendar foto|agendamento|foto de perfil|marcar foto|tirar foto)\b/.test(text))
    return "foto";
  if (/\b(?:emprestimo|emprestimos|parcela|parcelas)\b/.test(text))
    return "emprestimos";
  if (/\b(?:gastos|lucro|lucros|controle de corridas|calcular lucro)\b/.test(text))
    return "gastos";
  if (/\b(?:ajuda|duvida|como funciona|nao entendi|me explica)\b/.test(text) || /^\?{1,3}$/.test(text))
    return "ajuda";
  return null; // Sem inventar resposta para dúvidas desconhecidas.
}

const PUBLIC_GUIDANCE: Record<H2AutoPersonalizedTopic, string> = {
  atendimento: "👨‍💻 Para falar com nossa equipe, use a opção *Falar com atendente* no menu. Não encaminhei seu atendimento automaticamente.",
  codigo: "📧 Se já solicitou um código, confira o e-mail cadastrado e a pasta de spam. Se ele não chegou, solicite outro pelo fluxo de confirmação quando o prazo permitir. Nunca envie o código no grupo ou a terceiros.",
  novo_pedido: "🆕 Para fazer um pedido, escolha *Ainda não sou cliente* no menu e informe o telefone de quem indicou você.",
  acompanhar: "📦 Para conferir o status real do seu pedido, escolha *Já sou cliente* → *Acompanhar pedido*. A consulta exige a confirmação do seu cadastro.",
  indicacoes: "💰 Para ver suas indicações e comissões, selecione *Minhas indicações* no menu e confirme seu acesso.",
  valores: "💵 Para consultar os valores atuais, escolha *Tabela de preço* no menu do H2 AUTO. Assim você vê as opções atualizadas.",
  foto: "📸 Para agendar sua foto, selecione *Agendar foto* no menu do cliente. Confira seu pedido antes de escolher o horário.",
  emprestimos: "💳 Para consultar empréstimos e parcelas, acesse *Empréstimos* pelo menu. Os dados individuais exigem acesso confirmado.",
  gastos: "📊 Para acompanhar gastos e lucros, escolha *Calcule seus lucros* no menu ou acesse https://h2colombiano.com/gastos.",
  ajuda: "💬 Posso orientar sobre pedidos, preços, fotos, comissões, código de acesso, empréstimos e atendimento. Diga o assunto que procura.",
};

export function getH2AutoPersonalizedReply(
  input: string,
  config: H2AutoPersonalization = H2_AUTO_PERSONALIZATION_DEFAULT,
  context: H2AutoPersonalizedContext = {},
): H2AutoPersonalizedAnswer | null {
  if (!config.enabled) return null;
  const topic = classifyH2AutoPersonalizedQuestion(input);
  if (!topic) return null;
  const name = config.verifiedName && context.verified
    ? safeVerifiedFirstName(context.verifiedFirstName) : "";
  const greeting = config.tone === "acolhedor" ? (name ? "Oi, " + name + "! 😊" : "Entendi! 😊")
    : config.tone === "profissional" ? (name ? name + ", posso orientar você." : "Posso orientar você.")
      : name ? name + ", vamos lá." : "Certo.";
  const reminder = context.stage === "customer_phone"
    ? "\n\n📱 Para continuar a confirmação, informe seu telefone com DDD."
    : "";
  return {
    topic,
    message: "⚡ *H2 COLOMBIANO* 🇨🇴\n\n" + greeting + "\n\n" + PUBLIC_GUIDANCE[topic] +
      reminder + "\n\n🏠 *MENU* início | 🔙 *0* voltar",
  };
}
