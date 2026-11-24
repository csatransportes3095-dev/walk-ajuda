import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { ensureAdminCustomerBirthDateAuditTable } from "../server/customerBirthDate";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await ensureAdminCustomerBirthDateAuditTable(drizzle(connection));
    console.log("Tabelas customerBirthDates e auditoria ADM prontas.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Não foi possível inicializar customerBirthDates. Publicação interrompida.", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
