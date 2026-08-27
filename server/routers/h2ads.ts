import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createH2AdsGroup,
  createH2AdsInstance,
  getH2AdsGroup,
  getH2AdsInstance,
  listH2AdsDashboard,
  saveH2AdsNetworkProfile,
  updateH2AdsGroup,
  updateH2AdsInstance,
} from "../h2ads";
import { adminProcedure } from "../_core/trpc";

export const h2AdsGroupStatusSchema = z.enum(["active", "archived"]);
export const h2AdsInstanceStatusSchema = z.enum(["draft", "paused", "archived"]);
export const h2AdsNetworkSetupStatusSchema = z.enum(["not_configured", "metadata_ready", "blocked"]);

const optionalMetadata = (max: number) => z.string().trim().max(max).nullable().optional();

export const h2AdsCreateGroupSchema = z.object({
  name: z.string().trim().min(2).max(128),
  description: z.string().trim().max(2_000).nullable().optional(),
  status: h2AdsGroupStatusSchema.optional().default("active"),
  sortOrder: z.number().int().min(0).max(100_000).optional().default(0),
}).strict();

export const h2AdsUpdateGroupSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(2).max(128).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  status: h2AdsGroupStatusSchema.optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
}).strict().refine(({ id: _id, ...changes }) => Object.values(changes).some(value => value !== undefined), {
  message: "Informe ao menos um campo para atualizar o grupo.",
});

export const h2AdsCreateInstanceSchema = z.object({
  groupId: z.number().int().positive(),
  name: z.string().trim().min(2).max(128),
  status: h2AdsInstanceStatusSchema.optional().default("draft"),
  notes: z.string().trim().max(4_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional().default(0),
}).strict();

export const h2AdsUpdateInstanceSchema = z.object({
  id: z.number().int().positive(),
  groupId: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(128).optional(),
  status: h2AdsInstanceStatusSchema.optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
}).strict().refine(({ id: _id, ...changes }) => Object.values(changes).some(value => value !== undefined), {
  message: "Informe ao menos um campo para atualizar a instância.",
});

export const h2AdsSaveNetworkProfileSchema = z.object({
  instanceId: z.number().int().positive(),
  providerName: optionalMetadata(128),
  routeLabel: optionalMetadata(128),
  targetCountryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
  targetCity: optionalMetadata(128),
  expectedIsp: optionalMetadata(256),
  expectedAsn: optionalMetadata(32),
  setupStatus: h2AdsNetworkSetupStatusSchema,
}).strict().refine(({ instanceId: _instanceId, ...changes }) => Object.values(changes).some(value => value !== undefined), {
  message: "Informe ao menos um metadado de conectividade para salvar.",
}).refine((input) => input.setupStatus !== "metadata_ready" || Boolean(input.providerName && input.routeLabel && input.targetCountryCode && input.targetCity), {
  message: "Para marcar metadados como prontos, informe fornecedor, rótulo, país e cidade planejados.",
});

async function requireWritableGroup(groupId: number) {
  const group = await getH2AdsGroup(groupId);
  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Grupo H2 Ads não encontrado." });
  }
  if (group.status === "archived") {
    throw new TRPCError({ code: "CONFLICT", message: "Não é possível adicionar ou mover instâncias para um grupo arquivado." });
  }
  return group;
}

async function requireConfigurableInstance(instanceId: number) {
  const instance = await getH2AdsInstance(instanceId);
  if (!instance) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Instância H2 Ads não encontrada." });
  }
  if (instance.status === "archived") {
    throw new TRPCError({ code: "CONFLICT", message: "Não é possível configurar uma instância arquivada." });
  }
  await requireWritableGroup(instance.groupId);
  return instance;
}

export const h2AdsRouter = {
  listDashboard: adminProcedure.query(async () => listH2AdsDashboard()),

  createGroup: adminProcedure.input(h2AdsCreateGroupSchema).mutation(async ({ input }) => {
    const id = await createH2AdsGroup(input);
    return { success: true, id };
  }),

  updateGroup: adminProcedure.input(h2AdsUpdateGroupSchema).mutation(async ({ input }) => {
    const { id, ...changes } = input;
    const updated = await updateH2AdsGroup(id, changes);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Grupo H2 Ads não encontrado." });
    return { success: true };
  }),

  createInstance: adminProcedure.input(h2AdsCreateInstanceSchema).mutation(async ({ input }) => {
    await requireWritableGroup(input.groupId);
    const id = await createH2AdsInstance(input);
    return { success: true, id };
  }),

  updateInstance: adminProcedure.input(h2AdsUpdateInstanceSchema).mutation(async ({ input }) => {
    const { id, groupId, ...changes } = input;
    if (groupId !== undefined) await requireWritableGroup(groupId);
    const updated = await updateH2AdsInstance(id, { ...changes, ...(groupId === undefined ? {} : { groupId }) });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Instância H2 Ads não encontrada." });
    return { success: true };
  }),

  saveNetworkProfile: adminProcedure.input(h2AdsSaveNetworkProfileSchema).mutation(async ({ input }) => {
    const { instanceId, ...profile } = input;
    await requireConfigurableInstance(instanceId);
    await saveH2AdsNetworkProfile(instanceId, profile);
    return { success: true };
  }),
};
