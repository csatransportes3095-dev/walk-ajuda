import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminAuthenticatorAudit, adminAuthenticatorEntries } from "../../drizzle/schema";
import { decryptTotpSecret, encryptTotpSecret, generateTotp, normalizeTotpSecret } from "../adminAuthenticatorVault";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";

const entryIdInput = z.object({ id: z.number().int().positive() });

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

function publicEntry(row: typeof adminAuthenticatorEntries.$inferSelect) {
  return {
    id: row.id,
    label: row.label,
    issuer: row.issuer,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export const adminAuthenticatorRouter = router({
  list: adminProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db.select().from(adminAuthenticatorEntries).orderBy(desc(adminAuthenticatorEntries.updatedAt));
    return rows.map(publicEntry);
  }),

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
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: error instanceof Error ? error.message : "Não foi possível proteger a chave.",
        });
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

  getCode: adminProcedure
    .input(entryIdInput)
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db.select().from(adminAuthenticatorEntries).where(eq(adminAuthenticatorEntries.id, input.id)).limit(1);
      const entry = rows[0];
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Conta do autenticador não encontrada." });
      try {
        const secret = decryptTotpSecret({
          ciphertext: entry.secretCiphertext,
          iv: entry.secretIv,
          tag: entry.secretTag,
        });
        const code = generateTotp(secret);
        await db.update(adminAuthenticatorEntries).set({ lastUsedAt: new Date() }).where(eq(adminAuthenticatorEntries.id, input.id));
        return code;
      } catch {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Não foi possível abrir esta chave de autenticador." });
      }
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
      await db.delete(adminAuthenticatorEntries).where(eq(adminAuthenticatorEntries.id, input.id));
      await recordAudit(input.id, "deleted");
      return { success: true };
    }),

  listAudit: adminProcedure.query(async () => {
    const db = await requireDb();
    return db.select({
      id: adminAuthenticatorAudit.id,
      entryId: adminAuthenticatorAudit.entryId,
      action: adminAuthenticatorAudit.action,
      adminUsername: adminAuthenticatorAudit.adminUsername,
      createdAt: adminAuthenticatorAudit.createdAt,
    }).from(adminAuthenticatorAudit).orderBy(desc(adminAuthenticatorAudit.createdAt)).limit(100);
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
