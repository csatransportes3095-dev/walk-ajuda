from pathlib import Path

path = Path("server/_core/index.ts")
text = path.read_text(encoding="utf-8")

old_import = 'import { isIpBlocked, getSetting } from "../db";'
new_import = 'import { isIpBlocked, getSetting, getDb } from "../db";'
if old_import not in text:
    raise SystemExit("db import anchor not found")
text = text.replace(old_import, new_import, 1)

anchor = '''function registerProcessDiagnostics() {
  process.on("uncaughtException", (error) => {
'''
helper = '''async function ensureZohoOAuthInfrastructure() {
  const db = await getDb();
  if (!db) return;
  const { sql } = await import("drizzle-orm");

  // Bancos restaurados podem conter uma versao antiga/incompleta desta tabela.
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS zohoOAuthConfigs (
    id INT AUTO_INCREMENT NOT NULL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    zohoOrgId VARCHAR(64) NOT NULL,
    zohoClientId VARCHAR(256) NOT NULL,
    zohoClientSecret VARCHAR(256) NOT NULL,
    zohoRefreshToken VARCHAR(512) NOT NULL,
    domain VARCHAR(255) NOT NULL DEFAULT 'h2colombiano.com',
    isActive INT NOT NULL DEFAULT 1,
    status ENUM('active','inactive','error') NOT NULL DEFAULT 'inactive',
    lastError TEXT NULL,
    lastTestAt BIGINT NULL,
    createdAt BIGINT NOT NULL DEFAULT 0,
    updatedAt BIGINT NOT NULL DEFAULT 0
  )`));

  const columns = [
    "domain VARCHAR(255) NOT NULL DEFAULT 'h2colombiano.com'",
    "isActive INT NOT NULL DEFAULT 1",
    "status ENUM('active','inactive','error') NOT NULL DEFAULT 'inactive'",
    "lastError TEXT NULL",
    "lastTestAt BIGINT NULL",
    "createdAt BIGINT NOT NULL DEFAULT 0",
    "updatedAt BIGINT NOT NULL DEFAULT 0",
  ];

  for (const definition of columns) {
    try {
      await db.execute(sql.raw(`ALTER TABLE zohoOAuthConfigs ADD COLUMN IF NOT EXISTS ${definition}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|already exists/i.test(message)) {
        console.warn(`[ZohoOAuth] nao foi possivel garantir coluna ${definition.split(" ")[0]}:`, message);
      }
    }
  }
}

'''
if anchor not in text:
    raise SystemExit("diagnostics anchor not found")
text = text.replace(anchor, helper + anchor, 1)

startup_anchor = '''  try {
    await ensureCustomerIdentityInfrastructure();
  } catch (error) {
    console.error('[CustomerIdentity] infraestrutura não inicializada:', error);
  }
'''
startup_new = startup_anchor + '''  try {
    await ensureZohoOAuthInfrastructure();
  } catch (error) {
    console.error('[ZohoOAuth] infraestrutura nao reparada:', error);
  }
'''
if startup_anchor not in text:
    raise SystemExit("startup anchor not found")
text = text.replace(startup_anchor, startup_new, 1)

path.write_text(text, encoding="utf-8")
