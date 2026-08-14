import { createConnection } from 'mysql2/promise';

async function hasColumn(connection: Awaited<ReturnType<typeof createConnection>>, column: string) {
  const [rows] = await connection.query('SHOW COLUMNS FROM `productOptions` LIKE ?', [column]) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function addColumnIfMissing(connection: Awaited<ReturnType<typeof createConnection>>, column: string) {
  if (await hasColumn(connection, column)) return;
  await connection.query(`ALTER TABLE \`productOptions\` ADD COLUMN \`${column}\` VARCHAR(32) NULL`);
  console.log(`[option-card-appearance-migrate] Coluna adicionada: productOptions.${column}`);
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[option-card-appearance-migrate] DATABASE_URL não configurada, pulando migration.');
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    for (const column of ['cardBorderColor', 'cardBgColor', 'cardTextColor', 'cardButtonColor', 'cardAccentColor']) {
      await addColumnIfMissing(connection, column);
    }
    console.log('[option-card-appearance-migrate] Estrutura de aparência por opção verificada com sucesso.');
  } catch (error) {
    console.error('[option-card-appearance-migrate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
