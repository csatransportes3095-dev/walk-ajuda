import { isValidCPF, normalizeCpf } from "./cpf";

export const CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS = [
  { id: "name", label: "Nome completo" },
  { id: "phone", label: "Telefone" },
  { id: "cpf", label: "CPF" },
  { id: "email", label: "E-mail" },
  { id: "city", label: "Cidade" },
  { id: "uf", label: "Estado (UF)" },
  { id: "profilePhotoUrl", label: "Foto de perfil" },
] as const;

export type CustomerProfileUpdateField = (typeof CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS)[number]["id"];

const VALID_FIELDS = new Set<string>(CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS.map((field) => field.id));

export function normalizeCustomerProfileUpdateFields(value: unknown): CustomerProfileUpdateField[] {
  if (!Array.isArray(value)) return [];
  const fields: CustomerProfileUpdateField[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !VALID_FIELDS.has(item)) continue;
    const field = item as CustomerProfileUpdateField;
    if (!fields.includes(field)) fields.push(field);
  }
  return fields;
}

export function customerProfileFieldLabel(field: string): string {
  return CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS.find((option) => option.id === field)?.label || field;
}

export function customerProfileFieldIsMissing(customer: any, field: CustomerProfileUpdateField): boolean {
  switch (field) {
    case "name":
      return String(customer?.name || "").trim().length < 2 || /recuperad[oa]/i.test(String(customer?.name || ""));
    case "phone": {
      const phone = String(customer?.phone || "").replace(/\D/g, "");
      return phone.length < 10 || phone.length > 11;
    }
    case "cpf": {
      const cpf = normalizeCpf(customer?.cpf);
      return !cpf || !isValidCPF(cpf);
    }
    case "email":
      return !/^\S+@\S+\.\S+$/.test(String(customer?.email || "").trim());
    case "city":
      return String(customer?.city || "").trim().length < 2;
    case "uf":
      return !/^[A-Z]{2}$/.test(String(customer?.uf || "").trim().toUpperCase());
    case "profilePhotoUrl":
      return !String(customer?.profilePhotoUrl || "").trim();
    default:
      return true;
  }
}

export function getDefaultIncompleteCustomerFields(customer: any): CustomerProfileUpdateField[] {
  return CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS
    .map((field) => field.id)
    .filter((field) => customerProfileFieldIsMissing(customer, field));
}

export function getEffectiveCustomerProfileUpdateFields(
  customer: any,
  configuredFields: unknown,
  enabled: boolean,
): CustomerProfileUpdateField[] {
  // O ADM pode exigir novamente campos específicos mesmo já preenchidos.
  const fields = enabled ? normalizeCustomerProfileUpdateFields(configuredFields) : [];

  // Regra global: nenhum cadastro incompleto pode ser liberado. Todos os campos
  // obrigatórios que estiverem ausentes/invalidos entram automaticamente na
  // atualização, mesmo que o ADM tenha solicitado somente um campo ou nenhum.
  for (const missingField of getDefaultIncompleteCustomerFields(customer)) {
    if (!fields.includes(missingField)) fields.push(missingField);
  }
  return fields;
}

export function getCustomerProfileUpdateFieldLabels(fields: unknown): string[] {
  return normalizeCustomerProfileUpdateFields(fields).map(customerProfileFieldLabel);
}
