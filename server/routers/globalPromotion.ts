import { z } from "zod";
import { randomUUID } from "node:crypto";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getSetting, upsertSetting } from "../db";
import { GLOBAL_PROMOTION_KEY, parseGlobalPromotionConfig, isValidGlobalPromotionSchedule } from "../../shared/globalPromotion";

export const globalPromotionRouter = router({
  get: publicProcedure.query(async () => parseGlobalPromotionConfig(await getSetting(GLOBAL_PROMOTION_KEY))),
  save: adminProcedure
    .input(z.object({
      active: z.boolean(),
      type: z.enum(["percentage", "fixed"]),
      value: z.number().finite().positive().max(100000),
      schedule: z.union([
        z.null(),
        z.object({ mode: z.literal("period"), startAt: z.string(), endAt: z.string() }).strict(),
        z.object({ mode: z.literal("weekly_windows"), windows: z.array(z.object({ startDay: z.number().int().min(0).max(6), startTime: z.string(), endDay: z.number().int().min(0).max(6), endTime: z.string() }).strict()).min(1).max(28) }).strict(),
        z.object({ mode: z.literal("weekly"), weekdays: z.array(z.number().int().min(0).max(6)), startTime: z.string(), endTime: z.string(), startsOn: z.string().optional(), endsOn: z.string().optional() }).strict(),
      ]).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.type === "percentage" && input.value > 100) {
        throw new Error("O desconto percentual não pode superar 100%.");
      }
      if (input.schedule && !isValidGlobalPromotionSchedule(input.schedule)) throw new Error("Confira datas, dias e horários da programação.");
      const previous = parseGlobalPromotionConfig(await getSetting(GLOBAL_PROMOTION_KEY));
      const config = {
        ...previous,
        ...input,
        schedule: input.schedule === undefined ? previous.schedule ?? null : input.schedule,
        revision: randomUUID(),
        updatedAt: new Date().toISOString(),
      };
      await upsertSetting(GLOBAL_PROMOTION_KEY, JSON.stringify(config));
      const confirmed = parseGlobalPromotionConfig(await getSetting(GLOBAL_PROMOTION_KEY));
      if (confirmed.revision !== config.revision || confirmed.active !== config.active ||
          confirmed.type !== config.type || confirmed.value !== config.value ||
          JSON.stringify(confirmed.schedule ?? null) !== JSON.stringify(config.schedule ?? null)) {
        throw new Error("A promoção não foi confirmada no banco. Confira a configuração antes de tentar novamente.");
      }
      return confirmed;
    }),
});
