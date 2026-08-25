import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { addOrderStatus, generateOrderNumber } from "./db";

export type OrderStatusRow = { id: number };

export type PublicOrderPersistenceInput = {
  effectivePhone: string;
  cpTokenValid: boolean;
  accessCode?: string;
  generalPassword?: string;
  clientName?: string;
  serviceName?: string;
  serviceOption?: string;
  pricePaid?: string | null;
  answers?: string;
};

export type OrderPersistenceStore = {
  findAccessCodeId(code: string): Promise<number | undefined>;
  createAccessCode(input: {
    code: string;
    type: "general" | "vip";
    status: "active" | "used";
    clientName?: string | null;
    maxUses: number;
    currentUses: number;
  }): Promise<number | undefined>;
  createAccessCodePhone(codeId: number, phone: string, consumed: number): Promise<number | undefined>;
  findRegistrationIdByCodeAndPhone(code: string, phone: string): Promise<number | undefined>;
  findRegistrationIdByCodeIdAndPhone(codeId: number, phone: string): Promise<number | undefined>;
  findRegistrationIdByPhone(phone: string): Promise<number | undefined>;
  findInitialStatus(): Promise<string | undefined>;
  countOrderHistoryByPhone(phone: string): Promise<number>;
};

export type PublicOrderPersistenceDeps = {
  store: OrderPersistenceStore;
  addOrderStatus: typeof addOrderStatus;
  generateOrderNumber: typeof generateOrderNumber;
  now?: () => number;
  createId?: () => string;
};

export type PersistedPublicOrder = {
  registrationId: number;
  orderStatusId: number;
  orderNumber?: number;
  initialStatus: string;
  previousOrderCount: number;
};

function positiveId(value: unknown): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function materializeSyntheticAccess(
  store: OrderPersistenceStore,
  code: string,
  type: "general" | "vip",
  phone: string,
  clientName: string | undefined,
): Promise<number | undefined> {
  let codeId = await store.findAccessCodeId(code);
  if (!codeId) {
    codeId = await store.createAccessCode({
      code,
      type,
      status: "active",
      clientName: clientName || null,
      maxUses: 99999,
      currentUses: 0,
    });
  }
  if (!codeId) return undefined;
  return store.createAccessCodePhone(codeId, phone, 0);
}

/**
 * Creates the access-code phone row and the initial order status before any
 * public-order notification is sent. The cpToken is represented as a VIP
 * access code because the schema intentionally supports only general|vip.
 */
export async function persistPublicOrder(
  input: PublicOrderPersistenceInput,
  deps: PublicOrderPersistenceDeps,
): Promise<PersistedPublicOrder> {
  const phone = normalizePhone(input.effectivePhone);
  if (!phone) throw new Error("Telefone efetivo ausente para persistir o pedido");

  let registrationId: number | undefined;
  const isGeneralCode = Boolean(input.generalPassword && input.accessCode === input.generalPassword);

  if (input.cpTokenValid) {
    registrationId = await materializeSyntheticAccess(
      deps.store,
      "__cptoken__",
      "vip",
      phone,
      input.clientName,
    );
  } else if (isGeneralCode) {
    registrationId = await materializeSyntheticAccess(
      deps.store,
      "__general__",
      "general",
      phone,
      input.clientName,
    );
  } else {
    if (input.accessCode) {
      registrationId = await deps.store.findRegistrationIdByCodeAndPhone(input.accessCode, phone);
      if (!registrationId) {
        const codeId = await deps.store.findAccessCodeId(input.accessCode);
        if (codeId) {
          registrationId = await deps.store.createAccessCodePhone(codeId, phone, 0);
        }
      }
    }
    if (!registrationId) {
      registrationId = await deps.store.findRegistrationIdByPhone(phone);
    }
  }

  if (!registrationId) {
    const suffix = (deps.createId || randomUUID)().slice(0, 8);
    const fallbackCode = `ORDER-${phone}-${(deps.now || Date.now)()}-${suffix}`;
    const fallbackCodeId = await deps.store.createAccessCode({
      code: fallbackCode,
      type: "vip",
      status: "used",
      clientName: input.clientName || null,
      maxUses: 1,
      currentUses: 1,
    });
    if (fallbackCodeId) {
      registrationId = await deps.store.createAccessCodePhone(fallbackCodeId, phone, 1);
    }
  }

  if (!registrationId) {
    throw new Error("registrationId não foi criado");
  }

  const initialStatus = (await deps.store.findInitialStatus()) || "pedido_recebido";
  let orderNumber: number | undefined;
  try {
    orderNumber = await deps.generateOrderNumber();
  } catch (error) {
    console.error("[OrderNumber] Erro ao gerar número:", error);
  }

  const previousOrderCount = await deps.store.countOrderHistoryByPhone(phone);
  const statusRow = await deps.addOrderStatus({
    registrationId,
    orderNumber,
    customerPhone: phone,
    status: initialStatus,
    note: "Pedido recebido via site",
    serviceName: input.serviceName,
    serviceOption: input.serviceOption,
    pricePaid: input.pricePaid,
    answers: input.answers,
  });
  const orderStatusId = positiveId(statusRow?.id);
  if (!orderStatusId) {
    throw new Error("status inicial não foi persistido");
  }

  return {
    registrationId,
    orderStatusId,
    orderNumber,
    initialStatus,
    previousOrderCount,
  };
}

