import type { Express, Request, Response } from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { listActiveValidationBlocks, releaseValidationBlock, releaseAllValidationBlocks } from "./h2-auto-validation-blocks";
import { h2AutoTreeSchema, H2_AUTO_TREE_DEFAULT } from "../shared/h2AutoTree";
import {
  decodeH2AutoDiagnostics,
  h2AutoDiagnosticsSchema,
} from "./h2-auto-diagnostics";
import {
  decodeH2AutoHistory,
  h2AutoHistorySchema,
  mergeH2AutoHistory,
} from "./h2-auto-history";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const matchesHash = (stored: unknown, supplied: string) => {
  if (typeof stored !== "string" || !/^[a-f0-9]{64}$/.test(stored))
    return false;
  const actual = Buffer.from(stored, "hex");
  const expected = Buffer.from(hash(supplied), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const mediaSchema = z.object({
  enabled: z.boolean().default(false),
  transcribeAudio: z.boolean().default(false),
  audioFallback: z
    .string()
    .max(3000)
    .default(
      "🎤 Recebemos seu áudio. Por favor, envie sua dúvida por escrito ou digite 6 para falar com um atendente."
    ),
  photoReply: z
    .string()
    .max(3000)
    .default(
      "📸 Recebemos sua foto. Descreva sua dúvida por escrito ou digite 6."
    ),
  videoReply: z
    .string()
    .max(3000)
    .default(
      "🎥 Recebemos seu vídeo. Descreva sua dúvida por escrito ou digite 6."
    ),
  documentReply: z
    .string()
    .max(3000)
    .default(
      "📄 Recebemos seu documento. Descreva sua solicitação por escrito ou digite 6."
    ),
  stickerReply: z
    .string()
    .max(3000)
    .default("📎 Recebemos sua mídia. Digite MENU para escolher uma opção."),
  unknownReply: z
    .string()
    .max(3000)
    .default("📎 Recebemos sua mídia. Escreva sua dúvida ou digite MENU."),
  cooldownSeconds: z.number().int().min(15).max(3600).default(120),
  maxAudioSeconds: z.number().int().min(5).max(120).default(30),
});
const confirmationSchema = z.object({
  phonePrompt: z.string().max(2000).default("💰 *MINHAS INDICAÇÕES*\n\nPara proteger seus dados, confirme sua identidade.\nInforme o telefone cadastrado com DDD.\n\nDigite 0 para voltar."),
  phoneInvalid: z.string().max(600).default("Informe um telefone válido com DDD, somente números. Digite 0 para voltar."),
  phoneNotFound: z.string().max(1000).default("Não encontramos cadastro com esse telefone."),
  codeSent: z.string().max(1500).default("Código enviado ao e-mail cadastrado. Informe os 6 números recebidos."),
  codePrompt: z.string().max(600).default("Informe os 6 números recebidos no e-mail. Digite 0 para voltar."),
  codeInvalid: z.string().max(600).default("Código inválido ou expirado. Digite 0 para voltar."),
});
const configSchema = z.object({
  tree: h2AutoTreeSchema.optional(),
  media: mediaSchema.default(() => mediaSchema.parse({})),
  confirmation: confirmationSchema.default(() => confirmationSchema.parse({})),
  enabled: z.boolean(),
  identificationEnabled: z.boolean().default(true),
  identificationSessionHours: z.number().int().min(1).max(720).default(24),
  ordersEnabled: z.boolean().default(false),
  orderSessionHours: z.number().int().min(1).max(72).default(24),
  orderCodeTtlMinutes: z.number().int().min(5).max(30).default(10),
  orderCodeMaxAttempts: z.number().int().min(3).max(10).default(5),
  orderNoOrdersMessage: z
    .string()
    .max(600)
    .default(
      "Cadastro localizado com sucesso, mas não encontramos nenhum pedido associado a este cadastro no momento."
    ),
  welcome: z.string().max(6000),
  menu: z.array(z.string().max(6000)).length(9),
  whatsappMode: z.number().int().min(-1).max(1),
  pauseMinutes: z.number().int().min(1).max(1440),
  scheduleOn: z.boolean(),
  scheduleStart: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  scheduleEnd: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  blocked: z.string().max(10000),
  rules: z
    .array(
      z.object({
        trigger: z.string().max(120),
        reply: z.string().max(6000),
        mode: z.enum(["exact", "contains"]),
        enabled: z.boolean(),
      })
    )
    .max(100),
});
type RemoteConfig = z.infer<typeof configSchema>;
const initial: RemoteConfig = {
  media: mediaSchema.parse({}),
  confirmation: confirmationSchema.parse({}),
  ordersEnabled: false,
  orderSessionHours: 24,
  orderCodeTtlMinutes: 10,
  orderCodeMaxAttempts: 5,
  orderNoOrdersMessage:
    "Cadastro localizado com sucesso, mas não encontramos nenhum pedido associado a este cadastro no momento.",
  enabled: false,
  identificationEnabled: true,
  identificationSessionHours: 24,
  welcome: "",
  menu: Array(9).fill(""),
  whatsappMode: -1,
  pauseMinutes: 60,
  scheduleOn: false,
  scheduleStart: "09:00",
  scheduleEnd: "18:00",
  blocked: "",
  rules: [],
};
let ready: Promise<void> | undefined;
function ensure() {
  if (!ready)
    ready = (async () => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_devices (
 id VARCHAR(32) PRIMARY KEY,
 label VARCHAR(80) NOT NULL,
 pairing_hash CHAR(64) NULL,
 pairing_expires BIGINT NULL,
 pair_attempts INT NOT NULL DEFAULT 0,
 token_hash CHAR(64) NULL,
 config_json JSON NOT NULL,
 revision INT NOT NULL DEFAULT 1,
 last_seen BIGINT NULL,
 applied_revision INT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL
 )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_local_snapshots (
	 device_id VARCHAR(32) PRIMARY KEY,
	 snapshot_json JSON NOT NULL,
	 received_at BIGINT NOT NULL
	 )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_diagnostics (
	 device_id VARCHAR(32) PRIMARY KEY,
	 diagnostics_json JSON NOT NULL,
	 received_at BIGINT NOT NULL
	 )`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS h2_auto_history (
			 device_id VARCHAR(32) PRIMARY KEY,
		 history_json JSON NOT NULL,
		 received_at BIGINT NOT NULL
		)`);
    })().catch(e => {
      ready = undefined;
      throw e;
    });
  return ready;
}
const rows = async (query: any): Promise<any[]> => {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result: any = await db.execute(query);
  return result[0] || [];
};
const decodeConfig = (raw: any): RemoteConfig =>
  configSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
