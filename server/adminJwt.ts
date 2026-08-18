/**
 * O painel administrativo só pode assinar ou validar tokens quando há um
 * segredo configurado no ambiente. Nunca use fallback previsível em código.
 */
export function getAdminJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}
