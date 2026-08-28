from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


helper = r'''export type ZohoProvisioningUser = {
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
'''

helper_test = r'''import { describe, expect, it } from "vitest";
import { buildZohoCreateUserPayload, describeZohoApiError, resolveZohoProvisioningDomain } from "./zohoProvisioning";

describe("zohoProvisioning", () => {
  it("prefere o domínio observado nas contas reais quando a configuração está errada", () => {
    expect(resolveZohoProvisioningDomain("walkajuda.com", [
      { primaryEmailAddress: "h2@h2colombiano.com" },
      { primaryEmailAddress: "igor@h2colombiano.com" },
    ])).toBe("h2colombiano.com");
  });

  it("mantém o domínio configurado quando ainda não há usuários para inferir", () => {
    expect(resolveZohoProvisioningDomain("@walkajuda.com", [])).toBe("walkajuda.com");
  });

  it("envia o payload documentado com papel de membro", () => {
    expect(buildZohoCreateUserPayload({
      primaryEmailAddress: " Olivia.Teste@WalkAjuda.com ",
      displayName: " Olivia Araujo ",
      password: "Walk@@3095",
      firstName: " Olivia ",
      lastName: " Araujo ",
    })).toEqual({
      primaryEmailAddress: "olivia.teste@walkajuda.com",
      password: "Walk@@3095",
      firstName: "Olivia",
      lastName: "Araujo",
      displayName: "Olivia Araujo",
      role: "member",
      oneTimePassword: false,
    });
  });

  it("preserva o motivo de um Internal Error do Zoho", () => {
    expect(describeZohoApiError({ status: { code: 500, description: "Internal Error" }, data: {} }, 500)).toEqual({
      message: "Internal Error",
      errorCode: "",
    });
  });

  it("entende também a resposta antiga em array do Zoho", () => {
    expect(describeZohoApiError([0, { msg: "USERNAME_NOT_SET" }], 500).message).toContain("USERNAME_NOT_SET");
  });
});
'''

Path("server/zohoProvisioning.ts").write_text(helper, encoding="utf-8")
Path("server/zohoProvisioning.test.ts").write_text(helper_test, encoding="utf-8")

# -----------------------------------------------------------------------------
# server/zoho.ts
# -----------------------------------------------------------------------------
p = Path("server/zoho.ts")
text = p.read_text(encoding="utf-8")
text = text.replace(
    'import { ENV } from "./_core/env";\n',
    'import { ENV } from "./_core/env";\nimport { buildZohoCreateUserPayload, describeZohoApiError, resolveZohoProvisioningDomain } from "./zohoProvisioning";\n',
    1,
)
old_request = '''  const res = await fetch(url, {\n    method,\n    headers: {\n      Authorization: `Zoho-oauthtoken ${token}`,\n      "Content-Type": "application/json",\n    },\n    body: body ? JSON.stringify(body) : undefined,\n  });\n\n  const json = (await res.json()) as {\n    status?: { code: number; description: string };\n    data?: T;\n    error?: string;\n  };\n\n  if (!res.ok || (json.status && json.status.code >= 400)) {\n    const errorCode = (json.data as any)?.errorCode ?? "";\n    let message = json.status?.description ?? json.error ?? "unknown";\n    if (errorCode === "EMAILADDRESS_ALREADY_EXISTS") message = "Este email já existe no Zoho Mail";\n    else if (errorCode === "INVALID_PASSWORD") message = "Senha inválida â€” use pelo menos 8 caracteres com letras e números";\n    else if (errorCode === "ACCOUNT_LIMIT_EXCEEDED") message = "Limite de contas atingido neste servidor (máx. 5 no plano FREE)";\n    else if (errorCode === "INVALID_EMAILADDRESS") message = "Endereço de email inválido";\n    throw new Error(message);\n  }\n\n  return (json.data ?? json) as T;\n'''
new_request = '''  const res = await fetch(url, {\n    method,\n    headers: {\n      Authorization: `Zoho-oauthtoken ${token}`,\n      "Accept": "application/json",\n      "Content-Type": "application/json",\n    },\n    body: body ? JSON.stringify(body) : undefined,\n  });\n\n  const rawResponse = await res.text();\n  let json: any = {};\n  try { json = rawResponse ? JSON.parse(rawResponse) : {}; } catch { json = { error: rawResponse.slice(0, 500) }; }\n  const apiStatus = Number(json?.status?.code || res.status);\n\n  if (!res.ok || apiStatus >= 400) {\n    const detail = describeZohoApiError(json, res.status);\n    console.error(`[Zoho API] server=${String(config.name || 'unknown')} method=${method} path=${path} http=${res.status} apiStatus=${apiStatus} errorCode=${detail.errorCode || '-'} message=${detail.message}`);\n    throw new Error(`Zoho ${String(config.name || 'servidor')}: HTTP ${res.status} - ${detail.message}`);\n  }\n\n  return (json?.data ?? json) as T;\n'''
if old_request not in text:
    raise SystemExit("zoho request anchor not found")