export function isPersistedPublicOrder(value: Partial<PersistedPublicOrder> | null | undefined): value is PersistedPublicOrder {
  return Boolean(
    value &&
    positiveId(value.registrationId) &&
    positiveId(value.orderStatusId),
  );
}

export async function notifyOnlyAfterPersistence<T>(
  value: Partial<PersistedPublicOrder> | null | undefined,
  notify: () => Promise<T>,
): Promise<T | undefined> {
  if (!isPersistedPublicOrder(value)) return undefined;
  return notify();
}

export function createSqlOrderPersistenceStore(db: { execute(query: unknown): Promise<unknown> }): OrderPersistenceStore {
  const rowsFrom = (result: unknown): Array<Record<string, unknown>> => {
    if (!Array.isArray(result)) return [];
    if (Array.isArray(result[0])) return result[0] as Array<Record<string, unknown>>;
    if (result[0] && typeof result[0] === "object") return result as Array<Record<string, unknown>>;
    return [];
  };

  const firstId = (result: unknown): number | undefined => positiveId(rowsFrom(result)[0]?.id);

  return {
    async findAccessCodeId(code) {
      return firstId(await db.execute(sql`SELECT id FROM accessCodes WHERE code = ${code} LIMIT 1`));
    },
    async createAccessCode(input) {
      await db.execute(sql`
        INSERT INTO accessCodes (code, type, status, clientName, maxUses, currentUses, createdAt)
        VALUES (${input.code}, ${input.type}, ${input.status}, ${input.clientName || null}, ${input.maxUses}, ${input.currentUses}, NOW())
      `);
      return this.findAccessCodeId(input.code);
    },
    async createAccessCodePhone(codeId, phone, consumed) {
      await db.execute(sql`
        INSERT INTO accessCodePhones (codeId, phone, consumed, accessedAt)
        VALUES (${codeId}, ${phone}, ${consumed}, NOW())
      `);
      return firstId(await db.execute(sql`
        SELECT id FROM accessCodePhones
        WHERE codeId = ${codeId} AND REGEXP_REPLACE(phone, '[^0-9]', '') = ${phone}
        ORDER BY id DESC LIMIT 1
      `));
    },
    async findRegistrationIdByCodeAndPhone(code, phone) {
      return firstId(await db.execute(sql`
        SELECT acp.id
        FROM accessCodePhones acp
        INNER JOIN accessCodes ac ON ac.id = acp.codeId
        WHERE REGEXP_REPLACE(acp.phone, '[^0-9]', '') = ${phone}
          AND ac.code = ${code}
        ORDER BY acp.accessedAt DESC, acp.id DESC LIMIT 1
      `));
    },
    async findRegistrationIdByCodeIdAndPhone(codeId, phone) {
      return firstId(await db.execute(sql`
        SELECT id FROM accessCodePhones
        WHERE codeId = ${codeId}
          AND REGEXP_REPLACE(phone, '[^0-9]', '') = ${phone}
        ORDER BY accessedAt DESC, id DESC LIMIT 1
      `));
    },
    async findRegistrationIdByPhone(phone) {
      return firstId(await db.execute(sql`
        SELECT id FROM accessCodePhones
        WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${phone}
        ORDER BY accessedAt DESC, id DESC LIMIT 1
      `));
    },
    async findInitialStatus() {
      const rows = rowsFrom(await db.execute(sql`
        SELECT \`key\` FROM orderStatusTypes WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1
      `));
      const key = rows[0]?.key;
      return typeof key === "string" && key ? key : undefined;
    },
    async countOrderHistoryByPhone(phone) {
      const rows = rowsFrom(await db.execute(sql`
        SELECT COUNT(*) AS total FROM orderStatusHistory
        WHERE REGEXP_REPLACE(customerPhone, '[^0-9]', '') = ${phone}
      `));
      return Number(rows[0]?.total || 0);
    },
  };
}
