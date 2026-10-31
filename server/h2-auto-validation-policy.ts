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

/** The first numbered option must be processed even when a conversation has
 * no existing server session. Otherwise the client sees the opening menu again,
 * and a retry of '2' is incorrectly counted as a phone validation attempt.
 */
export function initialH2AutoChoiceStage(input: string):
  "customer_phone" | "referral_phone" | "referrals_phone" | null {
  switch (input.trim()) {
    case "1": return "customer_phone";
    case "2": return "referral_phone";
    case "3": return "referrals_phone";
    default: return null;
  }
}

/** Ignore only exact repeated selections matching the current phone stage.
 * Never grant access or reset a security block with these duplicate inputs.
 */
export function repeatedH2AutoChoice(stage: string, input: string): boolean {
  return initialH2AutoChoiceStage(input) === stage;
}

/** Navigation takes priority over phone format validation, never over a block. */
export function h2AutoNavigationCommand(answer: string): "home" | "back" | null {
  const normalized=answer.trim().toLowerCase();
  if (normalized==="menu" || normalized==="inicio" || normalized==="início" || normalized==="manu") return "home";
  if (normalized==="0" || normalized==="voltar") return "back";
  return null;
}
