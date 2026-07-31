// ─── Router do Módulo Lista de Compras do Mercado ────────────────────────────
// Integrado ao sistema de cartões — usa as mesmas tabelas cc_* e autenticação
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import * as jose from "jose";

const CC_JWT_SECRET = new TextEncoder().encode(
  process.env.CC_JWT_SECRET || process.env.JWT_SECRET || "cc-cartoes-secret-2024"
);
const CC_COOKIE = "cc_session";

async function verifyCcToken(token: string): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, CC_JWT_SECRET);
    return payload as any;
  } catch { return null; }
}

function makeCcProtected() {
  return publicProcedure.use(async ({ ctx, next }) => {
    const cookieHeader = (ctx as any).req?.headers?.cookie ?? "";
    const cookies = new Map(
      cookieHeader.split(";").map((c: string) => {
        const [k, ...v] = c.trim().split("=");
        return [k.trim(), v.join("=")];
      })
    );
    const token = cookies.get(CC_COOKIE);
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
    const payload = await verifyCcToken(token);
    if (!payload?.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next({ ctx: { ...(ctx as any), userId: payload.userId } });
  });
}

const ccP = makeCcProtected();

async function exec(query: string, params: any[] = []) {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const result = await db.execute(sql.raw(
    query.replace(/\?/g, () => {
      const p = params.shift();
      if (p === null || p === undefined) return "NULL";
      if (typeof p === "string") return `'${p.replace(/'/g, "''")}'`;
      if (p instanceof Date) return `'${p.toISOString().slice(0, 19).replace("T", " ")}'`;
      return String(p);
    })
  ));
  return (result[0] as any[]) || [];
}

function esc(s: string) { return s.replace(/'/g, "''"); }

export const mercadoRouter = router({
  // ── Produtos cadastrados ──────────────────────────────────────────────────
  produtos: router({
    list: ccP
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const where = input?.search
          ? `userId = ${ctx.userId} AND nome LIKE '%${esc(input.search)}%'`
          : `userId = ${ctx.userId}`;
        return exec(`SELECT * FROM cc_mercado_produtos WHERE ${where} ORDER BY favorito DESC, vezesComprado DESC, nome ASC`);
      }),

    create: ccP
      .input(z.object({
        nome: z.string().min(1),
        categoria: z.string().optional(),
        unidade: z.string().optional(),
        precoUltimo: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await exec(
          `INSERT INTO cc_mercado_produtos (userId, nome, categoria, unidade, precoUltimo, favorito, vezesComprado) VALUES (${ctx.userId}, '${esc(input.nome)}', ${input.categoria ? `'${esc(input.categoria)}'` : "NULL"}, '${esc(input.unidade || "un")}', ${input.precoUltimo ?? "NULL"}, 0, 0)`
        );
        return { id: (result as any).insertId };
      }),

    update: ccP
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        categoria: z.string().optional(),
        unidade: z.string().optional(),
        precoUltimo: z.number().optional(),
        favorito: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const sets: string[] = [];
        if (input.nome !== undefined) sets.push(`nome = '${esc(input.nome)}'`);
        if (input.categoria !== undefined) sets.push(`categoria = '${esc(input.categoria)}'`);
        if (input.unidade !== undefined) sets.push(`unidade = '${esc(input.unidade)}'`);
        if (input.precoUltimo !== undefined) sets.push(`precoUltimo = ${input.precoUltimo}`);
        if (input.favorito !== undefined) sets.push(`favorito = ${input.favorito ? 1 : 0}`);
        if (sets.length === 0) return { ok: true };
        await exec(`UPDATE cc_mercado_produtos SET ${sets.join(", ")} WHERE id = ${input.id} AND userId = ${ctx.userId}`);
        return { ok: true };
      }),

    delete: ccP
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await exec(`DELETE FROM cc_mercado_produtos WHERE id = ${input.id} AND userId = ${ctx.userId}`);
        return { ok: true };
      }),
  }),

  // ── Lista atual ───────────────────────────────────────────────────────────
  lista: router({
    get: ccP.query(async ({ ctx }) => {
      return exec(`SELECT * FROM cc_mercado_lista WHERE userId = ${ctx.userId} ORDER BY categoria ASC, nomeProduto ASC`);
    }),

    add: ccP
      .input(z.object({
        produtoId: z.number().optional(),
        nomeProduto: z.string().min(1),
        categoria: z.string().optional(),
        quantidade: z.number().optional(),
        unidade: z.string().optional(),
        precoPrateleira: z.number().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Evitar duplicatas
        const existing = await exec(`SELECT id FROM cc_mercado_lista WHERE userId = ${ctx.userId} AND nomeProduto = '${esc(input.nomeProduto)}' LIMIT 1`);
        if (existing.length > 0) return { id: existing[0].id, duplicate: true };

        const result = await exec(
          `INSERT INTO cc_mercado_lista (userId, produtoId, nomeProduto, categoria, quantidade, unidade, precoPrateleira, observacoes) VALUES (${ctx.userId}, ${input.produtoId ?? "NULL"}, '${esc(input.nomeProduto)}', ${input.categoria ? `'${esc(input.categoria)}'` : "NULL"}, ${input.quantidade ?? 1}, '${esc(input.unidade || "un")}', ${input.precoPrateleira ?? "NULL"}, ${input.observacoes ? `'${esc(input.observacoes)}'` : "NULL"})`
        );
        return { id: (result as any).insertId, duplicate: false };
      }),

    update: ccP
      .input(z.object({
        id: z.number(),
        quantidade: z.number().optional(),
        unidade: z.string().optional(),
        precoPrateleira: z.number().optional(),
        precoCaixa: z.number().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const sets: string[] = [];
        if (input.quantidade !== undefined) sets.push(`quantidade = ${input.quantidade}`);
        if (input.unidade !== undefined) sets.push(`unidade = '${esc(input.unidade)}'`);
        if (input.precoPrateleira !== undefined) sets.push(`precoPrateleira = ${input.precoPrateleira}`);
        if (input.precoCaixa !== undefined) sets.push(`precoCaixa = ${input.precoCaixa}`);
        if (input.observacoes !== undefined) sets.push(`observacoes = '${esc(input.observacoes)}'`);
        if (sets.length === 0) return { ok: true };
        await exec(`UPDATE cc_mercado_lista SET ${sets.join(", ")} WHERE id = ${input.id} AND userId = ${ctx.userId}`);
        return { ok: true };
      }),

    remove: ccP
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await exec(`DELETE FROM cc_mercado_lista WHERE id = ${input.id} AND userId = ${ctx.userId}`);
        return { ok: true };
      }),

    clear: ccP.mutation(async ({ ctx }) => {
      await exec(`DELETE FROM cc_mercado_lista WHERE userId = ${ctx.userId}`);
      return { ok: true };
    }),

    finalizar: ccP
      .input(z.object({
        mercado: z.string().optional(),
        cartaoId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const itens = await exec(`SELECT * FROM cc_mercado_lista WHERE userId = ${ctx.userId}`);
        if (itens.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Lista vazia" });

        const totalPrateleira = itens.reduce((s: number, i: any) =>
          s + (parseFloat(i.precoPrateleira || "0") * parseFloat(i.quantidade || "1")), 0);
        const totalCaixa = itens.reduce((s: number, i: any) =>
          s + (parseFloat(i.precoCaixa || i.precoPrateleira || "0") * parseFloat(i.quantidade || "1")), 0);
        const diferenca = totalCaixa - totalPrateleira;

        const itensJson = esc(JSON.stringify(itens));
        await exec(
          `INSERT INTO cc_mercado_historico (userId, mercado, cartaoId, totalPrateleira, totalCaixa, diferenca, itens) VALUES (${ctx.userId}, ${input.mercado ? `'${esc(input.mercado)}'` : "NULL"}, ${input.cartaoId ?? "NULL"}, ${totalPrateleira.toFixed(2)}, ${totalCaixa.toFixed(2)}, ${diferenca.toFixed(2)}, '${itensJson}')`
        );

        // Atualizar preço e vezesComprado dos produtos
        for (const item of itens) {
          if (item.produtoId) {
            const preco = item.precoCaixa || item.precoPrateleira;
            if (preco) {
              await exec(`UPDATE cc_mercado_produtos SET precoUltimo = ${parseFloat(preco)}, vezesComprado = vezesComprado + 1 WHERE id = ${item.produtoId} AND userId = ${ctx.userId}`);
            }
          }
        }

        await exec(`DELETE FROM cc_mercado_lista WHERE userId = ${ctx.userId}`);
        return { ok: true, totalPrateleira, totalCaixa, diferenca };
      }),
  }),

  // ── Histórico ─────────────────────────────────────────────────────────────
  historico: router({
    list: ccP.query(async ({ ctx }) => {
      return exec(`SELECT * FROM cc_mercado_historico WHERE userId = ${ctx.userId} ORDER BY finalizadoEm DESC LIMIT 50`);
    }),
  }),
});
