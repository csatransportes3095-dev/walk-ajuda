import { ENV } from "./_core/env";

const ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const ZOHO_API_BASE = "https://mail.zoho.com/api";
const ZOHO_USER_API_BASE = "https://mail.zoho.com/api";

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const params = new URLSearchParams({
    refresh_token: ENV.zohoRefreshToken,
    grant_type: "refresh_token",
    client_id: ENV.zohoClientId,
    client_secret: ENV.zohoClientSecret,
  });

  const res = await fetch(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!data.access_token) {
    throw new Error(`Zoho token error: ${data.error ?? "unknown"}`);
  }

  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000;
  return cachedAccessToken;
}

async function zohoRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getAccessToken();
  const url = `${ZOHO_API_BASE}/organization/${ENV.zohoOrgId}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as {
    status?: { code: number; description: string };
    data?: T;
    error?: string;
  };

  if (!res.ok || (json.status && json.status.code >= 400)) {
    const errorCode = (json.data as any)?.errorCode ?? "";
    let message = json.status?.description ?? json.error ?? "unknown";
    if (errorCode === "EMAILADDRESS_ALREADY_EXISTS") message = "Este email já existe no Zoho Mail";
    else if (errorCode === "INVALID_PASSWORD") message = "Senha inválida — use pelo menos 8 caracteres com letras e números";
    else if (errorCode === "ACCOUNT_LIMIT_EXCEEDED") message = "Limite de contas atingido no plano atual";
    else if (errorCode === "INVALID_EMAILADDRESS") message = "Endereço de email inválido";
    throw new Error(message);
  }

  return (json.data ?? json) as T;
}

export interface ZohoUser {
  accountId: string;
  zuid: number;
  primaryEmailAddress: string;
  displayName: string;
  firstName: string;
  lastName: string;
  role: string;
  enabled: boolean;
  mailboxStatus: string;
  accountCreationTime: number;
  lastLogin: number;
  planStorage: number;
  usedStorage: number;
  timeZone: string;
  country: string;
}

export interface CreateUserInput {
  primaryEmailAddress: string;
  displayName: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export async function listZohoUsers(limit = 50): Promise<ZohoUser[]> {
  const data = await zohoRequest<ZohoUser[]>(
    "GET",
    `/accounts?limit=${limit}`
  );
  return Array.isArray(data) ? data : [];
}

export async function createZohoUser(input: CreateUserInput): Promise<ZohoUser> {
  return zohoRequest<ZohoUser>("POST", "/accounts", {
    primaryEmailAddress: input.primaryEmailAddress,
    displayName: input.displayName,
    password: input.password,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
  });
}

export async function deleteZohoUser(emailAddress: string): Promise<void> {
  await zohoRequest<unknown>("DELETE", "/accounts", {
    emailList: [emailAddress],
  });
}

export async function resetZohoPassword(
  emailAddress: string,
  newPassword: string
): Promise<void> {
  // Find the user's accountId first
  const users = await listZohoUsers(200);
  const user = users.find((u) => u.primaryEmailAddress === emailAddress);
  if (!user) throw new Error("Usuário não encontrado");

  await zohoRequest<unknown>("PUT", `/accounts/${user.accountId}/password`, {
    password: newPassword,
  });
}

export async function toggleZohoUser(
  emailAddress: string,
  enabled: boolean
): Promise<void> {
  const users = await listZohoUsers(200);
  const user = users.find((u) => u.primaryEmailAddress === emailAddress);
  if (!user) throw new Error("Usuário não encontrado");

  await zohoRequest<unknown>("PUT", `/accounts/${user.accountId}`, {
    enabled,
  });
}

// ─── Funções de leitura de e-mails (inbox) ────────────────────────────────────

async function zohoUserRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getAccessToken();
  const url = `${ZOHO_USER_API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as {
    status?: { code: number; description: string };
    data?: T;
    error?: string;
  };

  if (!res.ok || (json.status && json.status.code >= 400)) {
    throw new Error(json.status?.description ?? json.error ?? "Erro na API do Zoho");
  }

  return (json.data ?? json) as T;
}

export interface ZohoMailAccount {
  accountId: string;
  incomingUserName: string;
  emailAddress: { mailId: string; isPrimary: boolean }[];
}

export interface ZohoMessage {
  messageId: string;
  subject: string;
  fromAddress: string;
  toAddress: string;
  receivedTime: string;
  size: number;
  status: string; // "0" = unread, "1" = read
  summary: string;
  folderId: string;
  hasAttachment: boolean;
}

export interface ZohoMessageContent {
  messageId: string;
  subject: string;
  fromAddress: string;
  toAddress: string;
  receivedTime: string;
  content: string;
  htmlContent?: string;
}

// Listar contas de e-mail do usuário autenticado
export async function listMailAccounts(): Promise<ZohoMailAccount[]> {
  const data = await zohoUserRequest<{ data: ZohoMailAccount[] }>("GET", "/accounts");
  return Array.isArray((data as any).data) ? (data as any).data : Array.isArray(data) ? (data as any) : [];
}

// Resolver o folderId real da inbox (a API Zoho não aceita a string "inbox")
async function resolveInboxFolderId(accountId: string): Promise<string> {
  const folders = await listFolders(accountId);
  const inbox = folders.find(f => f.folderName?.toLowerCase() === 'inbox');
  return inbox?.folderId ?? '';
}

// Listar mensagens da inbox de uma conta
export async function listInboxMessages(
  accountId: string,
  folderId = "inbox",
  limit = 20,
  start = 0
): Promise<ZohoMessage[]> {
  // Se folderId for "inbox" (string literal), resolver para o ID numérico real
  const resolvedFolderId = folderId === 'inbox' ? await resolveInboxFolderId(accountId) : folderId;
  if (!resolvedFolderId) return [];
  const data = await zohoUserRequest<any>(
    "GET",
    `/accounts/${accountId}/messages/view?folderId=${resolvedFolderId}&limit=${limit}&start=${start}&sortorder=false`
  );
  const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return arr;
}

// Ler conteúdo de uma mensagem
export async function getMessageContent(
  accountId: string,
  messageId: string
): Promise<ZohoMessageContent> {
  return zohoUserRequest<ZohoMessageContent>(
    "GET",
    `/accounts/${accountId}/messages/${messageId}/content`
  );
}

// Marcar mensagem como lida
export async function markMessageRead(
  accountId: string,
  messageId: string
): Promise<void> {
  await zohoUserRequest<unknown>(
    "PUT",
    `/accounts/${accountId}/updatemessage`,
    { mode: "markAsRead", messageId: [messageId] }
  );
}

// Listar pastas de uma conta
export async function listFolders(accountId: string): Promise<{ folderId: string; folderName: string; unreadCount: number }[]> {
  const data = await zohoUserRequest<any>(
    "GET",
    `/accounts/${accountId}/folders`
  );
  const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return arr;
}
