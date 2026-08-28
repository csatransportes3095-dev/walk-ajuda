from pathlib import Path
import re

# -----------------------------------------------------------------------------
# 1) DB: emailAccounts must exist after restoration.
# -----------------------------------------------------------------------------
p = Path('server/db.ts')
text = p.read_text(encoding='utf-8')
anchor = "// ========== EMAIL ACCOUNTS (ZOHO) ==========\n\n"
helper = r'''// ========== EMAIL ACCOUNTS (ZOHO) ==========

let _emailAccountsInfrastructureReady = false;
async function ensureEmailAccountsInfrastructure(db: any): Promise<void> {
  if (_emailAccountsInfrastructureReady) return;
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS emailAccounts (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    emailAddress VARCHAR(320) NOT NULL UNIQUE,
    type ENUM('principal','membro') NOT NULL DEFAULT 'membro',
    createdAt BIGINT NOT NULL DEFAULT 0,
    updatedAt BIGINT NOT NULL DEFAULT 0
  )`));
  _emailAccountsInfrastructureReady = true;
}

'''
if anchor not in text:
    raise SystemExit('email accounts anchor not found')
text = text.replace(anchor, helper, 1)

# Add lazy infrastructure guarantee to all metadata functions.
for old, new in [
    ("export async function upsertEmailAccount(emailAddress: string, type: 'principal' | 'membro' = 'membro') {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");",
     "export async function upsertEmailAccount(emailAddress: string, type: 'principal' | 'membro' = 'membro') {\n  const db = await getDb();\n  if (!db) throw new Error(\"Database connection failed\");\n  await ensureEmailAccountsInfrastructure(db);"),
    ("export async function getEmailAccountType(emailAddress: string): Promise<'principal' | 'membro' | null> {\n  const db = await getDb();\n  if (!db) return null;",
     "export async function getEmailAccountType(emailAddress: string): Promise<'principal' | 'membro' | null> {\n  const db = await getDb();\n  if (!db) return null;\n  await ensureEmailAccountsInfrastructure(db);"),
    ("export async function deleteEmailAccount(emailAddress: string): Promise<void> {\n  const db = await getDb();\n  if (!db) return;",
     "export async function deleteEmailAccount(emailAddress: string): Promise<void> {\n  const db = await getDb();\n  if (!db) return;\n  await ensureEmailAccountsInfrastructure(db);"),
    ("export async function listEmailAccounts(): Promise<Array<{ emailAddress: string; type: 'principal' | 'membro' }>> {\n  const db = await getDb();\n  if (!db) return [];",
     "export async function listEmailAccounts(): Promise<Array<{ emailAddress: string; type: 'principal' | 'membro' }>> {\n  const db = await getDb();\n  if (!db) return [];\n  await ensureEmailAccountsInfrastructure(db);"),
]:
    if old not in text:
        raise SystemExit(f'db snippet not found: {old[:70]}')
    text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8')

# -----------------------------------------------------------------------------
# 2) Zoho: list active configs directly from DB and never hide API errors.
# -----------------------------------------------------------------------------
p = Path('server/zoho.ts')
text = p.read_text(encoding='utf-8')
pattern = re.compile(r'''// Listar utilizadores de TODOS os servidores ativos, agrupados por servidor\nexport async function listAllZohoUsersGrouped\(limit = 50\): Promise<\{ serverId: number; serverName: string; domain: string; users: ZohoUser\[\] \}\[]> \{.*?\n\}\n\n// Listar todos os utilizadores''', re.S)
replacement = r'''// Listar utilizadores de TODOS os servidores ativos, agrupados por servidor.
// Esta função lê as configurações diretamente do banco para que a tela de e-mail
// nunca fique divergente da tela de Configuração Zoho.
export async function listAllZohoUsersGrouped(limit = 50): Promise<{ serverId: number; serverName: string; domain: string; users: ZohoUser[]; error: string | null }[]> {
  let configs: any[] = [];
  try {
    const { listZohoOAuthConfigs } = await import('./db');
    const all = await listZohoOAuthConfigs();
    configs = (all || []).filter((config: any) => Number(config.isActive) === 1);
  } catch (error) {
    console.error('[Zoho] falha ao ler servidores ativos:', error);
  }

  if (configs.length === 0) {
    try {
      configs = [await getPrimaryConfig()];
    } catch (error) {
      console.error('[Zoho] nenhum servidor ativo disponível:', error);
      return [];
    }
  }

  return Promise.all(configs.map(async (config: any) => {
    let users: ZohoUser[] = [];
    let errorMessage: string | null = null;
    try {
      const data = await zohoRequestForConfig<ZohoUser[]>(config, 'GET', `/accounts?limit=${limit}`);
      users = Array.isArray(data) ? data : [];
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Zoho] servidor ${config.name} ativo, mas a listagem de contas falhou:`, errorMessage);
    }

    const inferredDomain = config.domain || users.find((user) => user.primaryEmailAddress?.includes('@'))?.primaryEmailAddress.split('@')[1] || 'h2colombiano.com';
    return {
      serverId: Number(config.id),
      serverName: String(config.name || 'Servidor Zoho'),
      domain: String(inferredDomain),
      users,
      error: errorMessage,
    };
  }));
}

// Listar todos os utilizadores'''
text2, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'listAllZohoUsersGrouped replacement count={count}')
p.write_text(text2, encoding='utf-8')

