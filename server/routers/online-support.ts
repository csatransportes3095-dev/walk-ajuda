import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { onlineSupportConversations } from "../../drizzle/schema";
import { requireOnlineEntrySession } from "../online-support/entry";
import { CUSTOMER_ROUTES, requestCustomerRouteAccess } from "../customerAccess";
import { cancelOnlineRegistrationDraft, findOnlineRegistrationIdentity, getOnlineRegistrationDraft, saveOnlineRegistrationDraft } from "../online-support/registration";
import {
  clearLogs,
  deleteAgent,
  deleteAutoReply,
  deleteFileLibraryItem,
  deleteKnowledgeBase,
  deleteMenuItem,
  getBusinessHours,
  getDiagnostics,
  getOrCreateConfig,
  getPublicState,
  getReportSummary,
  getUnreadSummary,
  getOrCreateConversation,
  listAgents,
  listAutoReplies,
  listConversations,
  listFileLibrary,
  listKnowledgeBase,
  listMenuItems,
  listMessages,
  listNotifications,
  markAdminMessagesRead,
  markNotificationRead,
  markVisitorMessagesRead,
  saveAgent,
  saveAutoReply,
  saveFileLibraryItem,
  saveKnowledgeBase,
  saveMenuItem,
  sendAgentMessage,
  sendVisitorMessage,
  testAutoReply,
  updateBusinessHours,
  updateConfig,
  updateConversationState,
  upsertVisitor,
} from "../online-support/service";

const buttonSchema = z.object({
  label: z.string().min(1),
  actionType: z.string().min(1),
  actionPayload: z.record(z.string(), z.unknown()).optional(),
});

const mediaSchema = z.object({
  imageUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  audioUrl: z.string().optional(),
  documentUrl: z.string().optional(),
  linkUrl: z.string().optional(),
});

async function ensureConversationOwnership(conversationId: number, visitorId: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponivel" });

  const row = await db
    .select()
    .from(onlineSupportConversations)
    .where(and(eq(onlineSupportConversations.id, conversationId), eq(onlineSupportConversations.visitorId, visitorId)))
    .limit(1);

  if (!row[0]) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Conversa nao pertence a este visitante" });
  }

  return row[0];
}

