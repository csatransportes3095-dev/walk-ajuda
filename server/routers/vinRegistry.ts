import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { assertValidVinReservationBatch, reserveVinBatch } from "../vinRegistryCore";

// Limite defensivo por IP: a rota é pública, assim como o gerador de chassis.
const rateByIp = new Map<string, { used: number; expiresAt: number }>();
const MAX_VINS_PER_MINUTE = 300;

function checkVinRateLimit(ip: string, amount: number): void {
  const now = Date.now();
  if (rateByIp.size > 10000) {
    for (const [key, item] of rateByIp) {
      if (item.expiresAt <= now) rateByIp.delete(key);
    }
  }

  const current = rateByIp.get(ip);
  const entry = !current || current.expiresAt <= now
    ? { used: 0, expiresAt: now + 60_000 }
    : current;

  if (entry.used + amount > MAX_VINS_PER_MINUTE) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Muitas gerações em sequência. Tente novamente em um minuto.",
    });
  }
  entry.used += amount;
  rateByIp.set(ip, entry);
}

export const vinRegistryRouter = router({
  reserve: publicProcedure
    .input(z.object({
      vins: z.array(z.string().min(17).max(17)).min(1).max(10),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        assertValidVinReservationBatch(input.vins);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Chassi inválido.",
        });
      }

      checkVinRateLimit(ctx.req.ip || ctx.req.socket.remoteAddress || "unknown", input.vins.length);

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Verificação permanente de chassis indisponível. Nenhum novo número foi liberado.",
        });
      }

      try {
        return await db.transaction(async tx => reserveVinBatch(input.vins, async vin => {
          // MySQL/InnoDB + PRIMARY KEY(vin): duas solicitações simultâneas
          // não conseguem registrar o mesmo VIN. Sem consulta/insert separados.
          const result = await tx.execute(sql`INSERT IGNORE INTO h2_generated_vin_registry (vin) VALUES (${vin})`);
          const header = Array.isArray(result) ? result[0] : null;
          const affectedRows = header && typeof header === "object"
            ? (header as { affectedRows?: unknown }).affectedRows
            : undefined;

          if (affectedRows === 1) return true;
          if (affectedRows === 0) return false;
          throw new Error("Resposta inesperada ao registrar VIN.");
        }));
      } catch (error) {
        console.error("[vin-registry] Falha ao reservar VIN:", error instanceof Error ? error.message : "erro desconhecido");
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Não foi possível conferir os chassis no banco. Nenhum novo número foi liberado.",
        });
      }
    }),
});