# -----------------------------------------------------------------------------
# 3) Router: metadata errors can never erase Zoho servers.
# -----------------------------------------------------------------------------
p = Path('server/routers.ts')
text = p.read_text(encoding='utf-8')
pattern = re.compile(r'''  // === ZOHO MAIL - GERENCIAMENTO DE EMAILS ===\n  email: router\(\{\n    list: adminProcedure\.query\(async \(\) => \{.*?\n    \}\),\n\n    create: adminProcedure''', re.S)
replacement = r'''  // === ZOHO MAIL - GERENCIAMENTO DE EMAILS ===
  email: router({
    list: adminProcedure.query(async () => {
      const grouped = await listAllZohoUsersGrouped(200);
      const protectedPrincipal = new Set(['walkajuda@walkajuda.com', 'h2@h2colombiano.com']);
      let typeMap: Record<string, 'principal' | 'membro'> = {};

      // Metadados locais são auxiliares. Uma restauração incompleta desta tabela
      // jamais pode esconder os servidores/contas que vieram do Zoho.
      try {
        const { listEmailAccounts, upsertEmailAccount } = await import('../server/db');
        const foundProtected = grouped.flatMap(group => group.users)
          .map(user => String(user.primaryEmailAddress || '').trim().toLowerCase())
          .filter(email => protectedPrincipal.has(email));
        await Promise.all([...new Set(foundProtected)].map(email => upsertEmailAccount(email, 'principal')));
        const accountTypes = await listEmailAccounts();
        typeMap = Object.fromEntries(accountTypes.map((account: any) => [String(account.emailAddress || '').trim().toLowerCase(), account.type]));
      } catch (error) {
        console.error('[Email] metadados locais indisponíveis; mantendo listagem Zoho:', error);
      }

      return grouped.map(group => ({
        serverId: group.serverId,
        serverName: group.serverName,
        domain: group.domain || 'h2colombiano.com',
        error: group.error || null,
        users: group.users.map(user => {
          const normalized = String(user.primaryEmailAddress || '').trim().toLowerCase();
          return {
            ...user,
            type: typeMap[normalized] || (protectedPrincipal.has(normalized) ? 'principal' : 'membro'),
          };
        }),
      }));
    }),

    create: adminProcedure'''
text2, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'email router replacement count={count}')
p.write_text(text2, encoding='utf-8')

# -----------------------------------------------------------------------------
# 4) UI: display real RPC/API errors instead of fake 0/0.
# -----------------------------------------------------------------------------
p = Path('client/src/pages/AdminEmail.tsx')
text = p.read_text(encoding='utf-8')
old = '''interface ServerGroup {
  serverId: number;
  serverName: string;
  domain: string;
  users: ZohoUser[];
}'''
new = '''interface ServerGroup {
  serverId: number;
  serverName: string;
  domain: string;
  users: ZohoUser[];
  error?: string | null;
}'''
if old not in text:
    raise SystemExit('ServerGroup interface not found')
text = text.replace(old, new, 1)

old = 'const { data: groups = [], isLoading, refetch } = trpc.email.list.useQuery(undefined, { staleTime: 0, refetchInterval: 2_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });'
new = 'const { data: groups = [], isLoading, error: listError, refetch } = trpc.email.list.useQuery(undefined, { staleTime: 0, refetchInterval: 2_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true });'
if old not in text:
    raise SystemExit('AdminEmail query not found')
text = text.replace(old, new, 1)

old = '''          ) : (groups as ServerGroup[]).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma conta cadastrada</div>
          ) : ('''
new = '''          ) : listError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-red-300">
              Erro ao carregar servidores: {listError.message}
            </div>
          ) : (groups as ServerGroup[]).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhum servidor Zoho ativo encontrado</div>
          ) : ('''
if old not in text:
    raise SystemExit('AdminEmail empty state not found')
text = text.replace(old, new, 1)

old = '''                  <div className="divide-y divide-gray-800">'''
new = '''                  {group.error && (
                    <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      Servidor conectado, mas a API Zoho recusou a listagem: {group.error}
                    </div>
                  )}
                  <div className="divide-y divide-gray-800">'''
if old not in text:
    raise SystemExit('AdminEmail group body anchor not found')
text = text.replace(old, new, 1)

p.write_text(text, encoding='utf-8')
