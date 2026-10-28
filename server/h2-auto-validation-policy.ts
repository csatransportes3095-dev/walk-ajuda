/**
 * Strict 11-digit Brazilian cellphone answer with DDD.
 * Format only: client/referrer eligibility is verified separately.
 */
export function validH2AutoPhone11(answer: string): boolean {
  if (typeof answer !== "string") return false;
  const value = answer.trim();
  if (!/^[1-9][1-9]9[0-9]{8}$/.test(value)) return false;
  if (/^(.)\1{10}$/.test(value)) return false;
  return true;
}
