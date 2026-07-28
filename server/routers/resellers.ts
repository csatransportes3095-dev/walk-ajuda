import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { resellers, resellerPrices, resellerOrders, productOptions, products, warrantyTiers } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { parse as parseCookieHeader } from "cookie";
import { ENV } from "../_core/env";
import { getSessionCookieOptions } from "../_core/cookies";

const JWT_SECRET = ENV.cookieSecret;
const RESELLER_COOKIE = "reseller_token";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getResellerFromToken(req: any): Promise<{ id: number; username: string; name: string } | null> {
  try {
    // O servidor não usa cookie-parser, então lemos o header diretamente
    const cookieHeader = req.headers?.cookie as string | undefined;
    const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
    const token = cookies[RESELLER_COOKIE] ?? req.cookies?.[RESELLER_COOKIE];
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload?.role !== "reseller") return null;
    return { id: payload.id, username: payload.username, name: payload.name };
  } catch {
    return null;
  }
}

// ── Router ─────────────────────────────────────────────────────────────────────

export const resellersRouter = router({

  // ── Auth: Login do revendedor ──────────────────────────────────────────────
  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [reseller] = await db.select().from(resellers)
        .where(eq(resellers.username, input.username)).limit(1);
      if (!reseller || !reseller.isActive)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      const valid = await bcrypt.compare(input.password, reseller.passwordHash);
      if (!valid)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário ou senha inválidos" });
      const token = jwt.sign(
        { id: reseller.id, username: reseller.username, name: reseller.name, role: "reseller" },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
      const cookieOpts = getSessionCookieOptions((ctx as any).req);
      (ctx as any).res.cookie(RESELLER_COOKIE, token, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
      return { success: true, name: reseller.name };
    }),

  // ── Auth: Check ───────────────────────────────────────────────────────────
  check: publicProcedure.query(async ({ ctx }) => {
    const reseller = await getResellerFromToken((ctx as any).req);
    if (!reseller) return { isReseller: false };
    return { isReseller: true, ...reseller };
  }),

  // ── Auth: Logout ──────────────────────────────────────────────────────────
  logout: publicProcedure.mutation(async ({ ctx }) => {
    (ctx as any).res.clearCookie(RESELLER_COOKIE);
    return { success: true };
  }),

  // ── Busca revendedor por slug (público — para o cliente ver preços) ────────
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [reseller] = await db.select({
        id: resellers.id,
        name: resellers.name,
        slug: resellers.slug,
      }).from(resellers)
        .where(and(eq(resellers.slug, input.slug), eq(resellers.isActive, 1)))
        .limit(1);
      return reseller ?? null;
    }),

  // ── Preços do revendedor por slug (público — para o cliente ver) ──────────
  getPricesBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [reseller] = await db.select({ id: resellers.id })
        .from(resellers)
        .where(and(eq(resellers.slug, input.slug), eq(resellers.isActive, 1)))
        .limit(1);
      if (!reseller) return [];
      const prices = await db.select().from(resellerPrices)
        .where(eq(resellerPrices.resellerId, reseller.id));
      return prices; // { optionId, salePrice }[]
    }),

  // ── Meu perfil (revendedor logado) ────────────────────────────────────────
  me: publicProcedure.query(async ({ ctx }) => {
    const reseller = await getResellerFromToken((ctx as any).req);
    if (!reseller) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [data] = await db.select({
      id: resellers.id, name: resellers.name, phone: resellers.phone,
      email: resellers.email, slug: resellers.slug, username: resellers.username,
      isActive: resellers.isActive, createdAt: resellers.createdAt,
    }).from(resellers).where(eq(resellers.id, reseller.id)).limit(1);
    return data ?? null;
  }),

  // ── Meus preços (revendedor logado) ───────────────────────────────────────
  myPrices: publicProcedure.query(async ({ ctx }) => {
    const reseller = await getResellerFromToken((ctx as any).req);
    if (!reseller) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Busca todos os produtos ativos com suas opções e preços do revendedor
    const opts = await db.select({
      optionId: productOptions.id,
      optionLabel: productOptions.label,
      optionDescription: productOptions.warranty,
      productId: productOptions.productId,
      costPrice: resellerPrices.costPrice,
      salePrice: resellerPrices.salePrice,
    }).from(productOptions)
      .leftJoin(resellerPrices, and(
        eq(resellerPrices.optionId, productOptions.id),
        eq(resellerPrices.resellerId, reseller.id)
      ))
      .where(eq(productOptions.isActive, 1))
      .orderBy(productOptions.productId, productOptions.sortOrder);

    // Busca nomes de TODOS os produtos (ativos ou não) para montar o mapa de nomes
    // Isso garante que opções de produtos inativos ainda apareçam com o nome correto
    const prods = await db.select({ id: products.id, name: products.name })
      .from(products);
    const productMap: Record<number, string> = Object.fromEntries(prods.map((p: { id: number; name: string }) => [p.id, p.name]));

    // Busca tiers de garantia para cada opção
    const tiers = await db.select({
      optionId: warrantyTiers.optionId,
      warrantyType: warrantyTiers.warrantyType,
      warrantyValue: warrantyTiers.warrantyValue,
      warrantyLabel: warrantyTiers.warrantyLabel,
    }).from(warrantyTiers).where(eq(warrantyTiers.isActive, 1));
    const warrantyMap: Record<number, typeof tiers> = {};
    for (const t of tiers) {
      if (!warrantyMap[t.optionId]) warrantyMap[t.optionId] = [];
      warrantyMap[t.optionId].push(t);
    }

    return opts.map((o: any) => ({
      ...o,
      productName: productMap[o.productId] ?? "Outros Serviços",
      warrantyTiers: warrantyMap[o.optionId] ?? [],
    }));
  }),

  // ── Atualizar preço de venda (revendedor logado) ──────────────────────────
  updatePrice: publicProcedure
    .input(z.object({ optionId: z.number(), salePrice: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const reseller = await getResellerFromToken((ctx as any).req);
      if (!reseller) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Busca preço de custo definido pelo admin
      const [existing] = await db.select().from(resellerPrices)
        .where(and(eq(resellerPrices.resellerId, reseller.id), eq(resellerPrices.optionId, input.optionId)))
        .limit(1);
      if (existing) {
        await db.update(resellerPrices)
          .set({ salePrice: input.salePrice })
          .where(eq(resellerPrices.id, existing.id));
      } else {
        await db.insert(resellerPrices).values({
          resellerId: reseller.id,
          optionId: input.optionId,
          salePrice: input.salePrice,
          costPrice: "",
        });
      }
      return { success: true };
    }),

  // ── Meus pedidos (revendedor logado) ─────────────────────────────────────
  myOrders: publicProcedure.query(async ({ ctx }) => {
    const reseller = await getResellerFromToken((ctx as any).req);
    if (!reseller) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const orders = await db.select().from(resellerOrders)
      .where(eq(resellerOrders.resellerId, reseller.id))
      .orderBy(desc(resellerOrders.createdAt));
    return orders;
  }),

  // ── Registrar pedido do cliente do revendedor (chamado no checkout) ───────
  registerOrder: publicProcedure
    .input(z.object({
      resellerSlug: z.string(),
      registrationId: z.number(),
      customerPhone: z.string(),
      optionId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const [reseller] = await db.select({ id: resellers.id })
        .from(resellers)
        .where(and(eq(resellers.slug, input.resellerSlug), eq(resellers.isActive, 1)))
        .limit(1);
      if (!reseller) return { success: false };
      // Busca preços
      const [price] = await db.select().from(resellerPrices)
        .where(and(eq(resellerPrices.resellerId, reseller.id), eq(resellerPrices.optionId, input.optionId)))
        .limit(1);
      const salePrice = price?.salePrice ?? "";
      const costPrice = price?.costPrice ?? "";
      // Evita duplicatas
      const [existing] = await db.select({ id: resellerOrders.id })
        .from(resellerOrders)
        .where(and(
          eq(resellerOrders.resellerId, reseller.id),
          eq(resellerOrders.registrationId, input.registrationId)
        )).limit(1);
      if (existing) return { success: true };
      await db.insert(resellerOrders).values({
        resellerId: reseller.id,
        registrationId: input.registrationId,
        customerPhone: input.customerPhone,
        salePrice,
        costPrice,
      });
      return { success: true };
    }),

  // ── ADMIN: Lista todos os revendedores ────────────────────────────────────
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return await db.select({
      id: resellers.id, name: resellers.name, phone: resellers.phone,
      email: resellers.email, slug: resellers.slug, username: resellers.username,
      isActive: resellers.isActive, notes: resellers.notes, createdAt: resellers.createdAt,
    }).from(resellers).orderBy(desc(resellers.createdAt));
  }),

  // ── ADMIN: Cria revendedor ────────────────────────────────────────────────
  adminCreate: adminProcedure
    .input(z.object({
      name: z.string().min(2),
      phone: z.string().min(8),
      email: z.string().email().optional(),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug deve ter apenas letras minúsculas, números e hífens"),
      username: z.string().min(3),
      password: z.string().min(6),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const passwordHash = await bcrypt.hash(input.password, 10);
      await db.insert(resellers).values({
        name: input.name,
        phone: input.phone,
        email: input.email,
        slug: input.slug,
        username: input.username,
        passwordHash,
        notes: input.notes,
      });
      return { success: true };
    }),

  // ── ADMIN: Atualiza revendedor ────────────────────────────────────────────
  adminUpdate: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(2).optional(),
      phone: z.string().min(8).optional(),
      email: z.string().email().optional(),
      slug: z.string().min(2).optional(),
      username: z.string().min(3).optional(),
      password: z.string().min(6).optional(),
      isActive: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, password, ...rest } = input;
      const updates: any = { ...rest };
      if (password) updates.passwordHash = await bcrypt.hash(password, 10);
      await db.update(resellers).set(updates).where(eq(resellers.id, id));
      return { success: true };
    }),

  // ── ADMIN: Define preço de custo para revendedor/opção ───────────────────
  adminSetCostPrice: adminProcedure
    .input(z.object({ resellerId: z.number(), optionId: z.number(), costPrice: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select().from(resellerPrices)
        .where(and(eq(resellerPrices.resellerId, input.resellerId), eq(resellerPrices.optionId, input.optionId)))
        .limit(1);
      if (existing) {
        await db.update(resellerPrices).set({ costPrice: input.costPrice }).where(eq(resellerPrices.id, existing.id));
      } else {
        await db.insert(resellerPrices).values({
          resellerId: input.resellerId,
          optionId: input.optionId,
          salePrice: "",
          costPrice: input.costPrice,
        });
      }
      return { success: true };
    }),

  // ── ADMIN: Pedidos de um revendedor com saldo a pagar ────────────────────
  adminResellerOrders: adminProcedure
    .input(z.object({ resellerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(resellerOrders)
        .where(eq(resellerOrders.resellerId, input.resellerId))
        .orderBy(desc(resellerOrders.createdAt));
    }),

  // ── ADMIN: Marcar comissão como paga ─────────────────────────────────────
  adminMarkPaid: adminProcedure
    .input(z.object({ orderId: z.number(), paid: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(resellerOrders)
        .set({ commissionPaid: input.paid })
        .where(eq(resellerOrders.id, input.orderId));
      return { success: true };
    }),

  // ── ADMIN: Preços de um revendedor específico ─────────────────────────────
  adminGetPrices: adminProcedure
    .input(z.object({ resellerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const opts = await db.select({
        optionId: productOptions.id,
        optionLabel: productOptions.label,
        productId: productOptions.productId,
        costPrice: resellerPrices.costPrice,
        salePrice: resellerPrices.salePrice,
      }).from(productOptions)
        .leftJoin(resellerPrices, and(
          eq(resellerPrices.optionId, productOptions.id),
          eq(resellerPrices.resellerId, input.resellerId)
        ))
        .where(eq(productOptions.isActive, 1))
        .orderBy(productOptions.productId, productOptions.sortOrder);
      const prods = await db.select({ id: products.id, name: products.name })
        .from(products).where(eq(products.isActive, 1));
      const productMap: Record<number, string> = Object.fromEntries(prods.map((p: { id: number; name: string }) => [p.id, p.name]));
      return opts.map((o: typeof opts[number]) => ({ ...o, productName: productMap[o.productId] ?? "", defaultPrice: "" }));
    }),

  // ── ADMIN: Pedidos de um revendedor (alias) ───────────────────────────────
  adminGetOrders: adminProcedure
    .input(z.object({ resellerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db.select().from(resellerOrders)
        .where(eq(resellerOrders.resellerId, input.resellerId))
        .orderBy(desc(resellerOrders.createdAt));
    }),

  // ── ADMIN: Marcar comissão como paga (alias) ──────────────────────────────
  adminMarkCommissionPaid: adminProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(resellerOrders)
        .set({ commissionPaid: 1 })
        .where(eq(resellerOrders.id, input.orderId));
      return { success: true };
    }),

  // ── ADMIN: Excluir revendedor ─────────────────────────────────────────────
  adminDelete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(resellerOrders).where(eq(resellerOrders.resellerId, input.id));
      await db.delete(resellerPrices).where(eq(resellerPrices.resellerId, input.id));
      await db.delete(resellers).where(eq(resellers.id, input.id));
      return { success: true };
    }),

  // ── ADMIN: Ativar/Desativar revendedor ────────────────────────────────────
  adminToggle: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [r] = await db.select({ isActive: resellers.isActive })
        .from(resellers).where(eq(resellers.id, input.id)).limit(1);
      if (!r) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(resellers).set({ isActive: r.isActive ? 0 : 1 }).where(eq(resellers.id, input.id));
      return { success: true };
    }),
});
