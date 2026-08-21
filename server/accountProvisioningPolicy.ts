export const FINAL_ACCOUNT_PROVISIONING_STATUSES = ["entregue", "pedido_entregue", "login_de_acesso", "cancelado"] as const;

export type AccountProvisioningSearch =
  | { kind: "order"; value: string }
  | { kind: "customer"; value: string }
  | { kind: "phone_or_cpf"; value: string };

export function isOpenForAccountProvisioning(status: string | null | undefined): boolean {
  return !FINAL_ACCOUNT_PROVISIONING_STATUSES.includes(String(status || "").trim().toLowerCase() as typeof FINAL_ACCOUNT_PROVISIONING_STATUSES[number]);
}

export function parseAccountProvisioningSearch(rawValue: string): AccountProvisioningSearch {
  const raw = rawValue.trim();
  const digits = raw.replace(/\D/g, "");
  if (!raw) throw new Error("Informe telefone, CPF, *código de cadastro ou #pedido.");
  if (raw.startsWith("#")) {
    if (!/^\d+$/.test(raw.slice(1))) throw new Error("Número do pedido inválido.");
    return { kind: "order", value: raw.slice(1) };
  }
  if (raw.startsWith("*")) {
    if (!/^\d+$/.test(raw.slice(1))) throw new Error("Código de cadastro inválido.");
    return { kind: "customer", value: raw.slice(1) };
  }
  if (digits.length === 10 || digits.length === 11) return { kind: "phone_or_cpf", value: digits };
  throw new Error("Use telefone, CPF, *código de cadastro ou #pedido.");
}