const safeDevice = (r: any) => ({
  id: r.id,
  label: r.label,
  paired: Boolean(r.token_hash),
  revision: Number(r.revision),
  lastSeen: r.last_seen ? Number(r.last_seen) : null,
  appliedRevision: Number(r.applied_revision || 0),
  config: decodeConfig(r.config_json),
  snapshotConfig:
    r.snapshot_json == null ? null : decodeConfig(r.snapshot_json),
  snapshotReceivedAt: r.received_at == null ? null : Number(r.received_at),
  diagnostics: decodeH2AutoDiagnostics(r.diagnostics_json),
  diagnosticsReceivedAt:
    r.diagnostics_received_at == null
      ? null
      : Number(r.diagnostics_received_at),
  history: decodeH2AutoHistory(r.history_json),
  historyReceivedAt:
    r.history_received_at == null ? null : Number(r.history_received_at),
});
function mergeWithoutDeleting(
  remote: RemoteConfig,
  local: RemoteConfig
): RemoteConfig {
  const empty =
    !remote.welcome.trim() &&
    remote.menu.every(t => !t.trim()) &&
    remote.rules.length === 0 &&
    !remote.blocked.trim();
  if (empty)
    return {
      ...local,
      tree: remote.tree ?? local.tree,
      media: remote.media,
      confirmation: remote.confirmation,
      identificationSessionHours: remote.identificationSessionHours,
      ordersEnabled: remote.ordersEnabled,
      orderSessionHours: remote.orderSessionHours,
      orderCodeTtlMinutes: remote.orderCodeTtlMinutes,
      orderCodeMaxAttempts: remote.orderCodeMaxAttempts,
      orderNoOrdersMessage: remote.orderNoOrdersMessage,
    };
  const seen = new Set(
    remote.rules.map(r => r.trigger.trim().toLowerCase() + "|" + r.mode)
  );
  const rules = remote.rules.slice();
  for (const r of local.rules) {
    const k = r.trigger.trim().toLowerCase() + "|" + r.mode;
    if (!seen.has(k) && rules.length < 100) {
      rules.push(r);
      seen.add(k);
    }
  }
  const blocked = [
    ...new Set(
      [...remote.blocked.split(/[\n;,]/), ...local.blocked.split(/[\n;,]/)]
        .map(v => v.trim())
        .filter(Boolean)
    ),
  ]
    .join("\n")
    .slice(0, 10000);
  return {
    ...remote,
    tree: remote.tree ?? local.tree,
    media: remote.media,
    ordersEnabled: remote.ordersEnabled,
    welcome: remote.welcome.trim() ? remote.welcome : local.welcome,
    menu: remote.menu.map((v, i) => (v.trim() ? v : local.menu[i])),
    rules,
    blocked,
  };
}
/** Unlinking must also revoke customer-order sessions. The order feature may
 * never have been activated, so its session table can legitimately be absent. */
