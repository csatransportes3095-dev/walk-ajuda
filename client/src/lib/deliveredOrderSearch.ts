/**
 * Busca local, exclusiva da aba Entregues. Nenhuma consulta ou alteracao no pedido.
 * *410 (ou 410) identifica o codigo de cadastro do cliente, nao o numero do pedido.
 */
export type DeliveredOrderSearchFields = {
  customerNumber?: number | string | null;
  customerName?: string | null;
  codeClientName?: string | null;
  customerEmail?: string | null;
  phone?: string | null;
};

const digitsOnly = (value: string) => value.replace(/\D/g, "");

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function matchesCustomerCode(customerNumber: number | string | null | undefined, term: string): boolean {
  if (customerNumber == null || !/^\d+$/.test(term)) return false;
  return String(Number(customerNumber)) === String(Number(term));
}

/** Usa apenas os campos ja retornados pelo ADM; pesquisa sem distinguir acentos ou formatacao. */
export function matchesDeliveredOrderSearch(order: DeliveredOrderSearchFields, rawQuery: string): boolean {
  const query = String(rawQuery ?? "").trim();
  if (!query) return true;

  // Codigo com asterisco: apenas cadastro exato (*410), sem confundir com telefone.
  if (query.startsWith("*")) {
    return matchesCustomerCode(order.customerNumber, query.slice(1).trim());
  }

  if (/^\d+$/.test(query) && matchesCustomerCode(order.customerNumber, query)) {
    return true;
  }

  const term = normalizeText(query);
  if ([order.customerName, order.codeClientName, order.customerEmail]
    .some(value => typeof value === "string" && normalizeText(value).includes(term))) {
    return true;
  }

  const queryDigits = digitsOnly(query);
  // Nao interpretar *410 ou trechos de 3 numeros como telefone.
  if (queryDigits.length < 6) return false;
  const phoneDigits = digitsOnly(order.phone ?? "");
  const nationalQuery = queryDigits.length === 13 && queryDigits.startsWith("55")
    ? queryDigits.slice(2) : queryDigits;
  const nationalPhone = phoneDigits.length === 13 && phoneDigits.startsWith("55")
    ? phoneDigits.slice(2) : phoneDigits;
  return phoneDigits.includes(queryDigits) || nationalPhone.includes(nationalQuery);
}
