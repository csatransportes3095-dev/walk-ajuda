/**
 * H2 Android Agent - armazenamento separado de H2 ADS.
 * Pareamento com codigo de uso unico e token opaco armazenado somente como SHA-256.
 * Os agentes nao recebem credenciais do ADM e nao executam comandos remotos nesta etapa.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";

let initialization: Promise<void> | null = null;
const ONLINE_WINDOW_MS = 90_000;
const PAIRING_DURATION_MINUTES = 10;
const NATIVE_H2_AGENT_VERSIONS = new Set(["0.3.0-native", "0.3.2-native-clone", "0.3.3-native-guard", "0.3.4-native-screen"]);

const availabilitySchema = z.object({
  computerName: z.string().trim().min(1).max(80),
  windowsVersion: z.string().trim().max(100).default(""),
  agentVersion: z.string().trim().min(1).max(20),
  sdkDetected: z.boolean(),
  adbDetected: z.boolean(),
  emulatorDetected: z.boolean(),
  avdNames: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  emulatorDevices: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  runningAvds: z.array(z.string().regex(/^H2Android_[0-9]{2,3}$/)).max(10).default([]),
  configuredProxies: z.record(z.string().regex(/^H2Android_[0-9]{2,3}$/), z.string().regex(/^http:\/\/[a-zA-Z0-9.-]+:[0-9]{1,5}$/)).default({}),
  ramGb: z.number().min(0).max(2048).nullable().default(null),
  logicalProcessors: z.number().int().min(0).max(512).nullable().default(null),
  virtualizationEnabled: z.boolean().nullable().default(null),
  hyperVReady: z.boolean().default(false),
  hyperVReason: z.string().max(240).default(""),
}).strict();

export type AndroidAgentReport = z.infer<typeof availabilitySchema>;
export function validateAndroidAgentReport(value: unknown): AndroidAgentReport {
  return availabilitySchema.parse(value);
}

export function isAndroidAgentOnline(seen: Date | string | null, now = Date.now()): boolean {
  if (!seen) return false;
  const timestamp = new Date(seen).getTime();
  return Number.isFinite(timestamp) && timestamp <= now + 30_000 && now - timestamp < ONLINE_WINDOW_MS;
}

export function normalizeAndroidPairingCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-F0-9]{32}$/.test(raw) ? raw : null;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function dbWithAgentTables() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  if (!initialization) {
    initialization = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS h2_android_agent_pairings (
          id VARCHAR(36) PRIMARY KEY,
          codeHash CHAR(64) NOT NULL UNIQUE,
          expiresAt TIMESTAMP NOT NULL,
          claimedAt TIMESTAMP NULL DEFAULT NULL,
          createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_h2_android_pairing_expires (expiresAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS h2_android_agents (
          id VARCHAR(36) PRIMARY KEY,
          tokenHash CHAR(64) NOT NULL UNIQUE,
          computerName VARCHAR(80) NOT NULL,
          agentVersion VARCHAR(20) NOT NULL DEFAULT '',
          windowsVersion VARCHAR(100) NOT NULL DEFAULT '',
          reportJson TEXT NULL,
          pairedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          lastSeenAt TIMESTAMP NULL DEFAULT NULL,
          revokedAt TIMESTAMP NULL DEFAULT NULL,
          INDEX idx_h2_android_agents_active (revokedAt, lastSeenAt)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch(error => {
      initialization = null;
      throw error;
    });
  }
  await initialization;
  return db;
}

type AgentRow = {
  id: string;
  computerName: string;
  agentVersion: string;
  windowsVersion: string;
  pairedAt: Date | string;
  lastSeenAt: Date | string | null;
  reportJson: string | null;
};

export async function listAndroidAgents() {
  const db = await dbWithAgentTables();
  const [rows] = await db.execute(sql`
    SELECT id, computerName, agentVersion, windowsVersion, pairedAt, lastSeenAt, reportJson
    FROM h2_android_agents WHERE revokedAt IS NULL ORDER BY pairedAt DESC LIMIT 20
  `);
  return (rows as unknown as AgentRow[]).map(row => {
    let report: Partial<AndroidAgentReport> = {};
    try { report = JSON.parse(row.reportJson || "{}"); } catch {}
    return {
      id: row.id,
      computerName: row.computerName,
      windowsVersion: row.windowsVersion,
      agentVersion: row.agentVersion,
      pairedAt: new Date(row.pairedAt).toISOString(),
      lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
      online: isAndroidAgentOnline(row.lastSeenAt),
      sdkDetected: report.sdkDetected === true,
      adbDetected: report.adbDetected === true,
      emulatorDetected: report.emulatorDetected === true,
      avdNames: Array.isArray(report.avdNames) ? report.avdNames.slice(0, 20) : [],
      emulatorDevices: Array.isArray(report.emulatorDevices) ? report.emulatorDevices.slice(0, 10) : [],
      runningAvds: Array.isArray(report.runningAvds) ? report.runningAvds.slice(0, 10) : [],
      configuredProxies: report.configuredProxies && typeof report.configuredProxies === "object" ? report.configuredProxies : {},
      ramGb: typeof report.ramGb === "number" ? report.ramGb : null,
      logicalProcessors: typeof report.logicalProcessors === "number" ? report.logicalProcessors : null,
      virtualizationEnabled: typeof report.virtualizationEnabled === "boolean" ? report.virtualizationEnabled : null,
      hyperVReady: report.hyperVReady === true,
      hyperVReason: typeof report.hyperVReason === "string" ? report.hyperVReason.slice(0, 240) : "",
    };
  });
}

export async function issueAndroidPairingCode() {
  const db = await dbWithAgentTables();
  const code = randomBytes(16).toString("hex").toUpperCase();
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO h2_android_agent_pairings (id, codeHash, expiresAt)
    VALUES (${id}, ${digest(code)}, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
  `);
  // Codigo so sai nesta resposta, nunca eh listado e nao fica armazenado em texto puro.
  return { code, expiresInMinutes: PAIRING_DURATION_MINUTES };
}

export async function claimAndroidAgent(codeValue: unknown, computerName: unknown) {
  const code = normalizeAndroidPairingCode(codeValue);
  const host = z.string().trim().min(1).max(80).safeParse(computerName);
  if (!code || !host.success) return null;
  const db = await dbWithAgentTables();
  // Consumo atomico impede reaproveitamento e corrida de pareamento.
  const [result] = await db.execute(sql`
    UPDATE h2_android_agent_pairings
    SET claimedAt = NOW()
    WHERE codeHash = ${digest(code)} AND claimedAt IS NULL AND expiresAt > NOW()
  `);
  if ((result as { affectedRows?: number }).affectedRows !== 1) return null;
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  await db.execute(sql`
    INSERT INTO h2_android_agents (id, tokenHash, computerName)
    VALUES (${id}, ${digest(token)}, ${host.data})
  `);
  return { agentId: id, agentToken: token, heartbeatSeconds: 30 };
}

export async function recordAndroidAgentHeartbeat(
  bearer: string | undefined,
  body: unknown,
): Promise<boolean> {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(bearer || "");
  if (!match) return false;
  const parsed = availabilitySchema.safeParse(body);
  if (!parsed.success) return false;
  const report = parsed.data;
  const db = await dbWithAgentTables();
  const [result] = await db.execute(sql`
    UPDATE h2_android_agents
    SET computerName = ${report.computerName},
        agentVersion = ${report.agentVersion},
        windowsVersion = ${report.windowsVersion},
        reportJson = ${JSON.stringify(report)},
        lastSeenAt = NOW()
    WHERE tokenHash = ${digest(match[1].toLowerCase())} AND revokedAt IS NULL
  `);
  return (result as { affectedRows?: number }).affectedRows === 1;
}

export async function revokeAndroidAgent(id: string) {
  const db = await dbWithAgentTables();
  const [result] = await db.execute(sql`
    UPDATE h2_android_agents SET revokedAt = NOW()
    WHERE id = ${id} AND revokedAt IS NULL
  `);
  return (result as { affectedRows?: number }).affectedRows === 1;
}

/** Real H2 Android controls: finite, allowlisted commands. No shell or arbitrary paths. */
export const h2AndroidAvdName = /^H2Android_[0-9]{2,3}$/;
export type AndroidControlAction = "create" | "clone" | "start" | "stop" | "tap" | "key" | "proxy";
type AndroidCommandRow = { id: string; agentId: string; avdName: string; commandType: AndroidControlAction; payloadJson: string; createdAt: Date | string };
type AndroidAgentIdentity = { id: string; reportJson: string | null; lastSeenAt: Date | string | null };
const screenshots = new Map<string, { bytes: Buffer; updatedAt: number }>();
const captureErrors = new Map<string, { message: string; updatedAt: number }>();
const viewers = new Map<string, { avdName: string; until: number }>();
let commandsInit: Promise<void> | null = null;

