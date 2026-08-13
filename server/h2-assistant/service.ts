import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { resolveClientId } from "../routers/spreadsheet";
import {
  h2AssistantActions,
  h2AssistantAudit,
  h2AssistantConversations,
  h2AssistantMessages,
  h2AssistantSettings,
  h2AssistantUsage,
  spreadsheetClients,
} from "../../drizzle/schema";

export type AssistantUserContext = {
  db: any;
  userId: number;
  client: { id: number; name: string | null; phone: string | null; cpf: string | null };
};

export type AssistantActionDraft = {
  conversationId?: number | null;
  actionType: string;
  toolName: string;
  riskLevel?: "NORMAL" | "CRITICA";
  summary: string;
  payload: Record<string, unknown>;
  expiresInMinutes?: number;
};

const minuteWindow = new Map<number, { startedAt: number; count: number }>();
const TABLES_READY = new WeakSet<object>();
const MAX_TEXT_LENGTH = 2_000;
const MAX_HISTORY_ITEMS = 60;
const DEFAULT_REQUESTS_PER_MINUTE = 12;

function asJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function safeDetail(value: unknown, maxLength = 1_800) {
  const raw = asJson(value);
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}…` : raw;
}

function todayBrazil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function randomKey(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function ensureAssistantTables(db: any) {
  if (TABLES_READY.has(db)) return;
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS h2AssistantSettings (
      id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL UNIQUE, enabled INT NOT NULL DEFAULT 1,
      voiceEnabled INT NOT NULL DEFAULT 1, speakResponses INT NOT NULL DEFAULT 0,
      primaryProvider VARCHAR(32) NOT NULL DEFAULT 'openai', dailyRequestLimit INT NOT NULL DEFAULT 80,
      dailyAudioSecondsLimit INT NOT NULL DEFAULT 900, retentionDays INT NOT NULL DEFAULT 30,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS h2AssistantConversations (
      id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, title VARCHAR(180) NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'ATIVA', lastMessageAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_h2_assistant_conversation_user (userId, lastMessageAt)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS h2AssistantMessages (
      id INT AUTO_INCREMENT PRIMARY KEY, conversationId INT NOT NULL, userId INT NOT NULL,
      role VARCHAR(24) NOT NULL, content TEXT NOT NULL, intent VARCHAR(96) NULL,
      toolName VARCHAR(96) NULL, metadataJson TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_h2_assistant_message_conversation (conversationId, createdAt),
      INDEX idx_h2_assistant_message_user (userId, createdAt)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS h2AssistantActions (
      id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, conversationId INT NULL,
      actionType VARCHAR(40) NOT NULL, toolName VARCHAR(96) NOT NULL, riskLevel VARCHAR(24) NOT NULL DEFAULT 'NORMAL',
      status VARCHAR(24) NOT NULL DEFAULT 'PENDENTE', summary TEXT NOT NULL, payloadJson TEXT NOT NULL,
      resultJson TEXT NULL, idempotencyKey VARCHAR(96) NOT NULL UNIQUE, expiresAt TIMESTAMP NOT NULL,
      confirmedAt TIMESTAMP NULL, completedAt TIMESTAMP NULL, cancelledAt TIMESTAMP NULL,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_h2_assistant_action_user (userId, status, expiresAt)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS h2AssistantUsage (
      id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, dateKey VARCHAR(10) NOT NULL,
      requestCount INT NOT NULL DEFAULT 0, audioSeconds INT NOT NULL DEFAULT 0, inputCharacters INT NOT NULL DEFAULT 0,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_h2_assistant_usage_user_day (userId, dateKey)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS h2AssistantAudit (
      id INT AUTO_INCREMENT PRIMARY KEY, userId INT NOT NULL, conversationId INT NULL, actionId INT NULL,
      eventType VARCHAR(64) NOT NULL, toolName VARCHAR(96) NULL, correlationId VARCHAR(96) NOT NULL,
      detailJson TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_h2_assistant_audit_user (userId, createdAt),
      INDEX idx_h2_assistant_audit_action (actionId, createdAt)
    )
  `));
  TABLES_READY.add(db);
}

