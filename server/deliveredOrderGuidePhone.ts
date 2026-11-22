/**
 * Pedido Entregue: compatibilidade de telefones brasileiros (com/sem o nono
 * dígito) ao vincular o link individual à sessão autenticada do cliente.
 * Não aceita comparação só pelos últimos dígitos nem números sem DDD.
 */
function canonicalGuidePhone(input: string | null | undefined): string {
  let digits = String(input || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 11 && digits[2] === "9") return digits.slice(0, 2) + digits.slice(3);
  return digits.length === 10 ? digits : "";
}

export function sameDeliveredGuideCustomerPhone(
  sessionPhone: string | null | undefined,
  orderPhone: string | null | undefined,
): boolean {
  const session = canonicalGuidePhone(sessionPhone);
  const order = canonicalGuidePhone(orderPhone);
  return session.length === 10 && session === order;
}