async function androidCommandDb() {
  const db = await dbWithAgentTables();
  if (!commandsInit) {
    commandsInit = db.execute(sql`
      CREATE TABLE IF NOT EXISTS h2_android_commands (
        id VARCHAR(36) PRIMARY KEY,
        agentId VARCHAR(36) NOT NULL,
        avdName VARCHAR(80) NOT NULL,
        commandType VARCHAR(12) NOT NULL,
        payloadJson TEXT NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'pending',
        resultText VARCHAR(300) NULL DEFAULT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deliveredAt TIMESTAMP NULL DEFAULT NULL,
        finishedAt TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_h2android_agent_status (agentId, status, createdAt),
        INDEX idx_h2android_latest (createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).then(() => {}).catch(e => { commandsInit = null; throw e; });
  }
  await commandsInit;
  return db;
}

async function authenticatedAndroidAgent(bearer: string | undefined): Promise<AndroidAgentIdentity | null> {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(bearer || "");
  if (!match) return null;
  const db = await dbWithAgentTables();
  const [rows] = await db.execute(sql`
    SELECT id, reportJson, lastSeenAt FROM h2_android_agents
    WHERE tokenHash = ${digest(match[1].toLowerCase())} AND revokedAt IS NULL LIMIT 1
  `);
  return ((rows as unknown as AndroidAgentIdentity[])[0]) || null;
}

export async function enqueueAndroidCommand(input: {
  agentId: string; avdName: string; action: AndroidControlAction; payload: Record<string, unknown>;
}) {
  if (!h2AndroidAvdName.test(input.avdName)) throw new TRPCError({ code: "BAD_REQUEST", message: "Nome de Android invalido." });
  const db = await androidCommandDb();
  const [rows] = await db.execute(sql`
    SELECT id, reportJson, lastSeenAt FROM h2_android_agents
    WHERE id = ${input.agentId} AND revokedAt IS NULL LIMIT 1
  `);
  const agent = (rows as unknown as AndroidAgentIdentity[])[0];
  if (!agent || !isAndroidAgentOnline(agent.lastSeenAt)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Agente Windows offline." });
  }
  let report: AndroidAgentReport | null = null;
  try { report = validateAndroidAgentReport(JSON.parse(agent.reportJson || "{}")); } catch {}
  if (!report || !NATIVE_H2_AGENT_VERSIONS.has(report.agentVersion)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Substitua o agente antigo pelo H2 Android Nativo no ADM." });
  }
  if (!report.hyperVReady) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: report.hyperVReason || "Hyper-V nao esta pronto neste computador." });
  }
  // Fail-closed: remote screen, tap, keys and proxy are NOT implemented for Hyper-V.
  if (!["create", "clone", "start", "stop", "tap", "key"].includes(input.action)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Comando indisponivel no motor Hyper-V nativo." });
  }
  if (["tap", "key"].includes(input.action)) {
    if (report.agentVersion !== "0.3.4-native-screen") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Agente H2 sem suporte ao console nativo." });
    }
    if (!report.runningAvds.includes(input.avdName)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Ligue o Android antes de usar os controles." });
    }
  }
  // Nao expor copia de Android usado como se fosse um aparelho independente.
  // O destino pode herdar dados e IDs da origem. Somente imagem-base limpa sera liberada.
  if (input.action === "clone") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Criacao por copia desativada. Novos Androids exigem imagem-base limpa e configuracao independente.",
    });
  }
  const exists = report.avdNames.includes(input.avdName);
  const creating = input.action === "create" || input.action === "clone";
  if (creating ? exists : !exists) {
    throw new TRPCError({ code: "BAD_REQUEST", message: exists ? "Android ja existe." : "Android nao encontrado no agente." });
  }
  if (creating) {
    // Multiple browser clicks must never prepare the same destination twice.
    const [pending] = await db.execute(sql`
      SELECT id FROM h2_android_commands
      WHERE agentId = ${input.agentId} AND avdName = ${input.avdName}
      AND commandType IN ('create','clone')
      AND status IN ('pending','running') LIMIT 1
    `);
    if ((pending as unknown as { id: string }[]).length) {
      throw new TRPCError({ code: "CONFLICT", message: "A criacao deste Android ja esta em andamento." });
    }
  }
  if (input.action === "clone") {
    // Old paired agents do not know "clone". Refuse early rather than enqueue a
    // command that fails only after the Windows worker receives it.
    if (report.agentVersion !== "0.3.2-native-clone") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Atualize apenas o agente H2 Android pelo ADM antes de criar outra maquina.",
      });
    }
    const source = input.payload.sourceAvdName;
    if (typeof source !== "string" || !h2AndroidAvdName.test(source) ||
        source === input.avdName || !report.avdNames.includes(source)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Android de origem invalido ou nao encontrado no agente." });
    }
    if (report.runningAvds.includes(source)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Desligue o Android original antes de criar uma copia." });
    }
  }
  if (input.action === "start") {
    // One agent owns this computer. Count live devices and undelivered starts.
    const active = report.runningAvds.length;
    // AVD boot can take several minutes; reserve a slot for recent successful
    // starts until the heartbeat reports the device online. Otherwise six rapid
    // consecutive Start requests could bypass the five-instance limit.
    const [pendingRows] = await db.execute(sql`
      SELECT avdName FROM h2_android_commands
      WHERE agentId = ${input.agentId} AND commandType = 'start'
      AND status IN ('pending','running','done')
      AND createdAt > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    `);
    const recent = new Set((pendingRows as unknown as { avdName: string }[])
      .map(row => row.avdName).filter(name => !report!.runningAvds.includes(name)));
    if (active + recent.size >= 5) throw new TRPCError({ code: "CONFLICT", message: "Limite de cinco Androids simultaneos." });
  }
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO h2_android_commands (id, agentId, avdName, commandType, payloadJson)
    VALUES (${id}, ${input.agentId}, ${input.avdName}, ${input.action}, ${JSON.stringify(input.payload)})
  `);
  return { id, status: "pending" as const };
}

export async function listAndroidCommands() {
  const db = await androidCommandDb();
  const [rows] = await db.execute(sql`
    SELECT id, agentId, avdName, commandType, status, resultText, createdAt
    FROM h2_android_commands ORDER BY createdAt DESC LIMIT 15
  `);
  return (rows as unknown as {
    id: string; agentId: string; avdName: string; commandType: string; status: string; resultText: string | null; createdAt: Date | string
  }[]).map(c => ({ ...c, createdAt: new Date(c.createdAt).toISOString() }));
}

export async function pullAndroidCommand(bearer: string | undefined) {
  const agent = await authenticatedAndroidAgent(bearer);
  if (!agent) return null;
  const db = await androidCommandDb();
  // Commands waiting to be delivered expire quickly. Commands already running
  // on the Windows host may be verifying large ISO hashes or preparing Hyper-V.
  // Do not expire a real in-flight VM operation after just two minutes.
  await db.execute(sql`
    UPDATE h2_android_commands SET status='expired', payloadJson='{}', resultText='Tempo limite aguardando agente.'
    WHERE agentId=${agent.id} AND status='pending'
    AND createdAt < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
  `);
  await db.execute(sql`
    UPDATE h2_android_commands SET status='expired', payloadJson='{}', resultText='Tempo limite executando no Windows.'
    WHERE agentId=${agent.id} AND status='running'
    AND COALESCE(deliveredAt, createdAt) < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
  `);
  const [rows] = await db.execute(sql`
    SELECT id, agentId, avdName, commandType, payloadJson, createdAt
    FROM h2_android_commands WHERE agentId=${agent.id} AND status='pending'
    ORDER BY createdAt ASC LIMIT 1
  `);
  const command = (rows as unknown as AndroidCommandRow[])[0];
  let result = null;
  if (command) {
    const [updated] = await db.execute(sql`
      UPDATE h2_android_commands SET status='running', deliveredAt=NOW()
      WHERE id=${command.id} AND agentId=${agent.id} AND status='pending'
    `);
    if ((updated as { affectedRows?: number }).affectedRows === 1) {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(command.payloadJson || "{}"); } catch {}
      result = { id: command.id, avdName: command.avdName, action: command.commandType, payload };
    }
  }
  const viewed = viewers.get(agent.id);
  const viewAvd = viewed && viewed.until > Date.now() ? viewed.avdName : null;
  return { command: result, viewAvd };
}

