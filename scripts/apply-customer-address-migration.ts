import { createConnection } from 'mysql2/promise';

const COLUMNS: Array<[string, string]> = [
  ['cep', 'VARCHAR(9) NULL'],
  ['street', 'VARCHAR(255) NULL'],
  ['addressNumber', 'VARCHAR(30) NULL'],
  ['neighborhood', 'VARCHAR(150) NULL'],
  ['addressComplement', 'VARCHAR(255) NULL'],
];

async function hasColumn(connection: Awaited<ReturnType<typeof createConnection>>, column: string) {
  const [rows] = await connection.query('SHOW COLUMNS FROM `customers` LIKE ?', [column]) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[customer-address-migrate] DATABASE_URL não configurada, pulando migration.');
    return;
  }
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    for (const [column, definition] of COLUMNS) {
      if (await hasColumn(connection, column)) continue;
      await connection.query(`ALTER TABLE \`customers\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`[customer-address-migrate] Coluna adicionada: customers.${column}`);
    }
    console.log('[customer-address-migrate] Endereço completo verificado com sucesso.');
  } catch (error) {
    console.error('[customer-address-migrate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
