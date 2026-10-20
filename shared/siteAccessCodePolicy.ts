export const SITE_CODE_LENGTH = 12;
export const SITE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const SITE_CODE_LIFETIME_MS = 10 * 60 * 1000;
export const SITE_ACCESS_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const SITE_CODE_RESEND_SECONDS = 60;

export function normalizeSiteCode(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80) return '';
  return value.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
export function validSiteCode(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(value);
}
export function displaySiteCode(value: string): string {
  return value.replace(/(.{4})(?=.)/g, '$1-');
}
export function siteAccessReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value) ||
      /^\/(?:admin|api|site-access)(?:\/|\?|$)/i.test(value)) return '/';
  return value;
}
