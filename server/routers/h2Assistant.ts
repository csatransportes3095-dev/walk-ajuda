import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  cancelAssistantAction,
  getAssistantSettings,
  healthAssistant,
  listAssistantAudit,
  listAssistantConversations,
  listAssistantMessages,
  resolveAssistantUser,
  updateAssistantSettings,
  writeAssistantAudit,
} from "../h2-assistant/service";
import { createNavigationResult, executeReadTool, getNavigationTarget } from "../h2-assistant/tools";
import { processAssistantText, synthesizeAssistantSpeech, transcribeAssistantAudio } from "../h2-assistant/orchestrator";
import { H2_DIAGNOSTIC_EVENTS, h2Diagnostic, h2DiagnosticError } from "../h2-assistant/diagnostics";
import {
  draftCreateAppointment,
  draftCreateEarning,
  draftCreateExpense,
  draftCreateGoal,
  draftCreateQuote,
  executeConfirmedAction,
  getActionPreview,
} from "../h2-assistant/write-actions";

async function contextFromToken(token: string) {
  try {
    return await resolveAssistantUser(token);
  } catch (error: any) {
    throw new TRPCError({ code: "FORBIDDEN", message: error?.message || "Acesso ao H2 Assistente não autorizado." });
  }
}

const conversationField = z.number().int().positive().optional();
const locationStopSchema = z.object({
  address: z.string().min(4).max(500),
  latitude: z.string().max(40).nullable().optional(),
  longitude: z.string().max(40).nullable().optional(),
});

