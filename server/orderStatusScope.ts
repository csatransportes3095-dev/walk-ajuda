import { sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { orderStatusTypes } from '../drizzle/schema';

const schemaReady = new WeakMap<object, Promise<void>>();
export const scopeRows = (result: any): any[] => Array.isArray(result?.[0]) ? result[0] : [];

/** Additive schema only. No status, order, password or appointment is deleted. */
export async function ensureStatusScopeSchema(db: any): Promise<void> {
  if (!schemaReady.has(db)) {
    const pending = (async () => {
      const cols = scopeRows(await db.execute(sql`SHOW COLUMNS FROM orderStatusTypes LIKE 'isGlobal'`));
      if (!cols.length) {
        try { await db.execute(sql.raw('ALTER TABLE orderStatusTypes ADD COLUMN isGlobal INT NOT NULL DEFAULT 1')); }
        catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME' && error?.cause?.code !== 'ER_DUP_FIELDNAME') throw error; }
      }
      const imageCols = scopeRows(await db.execute(sql`SHOW COLUMNS FROM orderStatusTypes LIKE 'imageUrl'`));
      if (!imageCols.length) {
        try { await db.execute(sql.raw('ALTER TABLE orderStatusTypes ADD COLUMN imageUrl TEXT NULL AFTER icon')); }
        catch (error: any) { if (error?.code !== 'ER_DUP_FIELDNAME' && error?.cause?.code !== 'ER_DUP_FIELDNAME') throw error; }
      }
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS orderStatusScopeControl (
        id INT NOT NULL PRIMARY KEY, recoveryVersion INT NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
      await db.execute(sql`INSERT IGNORE INTO orderStatusScopeControl (id, recoveryVersion) VALUES (1, 0)`);
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS orderStatusScopeArchive (
        id INT AUTO_INCREMENT PRIMARY KEY, scopeKind VARCHAR(16) NOT NULL,
        recordKey VARCHAR(64) NOT NULL, definitionJson LONGTEXT NOT NULL,
        reason VARCHAR(64) NOT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status_scope_archive (scopeKind, recordKey, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
    })().catch(error => { schemaReady.delete(db); throw error; });
    schemaReady.set(db, pending);
  }
  await schemaReady.get(db);
}

/** Serialize catalogue and flow mutations so referenced records cannot disappear mid-save. */
export async function withStatusScopeLock<T>(db: any, callback: (tx: any) => Promise<T>): Promise<T> {
  await ensureStatusScopeSchema(db);
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT id FROM orderStatusScopeControl WHERE id = 1 FOR UPDATE`);
    return callback(tx);
  });
}

export async function archiveScopeDefinition(tx: any, kind: 'status' | 'flow', key: string, data: unknown, reason: string) {
  await tx.execute(sql`INSERT INTO orderStatusScopeArchive (scopeKind, recordKey, definitionJson, reason)
    VALUES (${kind}, ${key}, ${JSON.stringify(data)}, ${reason})`);
}

export async function assertStatusCanBeRemoved(tx: any, status: any) {
  const links = scopeRows(await tx.execute(sql`SELECT flowId FROM orderStatusFlowItems WHERE statusKey = ${status.key} LIMIT 1`));
  const history = scopeRows(await tx.execute(sql`SELECT id FROM orderStatusHistory WHERE status = ${status.key} LIMIT 1`));
  const progress = scopeRows(await tx.execute(sql`SELECT id FROM orderProgressConfig WHERE statusKey = ${status.key} LIMIT 1`));
  if (links.length || history.length || progress.length || status.isSystem === 1) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Este status possui vinculos ou historico. Use Retirar do global ou Remover desta sequencia; o cadastro compartilhado foi preservado.' });
  }
}

export async function assertNotInitialStatus(tx: any, status: any) {
  const initial = scopeRows(await tx.execute(sql`SELECT id FROM orderStatusTypes WHERE isActive = 1 AND isGlobal = 1 ORDER BY sortOrder ASC, id ASC LIMIT 1`))[0];
  if (status.key === 'recebido' || Number(initial?.id) === Number(status.id)) {
    throw new TRPCError({ code: 'CONFLICT', message: 'O status inicial universal deve permanecer ativo no global.' });
  }
}

// Titles explicitly approved in the recovery plan. They are NOT evidence of an ID.
// A reference recovery requires the exact key to still exist in a vehicle flow.
const confirmedVehicleLabels: Record<string, string> = {
  buscando_dados: 'BUSCANDO DADOS',
  documento_montagem: 'DOCUMENTO MONTAGEM',
  documento_em_teste: 'DOCUMENTO EM TESTE',
  doc_testado_e_aprovado: 'DOC TESTADO E APROVADO',
};
const vehicleFlow = (name: unknown) => String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('veiculo');

/** One-time recovery: retained keys / stored snapshots only; never invent IDs or links. */
export async function recoverReferencedStatusDefinitions(db: any) {
  return withStatusScopeLock(db, async tx => {
    const control = scopeRows(await tx.execute(sql`SELECT recoveryVersion FROM orderStatusScopeControl WHERE id = 1`))[0];
    if (Number(control?.recoveryVersion) >= 1) return { alreadyApplied: true, restored: [], isolated: [], unresolved: [] };
    const all = scopeRows(await tx.execute(sql`SELECT * FROM orderStatusTypes`));
    for (const status of all) await archiveScopeDefinition(tx, 'status', status.key, status, 'scope-baseline');
    const hasFlows = scopeRows(await tx.execute(sql`SHOW TABLES LIKE 'orderStatusFlowItems'`)).length > 0;
    const refs = hasFlows ? scopeRows(await tx.execute(sql`
      SELECT i.statusKey, i.sortOrder, f.name AS flowName FROM orderStatusFlowItems i
      INNER JOIN orderStatusFlows f ON f.id = i.flowId WHERE f.isDefault = 0
      ORDER BY i.flowId ASC, i.sortOrder ASC, i.id ASC
    `)) : [];
    const byKey = new Map(all.map(s => [String(s.key), s]));
    const restored: string[] = [], isolated: string[] = [], unresolved: string[] = [];
    const processed = new Set<string>();
    for (const ref of refs) {
      const key = String(ref.statusKey);
      if (processed.has(key)) continue;
      processed.add(key);
      const knownVehicle = refs.some(r => r.statusKey === key && vehicleFlow(r.flowName)) && Object.hasOwn(confirmedVehicleLabels, key);
      const existing = byKey.get(key);
      if (existing) {
        if (knownVehicle && (Number(existing.isGlobal) !== 0 || Number(existing.isActive) !== 1)) {
          await tx.execute(sql`UPDATE orderStatusTypes SET isGlobal = 0, isActive = 1 WHERE \`key\` = ${key}`);
          await archiveScopeDefinition(tx, 'status', key, { ...existing, isGlobal: 0, isActive: 1 }, 'vehicle-isolated-preserved');
          isolated.push(key);
        }
        continue;
      }
      const archived = scopeRows(await tx.execute(sql`SELECT definitionJson FROM orderStatusScopeArchive
        WHERE scopeKind = 'status' AND recordKey = ${key} ORDER BY id DESC LIMIT 1`))[0];
      let original: any = null;
      try { original = archived ? JSON.parse(String(archived.definitionJson)) : null; } catch { /* Keep unresolved; never guess invalid snapshots. */ }
      const verifiedSnapshot = original?.key === key && typeof original?.label === 'string' && original.label.length > 0 && original.label.length <= 128;
      if (!verifiedSnapshot && !knownVehicle) { unresolved.push(key); continue; }
      const definition = {
        key, label: verifiedSnapshot ? original.label : confirmedVehicleLabels[key],
        color: verifiedSnapshot ? original.color : 'text-gray-400',
        bgColor: verifiedSnapshot ? original.bgColor : 'bg-gray-500/20 border-gray-500/40',
        icon: verifiedSnapshot ? original.icon : 'Clock',
        description: verifiedSnapshot ? original.description : null,
        sortOrder: Number(verifiedSnapshot ? original.sortOrder : ref.sortOrder) || 0,
        isSystem: verifiedSnapshot ? Number(original.isSystem) || 0 : 0,
        isActive: 1, isGlobal: 0,
        pulseColor: verifiedSnapshot ? original.pulseColor : null,
        showInProgress: verifiedSnapshot ? Number(original.showInProgress) || 0 : 0,
        progressOrder: verifiedSnapshot ? Number(original.progressOrder) || 0 : 0,
      };
      // No primary ID supplied: the existing statusKey preserves flow/history references.
      await tx.insert(orderStatusTypes).values(definition);
      await archiveScopeDefinition(tx, 'status', key, definition, verifiedSnapshot ? 'recovered-exact-snapshot' : 'recovered-reference-review-style');
      restored.push(key);
    }
    await tx.execute(sql`UPDATE orderStatusScopeControl SET recoveryVersion = 1 WHERE id = 1`);
    return { alreadyApplied: false, restored, isolated, unresolved };
  });
}

export async function readStatusScopeReport(db: any) {
  await ensureStatusScopeSchema(db);
  const recovered = scopeRows(await db.execute(sql`SELECT recordKey, reason FROM orderStatusScopeArchive
    WHERE scopeKind = 'status' AND reason IN ('recovered-exact-snapshot', 'recovered-reference-review-style', 'vehicle-isolated-preserved') ORDER BY id ASC`));
  return { recovered: recovered.map(r => ({ key: String(r.recordKey), source: String(r.reason) })) };
}
