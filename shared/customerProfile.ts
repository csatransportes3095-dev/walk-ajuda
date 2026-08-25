const RECOVERED_CUSTOMER_NAME_PATTERN = /\bRECUPE(?:R)?AD[OA]\b/i;

export function isRecoveredCustomerName(value: unknown): boolean {
  const name = String(value ?? "").trim();
  return RECOVERED_CUSTOMER_NAME_PATTERN.test(name);
}
