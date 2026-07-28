import { z } from "zod";
import { eq, and, desc, lte, gte, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { adCampaigns, adImpressions, spreadsheetSessions } from "../../drizzle/schema";

// Procedure que verifica se o usuário é admin da planilha (via token de sessão admin)
// Para simplificar, usamos protectedProcedure (Manus OAuth) para o painel ADM

export const adCampaignsRouter = router({
  // ===== ADMIN: CRUD DE CAMPANHAS =====

  // Listar todas as campanhas
  list: protectedProcedure.query(async () => {
    const db = await getDb() as any;
    const campaigns = await db.select().from(adCampaigns).orderBy(desc(adCampaigns.createdAt));
    return campaigns;
  }),

  // Criar nova campanha
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      isActive: z.number().int().min(0).max(1).default(1),
      type: z.enum(["image", "video"]),
      imageUrl: z.string().url().optional().nullable(),
      videoUrl: z.string().url().optional().nullable(),
      title: z.string().max(256).optional().nullable(),
      description: z.string().optional().nullable(),
      linkUrl: z.string().url().optional().nullable(),
      linkText: z.string().max(128).default("Saiba Mais"),
      linkTarget: z.enum(["_self", "_blank"]).default("_blank"),
      requiredSeconds: z.number().int().min(1).max(300).default(20),
      frequency: z.enum(["once", "every_access", "every_reload", "custom"]).default("every_access"),
      frequencyMinutes: z.number().int().min(1).optional().nullable(),
      startsAt: z.string().optional().nullable(),
      endsAt: z.string().optional().nullable(),
      targetPages: z.string().default("gastos"),
      enableAudio: z.number().int().min(0).max(1).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const result = await db.insert(adCampaigns).values({
        name: input.name,
        isActive: input.isActive,
        type: input.type,
        imageUrl: input.imageUrl || null,
        videoUrl: input.videoUrl || null,
        title: input.title || null,
        description: input.description || null,
        linkUrl: input.linkUrl || null,
        linkText: input.linkText,
        linkTarget: input.linkTarget,
        requiredSeconds: input.requiredSeconds,
        frequency: input.frequency,
        frequencyMinutes: input.frequencyMinutes || null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        targetPages: input.targetPages,
        enableAudio: input.enableAudio ?? 0,
      });
      return { id: result[0]?.insertId };
    }),

  // Atualizar campanha
  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(256).optional(),
      isActive: z.number().int().min(0).max(1).optional(),
      type: z.enum(["image", "video"]).optional(),
      imageUrl: z.string().url().optional().nullable(),
      videoUrl: z.string().url().optional().nullable(),
      title: z.string().max(256).optional().nullable(),
      description: z.string().optional().nullable(),
      linkUrl: z.string().url().optional().nullable(),
      linkText: z.string().max(128).optional(),
      linkTarget: z.enum(["_self", "_blank"]).optional(),
      requiredSeconds: z.number().int().min(1).max(300).optional(),
      frequency: z.enum(["once", "every_access", "every_reload", "custom"]).optional(),
      frequencyMinutes: z.number().int().min(1).optional().nullable(),
      startsAt: z.string().optional().nullable(),
      endsAt: z.string().optional().nullable(),
      targetPages: z.string().optional(),
      enableAudio: z.number().int().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      const { id, startsAt, endsAt, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (startsAt !== undefined) updateData.startsAt = startsAt ? new Date(startsAt) : null;
      if (endsAt !== undefined) updateData.endsAt = endsAt ? new Date(endsAt) : null;
      await db.update(adCampaigns).set(updateData).where(eq(adCampaigns.id, id));
      return { success: true };
    }),

  // Deletar campanha
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      await db.delete(adCampaigns).where(eq(adCampaigns.id, input.id));
      return { success: true };
    }),

  // Toggle ativo/inativo
  toggle: protectedProcedure
    .input(z.object({ id: z.number().int(), isActive: z.number().int().min(0).max(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      await db.update(adCampaigns).set({ isActive: input.isActive }).where(eq(adCampaigns.id, input.id));
      return { success: true };
    }),

  // ===== CLIENTE: VERIFICAR SE DEVE EXIBIR PROPAGANDA =====
  // Chamado pela Planilha de Gastos ao carregar (via token de sessão)
  checkForClient: publicProcedure
    .input(z.object({ token: z.string(), page: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        const now = new Date();

        // Verificar sessão
        const sessionResult = await db.select().from(spreadsheetSessions)
          .where(eq(spreadsheetSessions.token, input.token.trim())).limit(1);
        const session = sessionResult?.[0];
        if (!session || new Date(session.expiresAt) < now) return { campaign: null };
        const clientId = session.clientId;

        // Buscar TODAS as campanhas ativas e dentro do período de vigência
        const campaignsResult = await db.select().from(adCampaigns)
          .where(
            and(
              eq(adCampaigns.isActive, 1),
              or(isNull(adCampaigns.startsAt), lte(adCampaigns.startsAt, now)),
              or(isNull(adCampaigns.endsAt), gte(adCampaigns.endsAt, now))
            )
          )
          .orderBy(adCampaigns.id);

        if (!campaignsResult || campaignsResult.length === 0) return { campaign: null };

        // Filtrar por página de destino (se informado)
        const filteredCampaigns = input.page
          ? campaignsResult.filter((c: any) => {
              const pages = c.targetPages ? c.targetPages.split(',').map((p: string) => p.trim()) : ['gastos'];
              return pages.includes(input.page!) || pages.includes('todas');
            })
          : campaignsResult;

        if (filteredCampaigns.length === 0) return { campaign: null };

        // === ALTERNÂNCIA ROTATIVA (round-robin por última impressão) ===
        type CampaignRow = typeof filteredCampaigns[0];

        // Buscar a última impressão de cada campanha para este cliente
        const lastShownMap: Record<number, Date | null> = {};
        for (const c of filteredCampaigns) {
          const imp = await db.select().from(adImpressions)
            .where(and(
              eq(adImpressions.campaignId, c.id),
              eq(adImpressions.clientId, clientId)
            ))
            .orderBy(desc(adImpressions.shownAt))
            .limit(1);
          lastShownMap[c.id] = imp?.[0]?.shownAt ? new Date(imp[0].shownAt) : null;
        }

        // Ordenar campanhas: nunca vistas primeiro, depois por data mais antiga
        const sorted = [...filteredCampaigns].sort((a: CampaignRow, b: CampaignRow) => {
          const aTime = lastShownMap[a.id]?.getTime() ?? 0;
          const bTime = lastShownMap[b.id]?.getTime() ?? 0;
          return aTime - bTime; // menor tempo (mais antiga ou null=0) primeiro
        });

        // Selecionar a primeira campanha elegivel de acordo com sua frequência
        const isCampaignEligible = async (c: CampaignRow): Promise<boolean> => {
          const lastShown = lastShownMap[c.id];

          if (c.frequency === "every_reload") {
            return true; // sempre exibir
          }

          if (c.frequency === "every_access") {
            // Elegivel se nunca foi vista nesta sessão
            if (!lastShown) return true;
            return lastShown < new Date(session.createdAt);
          }

          if (c.frequency === "once") {
            // Elegivel se nunca foi vista
            return lastShown === null;
          }

          if (c.frequency === "custom" && c.frequencyMinutes) {
            // Elegivel se não foi vista nos últimos X minutos
            if (!lastShown) return true;
            const cutoff = new Date(now.getTime() - c.frequencyMinutes * 60 * 1000);
            return lastShown < cutoff;
          }

          return true;
        };

        // Percorrer campanhas ordenadas e retornar a primeira elegível
        for (const c of sorted) {
          if (await isCampaignEligible(c)) {
            return { campaign: c };
          }
        }

        return { campaign: null };
      } catch (e) {
        console.error("[adCampaigns.checkForClient] Error:", e);
        return { campaign: null };
      }
    }),

  // ===== PÁGINAS SEM TOKEN: VERIFICAR SE DEVE EXIBIR PROPAGANDA =====
  // Chamado pelas páginas de Pedidos e Acompanhar (sem token de sessão da planilha)
  // Usa um identificador de sessão anonômico (sessionKey) para controle de frequência
  checkForPage: publicProcedure
    .input(z.object({ page: z.string(), sessionKey: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        const now = new Date();

        // Buscar campanhas ativas para a página solicitada
        const campaignsResult = await db.select().from(adCampaigns)
          .where(
            and(
              eq(adCampaigns.isActive, 1),
              or(isNull(adCampaigns.startsAt), lte(adCampaigns.startsAt, now)),
              or(isNull(adCampaigns.endsAt), gte(adCampaigns.endsAt, now))
            )
          )
          .orderBy(adCampaigns.id);

        if (!campaignsResult || campaignsResult.length === 0) return { campaign: null };

        // Filtrar por página de destino
        const filtered = campaignsResult.filter((c: any) => {
          const pages = c.targetPages ? c.targetPages.split(',').map((p: string) => p.trim()) : ['gastos'];
          return pages.includes(input.page) || pages.includes('todas');
        });

        if (filtered.length === 0) return { campaign: null };

        // Para páginas sem token, retorna a primeira campanha ativa (sem controle de frequência por usuário)
        // Usa round-robin simples por sessionKey para alternar campanhas
        if (filtered.length === 1) return { campaign: filtered[0] };

        // Se há várias, seleciona com base no sessionKey para distribuição
        const key = input.sessionKey || '';
        const hash = key.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const index = hash % filtered.length;
        return { campaign: filtered[index] };
      } catch (e) {
        console.error('[adCampaigns.checkForPage] Error:', e);
        return { campaign: null };
      }
    }),

  // Registrar impressão (quando a propaganda é exibida ao cliente)
  recordImpression: publicProcedure
    .input(z.object({ token: z.string(), campaignId: z.number().int() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        const sessionResult = await db.select().from(spreadsheetSessions)
          .where(eq(spreadsheetSessions.token, input.token.trim())).limit(1);
        const session = sessionResult?.[0];
        if (!session) return { success: false };
        await db.insert(adImpressions).values({
          campaignId: input.campaignId,
          clientId: session.clientId,
        });
        return { success: true };
      } catch (e) {
        console.error("[adCampaigns.recordImpression] Error:", e);
        return { success: false };
      }
    }),
});
