import { TRPCError } from "@trpc/server";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { ensureCpfVaultSchema, type CpfVaultExecutor } from "./cpfVaultSchema";
import { parseCpfVaultBatch, validCpfVaultValue, type CpfVaultRecord } from "../shared/cpfVault";

type Row = Record<string, unknown>;
type Database = CpfVaultExecutor & {
  transaction<T>(callback: (tx: CpfVaultExecutor) => Promise<T>): Promise<T>;
};
export type CpfVaultOrderInput = {
  registrationId?: number;
  subOrderIndex?: number;
  expectedOrderNumber?: number;
  expectedOrderRootId?: number;
};
type OrderIdentity = {
  registrationId: number;
  subOrderIndex: number;
  orderRootId: number;
  customerId: number | null;
  customerName: string | null;
  customerNumber: number | null;
  orderNumber: number | null;
};
const rows = (result: unknown): Row[] => Array.isArray(result) && Array.isArray(result[0]) ? result[0] as Row[] : [];
const nullableNumber = (value: unknown) => value == null ? null : Number(value);

function mapRecord(row: Row): CpfVaultRecord {
  return {
    id: Number(row.id), normalizedCpf: String(row.normalizedCpf),
    registrationId: nullableNumber(row.registrationId), subOrderIndex: Number(row.subOrderIndex || 0),
    orderRootId: nullableNumber(row.orderRootId),
    customerId: nullableNumber(row.customerId), customerName: row.customerName == null ? null : String(row.customerName),
    customerNumber: nullableNumber(row.customerNumber), orderNumber: nullableNumber(row.orderNumber),
    note: row.note == null ? null : String(row.note),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

async function database(): Promise<Database> {
  const db = await getDb() as Database | null;
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Cofre indisponível. Nenhum CPF foi liberado para uso." });
  await ensureCpfVaultSchema(db);
  return db;
}

/** Database errors must never become a green result or expose query parameters. */
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Não foi possível conferir o Cofre de CPF. Tente novamente; nenhum CPF foi liberado para reutilização." });
  }
}

function requireCpf(value: string): string {
  const cpf = validCpfVaultValue(value);
  if (!cpf) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido. Confira os 11 números e os dígitos verificadores." });
  return cpf;
}

function parseBatch(text: string) {
  try {
    const parsed = parseCpfVaultBatch(text);
    if (!parsed.total && !parsed.invalid.length) throw new Error("Informe pelo menos um CPF.");
    return parsed;
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Lista de CPFs inválida." });
  }
}

function isDuplicateKey(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const item = current as { code?: string; errno?: number; cause?: unknown };
    if (item.code === "ER_DUP_ENTRY" || item.errno === 1062) return true;
    current = item.cause;
  }
  return false;
}

async function readInitialOrderStatus(db: CpfVaultExecutor): Promise<string> {
  const statusRows = rows(await db.execute(sql`SELECT \`key\` FROM orderStatusTypes
    WHERE isActive=1 AND isGlobal=1 ORDER BY sortOrder ASC,id ASC LIMIT 1`));
  return String(statusRows[0]?.key || "recebido");
}

/** Shared by card metadata and save/list validation; newest group has index zero. */
function splitOrderHistory(history: Row[], initialStatus: string): Row[][] {
  const groups: Row[][] = [];
  let current: Row[] = [];
  for (const entry of history) {
    if ((entry.status === initialStatus || entry.status === "recebido") && current.length) {
      groups.push(current); current = [];
    }
    current.push(entry);
  }
  if (current.length) groups.push(current);
  return groups.reverse();
}

function describeOrderGroup(group: Row[]) {
  const numbered = group.find(row => row.orderNumber != null && Number(row.orderNumber) > 0);
  return { orderRootId: Number(group[0].id), orderNumber: numbered ? Number(numbered.orderNumber) : null };
}

type CpfVaultOrderMetadata = { orderRootId: number; cpfVaultOrderNumber: number | null };

/** Add CPF-only identity metadata without changing the existing card data or grouping. */
export async function getCpfVaultOrderMetadata(
  db: CpfVaultExecutor,
  orderScopes: Array<{ registrationId: number; subOrderIndex?: number }>,
): Promise<Map<string, CpfVaultOrderMetadata>> {
  const metadata = new Map<string, CpfVaultOrderMetadata>();
  const scopes = orderScopes.filter(scope => Number.isInteger(scope.registrationId) && scope.registrationId > 0
    && Number.isInteger(scope.subOrderIndex ?? 0) && (scope.subOrderIndex ?? 0) >= 0);
  if (!scopes.length) return metadata;
  try {
    const initialStatus = await readInitialOrderStatus(db);
    const ids = [...new Set(scopes.map(scope => scope.registrationId))];
    const histories = new Map<number, Row[]>();
    for (let index = 0; index < ids.length; index += 250) {
      const chunk = ids.slice(index, index + 250);
      const history = rows(await db.execute(sql`SELECT id,registrationId,status,orderNumber FROM orderStatusHistory
        WHERE registrationId IN (${sql.join(chunk.map(id => sql`${id}`), sql`, `)})
        ORDER BY registrationId ASC,createdAt ASC,id ASC`));
      for (const entry of history) {
        const id = Number(entry.registrationId);
        const group = histories.get(id) || [];
        group.push(entry);
        histories.set(id, group);
      }
    }
    const groupsByRegistration = new Map([...histories].map(([id, history]) => [id, splitOrderHistory(history, initialStatus)]));
    for (const scope of scopes) {
      const subOrderIndex = scope.subOrderIndex ?? 0;
      const group = groupsByRegistration.get(scope.registrationId)?.[subOrderIndex];
      if (!group?.length) continue;
      const identity = describeOrderGroup(group);
      metadata.set(`${scope.registrationId}_${subOrderIndex}`, {
        orderRootId: identity.orderRootId, cpfVaultOrderNumber: identity.orderNumber,
      });
    }
    return metadata;
  } catch {
    // Existing order cards remain usable; the CPF action requires valid metadata and fails closed.
    console.warn("[Cofre CPF] Não foi possível confirmar a identidade dos pedidos; registro de CPF bloqueado nestes cards.");
    return new Map();
  }
}

