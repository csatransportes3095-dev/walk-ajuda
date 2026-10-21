import { createConnection } from "mysql2/promise";
import { r2DeleteObjects, r2ListObjectsPage } from "../server/r2Storage";

const CHASSIS_TABLES = [
  "h2_chassis_audit_log",
  "h2_chassis_credit_ledger",
  "h2_chassis_credit_batches",
  "h2_chassis_generations",
  "h2_chassis_purchases",
  "h2_chassis_packages",
  "h2_chassis_sessions",
  "h2_chassis_settings",
  "h2_chassis_users",
] as const;
const PROOF_PREFIX = "chassis-comprovantes/";
const MAX_DELETE_PASSES = 1000;

async function removeChassisProofs() {
  let deleted = 0;
  for (let pass = 0; pass < MAX_DELETE_PASSES; pass += 1) {
    const page = await r2ListObjectsPage(PROOF_PREFIX);
    const keys = page.objects.map(object => object.key);
    if (keys.some(key => !key.startsWith(PROOF_PREFIX))) {
      throw new Error("A listagem R2 saiu do prefixo de comprovantes do chassis.");
    }
    if (keys.length === 0) {
      const verified = await r2ListObjectsPage(PROOF_PREFIX);
      if (verified.objects.length === 0) return deleted;
      continue;
    }
    for (let index = 0; index < keys.length; index += 500) {
      await r2DeleteObjects(keys.slice(index, index + 500));
    }
    deleted += keys.length;
  }
  throw new Error("A limpeza do prefixo de comprovantes excedeu o limite de segurança.");
}

async function removeChassisTables() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL não configurada.");
  const connection = await createConnection(databaseUrl);
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of CHASSIS_TABLES) {
      await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => undefined);
    await connection.end();
  }
}

async function main() {
  let deletedProofs = 0;
  const failures: string[] = [];
  try {
    await removeChassisTables();
  } catch {
    failures.push("database");
  }
  try {
    deletedProofs = await removeChassisProofs();
  } catch {
    failures.push("R2");
  }
  if (failures.length > 0) throw new Error(`Cleanup incomplete: ${failures.join(", ")}.`);
  console.log(`[Chassis Restore] Removed ${deletedProofs} chassis proof object(s) and the allowlisted service tables.`);
}

main().catch(error => {
  console.error("[Chassis Restore] Cleanup failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});