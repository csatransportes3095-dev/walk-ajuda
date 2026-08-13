import { createConnection } from 'mysql2/promise';

async function hasColumn(connection: Awaited<ReturnType<typeof createConnection>>, column: string) {
  const [rows] = await connection.query('SHOW COLUMNS FROM `orderLoginData` LIKE ?', [column]) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumnIfMissing(connection: Awaited<ReturnType<typeof createConnection>>, column: string, definition: string) {
  if (await hasColumn(connection, column)) return;
  await connection.query(`ALTER TABLE \`orderLoginData\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[private-authenticator-qr-migrate] Coluna adicionada: orderLoginData.${column}`);
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[private-authenticator-qr-migrate] DATABASE_URL não configurada, pulando migration.');
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await addColumnIfMissing(connection, 'authenticatorQrStorageKey', 'VARCHAR(512) NULL');
    await addColumnIfMissing(connection, 'authenticatorQrMimeType', 'VARCHAR(64) NULL');
    await addColumnIfMissing(connection, 'authenticatorQrUpdatedAt', 'TIMESTAMP NULL');
    console.log('[private-authenticator-qr-migrate] Estrutura do QR privado verificada com sucesso.');
  } catch (error) {
    console.error('[private-authenticator-qr-migrate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
