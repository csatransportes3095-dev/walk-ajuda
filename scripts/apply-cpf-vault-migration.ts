import "dotenv/config";
import mysql from "mysql2/promise";
import { CPF_VAULT_CREATE_TABLE_SQL } from "../server/cpfVaultSchema";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await connection.query(CPF_VAULT_CREATE_TABLE_SQL);
    console.log("Cofre de CPF pronto: registro permanente de uso inicializado.");
  } finally {
    await connection.end();
  }
}

main().catch(() => {
  console.error("Não foi possível inicializar o Cofre de CPF. Publicação interrompida.");
  process.exitCode = 1;
});
