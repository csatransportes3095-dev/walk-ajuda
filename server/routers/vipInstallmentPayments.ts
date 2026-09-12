import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  confirmVipInstallmentPayment,
  getVipInstallmentCustomerPlans,
  listVipInstallmentReceivables,
  quoteVipInstallmentOffer,
  rejectVipInstallmentProof,
  resolveVipInstallmentOffer,
  submitVipInstallmentProof,
} from "../vipInstallmentContractService";

const itemReference = z.object({
  productId: z.number().int().positive(),
  optionId: z.number().int().positive(),
  priceModelId: z.number().int().positive().nullable().optional(),
  warrantyTierId: z.number().int().positive().nullable().optional(),
});

export const vipInstallmentPaymentsRouter = router({
  offer: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      item: itemReference,
      couponCode: z.string().trim().max(64).optional(),
    }))
    .query(async ({ input }) => resolveVipInstallmentOffer(input)),

  quote: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      item: itemReference,
      couponCode: z.string().trim().max(64).optional(),
      installmentCount: z.number().int().min(2).max(120),
      frequency: z.enum(["daily", "weekly", "monthly"]),
    }))
    .query(async ({ input }) => quoteVipInstallmentOffer(input)),

  myPlans: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
    }))
    .query(async ({ input }) => getVipInstallmentCustomerPlans(input)),

  submitProof: publicProcedure
    .input(z.object({
      cpToken: z.string().min(32),
      phone: z.string().min(8).max(32).optional(),
      installmentId: z.number().int().positive(),
      proofUrl: z.string().min(1).max(2048),
      proofMimeType: z.string().max(128).nullable().optional(),
    }))
    .mutation(async ({ input }) => submitVipInstallmentProof(input)),

  adminReceivables: adminProcedure.query(async () => listVipInstallmentReceivables()),

  confirmPayment: adminProcedure
    .input(z.object({ installmentId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => confirmVipInstallmentPayment({
      installmentId: input.installmentId,
      actorId: String((ctx as any)?.user?.id || (ctx as any)?.user?.name || "admin"),
    })),

  rejectProof: adminProcedure
    .input(z.object({
      installmentId: z.number().int().positive(),
      reason: z.string().trim().min(2).max(500),
    }))
    .mutation(async ({ input, ctx }) => rejectVipInstallmentProof({
      installmentId: input.installmentId,
      reason: input.reason,
      actorId: String((ctx as any)?.user?.id || (ctx as any)?.user?.name || "admin"),
    })),
});