function isMissingH2AutoSessionTable(error: unknown): boolean {
  const e = error as {
    code?: string;
    errno?: number;
    cause?: { code?: string; errno?: number };
  } | null;
  return (
    e?.code === "ER_NO_SUCH_TABLE" ||
    e?.errno === 1146 ||
    e?.cause?.code === "ER_NO_SUCH_TABLE" ||
    e?.cause?.errno === 1146
  );
}
async function clearH2AutoCustomerSessions(
  db: any,
  deviceId: string
): Promise<void> {
  try {
    await db.execute(
      sql`DELETE FROM h2_auto_order_sessions WHERE device_id=${deviceId}`
    );
  } catch (error) {
    if (!isMissingH2AutoSessionTable(error)) throw error;
  }
}
export const h2AutoAdminRouter = router({
  validationBlocks: adminProcedure
    .input(z.object({id:z.string().regex(/^[a-f0-9]{24}$/)}))
    .query(async ({input}) => listActiveValidationBlocks(input.id)),
  releaseValidationBlock: adminProcedure
    .input(z.object({id:z.string().regex(/^[a-f0-9]{24}$/),sessionId:z.string().regex(/^[a-f0-9]{64}$/),restart:z.boolean().default(false)}))
    .mutation(async ({input}) => ({success:await releaseValidationBlock(input.id,input.sessionId,input.restart)})),
  releaseAllValidationBlocks: adminProcedure
    .input(z.object({id:z.string().regex(/^[a-f0-9]{24}$/),confirmed:z.literal(true)}))
    .mutation(async ({input}) => ({released:await releaseAllValidationBlocks(input.id)})),
  list: adminProcedure.query(async () => {
    await ensure();
    return (
      await rows(
        sql`SELECT d.*, s.snapshot_json, s.received_at, q.diagnostics_json, q.received_at AS diagnostics_received_at, h.history_json, h.received_at AS history_received_at FROM h2_auto_devices d LEFT JOIN h2_auto_local_snapshots s ON s.device_id=d.id LEFT JOIN h2_auto_diagnostics q ON q.device_id=d.id LEFT JOIN h2_auto_history h ON h.device_id=d.id ORDER BY d.created_at DESC LIMIT 30`
      )
    ).map(safeDevice);
  }),
  create: adminProcedure
    .input(z.object({ label: z.string().trim().min(1).max(80) }))
    .mutation(async ({ input }) => {
      await ensure();
      const id = randomBytes(12).toString("hex"),
        code = String(randomBytes(4).readUInt32BE() % 100000000).padStart(
          8,
          "0"
        );
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(sql`INSERT INTO h2_auto_devices (id,label,pairing_hash,pairing_expires,token_hash,config_json,revision,created_at) VALUES (
   ${id},${input.label},${hash(code)},${Date.now() + 10 * 60 * 1000},NULL,${JSON.stringify(initial)},0,${Date.now()})`);
      return { id, code, expiresInSeconds: 600 };
    }),
  pairCode: adminProcedure
    .input(z.object({ id: z.string().length(24) }))
    .mutation(async ({ input }) => {
      await ensure();
      const code = String(randomBytes(4).readUInt32BE() % 100000000).padStart(
        8,
        "0"
      );
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.execute(
        sql`UPDATE h2_auto_devices SET pairing_hash=${hash(code)},pairing_expires=${Date.now() + 600000},pair_attempts=0 WHERE id=${input.id}`
      );
      return { code, expiresInSeconds: 600 };
    }),
  save: adminProcedure
    .input(
      z.object({
        id: z.string().length(24),
        config: configSchema,
        expectedRevision: z.number().int().min(0),
      })
    )
    .mutation(async ({ input }) => {
      await ensure();
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const result: any = await db.execute(
        sql`UPDATE h2_auto_devices SET config_json=${JSON.stringify(input.config)},revision=revision+1 WHERE id=${input.id} AND revision=${input.expectedRevision}`
      );
      if (!result[0]?.affectedRows)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A configuração mudou. Atualize antes de salvar para não sobrescrever alterações.",
        });
      return { success: true };
    }),
  saveIdentificationValidity: adminProcedure
    .input(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), hours: z.number().int().min(1).max(720) }))
    .mutation(async ({input})=>{
      await ensure();
      const db=await getDb(); if(!db)throw new Error("DB unavailable");
      const result:any=await db.execute(sql`UPDATE h2_auto_devices SET
        config_json=JSON_SET(config_json,'$.identificationSessionHours',${input.hours}),
        revision=revision+1 WHERE id=${input.id}`);
      if(!result[0]?.affectedRows)throw new TRPCError({code:"NOT_FOUND",message:"Aparelho não encontrado."});
      return {success:true,hours:input.hours};
    }),
  saveSafetySwitch: adminProcedure
    .input(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/), key: z.enum(["enabled","identificationEnabled"]), value: z.boolean() }))
    .mutation(async ({input})=>{
      await ensure();
      const db=await getDb(); if(!db)throw new Error("DB unavailable");
      // Atomic JSON key update; does not overwrite drafts, menus or other settings.
      const path=input.key==="enabled"?"$.enabled":"$.identificationEnabled";
      const updated:any=await db.execute(sql`UPDATE h2_auto_devices SET config_json=JSON_SET(config_json,${path},JSON_EXTRACT(${input.value ? "true" : "false"},'$')),revision=revision+1 WHERE id=${input.id}`);
      if(!updated[0]?.affectedRows)throw new TRPCError({code:"NOT_FOUND",message:"Aparelho não encontrado."});
      return {success:true};
    }),
  saveTree: adminProcedure
    .input(z.object({
      id: z.string().regex(/^[a-f0-9]{24}$/),
      tree: h2AutoTreeSchema,
      // Snapshot used to reject concurrent changes to the actual question tree.
      // Legacy clients may omit this and continue using the global revision.
      baseTree: h2AutoTreeSchema.optional(),
      expectedRevision: z.number().int().min(0),
    }))
    .mutation(async ({ input }) => {
      await ensure();
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // ADM switches, media configuration, and validity settings update the
      // same device revision. Do not discard a user's edited questions just
      // because one of those unrelated controls changed during editing.
      for (let attempt = 0; attempt < 3; attempt++) {
        const row = (await rows(sql`SELECT config_json,revision FROM h2_auto_devices
          WHERE id=${input.id} LIMIT 1`))[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Aparelho não encontrado." });
        const currentRevision = Number(row.revision);
        const currentConfig = decodeConfig(row.config_json);
        if (input.baseTree) {
          const actualTree = currentConfig.tree ?? H2_AUTO_TREE_DEFAULT;
          if (JSON.stringify(actualTree) !== JSON.stringify(input.baseTree))
            throw new TRPCError({
              code: "CONFLICT",
              message: "As perguntas foram modificadas em outra sessão. Suas edições continuam na tela. Faça uma cópia antes de recarregar.",
            });
        } else if (currentRevision !== input.expectedRevision) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A configuração mudou. Suas perguntas não foram apagadas. Atualize a revisão antes de salvar.",
          });
        }

        const next: RemoteConfig = { ...currentConfig, tree: input.tree };
        const result: any = await db.execute(sql`
          UPDATE h2_auto_devices
          SET config_json=${JSON.stringify(next)}, revision=revision+1
          WHERE id=${input.id} AND revision=${currentRevision}`);
        if (result[0]?.affectedRows)
          return { success: true, revision: currentRevision + 1 };
      }
      throw new TRPCError({
        code: "CONFLICT",
        message: "O ADM recebeu outras alterações durante o salvamento. Tente salvar novamente; suas perguntas permanecem na tela.",
      });
    }),
  saveMedia: adminProcedure
    .input(
      z.object({
        id: z.string().length(24),
        media: mediaSchema,
        expectedRevision: z.number().int().min(0),
      })
    )
    .mutation(async ({ input }) => {
      await ensure();
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const data = await rows(
        sql`SELECT config_json,revision FROM h2_auto_devices WHERE id=${input.id} LIMIT 1`
      );
      const row = data[0];
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Aparelho não encontrado no H2 AUTO.",
        });
      if (Number(row.revision) !== input.expectedRevision)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A configuração mudou. Atualize antes de salvar a mídia para não sobrescrever alterações.",
        });
      const updated: RemoteConfig = {
        ...decodeConfig(row.config_json),
        media: input.media,
      };
      const result: any = await db.execute(
        sql`UPDATE h2_auto_devices SET config_json=${JSON.stringify(updated)},revision=revision+1 WHERE id=${input.id} AND revision=${input.expectedRevision}`
      );
      if (!result[0]?.affectedRows)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A configuração mudou durante o salvamento da mídia. Atualize antes de tentar novamente.",
        });
      return {
        success: true,
        revision: input.expectedRevision + 1,
        media: input.media,
      };
    }),
  mergeLocal: adminProcedure
    .input(
      z.object({
        id: z.string().length(24),
        expectedRevision: z.number().int().min(0),
      })
    )
    .mutation(async ({ input }) => {
      await ensure();
      const data = await rows(
        sql`SELECT d.config_json,d.revision,s.snapshot_json FROM h2_auto_devices d LEFT JOIN h2_auto_local_snapshots s ON s.device_id=d.id WHERE d.id=${input.id} LIMIT 1`
      );
      const row = data[0];
      if (!row?.snapshot_json)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "O aparelho ainda não enviou sua cópia local.",
        });
      if (Number(row.revision) !== input.expectedRevision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "O ADM foi alterado. Recarregue para evitar sobrescrever.",
        });
      const merged = mergeWithoutDeleting(
        decodeConfig(row.config_json),
        decodeConfig(row.snapshot_json)
      );
      const db = await getDb();
      if (!db) throw Error("db");
      const result: any = await db.execute(
        sql`UPDATE h2_auto_devices SET config_json=${JSON.stringify(merged)},revision=revision+1 WHERE id=${input.id} AND revision=${input.expectedRevision}`
      );
      if (!result[0]?.affectedRows)
        throw new TRPCError({
          code: "CONFLICT",
          message: "O ADM foi alterado durante a importação.",
        });
      return { success: true };
    }),
  revoke: adminProcedure
    .input(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }))
    .mutation(async ({ input }) => {
      await ensure();
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const exists = await rows(
        sql`SELECT id FROM h2_auto_devices WHERE id=${input.id} LIMIT 1`
      );
      if (!exists.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Celular não encontrado no H2 AUTO.",
        });
      // Stop all remote sync and order lookups while preserving ADM configuration.
      await db.execute(
        sql`UPDATE h2_auto_devices SET token_hash=NULL,pairing_hash=NULL,pairing_expires=NULL,pair_attempts=0,applied_revision=0,last_seen=NULL WHERE id=${input.id}`
      );
      await clearH2AutoCustomerSessions(db, input.id);
      await db.execute(
        sql`DELETE FROM h2_auto_diagnostics WHERE device_id=${input.id}`
      );
      await db.execute(
        sql`DELETE FROM h2_auto_history WHERE device_id=${input.id}`
      );
      return { success: true, removed: false };
    }),
  remove: adminProcedure
    .input(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }))
    .mutation(async ({ input }) => {
      await ensure();
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const exists = await rows(
        sql`SELECT id FROM h2_auto_devices WHERE id=${input.id} LIMIT 1`
      );
      if (!exists.length)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Celular já removido ou não encontrado.",
        });
      // Revoke first, then delete only this device, its immutable local snapshot,
      // and any active client-verification sessions linked to this device.
      await db.execute(
        sql`UPDATE h2_auto_devices SET token_hash=NULL,pairing_hash=NULL,pairing_expires=NULL,applied_revision=0 WHERE id=${input.id}`
      );
      await clearH2AutoCustomerSessions(db, input.id);
      await db.execute(
        sql`DELETE FROM h2_auto_local_snapshots WHERE device_id=${input.id}`
      );
      await db.execute(
        sql`DELETE FROM h2_auto_diagnostics WHERE device_id=${input.id}`
      );
      await db.execute(
        sql`DELETE FROM h2_auto_history WHERE device_id=${input.id}`
      );
      await db.execute(sql`DELETE FROM h2_auto_devices WHERE id=${input.id}`);
      return { success: true, removed: true };
    }),
});
const respond = (res: Response, status: number, body: unknown) =>
  res.status(status).set("Cache-Control", "no-store").json(body);
