import "dotenv/config";
import mysql from "mysql2/promise";
import { applySiteAccessMigration } from "../server/siteAccessMigration";
import { inspectSiteSecurityBackup, readSiteSecurityBackup } from "../server/siteAccessBackupGate";

async function main() {
  if (process.env.H2_SECURITY_MIGRATION_APPROVED !== "yes") {
    throw new Error("Migracao nao autorizada");
  }
  const target = process.env.H2_SITE_SECURITY_MIGRATION_TARGET;
  if (target !== "test" && target !== "production") {
    throw new Error("O destino deve ser test ou production");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL indisponivel");
  if (target === "production" && process.env.H2_SITE_ACCESS_ENFORCE === "true") {
    throw new Error("Nao executar migracao enquanto bloqueio global estiver ativo");
  }
  const backupId = process.env.H2_SITE_SECURITY_BACKUP_ID?.trim() || "";
  if (target === "production") {
    if (process.env.H2_SITE_SECURITY_PRODUCTION_APPROVED !== "YES_I_APPROVE_THIS_MIGRATION") {
      throw new Error("Confirmacao especifica de producao ausente");
    }
    if (!/^[a-f0-9]{48}$/i.test(backupId)) {
      throw new Error("ID de backup protegido obrigatorio para producao");
    }
  }
  const conn = await mysql.createConnection(url);
  try {
    const [identity] = await conn.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS databaseName, @@hostname AS serverName");
    if (!identity[0]?.databaseName) throw new Error("Banco alvo desconhecido");
    if (target === "production") {
      const record = await readSiteSecurityBackup(conn,backupId);
      const errors = inspectSiteSecurityBackup(record,backupId);
      if (errors.length) throw new Error("Backup de seguranca rejeitado: " + errors.join("; "));
    }
    await applySiteAccessMigration(conn);
    console.log("Migracao verificada em " + target + ". Tabelas antigas nao alteradas.");
  } finally { await conn.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode=1; });
