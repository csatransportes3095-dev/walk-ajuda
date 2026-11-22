import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { customerPasswordSessions } from "../../drizzle/schema";
import { BOT_EVENTS, BOT_PHASES, recordColombiaBotEvent, getColombiaBotDiagnostics } from "../colombiaBotReliability";

// Telemetria opt-in da sessão autenticada. Não recebe telefone, IP, CPF nem respostas.
export const colombiaBotDiagnosticsRouter = router({
  record: publicProcedure.input(z.object({
    sessionId: z.string().uuid(),
    phase: z.enum(BOT_PHASES),
    eventCode: z.enum(BOT_EVENTS),
    cpToken: z.string().min(20).max(200),
  })).mutation(async ({ input }) => {
    try {
      const db = await getDb();
      if (!db) return { accepted: false };
      const sessions = await db.select({ expiresAt: customerPasswordSessions.expiresAt })
        .from(customerPasswordSessions)
        .where(eq(customerPasswordSessions.token, input.cpToken))
        .limit(1);
      if (!sessions[0] || new Date(sessions[0].expiresAt) <= new Date()) {
        return { accepted: false };
      }
      const accepted = await recordColombiaBotEvent(db, {
        eventId: crypto.randomUUID(),
        sessionId: input.sessionId,
        phase: input.phase,
        eventCode: input.eventCode,
      });
      return { accepted };
    } catch (error) {
      console.warn("[ColombiaBot] Telemetria indisponível:", error instanceof Error ? error.message : "erro");
      return { accepted: false };
    }
  }),

  overview: adminProcedure.query(async () => {
    try {
      const db = await getDb();
      if (!db) return { available: false as const, message: "Banco indisponível." };
      const data = await getColombiaBotDiagnostics(db);
      return { available: true as const, ...data };
    } catch (error) {
      console.warn("[ColombiaBot] Consulta de diagnóstico indisponível:", error instanceof Error ? error.message : "erro");
      return { available: false as const, message: "Diagnósticos indisponíveis; os pedidos continuam funcionando." };
    }
  }),
});
