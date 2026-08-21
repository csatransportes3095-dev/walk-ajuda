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