text = text.replace(old_request, new_request, 1)
old_inferred = '''    const inferredDomain = config.domain || users.find((user) => user.primaryEmailAddress?.includes('@'))?.primaryEmailAddress.split('@')[1] || 'h2colombiano.com';\n'''
new_inferred = '''    const inferredDomain = resolveZohoProvisioningDomain(config.domain, users) || 'h2colombiano.com';\n'''
if old_inferred not in text:
    raise SystemExit("zoho grouped domain anchor not found")
text = text.replace(old_inferred, new_inferred, 1)
old_specific = '''export async function createZohoUserInConfig(config: any, input: CreateUserInput): Promise<ZohoUser> {\n  return zohoRequestForConfig<ZohoUser>(config, "POST", "/accounts", {\n    primaryEmailAddress: input.primaryEmailAddress,\n    displayName: input.displayName,\n    password: input.password,\n    firstName: input.firstName ?? "",\n    lastName: input.lastName ?? "",\n  });\n}\n'''
new_specific = '''export async function createZohoUserInConfig(config: any, input: CreateUserInput): Promise<ZohoUser> {\n  return zohoRequestForConfig<ZohoUser>(config, "POST", "/accounts", buildZohoCreateUserPayload(input));\n}\n'''
if old_specific not in text:
    raise SystemExit("specific create anchor not found")
text = text.replace(old_specific, new_specific, 1)
old_auto_payload = '''      const result = await zohoRequestForConfig<ZohoUser>(config, "POST", "/accounts", {\n        primaryEmailAddress: input.primaryEmailAddress,\n        displayName: input.displayName,\n        password: input.password,\n        firstName: input.firstName ?? "",\n        lastName: input.lastName ?? "",\n      });\n'''
new_auto_payload = '''      const result = await zohoRequestForConfig<ZohoUser>(config, "POST", "/accounts", buildZohoCreateUserPayload(input));\n'''
if old_auto_payload not in text:
    raise SystemExit("automatic create payload anchor not found")
text = text.replace(old_auto_payload, new_auto_payload, 1)
p.write_text(text, encoding="utf-8")

# -----------------------------------------------------------------------------
# server/routers.ts: inferir domínio real antes de reservar/criar.
# -----------------------------------------------------------------------------
p = Path("server/routers.ts")
text = p.read_text(encoding="utf-8")
import_anchor = '''  toggleZohoUser,\n  listMailAccounts,\n'''
if import_anchor not in text:
    raise SystemExit("routers zoho import anchor not found")
text = text.replace(import_anchor, '''  toggleZohoUser,\n  listMailAccounts,\n''', 1)
# helper import separado para não misturar função pura com o bloco existente.
core_anchor = '''} from "./zoho";\nimport fs from "fs";\n'''
if core_anchor not in text:
    raise SystemExit("routers zoho import close anchor not found")