export const h2AssistantRouter = router({
  bootstrap: publicProcedure.input(z.object({ token: z.string().min(20) })).query(async ({ input }) => {
    h2Diagnostic(H2_DIAGNOSTIC_EVENTS.bootstrapStart);
    try {
      const ctx = await contextFromToken(input.token);
      h2Diagnostic(H2_DIAGNOSTIC_EVENTS.authOk, { flow: "bootstrap" });
      const [settings, health, conversations] = await Promise.all([
        getAssistantSettings(ctx),
        healthAssistant(ctx),
        listAssistantConversations(ctx),
      ]);
      h2Diagnostic(H2_DIAGNOSTIC_EVENTS.openAiKeyPresent, { present: health.openAIConfigured });
      h2Diagnostic(H2_DIAGNOSTIC_EVENTS.bootstrapOk, { enabled: health.enabled, voiceEnabled: health.voiceEnabled, openAIConfigured: health.openAIConfigured });
      return {
        user: { id: ctx.userId, name: ctx.client.name, phone: ctx.client.phone },
        settings,
        health,
        conversations,
      };
    } catch (error) {
      h2DiagnosticError(H2_DIAGNOSTIC_EVENTS.bootstrapOk, error, { status: "error" });
      throw error;
    }
  }),

  settings: router({
    get: publicProcedure.input(z.object({ token: z.string().min(20) })).query(async ({ input }) => getAssistantSettings(await contextFromToken(input.token))),
    update: publicProcedure.input(z.object({
      token: z.string().min(20),
      voiceEnabled: z.boolean().optional(),
      speakResponses: z.boolean().optional(),
      dailyRequestLimit: z.number().int().min(10).max(300).optional(),
      dailyAudioSecondsLimit: z.number().int().min(60).max(3600).optional(),
      retentionDays: z.number().int().min(1).max(180).optional(),
    })).mutation(async ({ input }) => {
      const ctx = await contextFromToken(input.token);
      const { token: _token, ...patch } = input;
      return updateAssistantSettings(ctx, {
        ...patch,
        voiceEnabled: patch.voiceEnabled === undefined ? undefined : Number(patch.voiceEnabled),
        speakResponses: patch.speakResponses === undefined ? undefined : Number(patch.speakResponses),
      });
    }),
  }),

  conversations: router({
    list: publicProcedure.input(z.object({ token: z.string().min(20) })).query(async ({ input }) => listAssistantConversations(await contextFromToken(input.token))),
    messages: publicProcedure.input(z.object({ token: z.string().min(20), conversationId: z.number().int().positive() })).query(async ({ input }) => listAssistantMessages(await contextFromToken(input.token), input.conversationId)),
  }),

  tools: router({
    read: publicProcedure.input(z.object({
      token: z.string().min(20),
      tool: z.enum(["finance_today", "finance_month", "goal_month", "private_dashboard", "private_tomorrow", "private_client_search"]),
      search: z.string().max(160).optional(),
    })).query(async ({ input }) => {
      const ctx = await contextFromToken(input.token);
      const result = await executeReadTool(ctx, input.tool, { search: input.search });
      await writeAssistantAudit(ctx, "CONSULTA_EXECUTADA", input.tool, { searchLength: input.search?.length || 0 });
      return result;
    }),
    navigate: publicProcedure.input(z.object({ token: z.string().min(2).max(80), target: z.string().min(2).max(80) })).query(async ({ input }) => {
      const ctx = await contextFromToken(input.token);
      const target = getNavigationTarget(input.target);
      if (!target) throw new TRPCError({ code: "BAD_REQUEST", message: "Não encontrei esse módulo para abrir." });
      const result = createNavigationResult(target);
      await writeAssistantAudit(ctx, "NAVEGACAO_SOLICITADA", "navigate", { target });
      return result;
    }),
  }),

  chat: router({
    send: publicProcedure.input(z.object({
      token: z.string().min(20),
      text: z.string().min(1).max(2_000),
      conversationId: z.number().int().positive().optional(),
    })).mutation(async ({ input }) => {
      const ctx = await contextFromToken(input.token);
      h2Diagnostic(H2_DIAGNOSTIC_EVENTS.authOk, { flow: "chat" });
      try {
        return await processAssistantText(ctx, { text: input.text, conversationId: input.conversationId });
      } catch (error: any) {
        h2DiagnosticError(H2_DIAGNOSTIC_EVENTS.openAiError, error, { operation: "chat" });
        throw new TRPCError({ code: "BAD_REQUEST", message: error?.message || "Não foi possível processar a mensagem." });
      }
    }),
  }),

  voice: router({
    transcribe: publicProcedure.input(z.object({
      token: z.string().min(20),
      audioBase64: z.string().min(20).max(7_000_000),
      mimeType: z.string().min(6).max(80),
      durationSeconds: z.number().positive().max(90),
    })).mutation(async ({ input }) => {
      const ctx = await contextFromToken(input.token);
      h2Diagnostic(H2_DIAGNOSTIC_EVENTS.authOk, { flow: "transcription" });
      h2Diagnostic(H2_DIAGNOSTIC_EVENTS.audioReceived, { mimeType: input.mimeType.split(";")[0], durationSeconds: Math.round(input.durationSeconds), encodedCharacters: input.audioBase64.length });
      try {
        return await transcribeAssistantAudio(ctx, input);
      } catch (error: any) {
        h2DiagnosticError(H2_DIAGNOSTIC_EVENTS.transcriptionError, error, { mimeType: input.mimeType.split(";")[0] });
        throw new TRPCError({ code: "BAD_REQUEST", message: error?.message || "Não foi possível transcrever o áudio." });
      }
    }),
    synthesize: publicProcedure.input(z.object({ token: z.string().min(20), text: z.string().min(1).max(1_000) })).mutation(async ({ input }) => {
      const ctx = await contextFromToken(input.token);
      try {
        return await synthesizeAssistantSpeech(ctx, input.text);
      } catch (error: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error?.message || "Não foi possível gerar a resposta falada." });
      }
    }),
  }),

  actions: router({
    draft: router({
      expense: publicProcedure.input(z.object({
        token: z.string().min(20), conversationId: conversationField, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), category: z.string().min(2).max(60), amount: z.number().positive().max(1_000_000),
      })).mutation(async ({ input }) => draftCreateExpense(await contextFromToken(input.token), input)),
      earning: publicProcedure.input(z.object({
        token: z.string().min(20), conversationId: conversationField, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), category: z.string().min(1).max(60), amount: z.number().positive().max(1_000_000),
      })).mutation(async ({ input }) => draftCreateEarning(await contextFromToken(input.token), input)),
      goal: publicProcedure.input(z.object({
        token: z.string().min(20), conversationId: conversationField, month: z.string().regex(/^\d{4}-\d{2}$/), dailyGoal: z.number().nonnegative().max(1_000_000).optional(), weeklyGoal: z.number().nonnegative().max(1_000_000).optional(), monthlyGoal: z.number().positive().max(1_000_000),
      })).mutation(async ({ input }) => draftCreateGoal(await contextFromToken(input.token), input)),
      appointment: publicProcedure.input(z.object({
        token: z.string().min(20), conversationId: conversationField, clientId: z.number().int().positive(), pickupAddress: z.string().min(4).max(500), pickupLat: z.string().max(40).nullable().optional(), pickupLng: z.string().max(40).nullable().optional(), destinationAddress: z.string().min(4).max(500), destinationLat: z.string().max(40).nullable().optional(), destinationLng: z.string().max(40).nullable().optional(), stops: z.array(locationStopSchema).max(8).optional(), startsAt: z.string().min(16).max(40), durationMinutes: z.number().int().min(10).max(1_440), returnAt: z.string().min(16).max(40).nullable().optional(), tripType: z.enum(["ONE_WAY", "ROUND_TRIP", "RETURN", "IDA_VOLTA"]).optional(), waitMinutes: z.number().int().min(0).max(1_440).optional(), estimatedDistanceKm: z.number().nonnegative().max(10_000).optional(), estimatedCost: z.number().nonnegative().max(1_000_000).optional(), finalPrice: z.number().nonnegative().max(1_000_000).optional(), recurrenceRule: z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(), recurrenceUntil: z.string().min(16).max(40).nullable().optional(),
      })).mutation(async ({ input }) => draftCreateAppointment(await contextFromToken(input.token), input)),
      quote: publicProcedure.input(z.object({
        token: z.string().min(20), conversationId: conversationField, clientId: z.number().int().positive(), pickupAddress: z.string().min(4).max(500), pickupLat: z.string().max(40).nullable().optional(), pickupLng: z.string().max(40).nullable().optional(), destinationAddress: z.string().min(4).max(500), destinationLat: z.string().max(40).nullable().optional(), destinationLng: z.string().max(40).nullable().optional(), stops: z.array(locationStopSchema).max(8).optional(), appointmentAt: z.string().min(16).max(40).nullable().optional(), returnAt: z.string().min(16).max(40).nullable().optional(), tripType: z.string().max(40).optional(), waitMinutes: z.number().int().min(0).max(1_440).optional(), distanceToPickupKm: z.number().nonnegative().max(10_000).optional(), passengerDistanceKm: z.number().nonnegative().max(10_000).optional(), totalDistanceKm: z.number().nonnegative().max(10_000).optional(), estimatedDurationMinutes: z.number().int().min(0).max(1_440).optional(), estimatedFuelCost: z.number().nonnegative().max(1_000_000).optional(), estimatedTolls: z.number().nonnegative().max(1_000_000).optional(), estimatedParking: z.number().nonnegative().max(1_000_000).optional(), estimatedOtherCosts: z.number().nonnegative().max(1_000_000).optional(), estimatedCost: z.number().nonnegative().max(1_000_000).optional(), recommendedPrice: z.number().nonnegative().max(1_000_000).optional(), finalPrice: z.number().positive().max(1_000_000), notes: z.string().max(1_000).optional(),
      })).mutation(async ({ input }) => draftCreateQuote(await contextFromToken(input.token), input)),
    }),
    get: publicProcedure.input(z.object({ token: z.string().min(20), actionId: z.number().int().positive() })).query(async ({ input }) => getActionPreview(await contextFromToken(input.token), input.actionId)),
    confirm: publicProcedure.input(z.object({ token: z.string().min(20), actionId: z.number().int().positive() })).mutation(async ({ input }) => executeConfirmedAction(await contextFromToken(input.token), input.actionId)),
    cancel: publicProcedure.input(z.object({ token: z.string().min(20), actionId: z.number().int().positive() })).mutation(async ({ input }) => cancelAssistantAction(await contextFromToken(input.token), input.actionId)),
  }),

  audit: publicProcedure.input(z.object({ token: z.string().min(20) })).query(async ({ input }) => listAssistantAudit(await contextFromToken(input.token))),
});
