import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

// Recursos exclusivos do ColombiaBot. Nenhuma tabela de pedidos existente é alterada.
type SqlDb = { execute(query: any): Promise<any> };
export const BOT_PHASES = ["Serviço", "Garantia / preço", "Dados", "Documentos", "Cupom", "Pagamento", "Finalizar"] as const;
export const BOT_EVENTS = ["etapa", "falha_envio", "pedido_confirmado", "pedido_pendente", "pedido_repetido"] as const;
export type BotPhase = (typeof BOT_PHASES)[number];
export type BotEvent = (typeof BOT_EVENTS)[number];

let schemaReady: Promise<void> | undefined;
export async function ensureColombiaBotReliabilitySchema(db: SqlDb): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql.raw(
        "CREATE TABLE IF NOT EXISTS colombiaBotSubmissions (" +
        "requestKey VARCHAR(36) NOT NULL PRIMARY KEY, " +
        "fingerprint VARCHAR(64) NOT NULL, " +
        "state VARCHAR(20) NOT NULL DEFAULT 'processing', " +
        "registrationId INT NULL, orderStatusId INT NULL, pricePaid VARCHAR(64) NULL, " +
        "createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, " +
        "INDEX colombiaBotSubmissions_state_idx (state, createdAt)) ENGINE=InnoDB"
      ));
      await db.execute(sql.raw(
        "CREATE TABLE IF NOT EXISTS colombiaBotDiagnosticEvents (" +
        "eventId VARCHAR(36) NOT NULL PRIMARY KEY, " +
        "sessionId VARCHAR(36) NOT NULL, " +
        "phase VARCHAR(40) NOT NULL, eventCode VARCHAR(32) NOT NULL, " +
        "createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "INDEX colombiaBotDiagnosticEvents_session_idx (sessionId, createdAt), " +
        "INDEX colombiaBotDiagnosticEvents_time_idx (createdAt)) ENGINE=InnoDB"
      ));
    })().catch(err => { schemaReady = undefined; throw err; });
  }
  await schemaReady;
}

export function botSubmissionFingerprint(input: { phone: string; productId?: number | null; optionId?: number | null; priceModelId?: number | null; }) {
  // Mistura UUID no armazenamento, evita guardar números telefônicos em claro.
  const normalized = input.phone.replace(/\D/g, "");
  return createHash("sha256").update(JSON.stringify([
    normalized, input.productId ?? null, input.optionId ?? null, input.priceModelId ?? null
  ])).digest("hex");
}

export type BotSubmissionClaim =
  | { kind: "owner" }
  | { kind: "duplicate"; registrationId: number; orderStatusId: number; pricePaid: string | null }
  | { kind: "pending" }
  | { kind: "conflict" };

function rowsFrom(result: any): Array<Record<string, any>> {
  if (!Array.isArray(result)) return [];
  if (Array.isArray(result[0])) return result[0];
  if (result[0] && typeof result[0] === "object" && !("affectedRows" in result[0])) {
    return result;
  }
  return [];
}

export async function claimColombiaBotSubmission(
  db: SqlDb, requestKey: string,
  identity: { phone: string; productId?: number | null; optionId?: number | null; priceModelId?: number | null }
): Promise<BotSubmissionClaim> {
  await ensureColombiaBotReliabilitySchema(db);
  const fingerprint = botSubmissionFingerprint(identity);
  // INSERT IGNORE + chave primária evita duas gravações simultâneas mesmo com múltiplas instâncias Render.
  const inserted = await db.execute(sql`INSERT IGNORE INTO colombiaBotSubmissions (requestKey, fingerprint, state)
    VALUES (${requestKey}, ${fingerprint}, 'processing')`);
  const header: any = Array.isArray(inserted) ? inserted[0] : inserted;
  if (Number(header?.affectedRows) === 1) return { kind: "owner" };
  if (header?.affectedRows === undefined) throw new Error("Sem confirmação do bloqueio de duplicidade");
  const result = await db.execute(sql`SELECT fingerprint, state, registrationId, orderStatusId, pricePaid
    FROM colombiaBotSubmissions WHERE requestKey = ${requestKey} LIMIT 1`);
  const entry = rowsFrom(result)[0];
  if (!entry) throw new Error("Registro de duplicidade indisponível");
  if (entry.fingerprint !== fingerprint) return { kind: "conflict" };
  const registrationId = Number(entry.registrationId);
  const orderStatusId = Number(entry.orderStatusId);
  if (entry.state === "completed" && registrationId > 0 && orderStatusId > 0) {
    return { kind: "duplicate", registrationId, orderStatusId, pricePaid: entry.pricePaid ? String(entry.pricePaid) : null };
  }
  // Uma tentativa sem confirmação NÃO pode criar outro pedido automaticamente.
  return { kind: "pending" };
}

