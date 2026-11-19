import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrateCustomerLoginHistory } from "../server/customerLoginHistorySchema";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await migrateCustomerLoginHistory(drizzle(connection));
    console.log("Histórico de acessos pronto: sessões OTP recuperadas com as datas originais.");
  } finally {
    await connection.end();
  }
}

main().catch(() => {
  console.error("Não foi possível inicializar o histórico de acessos. Publicação interrompida.");
  process.exitCode = 1;
});