/** Same chronological grouping as listOrders, anchored to its FIRST history row. */
async function resolveOrder(db: CpfVaultExecutor, input: CpfVaultOrderInput): Promise<OrderIdentity | null> {
  if (input.registrationId === undefined) return null;
  const registrationId = input.registrationId;
  const subOrderIndex = input.subOrderIndex ?? 0;
  const history = rows(await db.execute(sql`SELECT id,status,orderNumber,customerPhone FROM orderStatusHistory
    WHERE registrationId=${registrationId} ORDER BY createdAt ASC,id ASC`));
  if (!history.length) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado. Atualize a lista de pedidos." });
  const group = splitOrderHistory(history, await readInitialOrderStatus(db))[subOrderIndex];
  if (!group?.length) throw new TRPCError({ code: "NOT_FOUND", message: "Subpedido não encontrado. Atualize a lista de pedidos." });
  const { orderRootId, orderNumber } = describeOrderGroup(group);
  if (input.expectedOrderRootId !== undefined && input.expectedOrderRootId !== orderRootId) {
    throw new TRPCError({ code: "CONFLICT", message: "Este card está desatualizado. Atualize a lista de pedidos antes de registrar o CPF." });
  }
  if (input.expectedOrderNumber !== undefined && input.expectedOrderNumber !== orderNumber) {
    throw new TRPCError({ code: "CONFLICT", message: "Este card está desatualizado. Atualize a lista de pedidos antes de registrar o CPF." });
  }
  const registration = rows(await db.execute(sql`SELECT phone FROM accessCodePhones WHERE id=${registrationId} LIMIT 1`))[0];
  const phone = String(registration?.phone || group[group.length - 1].customerPhone || "").replace(/\D/g, "");
  let customer: Row | undefined;
  if (phone.length >= 10) {
    customer = rows(await db.execute(sql`SELECT id,name,customerNumber FROM customers
      WHERE deletedAt IS NULL AND RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),11)=${phone.slice(-11)}
      ORDER BY (REGEXP_REPLACE(phone,'[^0-9]','')=${phone}) DESC,id DESC LIMIT 1`))[0];
  }
  return {
    registrationId, subOrderIndex, orderRootId, orderNumber,
    customerId: nullableNumber(customer?.id), customerNumber: nullableNumber(customer?.customerNumber),
    customerName: customer?.name == null ? null : String(customer.name),
  };
}

async function recordByCpf(db: CpfVaultExecutor, cpf: string, lock = false): Promise<CpfVaultRecord | null> {
  const result = rows(await db.execute(sql`SELECT id,normalizedCpf,registrationId,subOrderIndex,orderRootId,
    customerId,customerName,customerNumber,orderNumber,note,createdAt
    FROM cpf_usage_registry WHERE normalizedCpf=${cpf} LIMIT 1 ${lock ? sql`FOR UPDATE` : sql``}`));
  return result[0] ? mapRecord(result[0]) : null;
}

export const checkCpfVault = (input: { cpf: string }) => guarded(async () => {
  const normalizedCpf = requireCpf(input.cpf);
  const record = await recordByCpf(await database(), normalizedCpf);
  return { exists: record !== null, normalizedCpf, record };
});

export const saveCpfVault = (input: CpfVaultOrderInput & { cpf: string; note?: string }) => guarded(async () => {
  const normalizedCpf = requireCpf(input.cpf);
  if (input.registrationId !== undefined && input.expectedOrderRootId === undefined) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A identidade deste pedido não foi confirmada. Atualize a lista e abra o cofre novamente." });
  }
  const db = await database();
  return db.transaction(async tx => {
    const identity = await resolveOrder(tx, input);
    let saved = false;
    try {
      // The UNIQUE index arbitrates concurrent saves. Never replace the original owner.
      await tx.execute(sql`INSERT INTO cpf_usage_registry
        (normalizedCpf,registrationId,subOrderIndex,orderRootId,customerId,customerName,customerNumber,orderNumber,note)
        VALUES (${normalizedCpf},${identity?.registrationId ?? null},${identity?.subOrderIndex ?? 0},
          ${identity?.orderRootId ?? null},${identity?.customerId ?? null},${identity?.customerName ?? null},
          ${identity?.customerNumber ?? null},${identity?.orderNumber ?? null},${input.note?.trim() || null})`);
      saved = true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
    // Locking read sees the winning concurrent insertion even under REPEATABLE READ.
    const record = await recordByCpf(tx, normalizedCpf, true);
    if (!record) throw new Error("CPF insertion could not be verified");
    return { saved, exists: true as const, normalizedCpf, record };
  });
});