export async function confirmColombiaBotSubmission(
  db: SqlDb, requestKey: string, order: { registrationId: number; orderStatusId: number; pricePaid?: string | null }
): Promise<void> {
  const result = await db.execute(sql`UPDATE colombiaBotSubmissions
    SET state = 'completed', registrationId = ${order.registrationId}, orderStatusId = ${order.orderStatusId}, pricePaid = ${order.pricePaid || null}
    WHERE requestKey = ${requestKey} AND state = 'processing'`);
  const header: any = Array.isArray(result) ? result[0] : result;
  if (Number(header?.affectedRows) !== 1) throw new Error("Não foi possível confirmar chave idempotente");
}

export async function flagColombiaBotSubmissionForReview(db: SqlDb, requestKey: string): Promise<void> {
  await db.execute(sql`UPDATE colombiaBotSubmissions SET state = 'needs_review'
    WHERE requestKey = ${requestKey} AND state = 'processing'`);
}

let lastDiagnosticPruneAt = 0;

export async function recordColombiaBotEvent(db: SqlDb, input: {
  eventId: string; sessionId: string; phase: BotPhase; eventCode: BotEvent;
}): Promise<boolean> {
  await ensureColombiaBotReliabilitySchema(db);
  // Remoção conservadora de telemetria antiga, no máximo uma operação por hora e instância.
  if (Date.now() - lastDiagnosticPruneAt > 60 * 60 * 1000) {
    lastDiagnosticPruneAt = Date.now();
    try {
      await db.execute(sql`DELETE FROM colombiaBotDiagnosticEvents
        WHERE createdAt < NOW() - INTERVAL 8 DAY`);
    } catch { /* falha de limpeza não interrompe pedidos */ }
  }
  // Limite de eventos por sessão e janela: preservar o Render, evitar ruído e abuso.
  const row = rowsFrom(await db.execute(sql`SELECT COUNT(*) AS total
    FROM colombiaBotDiagnosticEvents WHERE sessionId = ${input.sessionId}
      AND createdAt >= NOW() - INTERVAL 1 DAY`))[0];
  if (Number(row?.total || 0) >= 40) return false;
  await db.execute(sql`INSERT IGNORE INTO colombiaBotDiagnosticEvents
    (eventId, sessionId, phase, eventCode)
    VALUES (${input.eventId}, ${input.sessionId}, ${input.phase}, ${input.eventCode})`);
  return true;
}

export async function getColombiaBotDiagnostics(db: SqlDb) {
  await ensureColombiaBotReliabilitySchema(db);
  const events = rowsFrom(await db.execute(sql`SELECT sessionId, phase, eventCode, createdAt
    FROM colombiaBotDiagnosticEvents
    WHERE createdAt >= NOW() - INTERVAL 7 DAY
    ORDER BY createdAt DESC LIMIT 250`));
  const claims = rowsFrom(await db.execute(sql`SELECT requestKey, state, registrationId, createdAt
    FROM colombiaBotSubmissions
    WHERE state IN ('processing', 'needs_review')
    ORDER BY createdAt DESC LIMIT 30`));
  const phases: Record<string, number> = Object.fromEntries(BOT_PHASES.map(p => [p, 0]));
  const latest = new Map<string, { id: string; phase: string; event: string; createdAt: string }>();
  for (const item of events) {
    const sessionId = String(item.sessionId || "");
    if (!latest.has(sessionId)) {
      latest.set(sessionId, {
        id: sessionId.slice(-8),
        phase: String(item.phase || ""),
        event: String(item.eventCode || ""),
        createdAt: new Date(item.createdAt).toISOString(),
      });
      phases[item.phase] = (phases[item.phase] || 0) + 1;
    }
  }
  return {
    totalSessions: latest.size,
    phases,
    lastSessions: [...latest.values()].slice(0, 40),
    pendingOrders: claims.map(item => ({
      request: String(item.requestKey || "").slice(-8),
      state: String(item.state || ""),
      registrationId: Number(item.registrationId || 0) || null,
      createdAt: new Date(item.createdAt).toISOString(),
    })),
    windowDays: 7,
  };
}
