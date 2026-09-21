import { createConnection } from 'mysql2/promise';

async function hasColumn(connection: Awaited<ReturnType<typeof createConnection>>) {
  const [rows] = await connection.query(
    'SHOW COLUMNS FROM \`productOptions\` LIKE ?',
    ['autoScheduleEnabled'],
  ) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[auto-schedule-migrate] DATABASE_URL nao configurada, pulando migration.');
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    if (!(await hasColumn(connection))) {
      await connection.query(
        'ALTER TABLE \`productOptions\` ADD COLUMN \`autoScheduleEnabled\` INT NOT NULL DEFAULT 0',
      );
      console.log('[auto-schedule-migrate] Coluna adicionada: productOptions.autoScheduleEnabled');
    }
    console.log('[auto-schedule-migrate] Estrutura verificada com sucesso.');
  } catch (error) {
    console.error('[auto-schedule-migrate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
