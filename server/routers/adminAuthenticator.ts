import { desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminAuthenticatorAudit, adminAuthenticatorEntries, adminAuthenticatorOrderLinks } from "../../drizzle/schema";
import { decryptTotpSecret, encryptTotpSecret, generateTotp, normalizeTotpSecret } from "../adminAuthenticatorVault";
import { buildAuthenticatorOrderLabel } from "../adminAuthenticatorOrder";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";

const entryIdInput = z.object({ id: z.number().int().positive() });
const FINAL_ORDER_STATUSES = ["entregue", "pedido_entregue", "login_de_acesso", "cancelado"] as const;

function maskCpf(value: unknown): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : null;
}

function parseOrderSearch(rawValue: string) {
  const raw = rawValue.trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("#") && /^\d+$/.test(raw.slice(1))) return { kind: "order" as const, value: raw.slice(1) };
  if (raw.startsWith("*") && /^\d+$/.test(raw.slice(1))) return { kind: "customer" as const, value: raw.slice(1) };
  if (digits.length === 10 || digits.length === 11) return { kind: "phone_or_cpf" as const, value: digits };
  throw new TRPCError({ code: "BAD_REQUEST", message: "Use telefone, CPF, *código de cadastro ou #pedido." });
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  return db;
}

async function recordAudit(entryId: number | null, action: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(adminAuthenticatorAudit).values({ entryId, action, adminUsername: "admin" });
}

function publicEntry(row: typeof adminAuthenticatorEntries.$inferSelect, linkedRegistrationId?: number | null) {
  return {
    id: row.id,
    label: row.label,
    issuer: row.issuer,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
    linkedRegistrationId: linkedRegistrationId ?? null,
  };
}

async function searchOpenOrders(query: string) {
  const db = await requireDb();
  const criteria = parseOrderSearch(query);
  const criteriaSql = criteria.kind === "order"
    ? sql`latest.orderNumber = ${Number(criteria.value)}`
    : criteria.kind === "customer"
      ? sql`c.customerNumber = ${Number(criteria.value)}`
      : sql`(
          REGEXP_REPLACE(acp.phone, '[^0-9]', '') = ${criteria.value}
          OR REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', '') = ${criteria.value}
          OR REGEXP_REPLACE(COALESCE(c.cpf, ''), '[^0-9]', '') = ${criteria.value}
        )`;
  const result = await db.execute(sql`
    SELECT
      acp.id AS registrationId,
      latest.orderNumber,
      latest.status AS latestStatus,
      latest.serviceName,
      latest.serviceOption,
      c.customerNumber,
      c.name AS customerName,
      c.phone AS customerPhone,
      c.cpf AS customerCpf
    FROM accessCodePhones acp
    INNER JOIN (
      SELECT h.registrationId, h.orderNumber, h.status, h.serviceName, h.serviceOption
      FROM orderStatusHistory h
      INNER JOIN (
        SELECT registrationId, MAX(id) AS latestId
        FROM orderStatusHistory
        GROUP BY registrationId
      ) newest ON newest.latestId = h.id
    ) latest ON latest.registrationId = acp.id
    LEFT JOIN customers c ON REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
      AND c.deletedAt IS NULL
    WHERE acp.archived = 0
      AND acp.rgCnhApproved = 0
      AND latest.status NOT IN (${sql.join(FINAL_ORDER_STATUSES.map((status) => sql`${status}`), sql`, `)})
      AND ${criteriaSql}
    ORDER BY acp.id DESC
    LIMIT 20
  `);
  return (((result as any)[0] || []) as any[]).map((row) => ({
    registrationId: Number(row.registrationId),
    orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
    latestStatus: String(row.latestStatus || ""),
    serviceName: row.serviceName ? String(row.serviceName) : null,
    serviceOption: row.serviceOption ? String(row.serviceOption) : null,
    customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
    customerName: row.customerName ? String(row.customerName) : null,
    customerPhone: row.customerPhone ? String(row.customerPhone) : null,
    customerCpfMasked: maskCpf(row.customerCpf),
  }));
}

