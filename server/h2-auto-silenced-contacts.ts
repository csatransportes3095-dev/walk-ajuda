/**
 * Blocking by number is exact, with/without Brazilian country code.
 * Never treat a saved display name as a telephone number.
 */
export function normalizeSilencedPhone(raw: string): string | null {
  const value = raw.trim().replace(/[\s()+.\-]/g, "");
  if (!/^\d{10,13}$/.test(value)) return null;
  const digits = value.startsWith("55") && value.length >= 12 ? value.slice(2) : value;
  if (!/^\d{2}9?\d{8}$/.test(digits) || digits.startsWith("0")) return null;
  return digits;
}
export function silencedEntries(blocked: string): string[] {
  return blocked.split(/[\n;,]/).map(s=>s.trim()).filter(Boolean);
}
export function manualSilencedPhones(blocked: string): string[] {
  return [...new Set(silencedEntries(blocked).map(s=>normalizeSilencedPhone(s)).filter((s):s is string=>!!s))];
}
export function changeSilencedPhone(blocked: string, phone: string, action: "block" | "release") {
  const normalized=normalizeSilencedPhone(phone);
  if (!normalized) throw new Error("Informe telefone com DDD, 10 ou 11 dígitos, sem nomes.");
  const existing=silencedEntries(blocked).filter(entry=>normalizeSilencedPhone(entry)!==normalized);
  if (action==="block") existing.push(normalized);
  const result=existing.join("\n");
  if(result.length>10000) throw new Error("Limite de contatos atingido.");
  return result;
}
