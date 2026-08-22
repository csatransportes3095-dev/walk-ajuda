export const PUBLIC_SITE_ORIGIN = "https://h2colombiano.com";

/**
 * Converte links antigos do domínio Walk Ajuda para a origem pública atual.
 * O texto salvo permanece intacto; a normalização é aplicada somente no link
 * que será exibido ou enviado ao cliente.
 */
export function normalizePublicSiteLinks(value: string): string {
  return String(value || "").replace(
    /https?:\/\/(?:www\.)?walkajuda\.com(?=\/|\b)/gi,
    PUBLIC_SITE_ORIGIN,
  );
}

export function publicSiteUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${PUBLIC_SITE_ORIGIN}${normalizedPath}`;
}

/**
 * URL exclusiva para compartilhamento no WhatsApp. Ela mantém o acesso normal
 * ao acompanhamento, mas tem caminho próprio para o WhatsApp buscar uma nova
 * miniatura em vez de reutilizar o cache antigo da URL operacional.
 */
export function publicTrackingShareUrl(): string {
  return publicSiteUrl("/link/acompanhamento");
}

/** Normaliza links salvos em templates de WhatsApp para a URL de compartilhamento. */
export function normalizeWhatsAppTrackingLinks(value: string): string {
  const normalized = normalizePublicSiteLinks(value);
  return normalized.replace(
    /https:\/\/h2colombiano\.com\/acompanhar(?:\?[^\s]*)?/gi,
    publicTrackingShareUrl(),
  );
}
