import { ENV } from "./_core/env";

const ZOHO_TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const ZOHO_API_BASE = "https://mail.zoho.com/api";
const ZOHO_USER_API_BASE = "https://mail.zoho.com/api";

// Cache por servidor (configId -> token)
const tokenCache = new Map<number, { token: string; expiresAt: number }>();

// Cache de credenciais de todos os servidores ativos (expira em 30s)
let cachedActiveConfigs: any[] | null = null;
let configCacheExpiresAt = 0;

async function getAllActiveConfigs(): Promise<any[]> {
  const now = Date.now();
  if (cachedActiveConfigs && now < configCacheExpiresAt) {
    return cachedActiveConfigs;
  }
  try {
    const { listZohoOAuthConfigs } = await import('./db');
    const all = await listZohoOAuthConfigs();
    cachedActiveConfigs = all.filter((c: any) => c.isActive === 1);
    configCacheExpiresAt = now + 30_000;
    return cachedActiveConfigs;
  } catch (err) {
    console.warn("Erro ao buscar configs Zoho:", err);
    return [];
  }
}

async function getAccessTokenForConfig(config: any): Promise<string> {
  const now = Date.now();
  const cached = tokenCache.get(config.id);
  if (cached && now < cached.expiresAt - 60_000) {
    return cached.token;
  }

  const params = new URLSearchParams({
    refresh_token: config.zohoRefreshToken,
    grant_type: "refresh_token",
    client_id: config.zohoClientId,
    client_secret: config.zohoClientSecret,
  });

  const res = await fetch(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) {
    throw new Error(`Zoho token error (${config.name}): ${data.error ?? "unknown"}`);
  }

  tokenCache.set(config.id, { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

// Obter o primeiro servidor ativo (para operações que precisam de um servidor específico)
async function getPrimaryConfig(): Promise<any> {
  const configs = await getAllActiveConfigs();
  if (configs.length > 0) return configs[0];

  // Fallback para variáveis de ambiente
  if (!ENV.zohoOrgId || !ENV.zohoClientId || !ENV.zohoClientSecret || !ENV.zohoRefreshToken) {
    throw new Error("Credenciais Zoho não configuradas. Configure via painel Admin.");
  }
  return {
    id: 0,
    name: "ENV",
    zohoOrgId: ENV.zohoOrgId,
    zohoClientId: ENV.zohoClientId,
    zohoClientSecret: ENV.zohoClientSecret,
    zohoRefreshToken: ENV.zohoRefreshToken,
  };
}

// Fazer request para um servidor específico
async function zohoRequestForConfig<T>(
  config: any,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getAccessTokenForConfig(config);
  const url = `${ZOHO_API_BASE}/organization/${config.zohoOrgId}${path}`;

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
    else if (errorCode === "INVALID_PASSWORD") message = "Senha inválida â€” use pelo menos 8 caracteres com letras e números";
    else if (errorCode === "ACCOUNT_LIMIT_EXCEEDED") message = "Limite de contas atingido neste servidor (máx. 5 no plano FREE)";
    else if (errorCode === "INVALID_EMAILADDRESS") message = "Endereço de email inválido";
    throw new Error(message);
  }

  return (json.data ?? json) as T;
}

// Request para o servidor primário (compatibilidade com código existente)
async function zohoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const config = await getPrimaryConfig();
  return zohoRequestForConfig<T>(config, method, path, body);
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

export interface ZohoUserWithServer extends ZohoUser {
  serverId: number;
  serverName: string;
}

export interface CreateUserInput {
  primaryEmailAddress: string;
  displayName: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

// Listar utilizadores de um servidor específico
export async function listZohoUsersForConfig(config: any, limit = 50): Promise<ZohoUser[]> {
  try {
    const data = await zohoRequestForConfig<ZohoUser[]>(config, "GET", `/accounts?limit=${limit}`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`Erro ao listar utilizadores do servidor ${config.name}:`, err);
    return [];
  }
}

// Listar utilizadores de TODOS os servidores ativos, agrupados por servidor
export async function listAllZohoUsersGrouped(limit = 50): Promise<{ serverId: number; serverName: string; domain: string; users: ZohoUser[] }[]> {
  const configs = await getAllActiveConfigs();
  if (configs.length === 0) return [];
  const results = await Promise.all(
    configs.map(async (config: any) => ({
      serverId: config.id,
      serverName: config.name,
      domain: config.domain || 'h2colombiano.com',
      users: await listZohoUsersForConfig(config, limit),
    }))
  );
  return results;
}

// Listar todos os utilizadores de todos os servidores (lista plana com info do servidor)
export async function listZohoUsers(limit = 50): Promise<ZohoUserWithServer[]> {
  const grouped = await listAllZohoUsersGrouped(limit);
  return grouped.flatMap(g => g.users.map(u => ({ ...u, serverId: g.serverId, serverName: g.serverName })));
}

// Criar utilizador num servidor específico
export async function createZohoUserInConfig(config: any, input: CreateUserInput): Promise<ZohoUser> {
  return zohoRequestForConfig<ZohoUser>(config, "POST", "/accounts", {
    primaryEmailAddress: input.primaryEmailAddress,
    displayName: input.displayName,
    password: input.password,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
  });
}

// Criar utilizador no servidor com menos contas (distribuição automática)
export async function createZohoUser(input: CreateUserInput): Promise<ZohoUser> {
  const configs = await getAllActiveConfigs();
  if (configs.length === 0) throw new Error("Nenhum servidor Zoho ativo. Configure via painel Admin.");

  // Tentar criar no primeiro servidor disponível (que não lotou)
  let lastError: Error | null = null;
  for (const config of configs) {
    try {
      const result = await zohoRequestForConfig<ZohoUser>(config, "POST", "/accounts", {
        primaryEmailAddress: input.primaryEmailAddress,
        displayName: input.displayName,
        password: input.password,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
      });
      return result;
    } catch (err: any) {
      if (err.message.includes("Limite de contas atingido")) {
        lastError = err;
        continue; // Tentar próximo servidor
      }
      throw err; // Outro erro â€” propagar
    }
  }
  throw lastError ?? new Error("Não foi possível criar a conta em nenhum servidor");
}

export async function deleteZohoUser(emailAddress: string): Promise<void> {
  // Tentar deletar em todos os servidores (o email existe em apenas um)
  const configs = await getAllActiveConfigs();
  for (const config of configs) {
    try {
      await zohoRequestForConfig<unknown>(config, "DELETE", "/accounts", { emailList: [emailAddress] });
      return;
    } catch {
      continue;
    }
  }
  // Fallback para servidor primário
  await zohoRequest<unknown>("DELETE", "/accounts", { emailList: [emailAddress] });
}

export async function resetZohoPassword(emailAddress: string, newPassword: string): Promise<void> {
  const allUsers = await listZohoUsers(200);
  const user = allUsers.find((u) => u.primaryEmailAddress === emailAddress);
  if (!user) throw new Error("Usuário não encontrado");

  const configs = await getAllActiveConfigs();
  const config = configs.find((c: any) => c.id === user.serverId) ?? await getPrimaryConfig();
  await zohoRequestForConfig<unknown>(config, "PUT", `/accounts/${user.accountId}/password`, { password: newPassword });
}

export async function toggleZohoUser(emailAddress: string, enabled: boolean): Promise<void> {
  const allUsers = await listZohoUsers(200);
  const user = allUsers.find((u) => u.primaryEmailAddress === emailAddress);
  if (!user) throw new Error("Usuário não encontrado");

  const configs = await getAllActiveConfigs();
  const config = configs.find((c: any) => c.id === user.serverId) ?? await getPrimaryConfig();
  await zohoRequestForConfig<unknown>(config, "PUT", `/accounts/${user.accountId}`, { enabled });
}

// â”€â”€â”€ Funções de leitura de e-mails (inbox) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getAccessToken(): Promise<string> {
  const config = await getPrimaryConfig();
  return getAccessTokenForConfig(config);
}

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
  status: string;
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

export async function listMailAccounts(): Promise<ZohoMailAccount[]> {
  const data = await zohoUserRequest<{ data: ZohoMailAccount[] }>("GET", "/accounts");
  return Array.isArray((data as any).data) ? (data as any).data : Array.isArray(data) ? (data as any) : [];
}

async function resolveInboxFolderId(accountId: string): Promise<string> {
  const folders = await listFolders(accountId);
  const inbox = folders.find(f => f.folderName?.toLowerCase() === 'inbox');
  return inbox?.folderId ?? '';
}

export async function listInboxMessages(
  accountId: string,
  folderId = "inbox",
  limit = 20,
  start = 0
): Promise<ZohoMessage[]> {
  const resolvedFolderId = folderId === 'inbox' ? await resolveInboxFolderId(accountId) : folderId;
  if (!resolvedFolderId) return [];
  const data = await zohoUserRequest<any>(
    "GET",
    `/accounts/${accountId}/messages/view?folderId=${resolvedFolderId}&limit=${limit}&start=${start}&sortorder=false`
  );
  return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
}

export async function getMessageContent(accountId: string, messageId: string): Promise<ZohoMessageContent> {
  return zohoUserRequest<ZohoMessageContent>("GET", `/accounts/${accountId}/messages/${messageId}/content`);
}

export async function markMessageRead(accountId: string, messageId: string): Promise<void> {
  await zohoUserRequest<unknown>("PUT", `/accounts/${accountId}/updatemessage`, { mode: "markAsRead", messageId: [messageId] });
}

export async function listFolders(accountId: string): Promise<{ folderId: string; folderName: string; unreadCount: number }[]> {
  const data = await zohoUserRequest<any>("GET", `/accounts/${accountId}/folders`);
  return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
}
