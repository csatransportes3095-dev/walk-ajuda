/**
 * Pesquisa pública do FAQ /ajuda.
 * Não altera os registros: agrupa as perguntas e busca em pergunta + resposta.
 */
export type PublicHelpQuestion = {
  id: string | number;
  question: string;
  answer: string;
};

export type HelpQuestionGroup<T extends PublicHelpQuestion> = {
  id: string;
  title: string;
  items: T[];
};

const topics = [
  { id: "chip", title: "CHIP E LINHA", words: ["chip", "sim card", "operadora", "linha telefonica"] },
  { id: "nome", title: "NOME E DOCUMENTOS", words: ["nome", "sobrenome"] },
  { id: "android", title: "CELULAR E ANDROID", words: ["android", "celular", "aparelho", "hard reset", "formatar", "reset"] },
  { id: "iphone", title: "IPHONE", words: ["iphone", "ios"] },
  { id: "wifi", title: "INTERNET E WI-FI", words: ["wi fi", "wifi", "internet", "dados moveis", "rede movel"] },
  { id: "whatsapp", title: "WHATSAPP", words: ["whatsapp", "whats app"] },
  { id: "foto", title: "FOTO E AGENDAMENTO", words: ["foto", "fotografia", "agendamento", "agendar", "oculos", "barba"] },
  { id: "cadastro", title: "CADASTRO E ACESSO", words: ["cadastro", "cadastrar", "login", "acesso"] },
  { id: "pedido", title: "PEDIDOS E GARANTIAS", words: ["pedido", "pagamento", "garantia", "entrega", "preco", "valor"] },
] as const;

const stopWords = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas",
  "eu", "me", "meu", "minha", "meus", "minhas",
  "de", "do", "da", "dos", "das", "no", "na", "nos", "nas",
  "com", "sem", "por", "para", "pra", "em", "ao", "aos",
  "e", "ou", "que", "qual", "quais", "como", "onde", "quando", "se",
  "posso", "pode", "podem", "quero", "preciso", "gostaria", "tenho",
  "tem", "ja", "devo", "faco", "fazer", "ser", "estar", "esta",
]);

// Verbos genéricos não criam grupos extras quando há um assunto específico.
const genericActions = new Set(["cadastrar", "cadastra", "cadastro", "usar", "utilizar", "colocar", "registrar", "trocar"]);

export function normalizeHelpText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getHelpSearchWords(search: string): string[] {
  const tokens = normalizeHelpText(search)
    .split(" ")
    .filter(Boolean)
    .map(word => word === "chio" ? "chip" : word) // erro comum de digitação do exemplo
    .filter(word => word.length > 2 && !stopWords.has(word));
  const unique = Array.from(new Set(tokens)).slice(0, 12);
  if (unique.length <= 1) return unique;
  const specific = unique.filter(word => !genericActions.has(word));
  return specific.length ? specific : unique;
}

function matchingTopics(text: string) {
  return topics.filter(topic => topic.words.some(word => text.includes(word)));
}

/**
 * Sem busca: árvore temática. A pergunta prevalece sobre palavras ocasionais
 * da resposta; assuntos mistos podem aparecer em até dois grupos.
 *
 * Com busca: um grupo por palavra relevante, sempre procurando tanto nas
 * perguntas quanto nas respostas (OU entre as palavras).
 */
export function groupHelpQuestions<T extends PublicHelpQuestion>(items: T[], query: string): {
  groups: HelpQuestionGroup<T>[];
  totalMatches: number;
  keywords: string[];
} {
  if (query.trim()) {
    const keywords = getHelpSearchWords(query);
    const groups = keywords.map(word => ({
      id: "word-" + word,
      title: "PALAVRA: " + word.toLocaleUpperCase("pt-BR"),
      items: items.filter(item =>
        normalizeHelpText(item.question + " " + item.answer).includes(word)),
    })).filter(group => group.items.length > 0);
    return {
      groups,
      totalMatches: new Set(groups.flatMap(group => group.items.map(item => item.id))).size,
      keywords,
    };
  }

  const byTopic = new Map<string, T[]>(topics.map(topic => [topic.id, []]));
  byTopic.set("outros", []);
  for (const item of items) {
    const questionMatches = matchingTopics(normalizeHelpText(item.question));
    const found = questionMatches.length
      ? questionMatches
      : matchingTopics(normalizeHelpText(item.answer));
    if (!found.length) {
      byTopic.get("outros")!.push(item);
    } else {
      for (const topic of found.slice(0, 2)) byTopic.get(topic.id)!.push(item);
    }
  }

  const groups: HelpQuestionGroup<T>[] = [
    ...topics.map(topic => ({
      id: "topic-" + topic.id,
      title: topic.title,
      items: byTopic.get(topic.id)!,
    })),
    { id: "topic-outros", title: "OUTRAS DÚVIDAS", items: byTopic.get("outros")! },
  ].filter(group => group.items.length > 0);

  return { groups, totalMatches: items.length, keywords: [] };
}
