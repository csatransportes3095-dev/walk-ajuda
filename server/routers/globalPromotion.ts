import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getSetting, upsertSetting } from "../db";
import { GLOBAL_PROMOTION_KEY, parseGlobalPromotionConfig } from "../../shared/globalPromotion";

export const globalPromotionRouter = router({
  get: publicProcedure.query(async () => parseGlobalPromotionConfig(await getSetting(GLOBAL_PROMOTION_KEY))),
  save: adminProcedure
    .input(z.object({
      active: z.boolean(),
      type: z.enum(["percentage", "fixed"]),
      value: z.number().finite().positive().max(100000),
    }))
    .mutation(async ({ input }) => {
      if (input.type === "percentage" && input.value > 100) {
        throw new Error("O desconto percentual não pode superar 100%.");
      }
      const config = {
        ...input,
        revision: Date.now().toString(36),
        updatedAt: new Date().toISOString(),
      };
      await upsertSetting(GLOBAL_PROMOTION_KEY, JSON.stringify(config));
      return config;
    }),
});