export async function finishAndroidCommand(bearer: string | undefined, body: unknown): Promise<boolean> {
  const agent = await authenticatedAndroidAgent(bearer);
  const parsed = z.object({
    id: z.string().uuid(), ok: z.boolean(), message: z.string().max(300)
  }).strict().safeParse(body);
  if (!agent || !parsed.success) return false;
  const db = await androidCommandDb();
  const [result] = await db.execute(sql`
    UPDATE h2_android_commands
    SET status=${parsed.data.ok ? "done" : "failed"},
        resultText=${parsed.data.message}, payloadJson='{}', finishedAt=NOW()
    WHERE id=${parsed.data.id} AND agentId=${agent.id} AND status='running'
  `);
  return (result as { affectedRows?: number }).affectedRows === 1;
}

export function requestAndroidScreen(agentId: string, avdName: string): { png: Buffer | null; error: string | null } {
  if (!h2AndroidAvdName.test(avdName)) return { png: null, error: null };
  const key = agentId + ":" + avdName;
  viewers.set(agentId, { avdName, until: Date.now() + 18_000 });
  const frame = screenshots.get(key);
  if (frame && Date.now() - frame.updatedAt < 15_000) return { png: frame.bytes, error: null };
  const diagnostic = captureErrors.get(key);
  return { png: null, error: diagnostic && Date.now() - diagnostic.updatedAt < 15_000 ? diagnostic.message : null };
}