async function getOpenOrderIdentity(registrationId: number) {
  const db = await requireDb();
  const result = await db.execute(sql`
    SELECT
      acp.id AS registrationId,
      latest.orderNumber,
      latest.status,
      c.customerNumber,
      c.name AS customerName
    FROM accessCodePhones acp
    INNER JOIN (
      SELECT h.registrationId, h.orderNumber, h.status
      FROM orderStatusHistory h
      INNER JOIN (
        SELECT registrationId, MAX(id) AS latestId
        FROM orderStatusHistory
        GROUP BY registrationId
      ) newest ON newest.latestId = h.id
    ) latest ON latest.registrationId = acp.id
    LEFT JOIN customers c ON REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', '') = REGEXP_REPLACE(acp.phone, '[^0-9]', '')
      AND c.deletedAt IS NULL
    WHERE acp.id = ${registrationId}
      AND acp.archived = 0
      AND acp.rgCnhApproved = 0
      AND latest.status NOT IN (${sql.join(FINAL_ORDER_STATUSES.map((status) => sql`${status}`), sql`, `)})
    LIMIT 1
  `);
  const row = ((result as any)[0] || [])[0];
  if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Este pedido não aceita novo autenticador. Pedido entregue, cancelado, arquivado ou oculto permanece protegido pela regra atual." });
  return {
    registrationId: Number(row.registrationId),
    orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
    customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
    customerName: row.customerName ? String(row.customerName) : null,
  };
}

async function ensureOpenOrder(registrationId: number) {
  await getOpenOrderIdentity(registrationId);
}