export function registerH2AutoDeviceRoutes(app: Express) {
  // Request bodies contain only the pairing code or opaque device token; no WhatsApp content.
  app.post("/api/h2-auto/pair", async (req: Request, res: Response) => {
    try {
      const parsed = z
        .object({
          deviceId: z.string().length(24),
          code: z.string().regex(/^\d{8}$/),
        })
        .safeParse(req.body);
      if (!parsed.success)
        return respond(res, 400, { error: "invalid_request" });
      await ensure();
      const data = await rows(
        sql`SELECT * FROM h2_auto_devices WHERE id=${parsed.data.deviceId} LIMIT 1`
      );
      const d = data[0];
      if (
        !d ||
        !d.pairing_hash ||
        Number(d.pairing_expires) < Date.now() ||
        Number(d.pair_attempts) >= 5 ||
        !matchesHash(d.pairing_hash, parsed.data.code)
      ) {
        if (d?.id && d.pairing_hash && Number(d.pair_attempts) < 5) {
          const db = await getDb();
          if (db)
            await db.execute(
              sql`UPDATE h2_auto_devices SET pair_attempts=pair_attempts+1 WHERE id=${d.id}`
            );
        }
        return respond(res, 403, { error: "invalid_or_expired_code" });
      }
      const token = randomBytes(32).toString("hex");
      const db = await getDb();
      if (!db) throw Error("db");
      const updated: any =
        await db.execute(sql`UPDATE h2_auto_devices SET token_hash=${hash(token)},pairing_hash=NULL,pairing_expires=NULL
     WHERE id=${d.id} AND pairing_hash=${d.pairing_hash} AND pairing_expires>=${Date.now()}`);
      if (!updated[0]?.affectedRows)
        return respond(res, 409, { error: "code_used" });
      return respond(res, 200, { token, deviceId: d.id });
    } catch {
      return respond(res, 500, { error: "temporary_error" });
    }
  });
  app.get("/api/h2-auto/config", async (req: Request, res: Response) => {
    try {
      const id = String(req.header("x-h2-device-id") || "");
      const token = String(req.header("x-h2-device-token") || "");
      if (!/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{64}$/.test(token))
        return respond(res, 401, { error: "unauthorized" });
      await ensure();
      const data = await rows(
          sql`SELECT * FROM h2_auto_devices WHERE id=${id} LIMIT 1`
        ),
        d = data[0];
      if (!d?.token_hash || !matchesHash(d.token_hash, token))
        return respond(res, 401, { error: "unauthorized" });
      const db = await getDb();
      if (db)
        await db.execute(
          sql`UPDATE h2_auto_devices SET last_seen=${Date.now()} WHERE id=${id} AND token_hash=${hash(token)}`
        );
      return respond(res, 200, {
        revision: Number(d.revision),
        needsInitialImport: Number(d.revision) === 0,
        config: Number(d.revision) === 0 ? null : safeDevice(d).config,
      });
    } catch {
      return respond(res, 500, { error: "temporary_error" });
    }
  });
  // A paired phone uploads its LOCAL snapshot before applying remote changes.
  // Keep the first snapshot immutable: a later sync must never erase the old settings.
  app.post("/api/h2-auto/import", async (req: Request, res: Response) => {
    try {
      const id = String(req.header("x-h2-device-id") || "");
      const token = String(req.header("x-h2-device-token") || "");
      if (!/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{64}$/.test(token))
        return respond(res, 401, { error: "unauthorized" });
      const parsed = configSchema.safeParse(req.body?.config ?? req.body);
      if (!parsed.success)
        return respond(res, 400, { error: "invalid_local_configuration" });
      await ensure();
      const data = await rows(
        sql`SELECT token_hash,revision FROM h2_auto_devices WHERE id=${id} LIMIT 1`
      );
      const device = data[0];
      if (!device?.token_hash || !matchesHash(device.token_hash, token))
        return respond(res, 401, { error: "unauthorized" });
      const db = await getDb();
      if (!db) throw Error("db");
      await db.execute(sql`INSERT IGNORE INTO h2_auto_local_snapshots (device_id,snapshot_json,received_at)
     VALUES (${id},${JSON.stringify(parsed.data)},${Date.now()})`);
      if (Number(device.revision) !== 0)
        return respond(res, 200, {
          success: true,
          imported: false,
          snapshotStored: true,
          reason: "admin_configuration_preserved",
          revision: Number(device.revision),
        });
      // Promote the local settings only if the ADM has NEVER been saved.
      const result: any =
        await db.execute(sql`UPDATE h2_auto_devices SET config_json=${JSON.stringify(parsed.data)},revision=1,last_seen=${Date.now()}
     WHERE id=${id} AND token_hash=${hash(token)} AND revision=0`);
      if (!result[0]?.affectedRows)
        return respond(res, 200, {
          success: true,
          imported: false,
          snapshotStored: true,
          reason: "admin_configuration_preserved",
        });
      return respond(res, 200, {
        success: true,
        imported: true,
        snapshotStored: true,
        revision: 1,
        source: "android_local_settings",
      });
    } catch (error) {
      console.error(
        "[H2Auto] initial import failed",
        error instanceof Error ? error.message : String(error)
      );
      return respond(res, 500, { error: "temporary_error" });
    }
  });

  // Persist only the media configuration from the paired APK. The same revision
  // mechanism protects simultaneous edits in ADM, and all other fields stay intact.
  app.post("/api/h2-auto/media", async (req: Request, res: Response) => {
    try {
      const id = String(req.header("x-h2-device-id") || "");
      const token = String(req.header("x-h2-device-token") || "");
      if (!/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{64}$/.test(token))
        return respond(res, 401, { error: "unauthorized" });
      const payload = z
        .object({
          expectedRevision: z.number().int().min(1),
          media: mediaSchema,
        })
        .safeParse(req.body);
      if (!payload.success)
        return respond(res, 400, { error: "invalid_media_configuration" });
      await ensure();
      const data = await rows(
        sql`SELECT token_hash,revision,config_json FROM h2_auto_devices WHERE id=${id} LIMIT 1`
      );
      const device = data[0];
      if (!device?.token_hash || !matchesHash(device.token_hash, token))
        return respond(res, 401, { error: "unauthorized" });
      if (Number(device.revision) !== payload.data.expectedRevision)
        return respond(res, 409, { error: "outdated_revision" });
      const previous = decodeConfig(device.config_json);
      const updated: RemoteConfig = { ...previous, media: payload.data.media };
      const db = await getDb();
      if (!db) throw Error("db");
      const result: any = await db.execute(sql`
      UPDATE h2_auto_devices
      SET config_json=${JSON.stringify(updated)},revision=revision+1,last_seen=${Date.now()}
      WHERE id=${id} AND revision=${payload.data.expectedRevision} AND token_hash=${hash(token)}
   `);
      if (!result[0]?.affectedRows)
        return respond(res, 409, { error: "outdated_revision" });
      return respond(res, 200, {
        success: true,
        revision: payload.data.expectedRevision + 1,
        media: updated.media,
      });
    } catch (error) {
      console.error(
        "[H2Auto] media configuration update failed",
        error instanceof Error ? error.message : String(error)
      );
      return respond(res, 500, { error: "temporary_error" });
    }
  });
  app.post("/api/h2-auto/ack", async (req: Request, res: Response) => {
    try {
      const p = z
        .object({
          revision: z.number().int().min(1),
          diagnostics: h2AutoDiagnosticsSchema.optional(),
          history: h2AutoHistorySchema.optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!p.success) return respond(res, 400, { error: "invalid_ack" });
      const id = String(req.header("x-h2-device-id") || ""),
        token = String(req.header("x-h2-device-token") || "");
      if (!/^[a-f0-9]{24}$/.test(id) || !/^[a-f0-9]{64}$/.test(token))
        return respond(res, 401, { error: "unauthorized" });
      await ensure();
      const data = await rows(
        sql`SELECT token_hash, revision FROM h2_auto_devices WHERE id=${id} LIMIT 1`
      );
      const d = data[0];
      if (!d?.token_hash || !matchesHash(d.token_hash, token))
        return respond(res, 401, { error: "unauthorized" });
      if (Number(d.revision) !== p.data.revision)
        return respond(res, 409, { error: "outdated_revision" });
      const db = await getDb();
      if (!db || typeof (db as any).transaction !== "function")
        throw Error("transaction_required");
      const persist = async (tx: any) => {
        const updated: any = await tx.execute(
          sql`UPDATE h2_auto_devices SET applied_revision=${p.data.revision},last_seen=${Date.now()} WHERE id=${id} AND revision=${p.data.revision} AND token_hash=${hash(token)}`
        );
        if (!updated[0]?.affectedRows) return false;

        if (p.data.history) {
          const storedRows: any = await tx.execute(
            sql`SELECT history_json FROM h2_auto_history WHERE device_id=${id} FOR UPDATE`
          );
          const storedRaw = storedRows[0]?.[0]?.history_json ?? null;
          const stored =
            storedRaw == null ? null : decodeH2AutoHistory(storedRaw);
          if (storedRaw != null && !stored)
            throw new Error("stored_h2_auto_history_invalid");
          const merged = mergeH2AutoHistory(stored, p.data.history);
          await tx.execute(sql`INSERT INTO h2_auto_history (device_id,history_json,received_at)
		         VALUES (${id},${JSON.stringify(merged)},${Date.now()})
		         ON DUPLICATE KEY UPDATE history_json=VALUES(history_json),received_at=VALUES(received_at)`);
        }

        if (p.data.diagnostics) {
          await tx.execute(sql`INSERT INTO h2_auto_diagnostics (device_id,diagnostics_json,received_at)
		         VALUES (${id},${JSON.stringify(p.data.diagnostics)},${Date.now()})
		         ON DUPLICATE KEY UPDATE diagnostics_json=VALUES(diagnostics_json),received_at=VALUES(received_at)`);
        }
        return true;
      };
      const persisted = await (db as any).transaction(persist);
      if (!persisted) return respond(res, 409, { error: "outdated_revision" });
      return respond(res, 200, { success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "HISTORY_CONFLICT")
        return respond(res, 409, { error: "history_conflict" });
      if (error instanceof Error && error.name === "H2AutoHistoryConflictError")
        return respond(res, 409, { error: "history_conflict" });
      return respond(res, 500, { error: "temporary_error" });
    }
  });
}
