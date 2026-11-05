import { z } from "zod";

/**
 * H2 AUTO: camada opcional de respostas contextuais, sem IA paga e sem acesso
 * a pedidos/códigos. Não substitui a árvore, MENU/0, validação ou handoff.
 */
/** Cada pergunta principal pode ter até 1.000 linhas de subperguntas.
 * O limite de caracteres comporta 1.000 frases de até 280 caracteres
 * (limite da entrada do atendimento), sem truncar texto salvo.
 */
export const H2_AUTO_FAQ_MAX_VARIATION_LINES = 1000;
export const H2_AUTO_FAQ_MAX_VARIATION_CHARS = 300000;
export function h2AutoFaqVariationLineCount(value: string): number {
  return value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length;
}
export const h2AutoFaqVariationsSchema = z.string().trim()
  .max(H2_AUTO_FAQ_MAX_VARIATION_CHARS, "Limite de caracteres das subperguntas excedido.")
  .refine(value => h2AutoFaqVariationLineCount(value) <= H2_AUTO_FAQ_MAX_VARIATION_LINES,
    "No máximo 1.000 linhas de subperguntas por pergunta principal.");

export const h2AutoFaqRuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{3,48}$/),
  question: z.string().trim().min(3).max(160),
  variations: h2AutoFaqVariationsSchema.default(""),
  answer: z.string().trim().min(3).max(1200),
  enabled: z.boolean().default(true),
}).strict();

export type H2AutoFaqRule = z.infer<typeof h2AutoFaqRuleSchema>;

export const h2AutoPersonalizationSchema = z.object({
  enabled: z.boolean().default(false),
  tone: z.enum(["acolhedor", "objetivo", "profissional"]).default("acolhedor"),
  verifiedName: z.boolean().default(true),
  faq: z.array(h2AutoFaqRuleSchema).max(1000).default([]),
  faqPresetsLoaded: z.boolean().default(false),
}).strict();

export type H2AutoPersonalization = z.infer<typeof h2AutoPersonalizationSchema>;
export type H2AutoPersonalizedTopic =
  | "atendimento" | "codigo" | "novo_pedido" | "acompanhar"
  | "indicacoes" | "valores" | "foto" | "emprestimos" | "gastos" | "ajuda" | "personalizada";

export const H2_AUTO_PERSONALIZATION_DEFAULT: H2AutoPersonalization = {
  enabled: false,
  tone: "acolhedor",
  verifiedName: true,
  faq: [],
  faqPresetsLoaded: false,
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

/** Normalização conservadora para comparar perguntas sem depender de botões. */
function normalizedFaqQuestion(value: string): string {
  return normalizeQuestion(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
const FAQ_STOP_WORDS = new Set(["eu","quero","queria","preciso","gostaria","poderia","como","qual","quais","onde","que","me","meu","minha","meus","minhas","um","uma","de","do","da","dos","das","com","o","a","os","as","para","por","em","no","na","tenho","pode","faz","fazem","fazer","ver","saber","esta","estou","voces","voce","vcs","tem","pra","favor"]);
function faqWords(question: string): Set<string> {
  // "99" é um nome de serviço, não um código de cliente. Preservar o
  // termo para distinguir perguntas sobre 99 de Uber, táxi ou login.
  // Nunca aceitar números longos (telefone, CPF ou código) como palavras.
  return new Set(normalizedFaqQuestion(question).split(" ")
    .filter(w => (w.length > 2 && /^[a-z]+$/.test(w) && !FAQ_STOP_WORDS.has(w)) ||
      w === "99"));
}
function faqMatchScore(input: string, candidate: string): number {
  const actual = normalizedFaqQuestion(input);
  const expected = normalizedFaqQuestion(candidate);
  if (!actual || !expected) return 0;
  if (actual === expected) return 1;
  const a = faqWords(actual), b = faqWords(expected);
  if (a.size < 2 || b.size < 2) return 0;
  let overlap=0;
  for (const word of a) if (b.has(word)) overlap++;
  const threshold = Math.max(2,Math.ceil(Math.max(a.size,b.size)*0.72));
  return overlap >= threshold ? overlap/Math.max(a.size,b.size) : 0;
}
/** Sem correspondência segura, nenhum FAQ é escolhido: preserva fluxo existente. */
function findCustomFaq(input: string, entries: H2AutoFaqRule[]): H2AutoFaqRule | null {
  let best: H2AutoFaqRule | null=null, bestScore=0, second=0;
  for (const rule of entries) {
    if (!rule.enabled) continue;
    const candidates=[rule.question,...rule.variations.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)];
    const score=Math.max(...candidates.map(q=>faqMatchScore(input,q)));
    if (score>bestScore){second=bestScore;bestScore=score;best=rule;}
    else if (score>second) second=score;
  }
  return best && bestScore>=0.72 && bestScore-second>0.05 ? best : null;
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
  if (/\b(?:agendar (?:minha |uma )?foto|agendamento|foto de perfil|marcar (?:minha |uma )?foto|tirar foto)\b/.test(text))
    return "foto";
  if (/\b(?:emprestimo|emprestimos|parcela|parcelas)\b/.test(text))
    return "emprestimos";
  if (/\b(?:gastos|lucro|lucros|controle de corridas|calcular lucro)\b/.test(text))
    return "gastos";
  if (/\b(?:ajuda|duvida|como funciona|nao entendi|me explica)\b/.test(text) || /^\?{1,3}$/.test(text))
    return "ajuda";
  return null; // Sem inventar resposta para dúvidas desconhecidas.
}

// Respostas automáticas são exclusivamente as perguntas personalizadas
// e variações aprovadas no ADM. Não criar respostas genéricas por assunto:
// sem regra correspondente, o servidor registra a pergunta na fila de aprendizado.

export function getH2AutoPersonalizedReply(
  input: string,
  config: Omit<H2AutoPersonalization, "faq"> & { faq?: H2AutoFaqRule[] } = H2_AUTO_PERSONALIZATION_DEFAULT,
  context: H2AutoPersonalizedContext = {},
): H2AutoPersonalizedAnswer | null {
  if (!config.enabled) return null;
  // Nunca captura comandos, códigos ou telefones; o fluxo de segurança tem prioridade.
  if (typeof input !== "string" || input.length > 280 || !input.trim() ||
      /\d{5,}/.test(input) || /^(?:menu|in[ií]cio|0|[1-9]|10|\/h2|\/h3)$/i.test(input.trim()) ||
      /@|https?:\/\/|www\./i.test(input)) return null;
  const rule = findCustomFaq(input,(config.faq ?? []));
  if (!rule) return null; // Não inventar resposta nem indicar menus que não existem.
  const name = config.verifiedName && context.verified
    ? safeVerifiedFirstName(context.verifiedFirstName) : "";
  const greeting = config.tone === "acolhedor" ? (name ? "Oi, " + name + "! 😊" : "Entendi! 😊")
    : config.tone === "profissional" ? (name ? name + ", posso orientar você." : "Posso orientar você.")
      : name ? name + ", vamos lá." : "Certo.";
  const reminder = context.stage === "customer_phone"
    ? "\n\n📱 Para continuar a confirmação, informe seu telefone com DDD."
    : "";
  return {
    topic: "personalizada",
    message: "⚡ *H2 COLOMBIANO* 🇨🇴\n\n" + greeting + "\n\n" + rule.answer +
      reminder + "\n\n💬 Pode enviar outra pergunta. Continuamos por aqui.",
  };
}
