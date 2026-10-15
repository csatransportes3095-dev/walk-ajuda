/** Shared only by profile-photo upload/recovery; does not change login identity rules. */
export function normalizeProfilePhotoPhone(value: unknown): string {
  let phone = String(value ?? "").replace(/\D/g, "");
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) phone = phone.slice(2);
  return /^\d{10,11}$/.test(phone) ? phone : "";
}

export function profilePhotoKeyTimestamp(key: string, phone: string): number | null {
  const match = /^profile-photos\/([+() 0-9-]+)-(\d{13})(?:-[a-f0-9-]{36})?\.(?:jpe?g|png|webp)$/i.exec(key);
  const normalized = normalizeProfilePhotoPhone(phone);
  if (!match || !normalized || normalizeProfilePhotoPhone(match[1]) !== normalized) return null;
  return Number(match[2]);
}

export function profilePhotoPrefixes(phone: string): string[] {
  const normalized = normalizeProfilePhotoPhone(phone);
  if (!normalized) return [];
  const aliases = [normalized, `55${normalized}`];
  const raw = String(phone).trim();
  if (/^[+() 0-9-]+$/.test(raw)) aliases.push(raw);
  return [...new Set(aliases)].map(value => `profile-photos/${value}-`);
}