export async function resolveAssistantUser(token: string): Promise<AssistantUserContext> {
  const userId = await resolveClientId(token);
  const db = await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível.");
  await ensureAssistantTables(db);
  const client = (await db.select({
    id: spreadsheetClients.id,
    name: spreadsheetClients.name,
    phone: spreadsheetClients.phone,
    cpf: spreadsheetClients.cpf,
  }).from(spreadsheetClients).where(eq(spreadsheetClients.id, userId)).limit(1))[0];
  if (!client) throw new Error("Sessão de cliente não encontrada.");
  return { db, userId, client };
}

export async function getAssistantSettings(ctx: AssistantUserContext) {
  let settings = (await ctx.db.select().from(h2AssistantSettings).where(eq(h2AssistantSettings.userId, ctx.userId)).limit(1))[0];
  if (!settings) {
    await ctx.db.insert(h2AssistantSettings).values({ userId: ctx.userId });
    settings = (await ctx.db.select().from(h2AssistantSettings).where(eq(h2AssistantSettings.userId, ctx.userId)).limit(1))[0];
  }
  return settings;
}

export async function updateAssistantSettings(ctx: AssistantUserContext, patch: Record<string, unknown>) {
  const allowed = ["voiceEnabled", "speakResponses", "dailyRequestLimit", "dailyAudioSecondsLimit", "retentionDays"];
  const values = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
  await getAssistantSettings(ctx);
  if (Object.keys(values).length) await ctx.db.update(h2AssistantSettings).set(values).where(eq(h2AssistantSettings.userId, ctx.userId));
  await writeAssistantAudit(ctx, "CONFIGURACAO_ATUALIZADA", null, { fields: Object.keys(values) });
  return getAssistantSettings(ctx);
}

export async function writeAssistantAudit(ctx: AssistantUserContext, eventType: string, toolName: string | null, detail: unknown, options?: { conversationId?: number | null; actionId?: number | null; correlationId?: string }) {
  const correlationId = options?.correlationId || randomKey("audit");
  await ctx.db.insert(h2AssistantAudit).values({
    userId: ctx.userId,
    conversationId: options?.conversationId ?? null,
    actionId: options?.actionId ?? null,
    eventType,
    toolName,
    correlationId,
    detailJson: safeDetail(detail),
  });
  return correlationId;
}

export async function enforceAssistantLimits(ctx: AssistantUserContext, inputText: string, audioSeconds = 0) {
  const normalized = inputText.trim();
  if (!normalized) throw new Error("Envie uma mensagem para o assistente.");
  if (normalized.length > MAX_TEXT_LENGTH) throw new Error("A mensagem é muito longa. Envie até 2.000 caracteres.");
  if (audioSeconds < 0 || audioSeconds > 90) throw new Error("O áudio deve ter no máximo 90 segundos por solicitação.");

  const settings = await getAssistantSettings(ctx);
  if (!settings || !Number(settings.enabled)) throw new Error("O H2 Assistente está desativado para esta conta.");
  const now = Date.now();
  const window = minuteWindow.get(ctx.userId) || { startedAt: now, count: 0 };
  if (now - window.startedAt >= 60_000) { window.startedAt = now; window.count = 0; }
  if (window.count >= DEFAULT_REQUESTS_PER_MINUTE) throw new Error("Muitas solicitações em pouco tempo. Aguarde um minuto e tente novamente.");
  window.count += 1;
  minuteWindow.set(ctx.userId, window);

  const dateKey = todayBrazil();
  await ctx.db.execute(sql.raw(`
    INSERT INTO h2AssistantUsage (userId, dateKey, requestCount, audioSeconds, inputCharacters)
    VALUES (${ctx.userId}, '${dateKey}', 1, ${Math.round(audioSeconds)}, ${normalized.length})
    ON DUPLICATE KEY UPDATE requestCount = requestCount + 1, audioSeconds = audioSeconds + VALUES(audioSeconds), inputCharacters = inputCharacters + VALUES(inputCharacters)
  `));
  const usage = (await ctx.db.select().from(h2AssistantUsage).where(and(eq(h2AssistantUsage.userId, ctx.userId), eq(h2AssistantUsage.dateKey, dateKey))).limit(1))[0];
  if (Number(usage?.requestCount || 0) > Number(settings.dailyRequestLimit || 80)) throw new Error("Limite diário do H2 Assistente atingido. Tente novamente amanhã.");
  if (Number(usage?.audioSeconds || 0) > Number(settings.dailyAudioSecondsLimit || 900)) throw new Error("Limite diário de áudio atingido. Continue digitando por texto.");
  return { settings, usage };
}

