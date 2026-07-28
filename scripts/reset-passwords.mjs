import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await createConnection(url);

try {
  // Verificar tabelas existentes
  const [tables] = await conn.execute("SHOW TABLES");
  const tableNames = tables.map(r => Object.values(r)[0]);
  console.log('Tabelas encontradas:', tableNames.filter(t => t.toLowerCase().includes('pin') || t.toLowerCase().includes('password')));

  // Limpar PINs antigos
  if (tableNames.includes('customerPins')) {
    const [r1] = await conn.execute("DELETE FROM customerPins");
    console.log('customerPins removidas:', r1.affectedRows, 'linhas');
  }

  // Limpar sessões do novo sistema
  if (tableNames.includes('customerPasswordSessions')) {
    const [r2] = await conn.execute("DELETE FROM customerPasswordSessions");
    console.log('customerPasswordSessions removidas:', r2.affectedRows, 'linhas');
  }

  // Limpar senhas do novo sistema
  if (tableNames.includes('customerPasswords')) {
    const [r3] = await conn.execute("DELETE FROM customerPasswords");
    console.log('customerPasswords removidas:', r3.affectedRows, 'linhas');
  }

  console.log('\n✅ Reset completo! Todos os clientes precisarão criar nova senha.');
} catch (err) {
  console.error('Erro:', err.message);
  process.exit(1);
} finally {
  await conn.end();
}
