/**
 * H2 Android - cadastro administrativo isolado.
 * Nesta etapa armazena SOMENTE perfis; nao controla emuladores nem proxies.
 * Sem vinculo com H2 ADS, clientes, pedidos ou demais modulos.
 */
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

export const H2_ANDROID_MAX_RUNNING = 5;
let initialized: Promise<void> | null = null;

async function requireAndroidDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponivel." });

  if (!initialized) {
    initialized = db.execute(sql`
      CREATE TABLE IF NOT EXISTS h2_android_profiles (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        label VARCHAR(80) NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).then(() => {}).catch((error) => {
      initialized = null;
      throw error;
    });
  }
  await initialized;
  return db;
}

type ProfileRow = { id: string; label: string; createdAt: Date | string; updatedAt: Date | string };

function serializeProfile(row: ProfileRow) {
  return {
    id: String(row.id),
    label: String(row.label),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    state: "not_provisioned" as const,
  };
}

const profileId = z.object({ id: z.string().uuid() });
const profileLabel = z.string().trim().min(2, "Informe pelo menos 2 caracteres.").max(80);

export const h2AndroidRouter = router({
  overview: adminProcedure.query(async () => {
    const db = await requireAndroidDb();
    const result = await db.execute(sql`
      SELECT id, label, createdAt, updatedAt
      FROM h2_android_profiles ORDER BY createdAt DESC, id DESC
    `);
    const profiles = (result[0] as unknown as ProfileRow[]).map(serializeProfile);
    return {
      profiles,
      maxSimultaneous: H2_ANDROID_MAX_RUNNING,
      activeCount: 0,
      agentStatus: "not_installed" as const,
      phase: "cadastro" as const,
    };
  }),

  createProfile: adminProcedure
    .input(z.object({ label: profileLabel }))
    .mutation(async ({ input }) => {
      const db = await requireAndroidDb();
      const id = randomUUID();
      await db.execute(sql`INSERT INTO h2_android_profiles (id, label) VALUES (${id}, ${input.label})`);
      return { id };
    }),

  renameProfile: adminProcedure
    .input(profileId.extend({ label: profileLabel }))
    .mutation(async ({ input }) => {
      const db = await requireAndroidDb();
      await db.execute(sql`UPDATE h2_android_profiles SET label = ${input.label} WHERE id = ${input.id}`);
      return { success: true };
    }),

  deleteProfile: adminProcedure
    .input(profileId)
    .mutation(async ({ input }) => {
      const db = await requireAndroidDb();
      // Apaga SOMENTE o cadastro deste modulo. Nenhum emulador existe nesta fase.
      await db.execute(sql`DELETE FROM h2_android_profiles WHERE id = ${input.id}`);
      return { success: true };
    }),
});