export const adminAuthenticatorRouter = router({
  list: adminProcedure.query(async () => {
    const db = await requireDb();
    const [entries, links] = await Promise.all([
      db.select().from(adminAuthenticatorEntries).orderBy(desc(adminAuthenticatorEntries.updatedAt)),
      db.select().from(adminAuthenticatorOrderLinks),
    ]);
    const linkByEntry = new Map(links.map((link) => [link.authenticatorEntryId, link.registrationId]));
    return entries.map((entry) => publicEntry(entry, linkByEntry.get(entry.id) ?? null));
  }),

  searchOpenOrders: adminProcedure
    .input(z.object({ query: z.string().trim().min(1).max(64) }))
    .query(({ input }) => searchOpenOrders(input.query)),

  create: adminProcedure
    .input(z.object({
      label: z.string().trim().min(1).max(128),
      issuer: z.string().trim().max(128).optional(),
      secret: z.string().min(16).max(256),
    }))
    .mutation(async ({ input }) => {
      let encrypted;
      try {
        encrypted = encryptTotpSecret(input.secret);
      } catch (error) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Não foi possível proteger a chave." });
      }
      const db = await requireDb();
      const [created] = await db.insert(adminAuthenticatorEntries).values({
        label: input.label,
        issuer: input.issuer || null,
        secretCiphertext: encrypted.ciphertext,
        secretIv: encrypted.iv,
        secretTag: encrypted.tag,
        keyVersion: encrypted.keyVersion,
      }).$returningId();
      await recordAudit(created.id, "created");
      return { id: created.id };
    }),

  createForOrder: adminProcedure
    .input(z.object({
      registrationId: z.number().int().positive(),
      issuer: z.string().trim().max(128).optional(),
      secret: z.string().min(16).max(256),
    }).strict())
    .mutation(async ({ input }) => {
      const identity = await getOpenOrderIdentity(input.registrationId);
      let encrypted;
      try {
        encrypted = encryptTotpSecret(input.secret);
      } catch (error) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "Chave do autenticador inválida." });
      }
      const label = buildAuthenticatorOrderLabel(identity);
      const db = await requireDb();
      const createdId = await db.transaction(async (tx) => {
        const [created] = await tx.insert(adminAuthenticatorEntries).values({
          label,
          issuer: input.issuer || null,
          secretCiphertext: encrypted.ciphertext,
          secretIv: encrypted.iv,
          secretTag: encrypted.tag,
          keyVersion: encrypted.keyVersion,
        }).$returningId();
        await tx.insert(adminAuthenticatorOrderLinks).values({
          authenticatorEntryId: created.id,
          registrationId: input.registrationId,
        });
        await tx.insert(adminAuthenticatorAudit).values({
          entryId: created.id,
          action: "created_and_linked_from_order",
          adminUsername: "admin",
        });
        return created.id;
      });
      return { success: true, id: createdId, label };
    }),

  linkToOrder: adminProcedure
    .input(z.object({ entryId: z.number().int().positive(), registrationId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const entry = await db.select({ id: adminAuthenticatorEntries.id }).from(adminAuthenticatorEntries).where(eq(adminAuthenticatorEntries.id, input.entryId)).limit(1);
      if (!entry[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Conta do autenticador não encontrada." });
      await ensureOpenOrder(input.registrationId);
      await db.insert(adminAuthenticatorOrderLinks).values({ authenticatorEntryId: input.entryId, registrationId: input.registrationId })
        .onDuplicateKeyUpdate({ set: { registrationId: input.registrationId, updatedAt: new Date() } });
      await recordAudit(input.entryId, "linked_to_order");
      return { success: true };
    }),

  unlinkFromOrder: adminProcedure
    .input(entryIdInput)
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(adminAuthenticatorOrderLinks).where(eq(adminAuthenticatorOrderLinks.authenticatorEntryId, input.id));
      await recordAudit(input.id, "unlinked_from_order");
      return { success: true };
    }),

  getCode: adminProcedure
    .input(entryIdInput)
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db.select().from(adminAuthenticatorEntries).where(eq(adminAuthenticatorEntries.id, input.id)).limit(1);
      const entry = rows[0];
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Conta do autenticador não encontrada." });
      try {
        const secret = decryptTotpSecret({ ciphertext: entry.secretCiphertext, iv: entry.secretIv, tag: entry.secretTag });
        const code = generateTotp(secret);
        await db.update(adminAuthenticatorEntries).set({ lastUsedAt: new Date() }).where(eq(adminAuthenticatorEntries.id, input.id));
        return code;
      } catch {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não foi possível abrir esta chave de autenticador." });
      }
    }),

  getCodeForOrder: adminProcedure
    .input(z.object({ registrationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const links = await db.select({ entryId: adminAuthenticatorEntries.id, label: adminAuthenticatorEntries.label, issuer: adminAuthenticatorEntries.issuer, ciphertext: adminAuthenticatorEntries.secretCiphertext, iv: adminAuthenticatorEntries.secretIv, tag: adminAuthenticatorEntries.secretTag })
        .from(adminAuthenticatorOrderLinks)
        .innerJoin(adminAuthenticatorEntries, eq(adminAuthenticatorOrderLinks.authenticatorEntryId, adminAuthenticatorEntries.id))
        .where(eq(adminAuthenticatorOrderLinks.registrationId, input.registrationId));
      const generated = links.map((entry) => {
        try {
          const secret = decryptTotpSecret({ ciphertext: entry.ciphertext, iv: entry.iv, tag: entry.tag });
          const generated = generateTotp(secret);
          return { entryId: entry.entryId, label: entry.label, issuer: entry.issuer, code: generated.code, expiresAt: generated.expiresAt };
        } catch {
          return { entryId: entry.entryId, label: entry.label, issuer: entry.issuer, code: null, expiresAt: null };
        }
      });
      return generated;
    }),

  updateLabel: adminProcedure
    .input(z.object({ id: z.number().int().positive(), label: z.string().trim().min(1).max(128), issuer: z.string().trim().max(128).optional() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(adminAuthenticatorEntries).set({ label: input.label, issuer: input.issuer || null }).where(eq(adminAuthenticatorEntries.id, input.id));
      await recordAudit(input.id, "label_updated");
      return { success: true };
    }),

  delete: adminProcedure
    .input(entryIdInput)
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const existing = await db.select({ id: adminAuthenticatorEntries.id }).from(adminAuthenticatorEntries).where(eq(adminAuthenticatorEntries.id, input.id)).limit(1);
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Conta do autenticador não encontrada." });
      await db.delete(adminAuthenticatorOrderLinks).where(eq(adminAuthenticatorOrderLinks.authenticatorEntryId, input.id));
      await db.delete(adminAuthenticatorEntries).where(eq(adminAuthenticatorEntries.id, input.id));
      await recordAudit(input.id, "deleted");
      return { success: true };
    }),

  listAudit: adminProcedure.query(async () => {
    const db = await requireDb();
    return db.select({ id: adminAuthenticatorAudit.id, entryId: adminAuthenticatorAudit.entryId, action: adminAuthenticatorAudit.action, adminUsername: adminAuthenticatorAudit.adminUsername, createdAt: adminAuthenticatorAudit.createdAt }).from(adminAuthenticatorAudit).orderBy(desc(adminAuthenticatorAudit.createdAt)).limit(100);
  }),

  validateSecret: adminProcedure
    .input(z.object({ secret: z.string().min(16).max(256) }))
    .query(({ input }) => {
      try {
        const secret = normalizeTotpSecret(input.secret);
        return { valid: true, normalizedLength: secret.length };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Chave inválida." });
      }
    }),
});
