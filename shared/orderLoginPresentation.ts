import { z } from 'zod';

// A manual string, never an integer or an automatically generated OTP.
export const cnhCodeSchema = z.string().regex(/^(?:[0-9]{6})?$/, 'Informe os 6 números do código CNH ou deixe vazio.');
export function cleanLoginText(value: string | null | undefined): string | null {
  return value && value !== 'NULL' && value.trim() ? value : null;
}
export type OrderGroupDefault = { groupLink: string | null };
export function resolveOrderGroupLink(defaults: OrderGroupDefault | null, legacy?: string | null): string | null {
  // A saved null is an explicit global removal. Never resurrect legacy links.
  return defaults === null ? cleanLoginText(legacy) : cleanLoginText(defaults.groupLink);
}
export function safeLoginLink(value: string | null | undefined): string | null {
  const raw = cleanLoginText(value)?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return null;
    // Refuse arbitrary URI schemes rather than converting them into a host.
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null;
    return url.toString();
  } catch { return null; }
}
export const globalOrderGroupSchema = z.object({
  groupLink: z.string().max(1024).refine(v => v.trim() === '' || safeLoginLink(v) !== null, 'Informe um link http ou https válido.'),
  expectedRevision: z.number().int().min(0),
});
export function loginOptionalFields(input: { cnhCode?: string; emailLink?: string; loginGroupLink?: string }) {
  // Missing fields from an older tab must not erase newer data.
  return {
    ...(input.cnhCode !== undefined ? { cnhCode: cnhCodeSchema.parse(input.cnhCode) || null } : {}),
    ...(input.emailLink !== undefined ? { emailLink: input.emailLink || null } : {}),
    ...(input.loginGroupLink !== undefined ? { loginGroupLink: input.loginGroupLink || null } : {}),
  };
}
export function escapeLoginHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
