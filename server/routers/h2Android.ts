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
import { issueAndroidPairingCode, listAndroidAgents, revokeAndroidAgent, enqueueAndroidCommand, listAndroidCommands, h2AndroidAvdName } from "../h2AndroidAgentStore";

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
    const agents = await listAndroidAgents();
    return {
      profiles,
      agents,
      commands: await listAndroidCommands(),
      maxSimultaneous: H2_ANDROID_MAX_RUNNING,
      activeCount: agents.reduce((n, agent) => n + (agent.online ? agent.runningAvds.length : 0), 0),
      agentStatus: agents.some(agent => agent.online) ? "online" as const : agents.length ? "offline" as const : "not_installed" as const,
      phase: "cadastro" as const,
    };
  }),

  /** Operations run on the paired Windows host, never inside Render. */
  control: adminProcedure
    .input(z.discriminatedUnion("action", [
      z.object({
        action: z.literal("create"),
        agentId: z.string().uuid(),
        avdName: z.string().regex(h2AndroidAvdName),
        isoPath: z.string().trim().min(5).max(400).regex(/^[A-Za-z]:[\\/][^\r\n]*\.iso$/i),
        isoSha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
        allowUnsignedBoot: z.boolean().default(false),
      }),
      z.object({
        action: z.literal("clone"),
        agentId: z.string().uuid(),
        avdName: z.string().regex(h2AndroidAvdName),
        sourceAvdName: z.string().regex(h2AndroidAvdName),
      }).refine(input => input.avdName !== input.sourceAvdName, { message: "Origem e destino devem ser diferentes." }),
      z.object({ action: z.literal("start"), agentId: z.string().uuid(), avdName: z.string().regex(h2AndroidAvdName) }),
      z.object({ action: z.literal("stop"), agentId: z.string().uuid(), avdName: z.string().regex(h2AndroidAvdName) }),
      z.object({ action: z.literal("tap"), agentId: z.string().uuid(), avdName: z.string().regex(h2AndroidAvdName), x: z.number().int().min(0).max(5000), y: z.number().int().min(0).max(10000) }),
      z.object({ action: z.literal("key"), agentId: z.string().uuid(), avdName: z.string().regex(h2AndroidAvdName), key: z.enum(["BACK","HOME","ENTER","POWER"]) }),
      z.object({ action: z.literal("proxy"), agentId: z.string().uuid(), avdName: z.string().regex(h2AndroidAvdName), host: z.string().trim().max(253).regex(/^[a-zA-Z0-9.-]*$/), port: z.number().int().min(0).max(65535) }),
    ]))
    .mutation(async ({ input }) => {
      let payload: Record<string, unknown> = {};
      if (input.action === "create") payload = {
        isoPath: input.isoPath,
        isoSha256: input.isoSha256,
        allowUnsignedBoot: input.allowUnsignedBoot,
      };
      if (input.action === "clone") payload = { sourceAvdName: input.sourceAvdName };
      if (input.action === "tap") payload = { x: input.x, y: input.y };
      if (input.action === "key") payload = { key: input.key };
      if (input.action === "proxy") {
        if ((input.host.length === 0) !== (input.port === 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe host e porta ou deixe ambos vazios." });
        payload = { host: input.host, port: input.port };
      }
      return enqueueAndroidCommand({ agentId: input.agentId, avdName: input.avdName, action: input.action, payload });
    }),

  createPairingCode: adminProcedure.mutation(() => issueAndroidPairingCode()),

  revokeAgent: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => ({ success: await revokeAndroidAgent(input.id) })),

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
