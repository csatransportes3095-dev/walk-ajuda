/**
 * Reconhece endereços escritos nas orientações globais do Pedido Entregue.
 * Retorna apenas texto e URLs http(s): o React cria as âncoras com escape normal,
 * sem interpretar HTML ou alterar o conteúdo gravado no ADM.
 */
export type DeliveredGuideTextPart = { text: string; href?: string };

const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{2,5})?(?:\/[^\s<>"']*)?/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)\]}]+$/;

function linkHref(text: string): string | null {
  try {
    const candidate = /^https?:\/\//i.test(text) ? text : "https://" + text;
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function splitDeliveredGuideLinks(input: string): DeliveredGuideTextPart[] {
  const source = String(input || "");
  const parts: DeliveredGuideTextPart[] = [];
  let cursor = 0;
  for (const match of source.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    // Não transformar o domínio que aparece dentro de um endereço de e-mail.
    if (index > 0 && /[@\w-]/.test(source[index - 1])) continue;
    const visible = match[0].replace(TRAILING_PUNCTUATION, "");
    const href = visible ? linkHref(visible) : null;
    if (!href || index < cursor) continue;
    if (index > cursor) parts.push({ text: source.slice(cursor, index) });
    parts.push({ text: visible, href });
    cursor = index + visible.length;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor) });
  return parts.length ? parts : [{ text: source }];
}