export function requestAndroidFrame(agentId: string, avdName: string): Buffer | null {
  if (!h2AndroidAvdName.test(avdName)) return null;
  const key = agentId + ":" + avdName;
  viewers.set(agentId, { avdName, until: Date.now() + 18_000 });
  const frame = screenshots.get(key);
  return frame && Date.now() - frame.updatedAt < 15_000 ? frame.bytes : null;
}

export async function storeAndroidFrame(bearer: string | undefined, body: unknown): Promise<boolean> {
  const agent = await authenticatedAndroidAgent(bearer);
  const parsed = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("frame"), avdName: z.string().regex(h2AndroidAvdName), pngBase64: z.string().min(100).max(4_500_000) }).strict(),
    z.object({ kind: z.literal("error"), avdName: z.string().regex(h2AndroidAvdName), error: z.string().trim().min(1).max(200) }).strict(),
  ]).safeParse(
    typeof body === "object" && body && "pngBase64" in body
      ? { ...body, kind: "frame" }
      : typeof body === "object" && body && "error" in body
        ? { ...body, kind: "error" }
        : body,
  );
  if (!agent || !parsed.success) return false;
  const viewed = viewers.get(agent.id);
  if (!viewed || viewed.avdName !== parsed.data.avdName || viewed.until < Date.now()) return false;
  const key = agent.id + ":" + parsed.data.avdName;
  if (parsed.data.kind === "error") {
    captureErrors.set(key, { message: parsed.data.error, updatedAt: Date.now() });
    screenshots.delete(key);
    return true;
  }
  const bytes = Buffer.from(parsed.data.pngBase64, "base64");
  if (bytes.length < 100 || bytes.length > 3_300_000 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return false;
  screenshots.set(key, { bytes, updatedAt: Date.now() });
  captureErrors.delete(key);
  if (screenshots.size > 20) {
    for (const [key, image] of screenshots) if (Date.now() - image.updatedAt > 30_000) screenshots.delete(key);
  }
  return true;
}
