export type ZohoProvisioningUser = {
  primaryEmailAddress?: string | null;
};

export function normalizeZohoDomain(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export function domainsObservedOnZohoUsers(users: ZohoProvisioningUser[]) {
  return [...new Set(users
    .map((user) => String(user.primaryEmailAddress || "").trim().toLowerCase())
    .filter((email) => email.includes("@"))
    .map((email) => normalizeZohoDomain(email.split("@").pop()))
    .filter(Boolean))];
}

/**
 * Existing users are the strongest evidence of which domain belongs to a Zoho organization.
 * A stale DB value must never make us provision a domain into the wrong organization.
 */
export function resolveZohoProvisioningDomain(configDomain: unknown, users: ZohoProvisioningUser[]) {
  const configured = normalizeZohoDomain(configDomain);
  const observed = domainsObservedOnZohoUsers(users);
  if (observed.length === 1) return observed[0];
  if (observed.length > 1 && configured && observed.includes(configured)) return configured;
  if (observed.length > 0) return observed[0];
  return configured;
}

export function buildZohoCreateUserPayload(input: {
  primaryEmailAddress: string;
  displayName: string;
  password: string;
  firstName?: string;
  lastName?: string;
}) {
  return {
    primaryEmailAddress: input.primaryEmailAddress.trim().toLowerCase(),
    password: input.password,
    firstName: input.firstName?.trim() || "",
    lastName: input.lastName?.trim() || "",
    displayName: input.displayName.trim(),
    role: "member" as const,
    oneTimePassword: false,
  };
}

function nestedErrorObject(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (item && typeof item === "object" && !Array.isArray(item)) return item as Record<string, unknown>;
    }
    return null;
  }
  if (typeof payload === "object") return payload as Record<string, unknown>;
  return null;
}

export function describeZohoApiError(payload: unknown, httpStatus: number) {
  const root = nestedErrorObject(payload) || {};
  const status = root.status && typeof root.status === "object" ? root.status as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : {};
  const arrayDetail = Array.isArray(payload) ? nestedErrorObject(payload.slice(1)) || {} : {};
  const errorCode = String(data.errorCode || root.errorCode || arrayDetail.errorCode || arrayDetail.code || arrayDetail.msg || "").trim();
  let message = String(status.description || root.error || root.message || data.message || arrayDetail.message || arrayDetail.msg || "").trim();

  if (errorCode === "EMAILADDRESS_ALREADY_EXISTS") message = "Este email já existe no Zoho Mail";
  else if (errorCode === "INVALID_PASSWORD") message = "Senha inválida — use pelo menos 8 caracteres com maiúscula, minúscula, número e caractere especial";
  else if (errorCode === "ACCOUNT_LIMIT_EXCEEDED") message = "Limite de contas atingido neste servidor (máx. 5 no plano FREE)";
  else if (errorCode === "INVALID_EMAILADDRESS") message = "Endereço de email inválido";
  else if (errorCode === "USERNAME_NOT_SET") message = "Zoho recusou os dados do usuário (USERNAME_NOT_SET)";

  if (!message) message = `Falha não detalhada pelo Zoho (HTTP ${httpStatus})`;
  return { message, errorCode };
}
