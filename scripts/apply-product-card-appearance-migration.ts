import { createConnection } from 'mysql2/promise';

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[product-card-appearance-migrate] DATABASE_URL não configurada, pulando migration.');
    return;
  }

  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.query('SHOW COLUMNS FROM `products` LIKE ?', ['cardAccentColor']) as any[];
    if (!Array.isArray(rows) || rows.length === 0) {
      await connection.query('ALTER TABLE `products` ADD COLUMN `cardAccentColor` VARCHAR(32) NULL AFTER `cardBtnColor`');
      console.log('[product-card-appearance-migrate] Coluna adicionada: products.cardAccentColor');
    }
    console.log('[product-card-appearance-migrate] Estrutura de aparência individual verificada com sucesso.');
  } catch (error) {
    console.error('[product-card-appearance-migrate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
