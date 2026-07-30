import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import {
  onlineSupportAgents,
  onlineSupportAutoReplies,
  onlineSupportBusinessHours,
  onlineSupportConfig,
  onlineSupportConversations,
  onlineSupportFileLibrary,
  onlineSupportKnowledgeBase,
  onlineSupportLogs,
  onlineSupportMenuItems,
  onlineSupportMessages,
  onlineSupportNotifications,
  onlineSupportVisitors,
} from "../../drizzle/schema";
import { fuzzyIncludes, normalizeText } from "./normalize";
import { findFlowNodeByLabel, getNodeChildren } from "../chat-flow/service";

type JsonValue = Record<string, unknown> | Array<unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function nowIso() {
  return new Date().toISOString();
}

async function addLog(level: "info" | "warn" | "error", source: string, event: string, message: string, meta?: JsonValue) {
  const db = await getDb();
  if (!db) return;

  await db.insert(onlineSupportLogs).values({
    level,
    source,
    event,
    message,
    metaJson: meta ? stringifyJson(meta) : null,
  });
}

export async function getOrCreateConfig() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const rows = await db.select().from(onlineSupportConfig).limit(1);
  if (rows[0]) return rows[0];

  await db.insert(onlineSupportConfig).values({
    chatEnabled: 0,
    welcomeButtonEnabled: 1,
    floatingBubbleEnabled: 1,
    autoReplyEnabled: 1,
    aiEnabled: 0,
    humanSupportEnabled: 1,
    fileUploadEnabled: 1,
    notificationsEnabled: 1,
    maintenanceMode: 0,
    allowedPages: stringifyJson(["/", "/acompanhar", "/ajuda"]),
    buttonSortOrder: 3,
    buttonLabel: "ATENDIMENTO ONLINE",
    buttonDescription: "Tire suas duvidas, receba instrucoes e fale com nossa equipe.",
    buttonIcon: "message-circle",
    buttonColor: "#2563eb",
    openMode: "modal",
    disabledMessage: "Atendimento indisponivel no momento.",
    welcomeMessage: "Ola! Seja bem-vindo a Walk Ajuda. Como podemos ajudar?",
    outOfHoursMessage: "Nossa equipe esta fora do horario de atendimento, mas o assistente virtual pode ajudar.",
    defaultFallbackMessage: "Nao encontrei uma resposta segura para essa pergunta. Vou encaminhar voce para um atendente.",
    aiProvider: "openai",
    aiModel: ENV.openAiModel || "gpt-4o-mini",
    aiTone: "profissional",
    aiMaxTokens: 400,
    aiErrorMessage: "Falha temporaria ao consultar a inteligencia artificial.",
    blockedTopics: stringifyJson(["senha", "token", "chave"]),
    handoffRule: "no_safe_answer",
    privacyConsentText: "Ao iniciar o chat, voce concorda com nossa politica de privacidade.",
    updatedBy: "system",
  });

  const afterInsert = await db.select().from(onlineSupportConfig).limit(1);
  return afterInsert[0];
}

export async function getBusinessHours() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(onlineSupportBusinessHours).orderBy(asc(onlineSupportBusinessHours.weekDay));
}

function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hh, mm] = time.split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

export async function isInWorkingHours() {
  const now = new Date();
  const weekDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const hours = await getBusinessHours();
  const rule = hours.find(h => h.weekDay === weekDay);

  if (!rule || rule.isOpen !== 1) return false;

  const open = timeToMinutes(rule.openTime);
  const close = timeToMinutes(rule.closeTime);
  if (open == null || close == null) return false;
  if (currentMinutes < open || currentMinutes > close) return false;

  const breakStart = timeToMinutes(rule.breakStart);
  const breakEnd = timeToMinutes(rule.breakEnd);
  if (breakStart != null && breakEnd != null) {
    if (currentMinutes >= breakStart && currentMinutes <= breakEnd) return false;
  }

  return true;
}

export async function getPublicState(pathname: string) {
  const config = await getOrCreateConfig();
  const menuItems = await listMenuItems(true);
  const notifications = config.notificationsEnabled === 1;
  const allowedPages = parseJson<string[]>(config.allowedPages, ["/"]);

  return {
    chatEnabled: config.chatEnabled === 1,
    welcomeButtonEnabled: config.welcomeButtonEnabled === 1,
    floatingBubbleEnabled: config.floatingBubbleEnabled === 1,
    maintenanceMode: config.maintenanceMode === 1,
    buttonLabel: config.buttonLabel,
    buttonDescription: config.buttonDescription,
    buttonIcon: config.buttonIcon,
    buttonColor: config.buttonColor,
    buttonSortOrder: config.buttonSortOrder,
    customStatusText: config.customStatusText || null,
    openMode: config.openMode,
    disabledMessage: config.disabledMessage,
    welcomeMessage: config.welcomeMessage,
    outOfHoursMessage: config.outOfHoursMessage,
    notificationsEnabled: notifications,
    allowedPages,
    showOnPage: allowedPages.length === 0 || allowedPages.includes(pathname),
    menuItems,
    onlineNow: await isInWorkingHours(),
  };
}

