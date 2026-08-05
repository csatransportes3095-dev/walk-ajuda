// ─── Router do Módulo Lista de Compras do Mercado ────────────────────────────
// Integrado ao sistema de cartões — usa as mesmas tabelas cc_* e autenticação
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
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

    // Sugerir categoria via IA
    suggestCategory: ccP
      .input(z.object({ nome: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const categorias = [
          "🥩 Açougue","🍎 Hortifruti","🥛 Laticínios","🥖 Padaria","🧴 Limpeza",
          "🧻 Higiene","🍝 Mercearia","🥤 Bebidas","🍦 Frios","🐟 Peixaria",
          "🌾 Grãos","🍬 Doces","🧊 Congelados","📦 Outros"
        ];
        const unidades = ["un","kg","g","L","ml","pct","cx","dz","lt"];
        try {
          const res = await invokeLLM({
            messages: [{
              role: "user",
              content: `Produto de supermercado: "${input.nome}"

Categoria mais adequada (escolha EXATAMENTE uma da lista):
${categorias.join("\n")}

Unidade mais adequada (escolha EXATAMENTE uma da lista):
${unidades.join(", ")}

Responda APENAS em JSON: {"categoria": "...", "unidade": "..."}`
            }],
            outputSchema: {
              name: "sugestao",
              schema: {
                type: "object",
                properties: {
                  categoria: { type: "string" },
                  unidade: { type: "string" }
                },
                required: ["categoria","unidade"]
              }
            }
          });
          const content = res.choices?.[0]?.message?.content;
          const parsed = typeof content === "string" ? JSON.parse(content) : content;
          const cat = categorias.includes(parsed?.categoria) ? parsed.categoria : "📦 Outros";
          const unid = unidades.includes(parsed?.unidade) ? parsed.unidade : "un";
          return { categoria: cat, unidade: unid };
        } catch {
          return { categoria: "📦 Outros", unidade: "un" };
        }
      }),

    // Pré-cadastrar lista padrão de produtos essenciais
    seed: ccP.mutation(async ({ ctx }) => {
      const PADRAO = [
        { nome: "Arroz", categoria: "\u{1F33E} Gr\u00e3os", unidade: "kg" },
        { nome: "Feij\u00e3o", categoria: "\u{1F33E} Gr\u00e3os", unidade: "kg" },
        { nome: "Macarr\u00e3o", categoria: "\u{1F33E} Gr\u00e3os", unidade: "pct" },
        { nome: "Farinha de trigo", categoria: "\u{1F33E} Gr\u00e3os", unidade: "kg" },
        { nome: "Fub\u00e1", categoria: "\u{1F33E} Gr\u00e3os", unidade: "kg" },
        { nome: "Aveia", categoria: "\u{1F33E} Gr\u00e3os", unidade: "pct" },
        { nome: "Sal", categoria: "\u{1F35D} Mercearia", unidade: "kg" },
        { nome: "A\u00e7\u00facar", categoria: "\u{1F35D} Mercearia", unidade: "kg" },
        { nome: "\u00d3leo", categoria: "\u{1F35D} Mercearia", unidade: "L" },
        { nome: "Azeite", categoria: "\u{1F35D} Mercearia", unidade: "L" },
        { nome: "Vinagre", categoria: "\u{1F35D} Mercearia", unidade: "L" },
        { nome: "Alho", categoria: "\u{1F35D} Mercearia", unidade: "un" },
        { nome: "Cebola", categoria: "\u{1F34E} Hortifruti", unidade: "kg" },
        { nome: "Pimenta", categoria: "\u{1F35D} Mercearia", unidade: "un" },
        { nome: "Or\u00e9gano", categoria: "\u{1F35D} Mercearia", unidade: "un" },
        { nome: "Caf\u00e9", categoria: "\u{1F35D} Mercearia", unidade: "pct" },
        { nome: "Ch\u00e1", categoria: "\u{1F35D} Mercearia", unidade: "cx" },
        { nome: "P\u00e3o", categoria: "\u{1F956} Padaria", unidade: "un" },
        { nome: "Margarina", categoria: "\u{1F956} Padaria", unidade: "un" },
        { nome: "Manteiga", categoria: "\u{1F95B} Latic\u00ednios", unidade: "un" },
        { nome: "Leite", categoria: "\u{1F95B} Latic\u00ednios", unidade: "L" },
        { nome: "Queijo", categoria: "\u{1F95B} Latic\u00ednios", unidade: "kg" },
        { nome: "Presunto", categoria: "\u{1F366} Frios", unidade: "kg" },
        { nome: "Iogurte", categoria: "\u{1F95B} Latic\u00ednios", unidade: "un" },
        { nome: "Requeij\u00e3o", categoria: "\u{1F95B} Latic\u00ednios", unidade: "un" },
        { nome: "Creme de leite", categoria: "\u{1F95B} Latic\u00ednios", unidade: "cx" },
        { nome: "Molho de tomate", categoria: "\u{1F35D} Mercearia", unidade: "un" },
        { nome: "Carne bovina", categoria: "\u{1F969} A\u00e7ougue", unidade: "kg" },
        { nome: "Frango", categoria: "\u{1F969} A\u00e7ougue", unidade: "kg" },
        { nome: "Carne mo\u00edda", categoria: "\u{1F969} A\u00e7ougue", unidade: "kg" },
        { nome: "Ovos", categoria: "\u{1F969} A\u00e7ougue", unidade: "dz" },
        { nome: "Peixe", categoria: "\u{1F41F} Peixaria", unidade: "kg" },
        { nome: "Lingu\u00ed\u00e7a", categoria: "\u{1F969} A\u00e7ougue", unidade: "kg" },
        { nome: "Banana", categoria: "\u{1F34E} Hortifruti", unidade: "kg" },
        { nome: "Ma\u00e7\u00e3", categoria: "\u{1F34E} Hortifruti", unidade: "kg" },
        { nome: "Laranja", categoria: "\u{1F34E} Hortifruti", unidade: "kg" },
        { nome: "Lim\u00e3o", categoria: "\u{1F34E} Hortifruti", unidade: "kg" },
        { nome: "Mam\u00e3o", categoria: "\u{1F34E} Hortifruti", unidade: "un" },
        { nome: "Melancia", categoria: "\u{1F34E} Hortifruti", unidade: "un" },
        { nome: "Batata", categoria: "\u{1F34E} Hortifruti", unidade: "kg" },
        { nome: "Tomate", categoria: "\u{1F34E} Hortifruti", unidade: "kg" },
        { nome: "Cenoura", categoria: "\u{1F34E} Hortifruti", unidade: "kg" },
        { nome: "Alface", categoria: "\u{1F34E} Hortifruti", unidade: "un" },
        { nome: "Couve", categoria: "\u{1F34E} Hortifruti", unidade: "un" },
        { nome: "Repolho", categoria: "\u{1F34E} Hortifruti", unidade: "un" },
        { nome: "Pepino", categoria: "\u{1F34E} Hortifruti", unidade: "un" },
        { nome: "Detergente", categoria: "\u{1F9F4} Limpeza", unidade: "un" },
        { nome: "Sab\u00e3o em p\u00f3", categoria: "\u{1F9F4} Limpeza", unidade: "kg" },
        { nome: "Amaciante", categoria: "\u{1F9F4} Limpeza", unidade: "L" },
        { nome: "Desinfetante", categoria: "\u{1F9F4} Limpeza", unidade: "L" },
        { nome: "\u00c1gua sanit\u00e1ria", categoria: "\u{1F9F4} Limpeza", unidade: "L" },
        { nome: "Esponja", categoria: "\u{1F9F4} Limpeza", unidade: "un" },
        { nome: "Saco de lixo", categoria: "\u{1F9F4} Limpeza", unidade: "pct" },
        { nome: "Papel toalha", categoria: "\u{1F9F4} Limpeza", unidade: "pct" },
        { nome: "Papel higi\u00eanico", categoria: "\u{1F9FB} Higiene", unidade: "pct" },
        { nome: "Sabonete", categoria: "\u{1F9FB} Higiene", unidade: "un" },
        { nome: "Shampoo", categoria: "\u{1F9FB} Higiene", unidade: "un" },
        { nome: "Condicionador", categoria: "\u{1F9FB} Higiene", unidade: "un" },
        { nome: "Creme dental", categoria: "\u{1F9FB} Higiene", unidade: "un" },
        { nome: "Escova de dente", categoria: "\u{1F9FB} Higiene", unidade: "un" },
        { nome: "Desodorante", categoria: "\u{1F9FB} Higiene", unidade: "un" },
        { nome: "Biscoito", categoria: "\u{1F36C} Doces", unidade: "pct" },
        { nome: "Suco", categoria: "\u{1F964} Bebidas", unidade: "L" },
        { nome: "Refrigerante", categoria: "\u{1F964} Bebidas", unidade: "L" },
        { nome: "Milho", categoria: "\u{1F35D} Mercearia", unidade: "un" },
        { nome: "Ervilha", categoria: "\u{1F35D} Mercearia", unidade: "un" },
        { nome: "Atum", categoria: "\u{1F41F} Peixaria", unidade: "un" },
        { nome: "Chocolate", categoria: "\u{1F36C} Doces", unidade: "un" },
        { nome: "Achocolatado", categoria: "\u{1F36C} Doces", unidade: "pct" },
        { nome: "Leite condensado", categoria: "\u{1F95B} Latic\u00ednios", unidade: "un" },
        { nome: "Bolacha", categoria: "\u{1F36C} Doces", unidade: "pct" },
        { nome: "Salgadinho", categoria: "\u{1F36C} Doces", unidade: "pct" },
      ];
      let criados = 0;
      for (const p of PADRAO) {
        const existing = await exec(`SELECT id FROM cc_mercado_produtos WHERE userId = ${ctx.userId} AND nome = '${esc(p.nome)}' LIMIT 1`);
        if (existing.length === 0) {
          await exec(`INSERT INTO cc_mercado_produtos (userId, nome, categoria, unidade, favorito, vezesComprado) VALUES (${ctx.userId}, '${esc(p.nome)}', '${esc(p.categoria)}', '${esc(p.unidade)}', 0, 0)`);
          criados++;
        }
      }
      return { criados };
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
    delete: ccP
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await exec(`DELETE FROM cc_mercado_historico WHERE id = ${input.id} AND userId = ${ctx.userId}`);
        return { ok: true };
      }),
  }),
});