text = text.replace(core_anchor, '''} from "./zoho";\nimport { resolveZohoProvisioningDomain } from "./zohoProvisioning";\nimport fs from "fs";\n''', 1)
old_create_prelude = '''        try {\n          let emailDomain = 'h2colombiano.com';\n          if (input.serverId) {\n            const { listZohoOAuthConfigs: getConfigs } = await import('../server/db');\n            const allCfgs = await getConfigs();\n            const cfg = allCfgs.find((c: any) => Number(c.id) === Number(input.serverId));\n            if (cfg?.domain) emailDomain = cfg.domain;\n          }\n          primaryEmailAddress = `${input.username.toLowerCase()}@${emailDomain}`.trim().toLowerCase();\n          const { reserveEmailAccount, releaseEmailAccountReservation, upsertEmailAccount } = await import('../server/db');\n'''
new_create_prelude = '''        try {\n          let emailDomain = 'h2colombiano.com';\n          let selectedConfig: any | null = null;\n          let selectedServerUsers: any[] = [];\n          if (input.serverId) {\n            const { listZohoOAuthConfigs: getConfigs } = await import('../server/db');\n            const allCfgs = await getConfigs();\n            const cfg = allCfgs.find((c: any) => Number(c.id) === Number(input.serverId));\n            if (!cfg) throw new Error(`Servidor não encontrado (id=${input.serverId})`);\n            if (Number(cfg.isActive) !== 1) throw new Error(`Servidor ${cfg.name} não está ativo.`);\n            selectedServerUsers = await listZohoUsersForConfig(cfg, 10);\n            if (selectedServerUsers.length >= 5) throw new Error(`Servidor ${cfg.name} está lotado (5/5 contas). Escolha outro servidor.`);\n            emailDomain = resolveZohoProvisioningDomain(cfg.domain, selectedServerUsers);\n            if (!emailDomain) throw new Error(`Não foi possível identificar o domínio real do servidor ${cfg.name}. Revise a configuração Zoho.`);\n            selectedConfig = cfg;\n          }\n          primaryEmailAddress = `${input.username.toLowerCase()}@${emailDomain}`.trim().toLowerCase();\n          const { reserveEmailAccount, releaseEmailAccountReservation, upsertEmailAccount } = await import('../server/db');\n'''
if old_create_prelude not in text:
    raise SystemExit("routers email create prelude anchor not found")
text = text.replace(old_create_prelude, new_create_prelude, 1)
old_creation = '''          let user;\n          if (input.serverId) {\n            const { listZohoOAuthConfigs } = await import('../server/db');\n            const allConfigs = await listZohoOAuthConfigs();\n            const config = allConfigs.find((c: any) => Number(c.id) === Number(input.serverId));\n            if (!config) throw new Error(`Servidor não encontrado (id=${input.serverId})`);\n            if (Number(config.isActive) !== 1) throw new Error(`Servidor ${config.name} não está ativo.`);\n            const existingUsers = await listZohoUsersForConfig(config, 10);\n            if (existingUsers.length >= 5) throw new Error(`Servidor ${config.name} está lotado (5/5 contas). Escolha outro servidor.`);\n            user = await createZohoUserInConfig(config, { primaryEmailAddress, displayName: input.displayName, password: input.password, firstName: input.firstName, lastName: input.lastName });\n          } else {\n            user = await createZohoUser({ primaryEmailAddress, displayName: input.displayName, password: input.password, firstName: input.firstName, lastName: input.lastName });\n          }\n'''
new_creation = '''          let user;\n          if (selectedConfig) {\n            user = await createZohoUserInConfig(selectedConfig, { primaryEmailAddress, displayName: input.displayName, password: input.password, firstName: input.firstName, lastName: input.lastName });\n          } else {\n            user = await createZohoUser({ primaryEmailAddress, displayName: input.displayName, password: input.password, firstName: input.firstName, lastName: input.lastName });\n          }\n'''
if old_creation not in text:
    raise SystemExit("routers email create selected config anchor not found")