export const onlineSupportRouter = router({
  entrySession: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const session = await requireOnlineEntrySession(input.token);
        return { authenticated: true, customer: session };
      } catch (error: any) {
        return { authenticated: false, message: error?.message || 'Sessão inválida.' };
      }
    }),

  entryRequestRoute: publicProcedure
    .input(z.object({ token: z.string().min(1), route: z.enum(CUSTOMER_ROUTES) }))
    .mutation(async ({ input }) => {
      const session = await requireOnlineEntrySession(input.token);
      const request = await requestCustomerRouteAccess(session.customerId, input.route);
      return { success: true, ...request, customerId: session.customerId };
    }),

  registrationDraftGet: publicProcedure
    .input(z.object({ conversationId: z.number().int().positive(), visitorId: z.string().min(8) }))
    .query(async ({ input }) => getOnlineRegistrationDraft(input.conversationId, input.visitorId)),

  registrationDraftSave: publicProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      visitorId: z.string().min(8),
      requestedRoute: z.enum(CUSTOMER_ROUTES),
      step: z.enum(['route', 'identity', 'name', 'phone', 'cpf', 'email', 'cep', 'uf', 'city', 'referrer', 'photo', 'confirm']),
      field: z.string().optional(),
      value: z.string().optional(),
      data: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => saveOnlineRegistrationDraft(input)),

  registrationFindExisting: publicProcedure
    .input(z.object({ phone: z.string().optional(), cpf: z.string().optional(), email: z.string().optional() }))
    .query(async ({ input }) => findOnlineRegistrationIdentity(input)),

  registrationDraftCancel: publicProcedure
    .input(z.object({ conversationId: z.number().int().positive(), visitorId: z.string().min(8) }))
    .mutation(async ({ input }) => cancelOnlineRegistrationDraft(input.conversationId, input.visitorId)),

  publicState: publicProcedure
    .input(z.object({ pathname: z.string().default("/") }))
    .query(async ({ input }) => {
      return getPublicState(input.pathname || "/");
    }),

  startConversation: publicProcedure
    .input(
      z.object({
        visitorId: z.string().min(8),
        visitorName: z.string().optional(),
        visitorPhone: z.string().optional(),
        visitorEmail: z.string().optional(),
        originPage: z.string().optional(),
        privacyConsent: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await upsertVisitor({
        visitorId: input.visitorId,
        name: input.visitorName,
        phone: input.visitorPhone,
        email: input.visitorEmail,
        originPage: input.originPage,
        privacyConsent: input.privacyConsent ?? true,
      });

      const conversation = await getOrCreateConversation({
        visitorId: input.visitorId,
        visitorName: input.visitorName,
        visitorPhone: input.visitorPhone,
        visitorEmail: input.visitorEmail,
        originPage: input.originPage,
      });

      return conversation;
    }),

  unreadSummary: publicProcedure
    .input(z.object({ visitorId: z.string().min(8) }))
    .query(async ({ input }) => {
      return getUnreadSummary(input.visitorId);
    }),

  listMessages: publicProcedure
    .input(z.object({ conversationId: z.number().int().positive(), visitorId: z.string().min(8), limit: z.number().int().min(1).max(300).default(120) }))
    .query(async ({ input }) => {
      await ensureConversationOwnership(input.conversationId, input.visitorId);
      return listMessages(input.conversationId, input.limit);
    }),

  sendVisitorMessage: publicProcedure
    .input(
      z.object({
        visitorId: z.string().min(8),
        conversationId: z.number().int().positive().optional(),
        visitorName: z.string().optional(),
        visitorPhone: z.string().optional(),
        visitorEmail: z.string().optional(),
        originPage: z.string().optional(),
        text: z.string().min(1).max(5000),
        dedupeKey: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.conversationId) {
        await ensureConversationOwnership(input.conversationId, input.visitorId);
      }

      return sendVisitorMessage(input);
    }),

  markVisitorRead: publicProcedure
    .input(z.object({ conversationId: z.number().int().positive(), visitorId: z.string().min(8) }))
    .mutation(async ({ input }) => {
      await ensureConversationOwnership(input.conversationId, input.visitorId);
      await markVisitorMessagesRead(input.conversationId);
      return { success: true };
    }),

  adminConfigGet: adminProcedure.query(async () => {
    return getOrCreateConfig();
  }),

  adminConfigUpdate: adminProcedure
    .input(
      z.object({
        chatEnabled: z.boolean().optional(),
        welcomeButtonEnabled: z.boolean().optional(),
        floatingBubbleEnabled: z.boolean().optional(),
        autoReplyEnabled: z.boolean().optional(),
        aiEnabled: z.boolean().optional(),
        humanSupportEnabled: z.boolean().optional(),
        fileUploadEnabled: z.boolean().optional(),
        notificationsEnabled: z.boolean().optional(),
        maintenanceMode: z.boolean().optional(),
        allowedPages: z.array(z.string()).optional(),
        buttonSortOrder: z.number().optional(),
        buttonLabel: z.string().optional(),
        buttonDescription: z.string().optional(),
        customStatusText: z.string().optional(),
        buttonIcon: z.string().optional(),
        buttonColor: z.string().optional(),
        openMode: z.enum(["modal", "sidebar", "fullscreen"]).optional(),
        disabledMessage: z.string().optional(),
        welcomeMessage: z.string().optional(),
        outOfHoursMessage: z.string().optional(),
        defaultFallbackMessage: z.string().optional(),
        aiProvider: z.string().optional(),
        aiModel: z.string().optional(),
        aiTone: z.string().optional(),
        aiMaxTokens: z.number().optional(),
        aiErrorMessage: z.string().optional(),
        blockedTopics: z.array(z.string()).optional(),
        handoffRule: z.string().optional(),
        privacyConsentText: z.string().optional(),
        updatedBy: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const payload: Record<string, unknown> = {};

      const boolKeys = [
        "chatEnabled",
        "welcomeButtonEnabled",
        "floatingBubbleEnabled",
        "autoReplyEnabled",
        "aiEnabled",
        "humanSupportEnabled",
        "fileUploadEnabled",
        "notificationsEnabled",
        "maintenanceMode",
      ] as const;

      for (const key of boolKeys) {
        if (input[key] !== undefined) payload[key] = input[key] ? 1 : 0;
      }

      if (input.allowedPages) payload.allowedPages = JSON.stringify(input.allowedPages);
      if (input.blockedTopics) payload.blockedTopics = JSON.stringify(input.blockedTopics);

      const scalarKeys = [
        "buttonSortOrder",
        "buttonLabel",
        "buttonDescription",
        "customStatusText",
        "buttonIcon",
        "buttonColor",
        "openMode",
        "disabledMessage",
        "welcomeMessage",
        "outOfHoursMessage",
        "defaultFallbackMessage",
        "aiProvider",
        "aiModel",
        "aiTone",
        "aiMaxTokens",
        "aiErrorMessage",
        "handoffRule",
        "privacyConsentText",
      ] as const;

      for (const key of scalarKeys) {
        if (input[key] !== undefined) payload[key] = input[key];
      }

      return updateConfig({ ...payload, updatedBy: input.updatedBy || "admin" });
    }),

  adminBusinessHoursList: adminProcedure.query(async () => {
    return getBusinessHours();
  }),

  adminBusinessHoursUpdate: adminProcedure
    .input(
      z.array(
        z.object({
          weekDay: z.number().min(0).max(6),
          openTime: z.string().nullable().optional(),
          closeTime: z.string().nullable().optional(),
          breakStart: z.string().nullable().optional(),
          breakEnd: z.string().nullable().optional(),
          isOpen: z.boolean(),
        }),
      ),
    )
    .mutation(async ({ input }) => {
      return updateBusinessHours(input);
    }),

  adminConversationsList: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return listConversations(input?.status);
    }),

  adminConversationMessages: adminProcedure
    .input(z.object({ conversationId: z.number().int().positive(), limit: z.number().int().min(1).max(300).default(150) }))
    .query(async ({ input }) => {
      return listMessages(input.conversationId, input.limit);
    }),

  adminSendMessage: adminProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        agentUser: z.string().min(1),
        agentName: z.string().min(1),
        text: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ input }) => {
      return sendAgentMessage(input);
    }),

  adminConversationUpdate: adminProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        status: z
          .enum(["new", "waiting_agent", "in_service", "waiting_customer", "finalized", "blocked"])
          .optional(),
        assignedAgent: z.string().nullable().optional(),
        botPaused: z.boolean().optional(),
        urgent: z.boolean().optional(),
        internalNotes: z.string().optional(),
        labels: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return updateConversationState(input);
    }),

  adminMarkRead: adminProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await markAdminMessagesRead(input.conversationId);
      return { success: true };
    }),

  adminMenuList: adminProcedure.query(async () => listMenuItems(false)),

  adminMenuSave: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        actionType: z.string().min(1),
        actionPayload: z.record(z.string(), z.unknown()).optional(),
        responseText: z.string().optional(),
        responseImageUrl: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        subButtons: z.array(z.object({
          label: z.string(),
          actionType: z.string(),
          actionPayload: z.record(z.string(), z.unknown()).optional(),
        })).optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => saveMenuItem(input)),

  adminMenuDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => deleteMenuItem(input.id)),

  adminAutoRepliesList: adminProcedure.query(async () => listAutoReplies()),

  adminAutoRepliesSave: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        internalName: z.string().min(1),
        title: z.string().min(1),
        category: z.string().optional(),
        relatedQuestions: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional(),
        priority: z.number().optional(),
        responseText: z.string().optional(),
        media: mediaSchema.optional(),
        buttons: z.array(buttonSchema).optional(),
        nextStep: z.string().optional(),
        waitTimeMs: z.number().optional(),
        isActive: z.boolean().optional(),
        updatedBy: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => saveAutoReply(input)),

  adminAutoRepliesDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => deleteAutoReply(input.id)),

  adminAutoRepliesTest: adminProcedure
    .input(z.object({ question: z.string().min(1) }))
    .query(async ({ input }) => testAutoReply(input.question)),

  adminKnowledgeBaseList: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => listKnowledgeBase(input?.status)),

  adminKnowledgeBaseSave: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        title: z.string().min(1),
        category: z.string().optional(),
        question: z.string().optional(),
        answer: z.string().optional(),
        keywords: z.array(z.string()).optional(),
        links: z.array(z.record(z.string(), z.unknown())).optional(),
        media: mediaSchema.optional(),
        priority: z.number().optional(),
        status: z.string().optional(),
        author: z.string().optional(),
        publishNow: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => saveKnowledgeBase(input)),

  adminKnowledgeBaseDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => deleteKnowledgeBase(input.id)),

  adminFilesList: adminProcedure.query(async () => listFileLibrary()),

  adminFilesSave: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        fileType: z.string().min(1),
        mimeType: z.string().optional(),
        fileSize: z.number().optional(),
        url: z.string().min(1),
        thumbnailUrl: z.string().optional(),
        status: z.string().optional(),
        uploadedBy: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => saveFileLibraryItem(input)),

  adminFilesDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => deleteFileLibraryItem(input.id)),

  adminAgentsList: adminProcedure.query(async () => listAgents()),

  adminAgentsSave: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        username: z.string().min(1),
        displayName: z.string().optional(),
        role: z.enum(["superadmin", "admin", "attendant", "viewer"]),
        permissions: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => saveAgent(input)),

  adminAgentsDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => deleteAgent(input.id)),

  adminNotificationsList: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(50) }).optional())
    .query(async ({ input }) => listNotifications(input?.limit || 50)),

  adminNotificationsMarkRead: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => markNotificationRead(input.id)),

  adminReportsSummary: adminProcedure
    .input(z.object({ startDate: z.coerce.date(), endDate: z.coerce.date() }))
    .query(async ({ input }) => getReportSummary(input)),

  adminDiagnosticsGet: adminProcedure.query(async () => getDiagnostics()),

  adminDiagnosticsClearLogs: adminProcedure.mutation(async () => clearLogs()),
});
