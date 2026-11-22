import { createConnection } from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada: migração NÃO executada.");
  }
  const conn = await createConnection(process.env.DATABASE_URL);
  try {
    await conn.query(
      "CREATE TABLE IF NOT EXISTS colombiaBotSubmissions (" +
      "requestKey VARCHAR(36) NOT NULL PRIMARY KEY, " +
      "fingerprint VARCHAR(64) NOT NULL, " +
      "state VARCHAR(20) NOT NULL DEFAULT 'processing', " +
      "registrationId INT NULL, orderStatusId INT NULL, pricePaid VARCHAR(64) NULL, " +
      "createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, " +
      "INDEX colombiaBotSubmissions_state_idx (state, createdAt)" +
      ") ENGINE=InnoDB"
    );
    await conn.query(
      "CREATE TABLE IF NOT EXISTS colombiaBotDiagnosticEvents (" +
      "eventId VARCHAR(36) NOT NULL PRIMARY KEY, " +
      "sessionId VARCHAR(36) NOT NULL, " +
      "phase VARCHAR(40) NOT NULL, eventCode VARCHAR(32) NOT NULL, " +
      "createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "INDEX colombiaBotDiagnosticEvents_session_idx (sessionId, createdAt), " +
      "INDEX colombiaBotDiagnosticEvents_time_idx (createdAt)" +
      ") ENGINE=InnoDB"
    );
    console.log("[ColombiaBot] Duas tabelas novas verificadas. Nenhuma tabela existente alterada.");
  } finally {
    await conn.end();
  }
}

void main().catch(e => {
  console.error("[ColombiaBot] Migração falhou:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
