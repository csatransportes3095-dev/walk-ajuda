// ─── Router do Sistema de Cartões de Crédito ─────────────────────────────────
// Integrado ao h2colombiano — tabelas cc_* no mesmo banco
// Autenticação própria: telefone + senha bcrypt + JWT em cookie (cc_session)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import * as jose from "jose";
import bcrypt from "bcryptjs";

const CC_JWT_SECRET = new TextEncoder().encode(
  process.env.CC_JWT_SECRET || process.env.JWT_SECRET || "cc-cartoes-secret-2024"
);
const CC_COOKIE = "cc_session";

async function signCcToken(payload: { userId: number; phone: string }) {
  return new jose.SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(CC_JWT_SECRET);
}

async function verifyCcToken(token: string): Promise<{ userId: number; phone: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, CC_JWT_SECRET);
    return payload as any;
  } catch {
    return null;
  }
}

function getCookieOptions(req: any) {
  const host = req.headers.host || "";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  return {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: (isLocalhost ? "lax" : "none") as "lax" | "none",
    path: "/",
  };
}

// Procedure protegida — verifica o cookie cc_session
function makeCcProtectedProcedure() {
  return publicProcedure.use(async ({ ctx, next }) => {
    const cookieHeader = (ctx as any).req?.headers?.cookie ?? "";
    const cookies = new Map(
      cookieHeader.split(";").map((c: string) => {
        const [k, ...v] = c.trim().split("=");
        return [k.trim(), v.join("=")];
      })
    );
    const token = cookies.get(CC_COOKIE);
    if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
    const payload = await verifyCcToken(token);
    if (!payload?.userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida" });
    return next({ ctx: { ...(ctx as any), ccUserId: payload.userId } });
  });
}

const ccProtected = makeCcProtectedProcedure();

// ─── Helpers de banco ─────────────────────────────────────────────────────────
async function ccExec(query: string, params: any[] = []) {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
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

export const cartoesRouter = router({
  // ── Auth ───────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      const cookieHeader = (ctx as any).req?.headers?.cookie ?? "";
      const cookies = new Map(
        cookieHeader.split(";").map((c: string) => {
          const [k, ...v] = c.trim().split("=");
          return [k.trim(), v.join("=")];
        })
      );
      const token = cookies.get(CC_COOKIE);
      if (!token) return null;
      const payload = await verifyCcToken(token);
      if (!payload?.userId) return null;
      const rows = await ccExec(`SELECT id, phone, name FROM cc_app_users WHERE id = ${payload.userId} LIMIT 1`);
      const user = rows[0];
      if (!user) return null;
      return { id: user.id, phone: user.phone, name: user.name };
    }),

    register: publicProcedure
      .input(z.object({
        name: z.string().min(2).max(100),
        phone: z.string().min(10).max(11),
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        const existing = await ccExec(`SELECT id FROM cc_app_users WHERE phone = '${input.phone}' LIMIT 1`);
        if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Este número já está cadastrado" });
        const hash = await bcrypt.hash(input.password, 10);
        await ccExec(`INSERT INTO cc_app_users (phone, passwordHash, name) VALUES ('${input.phone}', '${hash}', '${input.name.replace(/'/g, "''")}')`);
        const rows = await ccExec(`SELECT id, phone, name FROM cc_app_users WHERE phone = '${input.phone}' LIMIT 1`);
        const user = rows[0];
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const token = await signCcToken({ userId: user.id, phone: user.phone });
        const cookieOptions = getCookieOptions((ctx as any).req);
        (ctx as any).res.cookie(CC_COOKIE, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
        return { success: true, user: { id: user.id, phone: user.phone, name: user.name } };
      }),

    login: publicProcedure
      .input(z.object({
        phone: z.string().min(10).max(11),
        password: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const rows = await ccExec(`SELECT id, phone, name, passwordHash FROM cc_app_users WHERE phone = '${input.phone}' LIMIT 1`);
        const user = rows[0];
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Número não cadastrado" });
        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });
        const token = await signCcToken({ userId: user.id, phone: user.phone });
        const cookieOptions = getCookieOptions((ctx as any).req);
        (ctx as any).res.cookie(CC_COOKIE, token, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
        return { success: true, user: { id: user.id, phone: user.phone, name: user.name } };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getCookieOptions((ctx as any).req);
      (ctx as any).res.clearCookie(CC_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
  }),

  // ── Cartões ────────────────────────────────────────────────────────────────
  cartoes: router({
    list: ccProtected.query(async ({ ctx }) => {
      const userId = (ctx as any).ccUserId as number;
      const lista = await ccExec(`SELECT * FROM cc_cartoes WHERE userId = ${userId}`);
      // Para cada cartão, calcular fatura do mês atual
      const hoje = new Date();
      const mes = hoje.getMonth() + 1;
      const ano = hoje.getFullYear();
      return Promise.all(lista.map(async (c: any) => {
        // Gastos não pagos do ciclo atual
        const gastos = await ccExec(`SELECT valor, paga, data, numeroParcela, totalParcelas FROM cc_gastos WHERE cartaoId = ${c.id} AND paga = 0`);
        const totalGasto = gastos.reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0);
        const totalParcelas = gastos.filter((g: any) => g.numeroParcela).reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0);
        const limiteDisponivel = parseFloat(c.limiteTotal) - totalGasto;
        return {
          ...c,
          limiteTotal: parseFloat(c.limiteTotal),
          faturaAtual: totalGasto,
          valorEmParcelas: totalParcelas,
          limiteDisponivel,
        };
      }));
    }),

    create: ccProtected
      .input(z.object({
        nome: z.string().min(1).max(100),
        vencimentoDia: z.number().int().min(1).max(31),
        fechamentoDia: z.number().int().min(1).max(31).optional().nullable(),
        limiteTotal: z.number().positive(),
        corCartao: z.string().default("blue"),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const fechamento = input.fechamentoDia ?? "NULL";
        await ccExec(`INSERT INTO cc_cartoes (userId, nome, vencimentoDia, fechamentoDia, limiteTotal, corCartao) VALUES (${userId}, '${input.nome.replace(/'/g, "''")}', ${input.vencimentoDia}, ${fechamento}, ${input.limiteTotal}, '${input.corCartao}')`);
        return { success: true };
      }),

    update: ccProtected
      .input(z.object({
        id: z.number().int(),
        nome: z.string().min(1).max(100).optional(),
        vencimentoDia: z.number().int().min(1).max(31).optional(),
        fechamentoDia: z.number().int().min(1).max(31).optional().nullable(),
        limiteTotal: z.number().positive().optional(),
        corCartao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const sets: string[] = [];
        if (input.nome !== undefined) sets.push(`nome = '${input.nome.replace(/'/g, "''")}'`);
        if (input.vencimentoDia !== undefined) sets.push(`vencimentoDia = ${input.vencimentoDia}`);
        if (input.fechamentoDia !== undefined) sets.push(`fechamentoDia = ${input.fechamentoDia ?? "NULL"}`);
        if (input.limiteTotal !== undefined) sets.push(`limiteTotal = ${input.limiteTotal}`);
        if (input.corCartao !== undefined) sets.push(`corCartao = '${input.corCartao}'`);
        if (sets.length === 0) return { success: true };
        await ccExec(`UPDATE cc_cartoes SET ${sets.join(", ")} WHERE id = ${input.id} AND userId = ${userId}`);
        return { success: true };
      }),

    delete: ccProtected
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        await ccExec(`DELETE FROM cc_cartoes WHERE id = ${input.id} AND userId = ${userId}`);
        return { success: true };
      }),
  }),

  // ── Gastos ─────────────────────────────────────────────────────────────────
  gastos: router({
    list: ccProtected
      .input(z.object({ cartaoId: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cartão não encontrado" });
        const rows = await ccExec(`SELECT * FROM cc_gastos WHERE cartaoId = ${input.cartaoId} ORDER BY data DESC`);
        return rows.map((g: any) => ({ ...g, valor: parseFloat(g.valor) }));
      }),

    create: ccProtected
      .input(z.object({
        cartaoId: z.number().int(),
        descricao: z.string().min(1).max(200),
        valor: z.number().positive(),
        data: z.string().optional(),
        responsavel: z.string().max(100).optional(),
        categoriaId: z.number().int().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cartão não encontrado" });
        const data = input.data ? `'${input.data.slice(0, 10)} 00:00:00'` : "NOW()";
        const responsavel = input.responsavel ? `'${input.responsavel.replace(/'/g, "''")}'` : "NULL";
        const categoriaId = input.categoriaId ?? "NULL";
        await ccExec(`INSERT INTO cc_gastos (cartaoId, descricao, valor, data, responsavel, categoriaId) VALUES (${input.cartaoId}, '${input.descricao.replace(/'/g, "''")}', ${input.valor}, ${data}, ${responsavel}, ${categoriaId})`);
        return { success: true };
      }),

    delete: ccProtected
      .input(z.object({ id: z.number().int(), cartaoId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND", message: "Cartão não encontrado" });
        await ccExec(`DELETE FROM cc_gastos WHERE id = ${input.id} AND cartaoId = ${input.cartaoId}`);
        return { success: true };
      }),

    marcarPaga: ccProtected
      .input(z.object({ id: z.number().int(), cartaoId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const gasto = await ccExec(`SELECT id, parcelamentoId, data FROM cc_gastos WHERE id = ${input.id} AND cartaoId = ${input.cartaoId} LIMIT 1`);
        if (!gasto.length) throw new TRPCError({ code: "NOT_FOUND" });
        if (!gasto[0].parcelamentoId) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas parcelas podem ser marcadas como pagas" });
        await ccExec(`UPDATE cc_gastos SET paga = 1, dataOriginal = data, data = NOW() WHERE id = ${input.id} AND cartaoId = ${input.cartaoId}`);
        return { success: true };
      }),

    cancelarPagamento: ccProtected
      .input(z.object({ id: z.number().int(), cartaoId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const gasto = await ccExec(`SELECT id, parcelamentoId, dataOriginal FROM cc_gastos WHERE id = ${input.id} AND cartaoId = ${input.cartaoId} LIMIT 1`);
        if (!gasto.length) throw new TRPCError({ code: "NOT_FOUND" });
        if (!gasto[0].parcelamentoId) throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas parcelas podem ter pagamento cancelado" });
        const restoreData = gasto[0].dataOriginal ? `'${new Date(gasto[0].dataOriginal).toISOString().slice(0, 19).replace("T", " ")}'` : "NOW()";
        await ccExec(`UPDATE cc_gastos SET paga = 0, data = ${restoreData}, dataOriginal = NULL WHERE id = ${input.id} AND cartaoId = ${input.cartaoId}`);
        return { success: true };
      }),

    editar: ccProtected
      .input(z.object({
        id: z.number().int(),
        cartaoId: z.number().int(),
        descricao: z.string().min(1).max(200).optional(),
        valor: z.number().positive().optional(),
        data: z.string().optional(),
        responsavel: z.string().max(100).optional().nullable(),
        categoriaId: z.number().int().optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const sets: string[] = [];
        if (input.descricao !== undefined) sets.push(`descricao = '${input.descricao.replace(/'/g, "''")}'`);
        if (input.valor !== undefined) sets.push(`valor = ${input.valor}`);
        if (input.data !== undefined) sets.push(`data = '${input.data.slice(0, 10)} 00:00:00'`);
        if (input.responsavel !== undefined) sets.push(`responsavel = ${input.responsavel ? `'${input.responsavel.replace(/'/g, "''")}'` : "NULL"}`);
        if (input.categoriaId !== undefined) sets.push(`categoriaId = ${input.categoriaId ?? "NULL"}`);
        if (sets.length === 0) return { success: true };
        await ccExec(`UPDATE cc_gastos SET ${sets.join(", ")} WHERE id = ${input.id} AND cartaoId = ${input.cartaoId}`);
        return { success: true };
      }),
  }),

  // ── Pagamentos de Fatura ───────────────────────────────────────────────────
  pagamentos: router({
    list: ccProtected
      .input(z.object({ cartaoId: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const rows = await ccExec(`SELECT * FROM cc_pagamentos WHERE cartaoId = ${input.cartaoId} ORDER BY dataPagamento DESC`);
        return rows.map((p: any) => ({ ...p, valorPago: parseFloat(p.valorPago) }));
      }),

    create: ccProtected
      .input(z.object({
        cartaoId: z.number().int(),
        valorPago: z.number().positive(),
        observacao: z.string().max(200).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const obs = input.observacao ? `'${input.observacao.replace(/'/g, "''")}'` : "NULL";
        await ccExec(`INSERT INTO cc_pagamentos (cartaoId, valorPago, observacao) VALUES (${input.cartaoId}, ${input.valorPago}, ${obs})`);
        // Marcar gastos como pagos (os mais antigos primeiro até cobrir o valor)
        const gastos = await ccExec(`SELECT id, valor FROM cc_gastos WHERE cartaoId = ${input.cartaoId} AND paga = 0 ORDER BY data ASC`);
        let restante = input.valorPago;
        for (const g of gastos) {
          if (restante <= 0) break;
          await ccExec(`UPDATE cc_gastos SET paga = 1, dataOriginal = data, data = NOW() WHERE id = ${g.id}`);
          restante -= parseFloat(g.valor);
        }
        return { success: true };
      }),

    delete: ccProtected
      .input(z.object({ id: z.number().int(), cartaoId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        await ccExec(`DELETE FROM cc_pagamentos WHERE id = ${input.id} AND cartaoId = ${input.cartaoId}`);
        return { success: true };
      }),
  }),

  // ── Parcelamentos ──────────────────────────────────────────────────────────
  parcelamentos: router({
    list: ccProtected
      .input(z.object({ cartaoId: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const parcs = await ccExec(`SELECT * FROM cc_parcelamentos WHERE cartaoId = ${input.cartaoId} ORDER BY dataInicio DESC`);
        const gastos = await ccExec(`SELECT * FROM cc_gastos WHERE cartaoId = ${input.cartaoId}`);
        return parcs.map((p: any) => {
          const parcelas = gastos.filter((g: any) => g.parcelamentoId === p.id);
          const pagas = parcelas.filter((g: any) => g.paga === 1).length;
          return {
            ...p,
            valorTotal: parseFloat(p.valorTotal),
            valorParcela: parseFloat(p.valorParcela),
            parcelasPagas: pagas,
            parcelasTotal: parcelas.length,
            parcelas: parcelas.map((g: any) => ({ ...g, valor: parseFloat(g.valor) })),
          };
        });
      }),

    create: ccProtected
      .input(z.object({
        cartaoId: z.number().int(),
        descricao: z.string().min(1).max(200),
        valorTotal: z.number().positive(),
        numParcelas: z.number().int().min(2).max(120),
        dataInicio: z.string(),
        responsavel: z.string().max(100).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const valorParcela = Math.round((input.valorTotal / input.numParcelas) * 100) / 100;
        const responsavel = input.responsavel ? `'${input.responsavel.replace(/'/g, "''")}'` : "NULL";
        await ccExec(`INSERT INTO cc_parcelamentos (cartaoId, descricao, valorTotal, valorParcela, numParcelas, dataInicio, responsavel) VALUES (${input.cartaoId}, '${input.descricao.replace(/'/g, "''")}', ${input.valorTotal}, ${valorParcela}, ${input.numParcelas}, '${input.dataInicio.slice(0, 10)} 00:00:00', ${responsavel})`);
        const pRows = await ccExec(`SELECT LAST_INSERT_ID() as id`);
        const parcelamentoId = pRows[0]?.id;
        // Gerar parcelas mensais
        const [ano, mes, dia] = input.dataInicio.slice(0, 10).split("-").map(Number);
        for (let i = 0; i < input.numParcelas; i++) {
          const d = new Date(ano, mes - 1 + i, dia);
          const dataStr = d.toISOString().slice(0, 10);
          await ccExec(`INSERT INTO cc_gastos (cartaoId, descricao, valor, data, parcelamentoId, numeroParcela, totalParcelas, responsavel) VALUES (${input.cartaoId}, '${input.descricao.replace(/'/g, "''")} (${i + 1}/${input.numParcelas})', ${valorParcela}, '${dataStr} 00:00:00', ${parcelamentoId}, ${i + 1}, ${input.numParcelas}, ${responsavel})`);
        }
        return { success: true };
      }),

    cancelar: ccProtected
      .input(z.object({ id: z.number().int(), cartaoId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        await ccExec(`DELETE FROM cc_gastos WHERE parcelamentoId = ${input.id} AND cartaoId = ${input.cartaoId} AND paga = 0`);
        return { success: true };
      }),

    excluirTudo: ccProtected
      .input(z.object({ id: z.number().int(), cartaoId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        await ccExec(`DELETE FROM cc_gastos WHERE parcelamentoId = ${input.id} AND cartaoId = ${input.cartaoId}`);
        await ccExec(`DELETE FROM cc_parcelamentos WHERE id = ${input.id} AND cartaoId = ${input.cartaoId}`);
        return { success: true };
      }),

    editarData: ccProtected
      .input(z.object({
        id: z.number().int(),
        cartaoId: z.number().int(),
        novaData: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const parcelas = await ccExec(`SELECT id, numeroParcela FROM cc_gastos WHERE parcelamentoId = ${input.id} AND cartaoId = ${input.cartaoId} AND paga = 0 ORDER BY numeroParcela ASC`);
        const [ano, mes, dia] = input.novaData.slice(0, 10).split("-").map(Number);
        for (const p of parcelas) {
          const offset = (p.numeroParcela || 1) - 1;
          const d = new Date(ano, mes - 1 + offset, dia);
          const dataStr = d.toISOString().slice(0, 10);
          await ccExec(`UPDATE cc_gastos SET data = '${dataStr} 00:00:00' WHERE id = ${p.id}`);
        }
        await ccExec(`UPDATE cc_parcelamentos SET dataInicio = '${input.novaData.slice(0, 10)} 00:00:00' WHERE id = ${input.id}`);
        return { success: true };
      }),
  }),

  // ── Categorias ─────────────────────────────────────────────────────────────
  categorias: router({
    list: ccProtected.query(async ({ ctx }) => {
      const userId = (ctx as any).ccUserId as number;
      return ccExec(`SELECT * FROM cc_categorias WHERE userId = ${userId} ORDER BY nome ASC`);
    }),

    create: ccProtected
      .input(z.object({
        nome: z.string().min(1).max(100),
        icone: z.string().max(10).optional(),
        cor: z.string().max(30).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const icone = input.icone ? `'${input.icone}'` : "'tag'";
        const cor = input.cor ? `'${input.cor}'` : "'gray'";
        await ccExec(`INSERT INTO cc_categorias (userId, nome, icone, cor) VALUES (${userId}, '${input.nome.replace(/'/g, "''")}', ${icone}, ${cor})`);
        return { success: true };
      }),

    update: ccProtected
      .input(z.object({
        id: z.number().int(),
        nome: z.string().min(1).max(100).optional(),
        icone: z.string().max(10).optional(),
        cor: z.string().max(30).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const sets: string[] = [];
        if (input.nome !== undefined) sets.push(`nome = '${input.nome.replace(/'/g, "''")}'`);
        if (input.icone !== undefined) sets.push(`icone = '${input.icone}'`);
        if (input.cor !== undefined) sets.push(`cor = '${input.cor}'`);
        if (sets.length === 0) return { success: true };
        await ccExec(`UPDATE cc_categorias SET ${sets.join(", ")} WHERE id = ${input.id} AND userId = ${userId}`);
        return { success: true };
      }),

    delete: ccProtected
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        await ccExec(`UPDATE cc_gastos SET categoriaId = NULL WHERE categoriaId = ${input.id}`);
        await ccExec(`DELETE FROM cc_categorias WHERE id = ${input.id} AND userId = ${userId}`);
        return { success: true };
      }),
  }),

  // ── Despesas Fixas ─────────────────────────────────────────────────────────
  despesas: router({
    list: ccProtected
      .input(z.object({ mes: z.number().int().min(1).max(12), ano: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const lista = await ccExec(`SELECT * FROM cc_despesas WHERE userId = ${userId} AND ativa = 1 ORDER BY nome ASC`);
        const pags = await ccExec(`SELECT * FROM cc_pagamentos_despesas WHERE userId = ${userId} AND mes = ${input.mes} AND ano = ${input.ano}`);
        const pagMap = new Map(pags.map((p: any) => [p.despesaId, p]));
        return lista.map((d: any) => ({
          ...d,
          valor: d.valor ? parseFloat(d.valor) : null,
          pagamento: pagMap.get(d.id) ?? null,
        }));
      }),

    create: ccProtected
      .input(z.object({
        nome: z.string().min(1).max(100),
        categoriaId: z.number().int().nullable().optional(),
        valor: z.number().positive().nullable().optional(),
        diaVencimento: z.number().int().min(1).max(31).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const categoriaId = input.categoriaId ?? "NULL";
        const valor = input.valor != null ? input.valor : "NULL";
        const diaVenc = input.diaVencimento ?? "NULL";
        await ccExec(`INSERT INTO cc_despesas (userId, nome, categoriaId, valor, diaVencimento) VALUES (${userId}, '${input.nome.replace(/'/g, "''")}', ${categoriaId}, ${valor}, ${diaVenc})`);
        return { success: true };
      }),

    update: ccProtected
      .input(z.object({
        id: z.number().int(),
        nome: z.string().min(1).max(100).optional(),
        categoriaId: z.number().int().nullable().optional(),
        valor: z.number().positive().nullable().optional(),
        diaVencimento: z.number().int().min(1).max(31).nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const sets: string[] = [];
        if (input.nome !== undefined) sets.push(`nome = '${input.nome.replace(/'/g, "''")}'`);
        if (input.categoriaId !== undefined) sets.push(`categoriaId = ${input.categoriaId ?? "NULL"}`);
        if (input.valor !== undefined) sets.push(`valor = ${input.valor ?? "NULL"}`);
        if (input.diaVencimento !== undefined) sets.push(`diaVencimento = ${input.diaVencimento ?? "NULL"}`);
        if (sets.length === 0) return { success: true };
        await ccExec(`UPDATE cc_despesas SET ${sets.join(", ")} WHERE id = ${input.id} AND userId = ${userId}`);
        return { success: true };
      }),

    delete: ccProtected
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        await ccExec(`UPDATE cc_despesas SET ativa = 0 WHERE id = ${input.id} AND userId = ${userId}`);
        return { success: true };
      }),

    marcarPaga: ccProtected
      .input(z.object({
        despesaId: z.number().int(),
        mes: z.number().int().min(1).max(12),
        ano: z.number().int(),
        valorPago: z.number().positive().nullable().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const valorPago = input.valorPago != null ? input.valorPago : "NULL";
        await ccExec(`INSERT INTO cc_pagamentos_despesas (despesaId, userId, mes, ano, valorPago, dataPagamento) VALUES (${input.despesaId}, ${userId}, ${input.mes}, ${input.ano}, ${valorPago}, NOW()) ON DUPLICATE KEY UPDATE valorPago = ${valorPago}, dataPagamento = NOW()`);
        return { success: true };
      }),

    desmarcarPaga: ccProtected
      .input(z.object({
        despesaId: z.number().int(),
        mes: z.number().int().min(1).max(12),
        ano: z.number().int(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        await ccExec(`DELETE FROM cc_pagamentos_despesas WHERE despesaId = ${input.despesaId} AND userId = ${userId} AND mes = ${input.mes} AND ano = ${input.ano}`);
        return { success: true };
      }),
  }),
});
