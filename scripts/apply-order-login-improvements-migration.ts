import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';

export async function migrateOrderLoginImprovements(connection: Connection) {
  // Additive only: old links, QR bytes, passwords and statuses are untouched.
  const [columns] = await connection.query<RowDataPacket[]>("SHOW COLUMNS FROM `orderLoginData` LIKE 'cnhCode'");
  if (!columns.length) {
    try { await connection.query('ALTER TABLE `orderLoginData` ADD COLUMN `cnhCode` VARCHAR(6) NULL'); }
    catch (error) { if ((error as any)?.code !== 'ER_DUP_FIELDNAME') throw error; }
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS orderLoginDefaults (
    id INT NOT NULL PRIMARY KEY,
    groupLink VARCHAR(1024) NULL,
    revision INT NOT NULL DEFAULT 1,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Do not insert a singleton until the administrator explicitly saves/removes.
}
async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente para verificar os dados de login.');
  const connection = await createConnection(process.env.DATABASE_URL);
  try { await migrateOrderLoginImprovements(connection); console.log('[order-login-migrate] Estrutura verificada. Dados existentes preservados.'); }
  finally { await connection.end(); }
}
if (process.argv[1]?.endsWith('apply-order-login-improvements-migration.ts')) {
  run().catch(error => { console.error('[order-login-migrate]', error instanceof Error ? error.message : 'Falha na migração.'); process.exitCode = 1; });
}
