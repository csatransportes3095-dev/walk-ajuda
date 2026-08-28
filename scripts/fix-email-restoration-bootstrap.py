from pathlib import Path

# 1) Zoho listing must fall back to Render/.env credentials after DB restoration.
zoho = Path("server/zoho.ts")
text = zoho.read_text(encoding="utf-8")
old = '''export async function listAllZohoUsersGrouped(limit = 50): Promise<{ serverId: number; serverName: string; domain: string; users: ZohoUser[] }[]> {
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
}'''
new = '''export async function listAllZohoUsersGrouped(limit = 50): Promise<{ serverId: number; serverName: string; domain: string; users: ZohoUser[] }[]> {
  let configs = await getAllActiveConfigs();
  if (configs.length === 0) {
    try {
      // Recuperação pós-restauração: se a tabela zohoOAuthConfigs voltou vazia,
      // continua usando as credenciais que já existem no ambiente do Render.
      configs = [await getPrimaryConfig()];
    } catch (error) {
      console.warn("Nenhuma configuração Zoho ativa no DB ou no ambiente:", error);
      return [];
    }
  }
  const results = await Promise.all(
    configs.map(async (config: any) => {
      const users = await listZohoUsersForConfig(config, limit);
      const inferredDomain = config.domain || users.find((user) => user.primaryEmailAddress?.includes("@"))?.primaryEmailAddress.split("@")[1] || 'h2colombiano.com';
      return {
        serverId: config.id,
        serverName: config.name,
        domain: inferredDomain,
        users,
      };
    })
  );
  return results;
}'''
if old not in text:
    raise SystemExit("listAllZohoUsersGrouped anchor not found")
zoho.write_text(text.replace(old, new, 1), encoding="utf-8")

# 2) Heal metadata and activation for protected principal accounts when panel loads.
routers = Path("server/routers.ts")
text = routers.read_text(encoding="utf-8")
old = '''    list: adminProcedure.query(async () => {
      const grouped = await listAllZohoUsersGrouped(200);
      const { listEmailAccounts } = await import('../server/db');
      const accountTypes = await listEmailAccounts();
      const typeMap = Object.fromEntries(accountTypes.map((a: any) => [a.emailAddress, a.type]));
      return grouped.map(group => ({
        serverId: group.serverId,
        serverName: group.serverName,
        domain: (group as any).domain || 'h2colombiano.com',
        users: group.users.map(user => ({
          ...user,
          type: typeMap[user.primaryEmailAddress] || 'membro',
        })),
      }));
    }),'''
new = '''    list: adminProcedure.query(async () => {
      let grouped = await listAllZohoUsersGrouped(200);
      const { listEmailAccounts, upsertEmailAccount } = await import('../server/db');
      const protectedPrincipal = new Set(['walkajuda@walkajuda.com', 'h2@h2colombiano.com']);

      // Recria somente o metadado perdido pela restauração. Não recria caixas nem senhas.
      const foundProtected = grouped.flatMap(group => group.users)
        .map(user => String(user.primaryEmailAddress || '').trim().toLowerCase())
        .filter(email => protectedPrincipal.has(email));
      await Promise.all([...new Set(foundProtected)].map(email => upsertEmailAccount(email, 'principal')));

      // As duas contas principais devem permanecer ativas. Se a API indicar uma delas
      // como desativada, reativa e refaz a leitura uma única vez.
      const disabledProtected = grouped.flatMap(group => group.users)
        .filter(user => protectedPrincipal.has(String(user.primaryEmailAddress || '').trim().toLowerCase()) && user.enabled === false);
      if (disabledProtected.length > 0) {
        await Promise.all(disabledProtected.map(user => toggleZohoUser(user.primaryEmailAddress, true)));
        grouped = await listAllZohoUsersGrouped(200);
      }

      const accountTypes = await listEmailAccounts();
      const typeMap = Object.fromEntries(accountTypes.map((a: any) => [String(a.emailAddress || '').trim().toLowerCase(), a.type]));
      return grouped.map(group => ({
        serverId: group.serverId,
        serverName: group.serverName,
        domain: (group as any).domain || 'h2colombiano.com',
        users: group.users.map(user => ({
          ...user,
          type: typeMap[String(user.primaryEmailAddress || '').trim().toLowerCase()] || (protectedPrincipal.has(String(user.primaryEmailAddress || '').trim().toLowerCase()) ? 'principal' : 'membro'),
        })),
      }));
    }),'''
if old not in text:
    raise SystemExit("email.list anchor not found")
routers.write_text(text.replace(old, new, 1), encoding="utf-8")