text = text.replace(old_creation, new_creation, 1)
old_throw = '''          throw new TRPCError({ code: 'BAD_REQUEST', message: `Erro ao criar conta: ${msg}` });\n'''
new_throw = '''          throw new TRPCError({ code: 'BAD_REQUEST', message: msg });\n'''
if old_throw not in text:
    raise SystemExit("routers email create double prefix anchor not found")
text = text.replace(old_throw, new_throw, 1)

# OAuth automático agora carrega domínio até o callback.
old_auth_input = '''        zohoOrgId: z.string().min(1),\n        zohoClientId: z.string().min(1),\n        zohoClientSecret: z.string().min(1),\n      }))\n'''
new_auth_input = '''        zohoOrgId: z.string().min(1),\n        zohoClientId: z.string().min(1),\n        zohoClientSecret: z.string().min(1),\n        domain: z.string().trim().min(3).max(255),\n      }))\n'''
# Há outros inputs parecidos; restringir ao primeiro após getAuthUrl.
pos = text.find('getAuthUrl: adminProcedure')
if pos < 0:
    raise SystemExit("getAuthUrl anchor not found")
sub = text[pos:]
if old_auth_input not in sub:
    raise SystemExit("getAuthUrl input fields anchor not found")
sub = sub.replace(old_auth_input, new_auth_input, 1)
text = text[:pos] + sub
old_data_save = '''          zohoClientId: input.zohoClientId,\n          zohoClientSecret: input.zohoClientSecret,\n          redirectUri,\n'''
new_data_save = '''          zohoClientId: input.zohoClientId,\n          zohoClientSecret: input.zohoClientSecret,\n          domain: input.domain.trim().toLowerCase().replace(/^@+/, ''),\n          redirectUri,\n'''
if old_data_save not in text:
    raise SystemExit("getAuthUrl dataToSave anchor not found")
text = text.replace(old_data_save, new_data_save, 1)
p.write_text(text, encoding="utf-8")

# -----------------------------------------------------------------------------
# server/db.ts: pending OAuth aceita domínio.
# -----------------------------------------------------------------------------
replace_once(
    "server/db.ts",
    "export async function savePendingZohoOAuth(sessionId: string, data: { name: string; zohoOrgId: string; zohoClientId: string; zohoClientSecret: string; redirectUri: string }) {",
    "export async function savePendingZohoOAuth(sessionId: string, data: { name: string; zohoOrgId: string; zohoClientId: string; zohoClientSecret: string; domain: string; redirectUri: string }) {",
)

# -----------------------------------------------------------------------------
# callback: persistir domínio recebido.
# -----------------------------------------------------------------------------
replace_once(
    "server/_core/index.ts",
    '''          zohoClientSecret: pending.zohoClientSecret,\n          zohoRefreshToken: tokenData.refresh_token,\n        });''',
    '''          zohoClientSecret: pending.zohoClientSecret,\n          zohoRefreshToken: tokenData.refresh_token,\n          domain: String(pending.domain || '').trim().toLowerCase().replace(/^@+/, ''),\n        });''',
)