export async function upsertVisitor(input: {
  visitorId: string;
  name?: string;
  phone?: string;
  email?: string;
  originPage?: string;
  privacyConsent?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const existing = await db
    .select()
    .from(onlineSupportVisitors)
    .where(eq(onlineSupportVisitors.visitorId, input.visitorId))
    .limit(1);

  if (!existing[0]) {
    await db.insert(onlineSupportVisitors).values({
      visitorId: input.visitorId,
      name: input.name || null,
      phone: input.phone || null,
      email: input.email || null,
      originPage: input.originPage || null,
      privacyConsent: input.privacyConsent ? 1 : 0,
    });
  } else {
    await db
      .update(onlineSupportVisitors)
      .set({
        name: input.name || existing[0].name,
        phone: input.phone || existing[0].phone,
        email: input.email || existing[0].email,
        originPage: input.originPage || existing[0].originPage,
        privacyConsent: input.privacyConsent ? 1 : existing[0].privacyConsent,
        lastSeenAt: new Date(),
      })
      .where(eq(onlineSupportVisitors.visitorId, input.visitorId));
  }
}

export async function getOrCreateConversation(input: {
  visitorId: string;
  visitorName?: string;
  visitorPhone?: string;
  visitorEmail?: string;
  originPage?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const openStatuses = ["new", "waiting_agent", "in_service", "waiting_customer"];
  const open = await db
    .select()
    .from(onlineSupportConversations)
    .where(eq(onlineSupportConversations.visitorId, input.visitorId))
    .orderBy(desc(onlineSupportConversations.updatedAt))
    .limit(1);

  if (open[0] && openStatuses.includes(open[0].status)) {
    return open[0];
  }

  const result = await db.insert(onlineSupportConversations).values({
    visitorId: input.visitorId,
    visitorName: input.visitorName || null,
    visitorPhone: input.visitorPhone || null,
    visitorEmail: input.visitorEmail || null,
    originPage: input.originPage || null,
    status: "new",
    botPaused: 0,
    urgent: 0,
    labels: stringifyJson([]),
    unreadForAdmin: 0,
    unreadForVisitor: 0,
  });

  const id = Number(result[0].insertId);
  const row = await db.select().from(onlineSupportConversations).where(eq(onlineSupportConversations.id, id)).limit(1);
  return row[0];
}

async function createMessage(input: {
  conversationId: number;
  senderType: "visitor" | "bot" | "agent" | "system";
  senderId?: string;
  senderName?: string;
  messageType?: string;
  text?: string;
  payload?: JsonValue;
  dedupeKey?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  if (input.dedupeKey) {
    const existing = await db
      .select()
      .from(onlineSupportMessages)
      .where(eq(onlineSupportMessages.dedupeKey, input.dedupeKey))
      .limit(1);
    if (existing[0]) return existing[0];
  }

  const result = await db.insert(onlineSupportMessages).values({
    conversationId: input.conversationId,
    senderType: input.senderType,
    senderId: input.senderId || null,
    senderName: input.senderName || null,
    messageType: input.messageType || "text",
    text: input.text || null,
    payloadJson: input.payload ? stringifyJson(input.payload) : null,
    dedupeKey: input.dedupeKey || null,
    isRead: 0,
    isDelivered: 1,
  });

  const id = Number(result[0].insertId);
  const row = await db.select().from(onlineSupportMessages).where(eq(onlineSupportMessages.id, id)).limit(1);
  return row[0];
}

async function touchConversationForMessage(conversationId: number, options: {
  previewText?: string;
  incrementAdminUnread?: number;
  incrementVisitorUnread?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const current = await db
    .select()
    .from(onlineSupportConversations)
    .where(eq(onlineSupportConversations.id, conversationId))
    .limit(1);

  if (!current[0]) return;

  await db
    .update(onlineSupportConversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: options.previewText || current[0].lastMessagePreview,
      unreadForAdmin: Math.max(0, current[0].unreadForAdmin + (options.incrementAdminUnread || 0)),
      unreadForVisitor: Math.max(0, current[0].unreadForVisitor + (options.incrementVisitorUnread || 0)),
      status: options.status || current[0].status,
      updatedAt: new Date(),
    })
    .where(eq(onlineSupportConversations.id, conversationId));
}

export async function listMessages(conversationId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(onlineSupportMessages)
    .where(eq(onlineSupportMessages.conversationId, conversationId))
    .orderBy(asc(onlineSupportMessages.createdAt))
    .limit(limit);

  return rows.map(m => ({
    ...m,
    payload: parseJson<Record<string, unknown> | null>(m.payloadJson, null),
  }));
}

export async function listConversations(status?: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = status
    ? await db
        .select()
        .from(onlineSupportConversations)
        .where(eq(onlineSupportConversations.status, status))
        .orderBy(desc(onlineSupportConversations.updatedAt))
    : await db.select().from(onlineSupportConversations).orderBy(desc(onlineSupportConversations.updatedAt));

  return rows.map(row => ({
    ...row,
    labels: parseJson<string[]>(row.labels, []),
  }));
}

async function createNotification(input: {
  conversationId?: number;
  type: string;
  title: string;
  message: string;
  targetRole?: string;
  targetUser?: string;
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(onlineSupportNotifications).values({
    conversationId: input.conversationId || null,
    type: input.type,
    title: input.title,
    message: input.message,
    targetRole: input.targetRole || "admin",
    targetUser: input.targetUser || null,
    isRead: 0,
  });
}

function scoreAutoReply(question: string, candidates: string[]) {
  const normalizedQuestion = normalizeText(question);
  let score = 0;

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) continue;

    if (normalizedQuestion === normalizedCandidate) {
      score = Math.max(score, 100);
      continue;
    }

    if (normalizedQuestion.includes(normalizedCandidate)) {
      score = Math.max(score, 85);
      continue;
    }

    if (fuzzyIncludes(normalizedQuestion, normalizedCandidate)) {
      score = Math.max(score, 70);
    }
  }

  return score;
}

export async function testAutoReply(question: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const replies = await db
    .select()
    .from(onlineSupportAutoReplies)
    .where(eq(onlineSupportAutoReplies.isActive, 1))
    .orderBy(asc(onlineSupportAutoReplies.priority), desc(onlineSupportAutoReplies.updatedAt));

  let best: { row: (typeof replies)[number]; score: number } | null = null;

  for (const row of replies) {
    const keywords = parseJson<string[]>(row.keywordsJson, []);
    const related = parseJson<string[]>(row.relatedQuestionsJson, []);
    const candidates = [...keywords, ...related];
    const score = scoreAutoReply(question, candidates);

    if (!best || score > best.score) {
      best = { row, score };
    }
  }

  if (!best || best.score < 65) {
    const score = best ? best.score : 0;
    return { matched: false, score, reply: null };
  }

  return {
    matched: true,
    score: best.score,
    reply: {
      ...best.row,
      relatedQuestions: parseJson<string[]>(best.row.relatedQuestionsJson, []),
      keywords: parseJson<string[]>(best.row.keywordsJson, []),
      buttons: parseJson<Array<Record<string, unknown>>>(best.row.buttonsJson, []),
      media: parseJson<Record<string, unknown>>(best.row.mediaJson, {}),
    },
  };
}

async function getAiAnswer(question: string, config: Awaited<ReturnType<typeof getOrCreateConfig>>) {
  if (config.aiEnabled !== 1 || ENV.chatAiEnabled !== "true" || !ENV.openAiApiKey) {
    return null;
  }

  const blockedTopics = parseJson<string[]>(config.blockedTopics, []);
  const normalizedQuestion = normalizeText(question);

  if (blockedTopics.some(topic => topic && normalizedQuestion.includes(normalizeText(topic)))) {
    return null;
  }

  const db = await getDb();
  if (!db) return null;

  const kb = await db
    .select()
    .from(onlineSupportKnowledgeBase)
    .where(eq(onlineSupportKnowledgeBase.status, "published"))
    .orderBy(asc(onlineSupportKnowledgeBase.priority), desc(onlineSupportKnowledgeBase.updatedAt))
    .limit(30);

  if (!kb.length) return null;

  const context = kb
    .map(item => `Titulo: ${item.title}\nPergunta: ${item.question || ""}\nResposta: ${item.answer || ""}`)
    .join("\n\n----\n\n");

  const model = config.aiModel || ENV.openAiModel || "gpt-4o-mini";

  const payload = {
    model,
    messages: [
      {
        role: "system",
        content:
          "Voce e um assistente de atendimento. Responda SOMENTE usando os dados fornecidos na base de conhecimento. Se nao houver resposta segura, retorne exatamente: SEM_RESPOSTA_SEGURA",
      },
      {
        role: "user",
        content: `Base de conhecimento aprovada:\n\n${context}\n\nPergunta do cliente: ${question}`,
      },
    ],
    temperature: 0.1,
    max_tokens: Number(config.aiMaxTokens || 400),
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.openAiApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      await addLog("error", "chat-ai", "ai_http_error", `Status ${response.status}`, {
        status: response.status,
      });
      return null;
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = body.choices?.[0]?.message?.content?.trim() || "";
    if (!content || content === "SEM_RESPOSTA_SEGURA") return null;

    return content;
  } catch (error) {
    await addLog("error", "chat-ai", "ai_exception", "Erro ao consultar IA", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function sendVisitorMessage(input: {
  visitorId: string;
  conversationId?: number;
  visitorName?: string;
  visitorPhone?: string;
  visitorEmail?: string;
  originPage?: string;
  text: string;
  dedupeKey?: string;
}) {
  const config = await getOrCreateConfig();
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  await upsertVisitor({
    visitorId: input.visitorId,
    name: input.visitorName,
    phone: input.visitorPhone,
    email: input.visitorEmail,
    originPage: input.originPage,
    privacyConsent: true,
  });

  const conversation = input.conversationId
    ? (
        await db
          .select()
          .from(onlineSupportConversations)
          .where(eq(onlineSupportConversations.id, input.conversationId))
          .limit(1)
      )[0]
    : await getOrCreateConversation({
        visitorId: input.visitorId,
        visitorName: input.visitorName,
        visitorPhone: input.visitorPhone,
        visitorEmail: input.visitorEmail,
        originPage: input.originPage,
      });

  if (!conversation) throw new Error("Conversa nao encontrada");

  const visitorMessage = await createMessage({
    conversationId: conversation.id,
    senderType: "visitor",
    senderId: input.visitorId,
    senderName: input.visitorName,
    text: input.text,
    dedupeKey: input.dedupeKey,
  });

  await touchConversationForMessage(conversation.id, {
    previewText: input.text,
    incrementAdminUnread: 1,
    status: conversation.status === "finalized" ? "new" : conversation.status,
  });

  await createNotification({
    conversationId: conversation.id,
    type: "new_message",
    title: "Nova mensagem no Atendimento Online",
    message: `${input.visitorName || "Visitante"}: ${input.text.slice(0, 120)}`,
    targetRole: "admin",
  });

  const responses: Array<Record<string, unknown>> = [];

  const isOpenNow = await isInWorkingHours();

  if (config.chatEnabled !== 1 || config.maintenanceMode === 1) {
    const systemMessage = await createMessage({
      conversationId: conversation.id,
      senderType: "system",
      text: config.disabledMessage || "Atendimento indisponivel no momento.",
    });

    await touchConversationForMessage(conversation.id, {
      previewText: systemMessage.text || "",
      incrementVisitorUnread: 1,
    });

    responses.push({
      type: "disabled",
      message: systemMessage,
    });

    return { conversationId: conversation.id, visitorMessage, responses };
  }

  if (!isOpenNow && config.autoReplyEnabled === 1) {
    // Mesmo fora do horário, tenta responder com respostas automáticas por palavras-chave
    const matchOutOfHours = await testAutoReply(input.text);
    if (matchOutOfHours.matched && matchOutOfHours.reply) {
      const autoMessage = await createMessage({
        conversationId: conversation.id,
        senderType: "bot",
        senderName: "Assistente",
        text: String(matchOutOfHours.reply.responseText || ""),
        messageType: "rich",
        payload: {
          media: matchOutOfHours.reply.media,
          buttons: matchOutOfHours.reply.buttons,
          score: matchOutOfHours.score,
          autoReplyId: matchOutOfHours.reply.id,
          matchedAt: nowIso(),
        },
      });
      await touchConversationForMessage(conversation.id, {
        previewText: autoMessage.text || "",
        incrementVisitorUnread: 1,
        status: "waiting_customer",
      });
      responses.push({ type: "auto_reply", message: autoMessage });
      return { conversationId: conversation.id, visitorMessage, responses };
    }
    // Sem resposta automática: mostra mensagem de fora do horário com menu
    const outOfHours = await createMessage({
      conversationId: conversation.id,
      senderType: "bot",
      senderName: "Assistente",
      text:
        config.outOfHoursMessage ||
        "Nosso atendimento está fora do horário, mas posso ajudar com informações automáticas. Selecione uma opção abaixo.",
    });
    await touchConversationForMessage(conversation.id, {
      previewText: outOfHours.text || "",
      incrementVisitorUnread: 1,
      status: "waiting_customer",
    });
    responses.push({ type: "out_of_hours", message: outOfHours });
    return { conversationId: conversation.id, visitorMessage, responses };
  }

  const updatedConversation = (
    await db
      .select()
      .from(onlineSupportConversations)
      .where(eq(onlineSupportConversations.id, conversation.id))
      .limit(1)
  )[0];

  if (!updatedConversation || updatedConversation.botPaused === 1) {
    return { conversationId: conversation.id, visitorMessage, responses };
  }

  // Verificar se o texto corresponde a um nó do fluxo de botões (árvore recursiva)
  const flowNode = await findFlowNodeByLabel(input.text || "", null);
  if (flowNode && flowNode.isActive === 1) {
    const botText = flowNode.botResponse || flowNode.label;
    const children = await getNodeChildren(flowNode.id);
    const botPayload: Record<string, unknown> = {};
    if (children.length > 0) {
      botPayload.buttons = children.map(c => ({
        label: c.label,
        actionType: "flow_node",
        actionPayload: { nodeId: c.id, nodeActionType: c.actionType, nodeActionPayload: c.actionPayload },
      }));
    }
    // Se a ação do nó é uma ação direta (não show_children), executar
    if (flowNode.actionType !== "show_children" && children.length === 0) {
      botPayload.directAction = {
        actionType: flowNode.actionType,
        actionPayload: flowNode.actionPayload,
      };
    }
    if (flowNode.botImageUrl) {
      botPayload.media = { imageUrl: flowNode.botImageUrl };
    }
    const flowMsg = await createMessage({
      conversationId: conversation.id,
      senderType: "bot",
      senderName: "Assistente",
      text: botText,
      messageType: "rich",
      payload: botPayload,
    });
    await touchConversationForMessage(conversation.id, {
      previewText: flowMsg.text || "",
      incrementVisitorUnread: 1,
      status: "waiting_customer",
    });
    responses.push({ type: "flow_node", message: flowMsg });
    return { conversationId: conversation.id, visitorMessage, responses };
  }

  // Verificar se o texto corresponde a um botão do menu (por keywords ou título) — PRIORIDADE sobre respostas automáticas
  const inputNorm = normalizeText(input.text || "");
  const menuItemMatch = menuItems.find((m: any) => {
    // 1. Verificar por keywords configuradas no botão
    const keywords: string[] = m.keywords || [];
    if (keywords.length > 0) {
      const kwMatch = keywords.some(kw => {
        const kwNorm = normalizeText(kw);
        return inputNorm === kwNorm || inputNorm.includes(kwNorm) || fuzzyIncludes(inputNorm, kwNorm);
      });
      if (kwMatch) return true;
    }
    // 2. Verificar pelo título do botão
    const title = normalizeText(m.title || "");
    return inputNorm === title || inputNorm.includes(title) || title.includes(inputNorm);
  });
  if (menuItemMatch && (menuItemMatch.responseText || (menuItemMatch.subButtons && menuItemMatch.subButtons.length > 0))) {
    const botText = menuItemMatch.responseText || "Selecione uma opção:";
    const botPayload: Record<string, unknown> = {};
    if (menuItemMatch.subButtons && menuItemMatch.subButtons.length > 0) {
      botPayload.buttons = menuItemMatch.subButtons.map((b: any) => ({
        label: b.label,
        actionType: b.actionType,
        actionPayload: b.actionPayload || {},
      }));
    }
    if ((menuItemMatch as any).responseImageUrl) {
      botPayload.media = { imageUrl: (menuItemMatch as any).responseImageUrl };
    }
    const menuBotMsg = await createMessage({
      conversationId: conversation.id,
      senderType: "bot",
      senderName: "Assistente",
      text: botText,
      messageType: "rich",
      payload: botPayload,
    });
    await touchConversationForMessage(conversation.id, {
      previewText: menuBotMsg.text || "",
      incrementVisitorUnread: 1,
      status: "waiting_customer",
    });
    responses.push({ type: "menu_item", message: menuBotMsg });
    return { conversationId: conversation.id, visitorMessage, responses };
  }

  if (config.autoReplyEnabled === 1) {
    const match = await testAutoReply(input.text);
    if (match.matched && match.reply) {
      const autoMessage = await createMessage({
        conversationId: conversation.id,
        senderType: "bot",
        senderName: "Assistente",
        text: String(match.reply.responseText || ""),
        messageType: "rich",
        payload: {
          media: match.reply.media,
          buttons: match.reply.buttons,
          score: match.score,
          autoReplyId: match.reply.id,
          matchedAt: nowIso(),
        },
      });

      await touchConversationForMessage(conversation.id, {
        previewText: autoMessage.text || "",
        incrementVisitorUnread: 1,
        status: "waiting_customer",
      });

      responses.push({
        type: "auto_reply",
        message: autoMessage,
      });

      return { conversationId: conversation.id, visitorMessage, responses };
    }
  }

  const aiAnswer = await getAiAnswer(input.text, config);
  if (aiAnswer) {
    const aiMessage = await createMessage({
      conversationId: conversation.id,
      senderType: "bot",
      senderName: "Assistente IA",
      text: aiAnswer,
      messageType: "text",
      payload: { source: "ai", model: config.aiModel || ENV.openAiModel || "gpt-4o-mini" },
    });

    await touchConversationForMessage(conversation.id, {
      previewText: aiMessage.text || "",
      incrementVisitorUnread: 1,
      status: "waiting_customer",
    });

    responses.push({ type: "ai", message: aiMessage });

    return { conversationId: conversation.id, visitorMessage, responses };
  }

  // Sem resposta segura: encaminha para humano
  const fallbackText =
    config.defaultFallbackMessage ||
    "Nao encontrei uma resposta segura para essa pergunta. Vou encaminhar voce para um atendente.";

  const fallback = await createMessage({
    conversationId: conversation.id,
    senderType: "bot",
    senderName: "Assistente",
    text: fallbackText,
  });

  const handoff = await createMessage({
    conversationId: conversation.id,
    senderType: "system",
    text: "Seu atendimento foi encaminhado para nossa equipe. Aguarde um momento.",
  });

  await touchConversationForMessage(conversation.id, {
    previewText: handoff.text || "",
    incrementVisitorUnread: 2,
    status: "waiting_agent",
  });

  await createNotification({
    conversationId: conversation.id,
    type: "agent_request",
    title: "Cliente solicitou atendente",
    message: `Conversa #${conversation.id} aguardando atendente.`,
    targetRole: "admin",
  });

  responses.push({ type: "fallback", message: fallback });
  responses.push({ type: "handoff", message: handoff });

  return { conversationId: conversation.id, visitorMessage, responses };
}

export async function sendAgentMessage(input: {
  conversationId: number;
  agentUser: string;
  agentName: string;
  text: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const row = await db
    .select()
    .from(onlineSupportConversations)
    .where(eq(onlineSupportConversations.id, input.conversationId))
    .limit(1);

  if (!row[0]) throw new Error("Conversa nao encontrada");

  const message = await createMessage({
    conversationId: input.conversationId,
    senderType: "agent",
    senderId: input.agentUser,
    senderName: input.agentName,
    text: input.text,
  });

  await touchConversationForMessage(input.conversationId, {
    previewText: input.text,
    incrementVisitorUnread: 1,
    status: "waiting_customer",
  });

  await createNotification({
    conversationId: input.conversationId,
    type: "agent_reply",
    title: "Resposta de atendente",
    message: `${input.agentName} respondeu a conversa #${input.conversationId}`,
    targetRole: "admin",
  });

  return message;
}

export async function updateConversationState(input: {
  conversationId: number;
  status?: string;
  assignedAgent?: string | null;
  botPaused?: boolean;
  urgent?: boolean;
  internalNotes?: string;
  labels?: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const current = await db
    .select()
    .from(onlineSupportConversations)
    .where(eq(onlineSupportConversations.id, input.conversationId))
    .limit(1);

  if (!current[0]) throw new Error("Conversa nao encontrada");

  await db
    .update(onlineSupportConversations)
    .set({
      status: input.status || current[0].status,
      assignedAgent: input.assignedAgent === undefined ? current[0].assignedAgent : input.assignedAgent,
      botPaused: input.botPaused === undefined ? current[0].botPaused : input.botPaused ? 1 : 0,
      urgent: input.urgent === undefined ? current[0].urgent : input.urgent ? 1 : 0,
      internalNotes: input.internalNotes === undefined ? current[0].internalNotes : input.internalNotes,
      labels: input.labels ? stringifyJson(input.labels) : current[0].labels,
      closedAt: input.status === "finalized" ? new Date() : current[0].closedAt,
      updatedAt: new Date(),
    })
    .where(eq(onlineSupportConversations.id, input.conversationId));

  const updated = await db
    .select()
    .from(onlineSupportConversations)
    .where(eq(onlineSupportConversations.id, input.conversationId))
    .limit(1);

  return {
    ...updated[0],
    labels: parseJson<string[]>(updated[0].labels, []),
  };
}

export async function markVisitorMessagesRead(conversationId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(onlineSupportMessages)
    .set({ isRead: 1 })
    .where(and(eq(onlineSupportMessages.conversationId, conversationId), eq(onlineSupportMessages.senderType, "agent")));

  const conv = await db
    .select()
    .from(onlineSupportConversations)
    .where(eq(onlineSupportConversations.id, conversationId))
    .limit(1);

  if (conv[0]) {
    await db
      .update(onlineSupportConversations)
      .set({ unreadForVisitor: 0, updatedAt: new Date() })
      .where(eq(onlineSupportConversations.id, conversationId));
  }
}

export async function markAdminMessagesRead(conversationId: number) {
  const db = await getDb();
  if (!db) return;

  const conv = await db
    .select()
    .from(onlineSupportConversations)
    .where(eq(onlineSupportConversations.id, conversationId))
    .limit(1);

  if (conv[0]) {
    await db
      .update(onlineSupportConversations)
      .set({ unreadForAdmin: 0, updatedAt: new Date() })
      .where(eq(onlineSupportConversations.id, conversationId));
  }
}

export async function getUnreadSummary(visitorId: string) {
  const db = await getDb();
  if (!db) return { unreadMessages: 0, openConversationId: null as number | null };

  const row = await db
    .select()
    .from(onlineSupportConversations)
    .where(eq(onlineSupportConversations.visitorId, visitorId))
    .orderBy(desc(onlineSupportConversations.updatedAt))
    .limit(1);

  if (!row[0]) return { unreadMessages: 0, openConversationId: null };

  return {
    unreadMessages: row[0].unreadForVisitor || 0,
    openConversationId: row[0].id,
  };
}

export async function listMenuItems(activeOnly = false) {
  const db = await getDb();
  if (!db) return [];

  const rows = activeOnly
    ? await db
        .select()
        .from(onlineSupportMenuItems)
        .where(eq(onlineSupportMenuItems.isActive, 1))
        .orderBy(asc(onlineSupportMenuItems.sortOrder), asc(onlineSupportMenuItems.id))
    : await db.select().from(onlineSupportMenuItems).orderBy(asc(onlineSupportMenuItems.sortOrder), asc(onlineSupportMenuItems.id));

  return rows.map(row => ({
    ...row,
    actionPayload: parseJson<Record<string, unknown> | null>(row.actionPayloadJson, null),
    subButtons: parseJson<Array<Record<string, unknown>>>(row.subButtonsJson || null, []),
    keywords: parseJson<string[]>(row.keywordsJson || null, []),
  }));
}

export async function saveMenuItem(input: {
  id?: number;
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  actionType: string;
  actionPayload?: Record<string, unknown>;
  responseText?: string;
  subButtons?: Array<Record<string, unknown>>;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  if (input.id) {
    await db
      .update(onlineSupportMenuItems)
      .set({
        title: input.title,
        description: input.description || null,
        icon: input.icon || null,
        color: input.color || null,
        actionType: input.actionType,
        actionPayloadJson: stringifyJson(input.actionPayload || {}),
        responseText: input.responseText || null,
        responseImageUrl: (input as any).responseImageUrl || null,
        keywordsJson: (input as any).keywords && (input as any).keywords.length > 0 ? stringifyJson((input as any).keywords) : null,
        subButtonsJson: input.subButtons && input.subButtons.length > 0 ? stringifyJson(input.subButtons) : null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ? 1 : 0,
        updatedAt: new Date(),
      })
      .where(eq(onlineSupportMenuItems.id, input.id));

    const row = await db.select().from(onlineSupportMenuItems).where(eq(onlineSupportMenuItems.id, input.id)).limit(1);
    return row[0];
  }

  const result = await db.insert(onlineSupportMenuItems).values({
    title: input.title,
    description: input.description || null,
    icon: input.icon || null,
    color: input.color || null,
    actionType: input.actionType,
    actionPayloadJson: stringifyJson(input.actionPayload || {}),
    responseText: input.responseText || null,
    subButtonsJson: input.subButtons && input.subButtons.length > 0 ? stringifyJson(input.subButtons) : null,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive === false ? 0 : 1,
  });

  const id = Number(result[0].insertId);
  const row = await db.select().from(onlineSupportMenuItems).where(eq(onlineSupportMenuItems.id, id)).limit(1);
  return row[0];
}

export async function deleteMenuItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  await db.delete(onlineSupportMenuItems).where(eq(onlineSupportMenuItems.id, id));
  return true;
}

export async function listAutoReplies() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(onlineSupportAutoReplies)
    .orderBy(asc(onlineSupportAutoReplies.priority), desc(onlineSupportAutoReplies.updatedAt));

  return rows.map(row => ({
    ...row,
    relatedQuestions: parseJson<string[]>(row.relatedQuestionsJson, []),
    keywords: parseJson<string[]>(row.keywordsJson, []),
    media: parseJson<Record<string, unknown>>(row.mediaJson, {}),
    buttons: parseJson<Array<Record<string, unknown>>>(row.buttonsJson, []),
  }));
}

export async function saveAutoReply(input: {
  id?: number;
  internalName: string;
  title: string;
  category?: string;
  relatedQuestions?: string[];
  keywords?: string[];
  priority?: number;
  responseText?: string;
  media?: Record<string, unknown>;
  buttons?: Array<Record<string, unknown>>;
  nextStep?: string;
  waitTimeMs?: number;
  isActive?: boolean;
  updatedBy?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const payload = {
    internalName: input.internalName,
    title: input.title,
    category: input.category || null,
    relatedQuestionsJson: stringifyJson(input.relatedQuestions || []),
    keywordsJson: stringifyJson(input.keywords || []),
    priority: input.priority ?? 10,
    responseText: input.responseText || null,
    mediaJson: stringifyJson(input.media || {}),
    buttonsJson: stringifyJson(input.buttons || []),
    nextStep: input.nextStep || null,
    waitTimeMs: input.waitTimeMs ?? 0,
    isActive: input.isActive === false ? 0 : 1,
    updatedBy: input.updatedBy || null,
    updatedAt: new Date(),
  };

  if (input.id) {
    await db.update(onlineSupportAutoReplies).set(payload).where(eq(onlineSupportAutoReplies.id, input.id));
    const row = await db.select().from(onlineSupportAutoReplies).where(eq(onlineSupportAutoReplies.id, input.id)).limit(1);
    return row[0];
  }

  const result = await db.insert(onlineSupportAutoReplies).values(payload);
  const id = Number(result[0].insertId);
  const row = await db.select().from(onlineSupportAutoReplies).where(eq(onlineSupportAutoReplies.id, id)).limit(1);
  return row[0];
}

export async function deleteAutoReply(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  await db.delete(onlineSupportAutoReplies).where(eq(onlineSupportAutoReplies.id, id));
  return true;
}

export async function listKnowledgeBase(status?: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = status
    ? await db
        .select()
        .from(onlineSupportKnowledgeBase)
        .where(eq(onlineSupportKnowledgeBase.status, status))
        .orderBy(asc(onlineSupportKnowledgeBase.priority), desc(onlineSupportKnowledgeBase.updatedAt))
    : await db
        .select()
        .from(onlineSupportKnowledgeBase)
        .orderBy(asc(onlineSupportKnowledgeBase.priority), desc(onlineSupportKnowledgeBase.updatedAt));

  return rows.map(row => ({
    ...row,
    keywords: parseJson<string[]>(row.keywordsJson, []),
    links: parseJson<Array<Record<string, unknown>>>(row.linksJson, []),
    media: parseJson<Record<string, unknown>>(row.mediaJson, {}),
  }));
}

export async function saveKnowledgeBase(input: {
  id?: number;
  title: string;
  category?: string;
  question?: string;
  answer?: string;
  keywords?: string[];
  links?: Array<Record<string, unknown>>;
  media?: Record<string, unknown>;
  priority?: number;
  status?: string;
  author?: string;
  publishNow?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const payload = {
    title: input.title,
    category: input.category || null,
    question: input.question || null,
    answer: input.answer || null,
    keywordsJson: stringifyJson(input.keywords || []),
    linksJson: stringifyJson(input.links || []),
    mediaJson: stringifyJson(input.media || {}),
    priority: input.priority ?? 10,
    status: input.status || "draft",
    publishedAt: input.publishNow ? new Date() : null,
    author: input.author || null,
    updatedAt: new Date(),
  };

  if (input.id) {
    await db.update(onlineSupportKnowledgeBase).set(payload).where(eq(onlineSupportKnowledgeBase.id, input.id));
    const row = await db.select().from(onlineSupportKnowledgeBase).where(eq(onlineSupportKnowledgeBase.id, input.id)).limit(1);
    return row[0];
  }

  const result = await db.insert(onlineSupportKnowledgeBase).values(payload);
  const id = Number(result[0].insertId);
  const row = await db.select().from(onlineSupportKnowledgeBase).where(eq(onlineSupportKnowledgeBase.id, id)).limit(1);
  return row[0];
}

export async function deleteKnowledgeBase(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  await db.delete(onlineSupportKnowledgeBase).where(eq(onlineSupportKnowledgeBase.id, id));
  return true;
}

export async function listFileLibrary() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(onlineSupportFileLibrary).orderBy(desc(onlineSupportFileLibrary.updatedAt));
}

export async function saveFileLibraryItem(input: {
  id?: number;
  title: string;
  description?: string;
  category?: string;
  fileType: string;
  mimeType?: string;
  fileSize?: number;
  url: string;
  thumbnailUrl?: string;
  status?: string;
  uploadedBy?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const payload = {
    title: input.title,
    description: input.description || null,
    category: input.category || null,
    fileType: input.fileType,
    mimeType: input.mimeType || null,
    fileSize: input.fileSize || null,
    url: input.url,
    thumbnailUrl: input.thumbnailUrl || null,
    status: input.status || "active",
    uploadedBy: input.uploadedBy || null,
    updatedAt: new Date(),
  };

  if (input.id) {
    await db.update(onlineSupportFileLibrary).set(payload).where(eq(onlineSupportFileLibrary.id, input.id));
    const row = await db.select().from(onlineSupportFileLibrary).where(eq(onlineSupportFileLibrary.id, input.id)).limit(1);
    return row[0];
  }

  const result = await db.insert(onlineSupportFileLibrary).values(payload);
  const id = Number(result[0].insertId);
  const row = await db.select().from(onlineSupportFileLibrary).where(eq(onlineSupportFileLibrary.id, id)).limit(1);
  return row[0];
}

export async function deleteFileLibraryItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  await db.delete(onlineSupportFileLibrary).where(eq(onlineSupportFileLibrary.id, id));
  return true;
}

export async function listNotifications(limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(onlineSupportNotifications)
    .orderBy(desc(onlineSupportNotifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  await db.update(onlineSupportNotifications).set({ isRead: 1 }).where(eq(onlineSupportNotifications.id, id));
  return true;
}

export async function clearLogs() {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  await db.delete(onlineSupportLogs);
  return true;
}

export async function getDiagnostics() {
  const db = await getDb();
  if (!db) {
    return {
      chatStatus: "offline",
      databaseStatus: "offline",
      realtimeStatus: "polling",
      storageStatus: ENV.r2PublicUrl ? "online" : "not_configured",
      aiStatus: ENV.chatAiEnabled === "true" && ENV.openAiApiKey ? "ready" : "disabled",
      lastError: "Banco indisponivel",
      lastProcessedMessage: null,
      openConversations: 0,
      queueMessages: 0,
      recentLogs: [],
    };
  }

  const cfg = await getOrCreateConfig();
  const logs = await db.select().from(onlineSupportLogs).orderBy(desc(onlineSupportLogs.createdAt)).limit(20);

  const openConversations = await db
    .select({ count: sql<number>`count(*)` })
    .from(onlineSupportConversations)
    .where(
      sql`${onlineSupportConversations.status} in ('new','waiting_agent','in_service','waiting_customer')`,
    );

  const unprocessed = await db
    .select({ count: sql<number>`count(*)` })
    .from(onlineSupportMessages)
    .where(eq(onlineSupportMessages.isDelivered, 0));

  const lastMessage = await db
    .select()
    .from(onlineSupportMessages)
    .orderBy(desc(onlineSupportMessages.createdAt))
    .limit(1);

  const lastError = logs.find(l => l.level === "error");

  return {
    chatStatus: cfg.chatEnabled === 1 && cfg.maintenanceMode === 0 ? "online" : "offline",
    databaseStatus: "online",
    realtimeStatus: "polling",
    storageStatus: ENV.r2PublicUrl ? "online" : "not_configured",
    aiStatus: cfg.aiEnabled === 1 && ENV.chatAiEnabled === "true" && ENV.openAiApiKey ? "ready" : "disabled",
    lastError: lastError?.message || null,
    lastProcessedMessage: lastMessage[0] || null,
    openConversations: Number(openConversations[0]?.count || 0),
    queueMessages: Number(unprocessed[0]?.count || 0),
    recentLogs: logs,
  };
}

export async function getReportSummary(input: { startDate: Date; endDate: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const conversations = await db
    .select()
    .from(onlineSupportConversations)
    .where(
      and(
        gte(onlineSupportConversations.createdAt, input.startDate),
        lte(onlineSupportConversations.createdAt, input.endDate),
      ),
    );

  const messages = await db
    .select()
    .from(onlineSupportMessages)
    .where(and(gte(onlineSupportMessages.createdAt, input.startDate), lte(onlineSupportMessages.createdAt, input.endDate)));

  const fromVisitor = messages.filter(m => m.senderType === "visitor").length;
  const fromBot = messages.filter(m => m.senderType === "bot").length;
  const fromAgent = messages.filter(m => m.senderType === "agent").length;

  const transferToHuman = conversations.filter(c => ["waiting_agent", "in_service"].includes(c.status)).length;
  const finalized = conversations.filter(c => c.status === "finalized").length;

  return {
    totalConversations: conversations.length,
    newCustomers: new Set(conversations.map(c => c.visitorId)).size,
    messagesReceived: fromVisitor,
    messagesSent: fromBot + fromAgent,
    transferToHuman,
    finalized,
    abandoned: Math.max(0, conversations.length - finalized),
    withoutResponse: conversations.filter(c => !c.lastMessageAt).length,
    byOriginPage: conversations.reduce<Record<string, number>>((acc, c) => {
      const key = c.originPage || "desconhecida";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}

export async function updateConfig(input: Partial<typeof onlineSupportConfig.$inferInsert> & { updatedBy?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const current = await getOrCreateConfig();

  await db
    .update(onlineSupportConfig)
    .set({
      ...input,
      updatedBy: input.updatedBy || current.updatedBy,
      updatedAt: new Date(),
    })
    .where(eq(onlineSupportConfig.id, current.id));

  await addLog("info", "chat-config", "config_update", "Configuracoes atualizadas", {
    updatedBy: input.updatedBy || "admin",
  });

  const after = await db.select().from(onlineSupportConfig).where(eq(onlineSupportConfig.id, current.id)).limit(1);
  return after[0];
}

export async function updateBusinessHours(input: Array<{ weekDay: number; openTime?: string | null; closeTime?: string | null; breakStart?: string | null; breakEnd?: string | null; isOpen: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  for (const item of input) {
    const exists = await db
      .select()
      .from(onlineSupportBusinessHours)
      .where(eq(onlineSupportBusinessHours.weekDay, item.weekDay))
      .limit(1);

    if (!exists[0]) {
      await db.insert(onlineSupportBusinessHours).values({
        weekDay: item.weekDay,
        openTime: item.openTime || null,
        closeTime: item.closeTime || null,
        breakStart: item.breakStart || null,
        breakEnd: item.breakEnd || null,
        isOpen: item.isOpen ? 1 : 0,
      });
    } else {
      await db
        .update(onlineSupportBusinessHours)
        .set({
          openTime: item.openTime || null,
          closeTime: item.closeTime || null,
          breakStart: item.breakStart || null,
          breakEnd: item.breakEnd || null,
          isOpen: item.isOpen ? 1 : 0,
          updatedAt: new Date(),
        })
        .where(eq(onlineSupportBusinessHours.weekDay, item.weekDay));
    }
  }

  return getBusinessHours();
}

export async function listAgents() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(onlineSupportAgents).orderBy(asc(onlineSupportAgents.displayName));
  return rows.map(row => ({
    ...row,
    permissions: parseJson<string[]>(row.permissionsJson, []),
  }));
}

export async function saveAgent(input: {
  id?: number;
  username: string;
  displayName?: string;
  role: string;
  permissions?: string[];
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");

  const payload = {
    username: input.username,
    displayName: input.displayName || null,
    role: input.role,
    permissionsJson: stringifyJson(input.permissions || []),
    isActive: input.isActive === false ? 0 : 1,
    updatedAt: new Date(),
  };

  if (input.id) {
    await db.update(onlineSupportAgents).set(payload).where(eq(onlineSupportAgents.id, input.id));
    const row = await db.select().from(onlineSupportAgents).where(eq(onlineSupportAgents.id, input.id)).limit(1);
    return row[0];
  }

  const result = await db.insert(onlineSupportAgents).values(payload);
  const id = Number(result[0].insertId);
  const row = await db.select().from(onlineSupportAgents).where(eq(onlineSupportAgents.id, id)).limit(1);
  return row[0];
}

export async function deleteAgent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponivel");
  await db.delete(onlineSupportAgents).where(eq(onlineSupportAgents.id, id));
  return true;
}
