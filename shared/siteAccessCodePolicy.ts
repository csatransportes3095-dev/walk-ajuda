export const SITE_CODE_LENGTH = 6;
export const SITE_CODE_ALPHABET = '0123456789';
export const SITE_CODE_LIFETIME_MS = 10 * 60 * 1000;
export const SITE_ACCESS_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const SITE_CODE_RESEND_SECONDS = 60;

export function normalizeSiteCode(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80) return '';
  // Preserve leading zeroes and accept pasted separators, but never turn letters into digits.
  return value.replace(/[\s-]/g, '');
}
export function validSiteCode(value: string): boolean {
  return /^[0-9]{6}$/.test(value);
}
export function displaySiteCode(value: string): string {
  return value;
}
export function siteAccessReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value) ||
      /^\/(?:admin|api|site-access)(?:\/|\?|$)/i.test(value)) return '/';
  return value;
}
