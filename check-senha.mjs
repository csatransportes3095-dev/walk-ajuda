import { getDb } from './server/db.ts';
import { sql } from 'drizzle-orm';

const db = await getDb();
if (!db) { console.log('DB not available'); process.exit(1); }

const rows = await db.execute(sql`SELECT id, code, type, status, clientName, maxUses, currentUses, expiresAt, timeOnly FROM accessCodes WHERE code = 'SEXTA25'`);
console.log('Resultado:', JSON.stringify(rows[0], null, 2));

const now = new Date();
console.log('Hora atual UTC:', now.toISOString());
process.exit(0);
