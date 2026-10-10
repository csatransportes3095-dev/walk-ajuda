import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const statement = (await readFile(
    path.resolve(process.cwd(), "drizzle", "0147_generated_vin_registry.sql"), "utf8",
  )).trim();

  if (!/CREATE TABLE IF NOT EXISTS `h2_generated_vin_registry`/i.test(statement)
    || /(?:DROP|TRUNCATE|DELETE|UPDATE|ALTER)\s/i.test(statement)) {
    throw new Error("Migração VIN rejeitada: somente CREATE TABLE isolado é permitido.");
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await connection.query(statement);

    // IF NOT EXISTS não conserta uma tabela incorreta: confirme a restrição.
    const [keys] = await connection.query<Array<{
      COLUMN_NAME: string; NON_UNIQUE: number;
    }>>(
      "SELECT COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h2_generated_vin_registry' AND INDEX_NAME = 'PRIMARY'"
    );
    if (keys.length !== 1 || keys[0].COLUMN_NAME !== "vin" || Number(keys[0].NON_UNIQUE) !== 0) {
      throw new Error("Registro VIN sem chave primária única na coluna vin.");
    }

    const [columns] = await connection.query<Array<{
      DATA_TYPE: string; CHARACTER_MAXIMUM_LENGTH: number;
    }>>(
      "SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h2_generated_vin_registry' AND COLUMN_NAME = 'vin'"
    );
    if (columns.length !== 1 || columns[0].DATA_TYPE !== "char" || Number(columns[0].CHARACTER_MAXIMUM_LENGTH) !== 17) {
      throw new Error("Coluna VIN não corresponde ao formato CHAR(17) exigido.");
    }

    console.log("[VIN Registry] Tabela e chave única confirmadas, sem alterações em registros anteriores.");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("[VIN Registry] Migração bloqueada:", error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
});
