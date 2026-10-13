import "dotenv/config";
import mysql from "mysql2/promise";

/** Execução SOMENTE manual em homologação, nunca no start do site. */
async function main() {
  if (process.env.H2_SECURITY_MIGRATION_APPROVED !== "yes") {
    throw new Error("Migração não autorizada: H2_SECURITY_MIGRATION_APPROVED=yes obrigatório");
  }
  const url=process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection=await mysql.createConnection(url);
  try {
    await connection.query("CREATE TABLE IF NOT EXISTS siteAccessConfig (id INT PRIMARY KEY, mode VARCHAR(16) NOT NULL DEFAULT 'public', updatedBy VARCHAR(64) NULL, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
    await connection.query("CREATE TABLE IF NOT EXISTS siteAccessEntries (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, displayName VARCHAR(128) NOT NULL, email VARCHAR(320) NOT NULL UNIQUE, phone VARCHAR(32) NULL, customerId INT NULL, status VARCHAR(16) NOT NULL DEFAULT 'active', expiresAt TIMESTAMP NULL, sessionVersion INT NOT NULL DEFAULT 1, createdBy VARCHAR(64) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
    await connection.query("CREATE TABLE IF NOT EXISTS siteAccessChallenges (email VARCHAR(320) NOT NULL PRIMARY KEY, codeHash VARCHAR(100) NOT NULL, attempts INT NOT NULL DEFAULT 0, expiresAt TIMESTAMP NOT NULL, requestedAt TIMESTAMP NOT NULL)");
    await connection.query("CREATE TABLE IF NOT EXISTS siteAccessRateLimits (limitKey VARCHAR(80) NOT NULL PRIMARY KEY, windowStartedAt BIGINT NOT NULL, hits INT NOT NULL DEFAULT 0)");
    await connection.query("CREATE TABLE IF NOT EXISTS siteAccessAudit (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, actor VARCHAR(64) NOT NULL, action VARCHAR(48) NOT NULL, subject VARCHAR(320) NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    console.log("Schema de segurança criado (modo público padrão; sem alteração de tráfego).");
  } finally { await connection.end(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
