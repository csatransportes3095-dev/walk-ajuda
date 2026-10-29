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

/** Menu cannot bypass a phone-number challenge or a persistent block.
 * It remains available only while the customer is entering a verification code.
 */
export function allowsH2AutoMenuReset(stage: string, answer: string): boolean {
  if (stage !== "customer_code") return false;
  const normalized = answer.trim().toLowerCase();
  return normalized === "menu" || normalized === "inicio";
}

/** Phone stages reject every non-mobile answer, including MENU, 0 and words. */
export function invalidH2AutoPhoneStageAnswer(stage: string, answer: string): boolean {
  return (stage === "customer_phone" || stage === "referrals_phone" || stage === "referral_phone") &&
    !validH2AutoPhone11(answer);
}

/** Navigation takes priority over phone format validation, never over a block. */
export function h2AutoNavigationCommand(answer: string): "home" | "back" | null {
  const normalized=answer.trim().toLowerCase();
  if (normalized==="menu" || normalized==="inicio" || normalized==="início" || normalized==="manu") return "home";
  if (normalized==="0" || normalized==="voltar") return "back";
  return null;
}
