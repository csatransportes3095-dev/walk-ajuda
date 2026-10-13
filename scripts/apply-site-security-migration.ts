import "dotenv/config";
import mysql from "mysql2/promise";
import { applySiteAccessMigration } from "../server/siteAccessMigration";

async function main() {
  if (process.env.H2_SECURITY_MIGRATION_APPROVED !== "yes") {
    throw new Error("Migracao nao autorizada: H2_SECURITY_MIGRATION_APPROVED=yes obrigatorio");
  }
  if (process.env.H2_SITE_SECURITY_MIGRATION_TARGET !== "test") {
    throw new Error("Somente homologacao: H2_SITE_SECURITY_MIGRATION_TARGET=test obrigatorio");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL nao configurada");
  const conn = await mysql.createConnection(url);
  try {
    await applySiteAccessMigration(conn);
    console.log("Migracao aditiva verificada. Nenhum dado legado alterado.");
  } finally {
    await conn.end();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
