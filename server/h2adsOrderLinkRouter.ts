import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure } from "./_core/trpc";
import { listH2AdsOrderLinks, searchH2AdsCustomersForNewInstance, setH2AdsOrderLink } from "./h2adsOrderLink";

const setOrderLinkSchema = z.object({
  instanceId: z.number().int().positive(),
  registrationId: z.number().int().positive().nullable(),
  subOrderIndex: z.number().int().min(0).default(0),
}).strict();

const searchNewInstanceCustomerSchema = z.object({
  search: z.string().trim().min(1).max(128),
}).strict();

export const h2AdsOrderLinkRouterPart = {
  listOrderLinks: adminProcedure.query(async () => listH2AdsOrderLinks()),
  searchCustomersForNewInstance: adminProcedure.input(searchNewInstanceCustomerSchema).query(async ({ input }) => {
    return searchH2AdsCustomersForNewInstance(input.search);
  }),
  setOrderLink: adminProcedure.input(setOrderLinkSchema).mutation(async ({ input }) => {
    try {
      await setH2AdsOrderLink(input.instanceId, input.registrationId, input.subOrderIndex);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível vincular o pedido à instância.";
      const code = message.includes("outra instância") ? "CONFLICT" : message.includes("não encontrad") ? "NOT_FOUND" : "BAD_REQUEST";
      throw new TRPCError({ code, message });
    }
  }),
};
