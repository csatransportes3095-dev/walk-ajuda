import "dotenv/config";
import mysql from "mysql2/promise";
import { applySiteAccessMigration, verifySiteAccessSchema } from "./siteAccessMigration";

async function main() {
  if (process.env.H2_SITE_SECURITY_MIGRATION_TARGET !== "test") throw new Error("Test-only database required");
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    await db.query("CREATE TABLE IF NOT EXISTS legacySentinel (id INT PRIMARY KEY, content VARCHAR(64) NOT NULL)");
    await db.query("INSERT INTO legacySentinel (id,content) VALUES (7,'preserve') ON DUPLICATE KEY UPDATE id=id");
    await applySiteAccessMigration(db);
    await db.query("INSERT INTO siteAccessConfig (id,mode) VALUES (1,'restricted')");
    await db.query("INSERT INTO siteAccessEntries (displayName,email,createdBy) VALUES ('Teste','authorized@example.test','test')");
    await db.query("INSERT INTO siteAccessRateLimits (limitKey,windowStartedAt,hits) VALUES ('sample',100,2)");
    await applySiteAccessMigration(db);
    await verifySiteAccessSchema(db);
    const [mode] = await db.query<mysql.RowDataPacket[]>("SELECT mode FROM siteAccessConfig WHERE id=1");
    const [people] = await db.query<mysql.RowDataPacket[]>("SELECT email,sessionVersion,status FROM siteAccessEntries WHERE email='authorized@example.test'");
    const [sentinel] = await db.query<mysql.RowDataPacket[]>("SELECT content FROM legacySentinel WHERE id=7");
    const [rate] = await db.query<mysql.RowDataPacket[]>("SELECT hits FROM siteAccessRateLimits WHERE limitKey='sample'");
    if (mode[0]?.mode !== "restricted" || people[0]?.sessionVersion !== 1 || people[0]?.status !== "active" ||
        sentinel[0]?.content !== "preserve" || rate[0]?.hits !== 2) throw new Error("Data changed in second migration");
    await db.query("CREATE TABLE IF NOT EXISTS siteAccessAuditTestMetadata (id INT PRIMARY KEY)");
    console.log("PASS: double migration, defaults, indexes, preservation, legacy sentinel");
  } finally { await db.end(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
