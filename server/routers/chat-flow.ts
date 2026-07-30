import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import {
  listAllFlowNodes,
  listFlowNodes,
  saveFlowNode,
  deleteFlowNode,
  getFlowNode,
  getNodeChildren,
} from "../chat-flow/service";

export const chatFlowRouter = router({
  // Admin: listar todos os nós
  adminListAll: adminProcedure.query(async () => listAllFlowNodes()),

  // Admin: listar nós raiz (sem pai)
  adminListRoots: adminProcedure.query(async () => listFlowNodes(null)),

  // Admin: listar filhos de um nó
  adminListChildren: adminProcedure
    .input(z.object({ parentId: z.number().int().positive() }))
    .query(async ({ input }) => listFlowNodes(input.parentId)),

  // Admin: salvar nó (criar ou atualizar)
  adminSave: adminProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      parentId: z.number().int().positive().nullable().optional(),
      label: z.string().min(1),
      botResponse: z.string().optional(),
      actionType: z.enum(["show_children", "open_internal", "open_external", "open_video", "open_whatsapp", "send_text", "handoff_human"]),
      actionPayload: z.record(z.string(), z.unknown()).optional(),
      sortOrder: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => saveFlowNode(input)),

  // Admin: excluir nó (e todos os filhos)
  adminDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => deleteFlowNode(input.id)),

  // Público: buscar filhos de um nó (para o widget)
  publicChildren: publicProcedure
    .input(z.object({ nodeId: z.number().int().positive() }))
    .query(async ({ input }) => getNodeChildren(input.nodeId)),

  // Público: buscar nós raiz (para o widget)
  publicRoots: publicProcedure.query(async () => listFlowNodes(null).then(nodes => nodes.filter(n => n.isActive === 1))),
});