# -----------------------------------------------------------------------------
# AdminZohoConfig: domínio obrigatório também no fluxo automático e visível no card.
# -----------------------------------------------------------------------------
p = Path("client/src/pages/AdminZohoConfig.tsx")
text = p.read_text(encoding="utf-8")
text = text.replace(
    '''  status: string; createdAt: number;\n};''',
    '''  status: string; createdAt: number; domain: string;\n};''',
    1,
)
text = text.replace(
    '''    if (!form.name || !form.zohoOrgId || !form.zohoClientId || !form.zohoClientSecret) {\n      toast.error("Preencha Nome, Org ID, Client ID e Client Secret antes.");''',
    '''    if (!form.name || !form.zohoOrgId || !form.domain || !form.zohoClientId || !form.zohoClientSecret) {\n      toast.error("Preencha Nome, Org ID, Domínio, Client ID e Client Secret antes.");''',
    1,
)
text = text.replace(
    '''        name: form.name, zohoOrgId: form.zohoOrgId,\n        zohoClientId: form.zohoClientId, zohoClientSecret: form.zohoClientSecret,\n''',
    '''        name: form.name, zohoOrgId: form.zohoOrgId, domain: form.domain.trim().toLowerCase().replace(/^@+/, ''),\n        zohoClientId: form.zohoClientId, zohoClientSecret: form.zohoClientSecret,\n''',
    1,
)
text = text.replace(
    '''                      Org: {c.zohoOrgId} · Client: {c.zohoClientId.slice(0, 24)}...\n''',
    '''                      Org: {c.zohoOrgId} · Domínio: @{c.domain || 'não definido'} · Client: {c.zohoClientId.slice(0, 24)}...\n''',
    1,
)
p.write_text(text, encoding="utf-8")

# -----------------------------------------------------------------------------
# AdminEmail: domínio pertence ao servidor; não pode ser trocado isoladamente.
# -----------------------------------------------------------------------------
p = Path("client/src/pages/AdminEmail.tsx")
text = p.read_text(encoding="utf-8")
text = text.replace('  const [manualDomain, setManualDomain] = useState<string | null>(null);\n', '', 1)
start = text.find('  // Domínios disponíveis: extrair dos grupos ou usar defaults')
end = text.find('  const handleGenerateUsername', start)
if start < 0 or end < 0:
    raise SystemExit("AdminEmail domain helper block not found")
replacement = '''  // O domínio é propriedade do servidor Zoho selecionado.\n  // Não permitimos misturar @walkajuda.com no servidor H2 (ou o inverso).\n  const serverDomain = selectedServer?.domain || 'h2colombiano.com';\n  const selectedDomain = serverDomain;\n\n'''
text = text[:start] + replacement + text[end:]
text = text.replace("    setManualDomain(null); // Resetar domínio manual ao trocar servidor\n", '', 1)
old_domain_selector = '''                    {availableDomains.length > 1 ? (\n                    <select\n                      value={selectedDomain}\n                      onChange={(e) => setManualDomain(e.target.value)}\n                      className="text-sm font-semibold text-blue-400 bg-transparent border border-blue-500/40 rounded px-2 py-1 cursor-pointer hover:border-blue-400 transition"\n                    >\n                      {availableDomains.map(d => (\n                        <option key={d} value={d} className="bg-gray-900 text-white">@{d}</option>\n                      ))}\n                    </select>\n                  ) : (\n                    <span className="text-sm font-semibold text-blue-400 whitespace-nowrap">@{selectedDomain}</span>\n                  )}\n'''
new_domain_selector = '''                  <span className="whitespace-nowrap rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-sm font-semibold text-blue-400">@{selectedDomain}</span>\n'''
if old_domain_selector not in text:
    raise SystemExit("AdminEmail domain selector anchor not found")
text = text.replace(old_domain_selector, new_domain_selector, 1)
text = text.replace(
    '<p className="text-xs text-muted-foreground">Clique em 🔀 para gerar um usuário aleatório único</p>',
    '<p className="text-xs text-muted-foreground">Domínio fixado pelo servidor selecionado. Para mudar o domínio, troque de servidor.</p>',
    1,
)
# Mostrar domínio também na escolha do servidor.
text = text.replace(
    '''                          <p className="text-xs text-gray-400">Contas utilizadas: {group.users.length}/5</p>\n''',
    '''                          <p className="text-xs text-gray-400">@{group.domain} · Contas utilizadas: {group.users.length}/5</p>\n''',
    1,
)
p.write_text(text, encoding="utf-8")

print("Zoho email provisioning fix applied.")
