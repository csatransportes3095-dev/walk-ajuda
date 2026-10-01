import { createConnection } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { recoverReferencedStatusDefinitions } from '../server/orderStatusScope';

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    const result = await recoverReferencedStatusDefinitions(drizzle(connection));
    console.log('[status-scope-migrate]', JSON.stringify(result));
  } finally { await connection.end(); }
}
if (process.argv[1]?.endsWith('apply-status-scope-migration.ts')) {
  run().catch(error => { console.error('[status-scope-migrate] Failed:', error instanceof Error ? error.message : 'Migration failed'); process.exitCode = 1; });
}
