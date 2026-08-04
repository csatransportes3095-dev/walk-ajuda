// ─── Router do Sistema de Cartões de Crédito ─────────────────────────────────
// Integrado ao h2colombiano — tabelas cc_* no mesmo banco
// Autenticação própria: telefone + senha bcrypt + JWT em cookie (cc_session)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
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

// ─── Função central de cálculo financeiro do cartão ─────────────────────────────
// Regras:
// - Competência do ciclo corrente é sempre baseada no fechamentoDia (sem avançar por causa de atraso)
// - Fatura em atraso = gastos paga=0 de competências ANTERIORES ao ciclo corrente
// - Fatura atual = gastos paga=0 do ciclo corrente
// - Próxima fatura = gastos paga=0 do próximo ciclo
async function calcCartao(c: any) {
  const cartaoId = c.id;
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const fechDia = c.fechamentoDia ? Number(c.fechamentoDia) : null;
  const vencDia = Number(c.vencimentoDia);
  const limiteTotal = parseFloat(c.limiteTotal);

  // ── Determinar competência do ciclo corrente ──────────────────────────────
  // O ciclo corrente é sempre o mês atual (baseado no fechamento).
  // Quando diaHoje > fechDia, o ciclo ACABOU DE FECHAR e a fatura está aguardando pagamento.
  // Não avançamos a competência — isso causaria a fatura vencida desaparecer.
  // A competência corrente = mês atual até o fechamento.
  // A competência seguinte = mês seguinte.
  const compMes = hoje.getMonth() + 1;
  const compAno = hoje.getFullYear();
  const compStr = `${compAno}-${String(compMes).padStart(2, '0')}`;

  // Próxima competência (mês seguinte)
  const proxDate = new Date(compAno, compMes, 1);
  const proxMes = proxDate.getMonth() + 1;
  const proxAno = proxDate.getFullYear();
  const proxStr = `${proxAno}-${String(proxMes).padStart(2, '0')}`;

  // ── Detectar fatura em atraso ─────────────────────────────────────────────
  // Fatura em atraso = gastos paga=0 de competências ANTERIORES ao mês atual
  // (ou seja, DATE_FORMAT(data,'%Y-%m') < compStr)
  const gastosAtrasados = await ccExec(
    `SELECT valor FROM cc_gastos WHERE cartaoId = ${cartaoId} AND paga = 0 AND DATE_FORMAT(data, '%Y-%m') < '${compStr}'`
  );
  const valorEmAtraso = Math.round(gastosAtrasados.reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0) * 100) / 100;

  // Calcular competência da fatura em atraso (a mais recente anterior ao mês atual)
  let faturaEmAtraso: { valor: number; competencia: string; vencimento: string; diasAtraso: number } | null = null;
  if (valorEmAtraso > 0) {
    // Buscar a competência mais recente com gastos em atraso
    const compAtrasadaRows = await ccExec(
      `SELECT DATE_FORMAT(data, '%Y-%m') as comp FROM cc_gastos WHERE cartaoId = ${cartaoId} AND paga = 0 AND DATE_FORMAT(data, '%Y-%m') < '${compStr}' ORDER BY data DESC LIMIT 1`
    );
    const compAtrasada = compAtrasadaRows[0]?.comp ?? '';
    if (compAtrasada) {
      const [aAno, aMes] = compAtrasada.split('-').map(Number);
      // Vencimento da fatura atrasada = dia de vencimento no mês seguinte ao fechamento
      // Se vencDia > fechDia: vence no mesmo mês do fechamento
      // Se vencDia <= fechDia: vence no mês seguinte ao fechamento
      let vencAno = aAno;
      let vencMesIdx = aMes - 1; // 0-indexed
      if (fechDia && vencDia > fechDia) {
        // vence no mesmo mês da competência
        vencMesIdx = aMes - 1;
        vencAno = aAno;
      } else {
        // vence no mês seguinte à competência
        vencMesIdx = aMes; // aMes é 1-indexed, então aMes como 0-indexed = próximo mês
        if (vencMesIdx > 11) { vencMesIdx = 0; vencAno = aAno + 1; }
      }
      const dataVenc = new Date(vencAno, vencMesIdx, vencDia, 23, 59, 59);
      const diasAtraso = Math.max(0, Math.ceil((hoje.getTime() - dataVenc.getTime()) / 86400000));
      faturaEmAtraso = {
        valor: valorEmAtraso,
        competencia: compAtrasada,
        vencimento: dataVenc.toISOString().slice(0, 10),
        diasAtraso,
      };
    }
  }

  // ── Fatura Atual = gastos paga=0 do ciclo corrente ────────────────────────
  // Se há fatura em atraso, a fatura atual mostra o ciclo corrente separado
  const gastosAtual = await ccExec(
    `SELECT valor FROM cc_gastos WHERE cartaoId = ${cartaoId} AND paga = 0 AND DATE_FORMAT(data, '%Y-%m') = '${compStr}'`
  );
  const faturaAtual = Math.round(gastosAtual.reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0) * 100) / 100;

  // ── Próxima Fatura = gastos paga=0 do próximo ciclo ───────────────────────
  const gastosProx = await ccExec(
    `SELECT valor FROM cc_gastos WHERE cartaoId = ${cartaoId} AND paga = 0 AND DATE_FORMAT(data, '%Y-%m') = '${proxStr}'`
  );
  const proximaFatura = Math.round(gastosProx.reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0) * 100) / 100;

  // ── Limite Utilizado = todas as parcelas pendentes ────────────────────────
  const todosPendentes = await ccExec(
    `SELECT valor, numeroParcela FROM cc_gastos WHERE cartaoId = ${cartaoId} AND paga = 0`
  );
  const limiteUsado = Math.round(todosPendentes.reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0) * 100) / 100;
  const limiteDisponivel = Math.round((limiteTotal - limiteUsado) * 100) / 100;
  const pctLimite = limiteTotal > 0 ? Math.round((limiteUsado / limiteTotal) * 10000) / 100 : 0;

  // Totais para o dashboard
  const totalAVista = Math.round(todosPendentes.filter((g: any) => !g.numeroParcela).reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0) * 100) / 100;
  const totalParcelado = Math.round(todosPendentes.filter((g: any) => g.numeroParcela).reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0) * 100) / 100;
  const numParcelasAtivas = todosPendentes.filter((g: any) => g.numeroParcela).length;

  return {
    faturaAtual,
    proximaFatura,
    faturaEmAtraso,
    limiteUsado,
    limiteDisponivel,
    pctLimite,
    totalAVista,
    totalParcelado,
    numParcelasAtivas,
    competenciaAtual: compStr,
    proximaCompetencia: proxStr,
  };
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
    get: ccProtected
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const rows = await ccExec(`SELECT * FROM cc_cartoes WHERE id = ${input.id} AND userId = ${userId} LIMIT 1`);
        if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND' });
        const c = rows[0] as any;
        const calc = await calcCartao(c);
        return { ...c, limiteTotal: parseFloat(c.limiteTotal), ...calc };
      }),

    list: ccProtected.query(async ({ ctx }) => {
      const userId = (ctx as any).ccUserId as number;
      const lista = await ccExec(`SELECT * FROM cc_cartoes WHERE userId = ${userId}`);
      return Promise.all(lista.map(async (c: any) => {
        const calc = await calcCartao(c);
        return { ...c, limiteTotal: parseFloat(c.limiteTotal), ...calc };
      }));
    }),

    create: ccProtected
      .input(z.object({
        nome: z.string().min(1).max(100),
        vencimentoDia: z.number().int().min(1).max(31),
        fechamentoDia: z.number().int().min(1).max(31).optional().nullable(),
        limiteTotal: z.number().positive(),
        corCartao: z.string().default("blue"),
        banco: z.string().max(60).optional().nullable(),
        bandeira: z.string().max(20).optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const fechamento = input.fechamentoDia ?? "NULL";
        const banco = input.banco ? `'${input.banco.replace(/'/g, "''")}'` : "NULL";
        const bandeira = input.bandeira ? `'${input.bandeira.replace(/'/g, "''")}'` : "NULL";
        await ccExec(`INSERT INTO cc_cartoes (userId, nome, vencimentoDia, fechamentoDia, limiteTotal, corCartao, banco, bandeira) VALUES (${userId}, '${input.nome.replace(/'/g, "''")}', ${input.vencimentoDia}, ${fechamento}, ${input.limiteTotal}, '${input.corCartao}', ${banco}, ${bandeira})`);
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
        banco: z.string().max(60).optional().nullable(),
        bandeira: z.string().max(20).optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const sets: string[] = [];
        if (input.nome !== undefined) sets.push(`nome = '${input.nome.replace(/'/g, "''")}' `);
        if (input.vencimentoDia !== undefined) sets.push(`vencimentoDia = ${input.vencimentoDia}`);
        if (input.fechamentoDia !== undefined) sets.push(`fechamentoDia = ${input.fechamentoDia ?? "NULL"}`);
        if (input.limiteTotal !== undefined) sets.push(`limiteTotal = ${input.limiteTotal}`);
        if (input.corCartao !== undefined) sets.push(`corCartao = '${input.corCartao}'`);
        if (input.banco !== undefined) sets.push(`banco = ${input.banco ? `'${input.banco.replace(/'/g, "''")}'` : "NULL"}`);
        if (input.bandeira !== undefined) sets.push(`bandeira = ${input.bandeira ? `'${input.bandeira.replace(/'/g, "''")}'` : "NULL"}`);
        if (sets.length === 0) return { success: true };
        await ccExec(`UPDATE cc_cartoes SET ${sets.join(", ")} WHERE id = ${input.id} AND userId = ${userId}`);
        return { success: true };
      }),

    // Histórico de faturas por mês
    historico: ccProtected
      .input(z.object({ cartaoId: z.number().int(), meses: z.number().int().min(1).max(24).default(6) }))
      .query(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT * FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: 'NOT_FOUND' });
        const hoje = new Date();
        const resultado: any[] = [];
        for (let i = 0; i < input.meses; i++) {
          const refDate = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
          const mes = refDate.getMonth() + 1;
          const ano = refDate.getFullYear();
          const mesStr = `${ano}-${String(mes).padStart(2, '0')}`;
          const gastosMes = await ccExec(`SELECT g.id, g.descricao, g.valor, g.data, g.paga, g.numeroParcela, g.totalParcelas, p.descricao as parcelDescricao FROM cc_gastos g LEFT JOIN cc_parcelamentos p ON g.parcelamentoId = p.id WHERE g.cartaoId = ${input.cartaoId} AND DATE_FORMAT(g.data, '%Y-%m') = '${mesStr}'`);
          const totalMes = gastosMes.reduce((s: number, g: any) => s + parseFloat(g.valor || 0), 0);
          const pagsMes = await ccExec(`SELECT * FROM cc_pagamentos WHERE cartaoId = ${input.cartaoId} AND DATE_FORMAT(dataPagamento, '%Y-%m') = '${mesStr}'`);
          const totalPago = pagsMes.reduce((s: number, p: any) => s + parseFloat(p.valorPago || 0), 0);
          const isAtual = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();
          const status = isAtual ? 'aberta' : (totalPago >= totalMes && totalMes > 0) ? 'paga' : (totalMes > 0 ? 'pendente' : 'vazia');
          resultado.push({
            mesStr, mes, ano, total: totalMes, totalPago, status,
            gastos: gastosMes.map((g: any) => ({ ...g, valor: parseFloat(g.valor) })),
            pagamentos: pagsMes.map((p: any) => ({ ...p, valorPago: parseFloat(p.valorPago) })),
          });
        }
        return resultado;
      }),

    // Indicadores inteligentes
    indicadores: ccProtected
      .input(z.object({ cartaoId: z.number().int() }))
      .query(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT * FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: 'NOT_FOUND' });
        const c = cartao[0] as any;
        const calc = await calcCartao(c);
        const hoje = new Date();
        const diaHoje = hoje.getDate();
        const fechDia = c.fechamentoDia ? Number(c.fechamentoDia) : null;
        const vencDia = Number(c.vencimentoDia);
        const calcDias = (dia: number) => {
          let d = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
          if (d.getDate() < diaHoje) d = new Date(hoje.getFullYear(), hoje.getMonth() + 1, dia);
          return Math.ceil((d.getTime() - hoje.getTime()) / 86400000);
        };
        const diasParaFechar = fechDia ? calcDias(fechDia) : null;
        const diasParaVencer = calcDias(vencDia);
        const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
        const msgs: string[] = [];
        if (fechDia && diasParaFechar !== null && diasParaFechar <= 3) msgs.push(`⚠️ Fatura fecha em ${diasParaFechar === 0 ? 'hoje' : diasParaFechar + (diasParaFechar === 1 ? ' dia' : ' dias')}`);
        if (diasParaVencer <= 5 && calc.faturaAtual > 0) msgs.push(`🔔 Fatura vence em ${diasParaVencer === 0 ? 'hoje' : diasParaVencer + (diasParaVencer === 1 ? ' dia' : ' dias')}`);
        if (calc.pctLimite >= 80) msgs.push(`🚨 Você utilizou ${calc.pctLimite.toFixed(0)}% do limite`);
        else if (calc.pctLimite >= 50) msgs.push(`⚡ Você utilizou ${calc.pctLimite.toFixed(0)}% do limite`);
        if (calc.numParcelasAtivas > 0) msgs.push(`📦 Possui ${calc.numParcelasAtivas} parcela${calc.numParcelasAtivas !== 1 ? 's' : ''} ativa${calc.numParcelasAtivas !== 1 ? 's' : ''}`);
        if (calc.limiteUsado > 0) msgs.push(`💡 Após pagar esta fatura seu limite ficará em ${fmt(parseFloat(c.limiteTotal))}`);
        return { ...calc, diasParaFechar, diasParaVencer, msgs };
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

    // Alias para compatibilidade com chamadas antigas
    create: ccProtected
      .input(z.object({
        cartaoId: z.number().int(),
        valorPago: z.number().positive(),
        observacao: z.string().max(200).optional(),
        competencia: z.string().optional(), // formato YYYY-MM — quando passado, baixa só gastos dessa competência
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const obs = input.observacao ? `'${input.observacao.replace(/'/g, "''")}' ` : "NULL";
        await ccExec(`INSERT INTO cc_pagamentos (cartaoId, valorPago, observacao) VALUES (${input.cartaoId}, ${input.valorPago}, ${obs})`);
        // Se competência especificada: baixar apenas gastos daquela competência
        // Caso contrário: baixar os mais antigos primeiro até cobrir o valor
        let gastos: any[];
        if (input.competencia) {
          gastos = await ccExec(`SELECT id, valor FROM cc_gastos WHERE cartaoId = ${input.cartaoId} AND paga = 0 AND DATE_FORMAT(data, '%Y-%m') = '${input.competencia}' ORDER BY data ASC`);
        } else {
          gastos = await ccExec(`SELECT id, valor FROM cc_gastos WHERE cartaoId = ${input.cartaoId} AND paga = 0 ORDER BY data ASC`);
        }
        let restante = input.valorPago;
        let parcelasMarcadas = 0;
        for (const g of gastos) {
          if (restante <= 0) break;
          await ccExec(`UPDATE cc_gastos SET paga = 1, dataOriginal = data, data = NOW() WHERE id = ${g.id}`);
          restante -= parseFloat(g.valor);
          parcelasMarcadas++;
        }
        return { success: true, parcelasMarcadas };
      }),

    pagar: ccProtected
      .input(z.object({
        cartaoId: z.number().int(),
        valorPago: z.number().positive(),
        observacao: z.string().max(200).optional(),
        competencia: z.string().optional(), // formato YYYY-MM — quando passado, baixa só gastos dessa competência
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const obs = input.observacao ? `'${input.observacao.replace(/'/g, "''")}' ` : "NULL";
        await ccExec(`INSERT INTO cc_pagamentos (cartaoId, valorPago, observacao) VALUES (${input.cartaoId}, ${input.valorPago}, ${obs})`);
        // Se competência especificada: baixar apenas gastos daquela competência
        // Caso contrário: baixar os mais antigos primeiro até cobrir o valor
        let gastos: any[];
        if (input.competencia) {
          gastos = await ccExec(`SELECT id, valor FROM cc_gastos WHERE cartaoId = ${input.cartaoId} AND paga = 0 AND DATE_FORMAT(data, '%Y-%m') = '${input.competencia}' ORDER BY data ASC`);
        } else {
          gastos = await ccExec(`SELECT id, valor FROM cc_gastos WHERE cartaoId = ${input.cartaoId} AND paga = 0 ORDER BY data ASC`);
        }
        let restante = input.valorPago;
        let parcelasMarcadas = 0;
        for (const g of gastos) {
          if (restante <= 0) break;
          await ccExec(`UPDATE cc_gastos SET paga = 1, dataOriginal = data, data = NOW() WHERE id = ${g.id}`);
          restante -= parseFloat(g.valor);
          parcelasMarcadas++;
        }
        return { success: true, parcelasMarcadas };
      }),

    cancelar: ccProtected
      .input(z.object({ id: z.number().int(), cartaoId: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        await ccExec(`DELETE FROM cc_pagamentos WHERE id = ${input.id} AND cartaoId = ${input.cartaoId}`);
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

    editar: ccProtected
      .input(z.object({
        id: z.number().int(),
        cartaoId: z.number().int(),
        descricao: z.string().min(1).max(200).optional(),
        responsavel: z.string().max(100).optional().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx as any).ccUserId as number;
        const cartao = await ccExec(`SELECT id FROM cc_cartoes WHERE id = ${input.cartaoId} AND userId = ${userId} LIMIT 1`);
        if (!cartao.length) throw new TRPCError({ code: "NOT_FOUND" });
        const sets: string[] = [];
        if (input.descricao !== undefined) sets.push(`descricao = '${input.descricao.replace(/'/g, "''")}'`);
        if (input.responsavel !== undefined) sets.push(`responsavel = ${input.responsavel ? `'${input.responsavel.replace(/'/g, "''")}'` : "NULL"}`);
        if (sets.length > 0) {
          await ccExec(`UPDATE cc_parcelamentos SET ${sets.join(", ")} WHERE id = ${input.id} AND cartaoId = ${input.cartaoId}`);
          // Atualizar descrição das parcelas também
          if (input.descricao !== undefined) {
            const parcelas = await ccExec(`SELECT id, numeroParcela, totalParcelas FROM cc_gastos WHERE parcelamentoId = ${input.id} AND cartaoId = ${input.cartaoId}`);
            for (const p of parcelas) {
              const novaDesc = `${input.descricao} (${p.numeroParcela}/${p.totalParcelas})`;
              await ccExec(`UPDATE cc_gastos SET descricao = '${novaDesc.replace(/'/g, "''")}' WHERE id = ${p.id}`);
            }
          }
        }
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

  // ── Admin ───────────────────────────────────────────────────────────────────────
  admin: router({
    // Listar todos os usuários do sistema de cartões
    listUsers: adminProcedure.query(async () => {
      const users = await ccExec(`
        SELECT u.id, u.phone, u.name, u.createdAt, u.updatedAt,
          (SELECT COUNT(*) FROM cc_cartoes WHERE userId = u.id) as numCartoes,
          (SELECT COUNT(*) FROM cc_gastos g JOIN cc_cartoes c ON g.cartaoId = c.id WHERE c.userId = u.id AND g.paga = 0) as gastosAbertos
        FROM cc_app_users u ORDER BY u.createdAt DESC
      `);
      return users.map((u: any) => ({
        ...u,
        numCartoes: Number(u.numCartoes),
        gastosAbertos: Number(u.gastosAbertos),
      }));
    }),

    // Resetar senha de um usuário
    resetPassword: adminProcedure
      .input(z.object({
        userId: z.number().int(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ input }) => {
        const hash = await bcrypt.hash(input.newPassword, 10);
        await ccExec(`UPDATE cc_app_users SET passwordHash = '${hash}' WHERE id = ${input.userId}`);
        return { success: true };
      }),

    // Criar usuário manualmente
    createUser: adminProcedure
      .input(z.object({
        phone: z.string().min(10).max(11),
        name: z.string().min(2).max(100),
        password: z.string().min(6),
      }))
      .mutation(async ({ input }) => {
        const existing = await ccExec(`SELECT id FROM cc_app_users WHERE phone = '${input.phone}' LIMIT 1`);
        if (existing.length > 0) throw new TRPCError({ code: 'CONFLICT', message: 'Telefone já cadastrado' });
        const hash = await bcrypt.hash(input.password, 10);
        await ccExec(`INSERT INTO cc_app_users (phone, passwordHash, name) VALUES ('${input.phone}', '${hash}', '${input.name.replace(/'/g, "''")}')`);
        return { success: true };
      }),

    // Excluir usuário (e todos os dados)
    deleteUser: adminProcedure
      .input(z.object({ userId: z.number().int() }))
      .mutation(async ({ input }) => {
        await ccExec(`DELETE FROM cc_app_users WHERE id = ${input.userId}`);
        return { success: true };
      }),

    // Atualizar nome do usuário
    updateUser: adminProcedure
      .input(z.object({
        userId: z.number().int(),
        name: z.string().min(2).max(100),
        phone: z.string().min(10).max(11),
      }))
      .mutation(async ({ input }) => {
        await ccExec(`UPDATE cc_app_users SET name = '${input.name.replace(/'/g, "''")}', phone = '${input.phone}' WHERE id = ${input.userId}`);
        return { success: true };
      }),

    // Resumo de um usuário (cartões + gastos)
    getUserDetail: adminProcedure
      .input(z.object({ userId: z.number().int() }))
      .query(async ({ input }) => {
        const user = await ccExec(`SELECT id, phone, name, createdAt FROM cc_app_users WHERE id = ${input.userId} LIMIT 1`);
        if (!user.length) throw new TRPCError({ code: 'NOT_FOUND' });
        const cartoes = await ccExec(`
          SELECT c.id, c.nome, c.limiteTotal, c.vencimentoDia, c.corCartao,
            COALESCE(SUM(CASE WHEN g.paga = 0 THEN g.valor ELSE 0 END), 0) as faturaAberta,
            COUNT(CASE WHEN g.paga = 0 THEN 1 END) as numGastosAbertos
          FROM cc_cartoes c
          LEFT JOIN cc_gastos g ON g.cartaoId = c.id
          WHERE c.userId = ${input.userId}
          GROUP BY c.id
        `);
        return {
          user: user[0],
          cartoes: cartoes.map((c: any) => ({
            ...c,
            limiteTotal: parseFloat(c.limiteTotal),
            faturaAberta: parseFloat(c.faturaAberta),
            numGastosAbertos: Number(c.numGastosAbertos),
          })),
        };
      }),
  }),
});