export const checkCpfVaultBatch = (input: { text: string }) => guarded(async () => {
  const parsed = parseBatch(input.text);
  const db = await database();
  const used = new Set<string>();
  for (let index = 0; index < parsed.cpfs.length; index += 250) {
    const chunk = parsed.cpfs.slice(index, index + 250);
    const found = rows(await db.execute(sql`SELECT normalizedCpf FROM cpf_usage_registry
      WHERE normalizedCpf IN (${sql.join(chunk.map(cpf => sql`${cpf}`), sql`, `)})`));
    for (const record of found) used.add(String(record.normalizedCpf));
  }
  return {
    total: parsed.total, available: parsed.cpfs.filter(cpf => !used.has(cpf)),
    used: parsed.cpfs.filter(cpf => used.has(cpf)), invalid: parsed.invalid, duplicateCount: parsed.duplicateCount,
  };
});

export const saveCpfVaultBatch = (input: { text: string; note?: string }) => guarded(async () => {
  const parsed = parseBatch(input.text);
  const db = await database();
  const savedCount = await db.transaction(async tx => {
    let saved = 0;
    for (let index = 0; index < parsed.cpfs.length; index += 250) {
      const chunk = parsed.cpfs.slice(index, index + 250);
      const result = await tx.execute(sql`INSERT IGNORE INTO cpf_usage_registry (normalizedCpf,note)
        VALUES ${sql.join(chunk.map(cpf => sql`(${cpf},${input.note?.trim() || null})`), sql`, `)}`);
      const header = Array.isArray(result) ? result[0] as { affectedRows?: number; warningStatus?: number } : null;
      if (!header || !Number.isInteger(header.affectedRows) || header.affectedRows! < 0 || header.affectedRows! > chunk.length) {
        throw new Error("Unexpected CPF batch insert result");
      }
      // IGNORE is used only for races on the UNIQUE CPF key, never data loss.
      if (header.warningStatus) {
        const warnings = rows(await tx.execute(sql`SHOW WARNINGS`));
        if (!warnings.length || warnings.some(warning => Number(warning.Code) !== 1062)) {
          throw new Error("Unexpected CPF batch insert warning");
        }
      }
      saved += header.affectedRows!;
    }
    return saved;
  });
  return { savedCount, alreadyUsedCount: parsed.total - savedCount,
    invalid: parsed.invalid, duplicateCount: parsed.duplicateCount, total: parsed.total };
});

export const listCpfVault = (input: CpfVaultOrderInput & { query?: string; limit?: number; cursor?: number }) => guarded(async () => {
  const db = await database();
  const identity = await resolveOrder(db, input);
  const filters: SQL[] = [];
  if (identity) filters.push(sql`registrationId=${identity.registrationId} AND orderRootId=${identity.orderRootId}`);
  const query = input.query?.trim() || "";
  if (query) {
    const customerNumber = query.match(/^[*#]\s*(\d+)$/);
    if (customerNumber) filters.push(sql`customerNumber=${Number(customerNumber[1])}`);
    else {
      const pattern = `%${query.replace(/[!%_]/g, value => `!${value}`)}%`;
      const digits = /^[\d.\s-]+$/.test(query) ? query.replace(/\D/g, "") : "";
      filters.push(sql`(customerName LIKE ${pattern} ESCAPE '!' OR note LIKE ${pattern} ESCAPE '!'
        OR CAST(orderNumber AS CHAR) LIKE ${pattern} ESCAPE '!'
        OR ${digits ? sql`normalizedCpf LIKE ${`%${digits}%`}` : sql`0=1`})`);
    }
  }
  const baseWhere = filters.length ? sql.join(filters, sql` AND `) : sql`1=1`;
  const count = rows(await db.execute(sql`SELECT COUNT(*) AS total FROM cpf_usage_registry WHERE ${baseWhere}`));
  const where = input.cursor ? sql`${baseWhere} AND id<${input.cursor}` : baseWhere;
  const limit = input.limit ?? 50;
  const found = rows(await db.execute(sql`SELECT id,normalizedCpf,registrationId,subOrderIndex,orderRootId,
    customerId,customerName,customerNumber,orderNumber,note,createdAt FROM cpf_usage_registry
    WHERE ${where} ORDER BY id DESC LIMIT ${limit + 1}`));
  const items = found.slice(0, limit).map(mapRecord);
  return { items, nextCursor: found.length > limit ? items[items.length - 1].id : null,
    total: Number(count[0]?.total ?? 0), orderRootId: identity?.orderRootId ?? null };
});