export async function createAssistantConversation(ctx: AssistantUserContext, title?: string) {
  const insert = await ctx.db.insert(h2AssistantConversations).values({ userId: ctx.userId, title: title?.slice(0, 180) || "Nova conversa" });
  const id = Number(insert[0]?.insertId || insert.insertId);
  await writeAssistantAudit(ctx, "CONVERSA_CRIADA", null, { conversationId: id }, { conversationId: id });
  return id;
}

export async function ensureAssistantConversation(ctx: AssistantUserContext, conversationId?: number | null, title?: string) {
  if (conversationId) {
    const existing = (await ctx.db.select().from(h2AssistantConversations).where(and(eq(h2AssistantConversations.id, conversationId), eq(h2AssistantConversations.userId, ctx.userId))).limit(1))[0];
    if (existing) return Number(existing.id);
  }
  return createAssistantConversation(ctx, title);
}

export async function addAssistantMessage(ctx: AssistantUserContext, input: { conversationId: number; role: "user" | "assistant" | "system"; content: string; intent?: string; toolName?: string; metadata?: unknown }) {
  const content = input.content.trim().slice(0, MAX_TEXT_LENGTH * 3);
  const insert = await ctx.db.insert(h2AssistantMessages).values({
    conversationId: input.conversationId,
    userId: ctx.userId,
    role: input.role,
    content,
    intent: input.intent || null,
    toolName: input.toolName || null,
    metadataJson: input.metadata ? safeDetail(input.metadata, 4_000) : null,
  });
  await ctx.db.update(h2AssistantConversations).set({ lastMessageAt: new Date() }).where(and(eq(h2AssistantConversations.id, input.conversationId), eq(h2AssistantConversations.userId, ctx.userId)));
  return Number(insert[0]?.insertId || insert.insertId);
}

export async function listAssistantConversations(ctx: AssistantUserContext) {
  return ctx.db.select().from(h2AssistantConversations).where(eq(h2AssistantConversations.userId, ctx.userId)).orderBy(desc(h2AssistantConversations.lastMessageAt)).limit(20);
}

export async function listAssistantMessages(ctx: AssistantUserContext, conversationId: number) {
  const conversation = (await ctx.db.select().from(h2AssistantConversations).where(and(eq(h2AssistantConversations.id, conversationId), eq(h2AssistantConversations.userId, ctx.userId))).limit(1))[0];
  if (!conversation) throw new Error("Conversa não encontrada.");
  return ctx.db.select().from(h2AssistantMessages).where(and(eq(h2AssistantMessages.conversationId, conversationId), eq(h2AssistantMessages.userId, ctx.userId))).orderBy(desc(h2AssistantMessages.createdAt)).limit(MAX_HISTORY_ITEMS);
}

export async function createAssistantAction(ctx: AssistantUserContext, draft: AssistantActionDraft) {
  const conversationId = await ensureAssistantConversation(ctx, draft.conversationId, draft.summary.slice(0, 80));
  const expiresAt = new Date(Date.now() + (draft.expiresInMinutes || 10) * 60_000);
  const idempotencyKey = randomKey("act");
  const insert = await ctx.db.insert(h2AssistantActions).values({
    userId: ctx.userId,
    conversationId,
    actionType: draft.actionType,
    toolName: draft.toolName,
    riskLevel: draft.riskLevel || "NORMAL",
    status: "PENDENTE",
    summary: draft.summary.slice(0, 4_000),
    payloadJson: safeDetail(draft.payload, 8_000),
    idempotencyKey,
    expiresAt,
  });
  const id = Number(insert[0]?.insertId || insert.insertId);
  await writeAssistantAudit(ctx, "PREVIA_CRIADA", draft.toolName, { actionType: draft.actionType, riskLevel: draft.riskLevel || "NORMAL" }, { conversationId, actionId: id, correlationId: idempotencyKey });
  return { id, conversationId, idempotencyKey, expiresAt, status: "PENDENTE" as const, summary: draft.summary, riskLevel: draft.riskLevel || "NORMAL" };
}

export async function getAssistantAction(ctx: AssistantUserContext, actionId: number) {
  const action = (await ctx.db.select().from(h2AssistantActions).where(and(eq(h2AssistantActions.id, actionId), eq(h2AssistantActions.userId, ctx.userId))).limit(1))[0];
  if (!action) throw new Error("Ação pendente não encontrada.");
  return action;
}

export async function cancelAssistantAction(ctx: AssistantUserContext, actionId: number) {
  const action = await getAssistantAction(ctx, actionId);
  if (action.status !== "PENDENTE") throw new Error("Esta ação já foi processada.");
  await ctx.db.update(h2AssistantActions).set({ status: "CANCELADA", cancelledAt: new Date() }).where(and(eq(h2AssistantActions.id, actionId), eq(h2AssistantActions.userId, ctx.userId), eq(h2AssistantActions.status, "PENDENTE")));
  await writeAssistantAudit(ctx, "PREVIA_CANCELADA", action.toolName, { actionId }, { conversationId: action.conversationId, actionId, correlationId: action.idempotencyKey });
  return { success: true };
}

export async function markAssistantActionRunning(ctx: AssistantUserContext, actionId: number) {
  const action = await getAssistantAction(ctx, actionId);
  if (action.status === "CONCLUIDA") return { action, alreadyCompleted: true };
  if (action.status !== "PENDENTE") throw new Error("Esta ação não pode mais ser confirmada.");
  if (new Date(action.expiresAt).getTime() < Date.now()) {
    await ctx.db.update(h2AssistantActions).set({ status: "EXPIRADA" }).where(eq(h2AssistantActions.id, actionId));
    throw new Error("A prévia expirou. Peça uma nova confirmação.");
  }
  const updated = await ctx.db.update(h2AssistantActions).set({ status: "PROCESSANDO", confirmedAt: new Date() }).where(and(eq(h2AssistantActions.id, actionId), eq(h2AssistantActions.userId, ctx.userId), eq(h2AssistantActions.status, "PENDENTE")));
  if (!updated[0]?.affectedRows) throw new Error("Esta ação já foi confirmada em outra solicitação.");
  return { action: await getAssistantAction(ctx, actionId), alreadyCompleted: false };
}

export async function completeAssistantAction(ctx: AssistantUserContext, actionId: number, result: unknown) {
  const action = await getAssistantAction(ctx, actionId);
  await ctx.db.update(h2AssistantActions).set({ status: "CONCLUIDA", resultJson: safeDetail(result, 8_000), completedAt: new Date() }).where(and(eq(h2AssistantActions.id, actionId), eq(h2AssistantActions.userId, ctx.userId)));
  await writeAssistantAudit(ctx, "ACAO_CONCLUIDA", action.toolName, { actionId }, { conversationId: action.conversationId, actionId, correlationId: action.idempotencyKey });
  return { success: true, idempotencyKey: action.idempotencyKey };
}

export async function failAssistantAction(ctx: AssistantUserContext, actionId: number, errorMessage: string) {
  const action = await getAssistantAction(ctx, actionId);
  await ctx.db.update(h2AssistantActions).set({ status: "FALHOU", resultJson: safeDetail({ error: errorMessage }), completedAt: new Date() }).where(and(eq(h2AssistantActions.id, actionId), eq(h2AssistantActions.userId, ctx.userId)));
  await writeAssistantAudit(ctx, "ACAO_FALHOU", action.toolName, { actionId, reason: errorMessage }, { conversationId: action.conversationId, actionId, correlationId: action.idempotencyKey });
}

export async function listAssistantAudit(ctx: AssistantUserContext) {
  return ctx.db.select().from(h2AssistantAudit).where(eq(h2AssistantAudit.userId, ctx.userId)).orderBy(desc(h2AssistantAudit.createdAt)).limit(100);
}

export async function healthAssistant(ctx: AssistantUserContext) {
  const settings = await getAssistantSettings(ctx);
  return {
    enabled: Boolean(settings.enabled),
    openAIConfigured: Boolean(process.env.OPENAI_API_KEY),
    voiceEnabled: Boolean(settings.voiceEnabled),
    browserVoiceFallback: true,
    audioMaxSecondsPerRequest: 90,
    textAlwaysAvailable: true,
  };
}
