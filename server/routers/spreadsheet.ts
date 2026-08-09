import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  createEarning, getEarningsByUserAndMonth, getEarningsByUserAndYear, updateEarning, deleteEarning,
  createExpense, getExpensesByUserAndMonth, getExpensesByUserAndYear, updateExpense, deleteExpense,
  createOperational, getOperationalByUserAndMonth, updateOperational, deleteOperational,
  createGoal, getGoalsByUserAndMonth, updateGoal, deleteGoal,
} from "../db";
import { getDb } from "../db";
import { spreadsheetClients, spreadsheetPasswords, spreadsheetSessions, spreadsheetLoginAudit, customers, appSettings, customerPasswordSessions } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Resolve o clientId a partir do token de sessão da planilha.
// Lança UNAUTHORIZED se o token for inválido ou expirado.
async function resolveClientId(token: string): Promise<number> {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
  
  // Remover espaços em branco do token
  const cleanToken = token.trim();
  
  const sessionResult = await db.select().from(spreadsheetSessions)
    .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
  const session = sessionResult?.[0] || null;
  
  if (!session) {
    console.error('[resolveClientId] Token não encontrado:', { token: cleanToken, length: cleanToken.length });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida ou expirada. Faça login novamente." });
  }
  
  if (new Date(session.expiresAt) < new Date()) {
    console.error('[resolveClientId] Sessão expirada:', { expiresAt: session.expiresAt });
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida ou expirada. Faça login novamente." });
  }

  // Sliding session: renova a validade a cada uso ativo (login persistente).
  // Renova no maximo 1x por dia para evitar escrita excessiva.
  try {
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
    const currentExpiry = new Date(session.expiresAt);
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (newExpiry.getTime() - currentExpiry.getTime() > oneDayMs) {
      await db.update(spreadsheetSessions)
        .set({ expiresAt: newExpiry })
        .where(eq(spreadsheetSessions.token, cleanToken));
    }
  } catch (e) {
    // Se a renovacao falhar, nao bloqueia o uso da sessao ainda valida
    console.error('[resolveClientId] Falha ao renovar sessao (ignorado):', e);
  }

  return session.clientId as number;
}

// Duracao da sessao do Gestor de Gastos: 90 dias (login persistente)
const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

export const spreadsheetRouter = router({
  // EARNINGS
  createEarning: publicProcedure
    .input(z.object({
      token: z.string(),
      date: z.string(),
      uber: z.string().default("0"),
      ninetynine: z.string().default("0"),
      indrive: z.string().default("0"),
      particular: z.string().default("0"),
      deliveries: z.string().default("0"),
      tips: z.string().default("0"),
      otherEarnings: z.string().default("0"),
    }))
    .mutation(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await createEarning({
        userId: clientId,
        date: input.date,
        uber: input.uber,
        ninetynine: input.ninetynine,
        indrive: input.indrive,
        particular: input.particular,
        deliveries: input.deliveries,
        tips: input.tips,
        otherEarnings: input.otherEarnings,
      });
    }),

  getEarningsByMonth: publicProcedure
    .input(z.object({ token: z.string(), month: z.string() }))
    .query(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await getEarningsByUserAndMonth(clientId, input.month);
    }),

  getEarningsByYear: publicProcedure
    .input(z.object({ token: z.string(), year: z.string() }))
    .query(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await getEarningsByUserAndYear(clientId, input.year);
    }),

  updateEarning: publicProcedure
    .input(z.object({
      token: z.string(),
      id: z.number(),
      uber: z.string().optional(),
      ninetynine: z.string().optional(),
      indrive: z.string().optional(),
      particular: z.string().optional(),
      deliveries: z.string().optional(),
      tips: z.string().optional(),
      otherEarnings: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await resolveClientId(input.token);
      const { token, ...rest } = input;
      return await updateEarning(rest.id, rest);
    }),

  deleteEarning: publicProcedure
    .input(z.object({ token: z.string(), id: z.number() }))
    .mutation(async ({ input }) => {
      await resolveClientId(input.token);
      return await deleteEarning(input.id);
    }),

  // EXPENSES
  createExpense: publicProcedure
    .input(z.object({
      token: z.string(),
      date: z.string(),
      fuel: z.string().default("0"),
      carRental: z.string().default("0"),
      maintenance: z.string().default("0"),
      oilChange: z.string().default("0"),
      washing: z.string().default("0"),
      insurance: z.string().default("0"),
      internetPhone: z.string().default("0"),
      food: z.string().default("0"),
      parking: z.string().default("0"),
      tolls: z.string().default("0"),
      financing: z.string().default("0"),
      fines: z.string().default("0"),
      accessories: z.string().default("0"),
      otherExpenses: z.string().default("0"),
    }))
    .mutation(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await createExpense({
        userId: clientId,
        date: input.date,
        fuel: input.fuel,
        carRental: input.carRental,
        maintenance: input.maintenance,
        oilChange: input.oilChange,
        washing: input.washing,
        insurance: input.insurance,
        internetPhone: input.internetPhone,
        food: input.food,
        parking: input.parking,
        tolls: input.tolls,
        financing: input.financing,
        fines: input.fines,
        accessories: input.accessories,
        otherExpenses: input.otherExpenses,
      });
    }),

  getExpensesByMonth: publicProcedure
    .input(z.object({ token: z.string(), month: z.string() }))
    .query(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await getExpensesByUserAndMonth(clientId, input.month);
    }),

  getExpensesByYear: publicProcedure
    .input(z.object({ token: z.string(), year: z.string() }))
    .query(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await getExpensesByUserAndYear(clientId, input.year);
    }),

  updateExpense: publicProcedure
    .input(z.object({
      token: z.string(),
      id: z.number(),
      fuel: z.string().optional(),
      carRental: z.string().optional(),
      maintenance: z.string().optional(),
      oilChange: z.string().optional(),
      washing: z.string().optional(),
      insurance: z.string().optional(),
      internetPhone: z.string().optional(),
      food: z.string().optional(),
      parking: z.string().optional(),
      tolls: z.string().optional(),
      financing: z.string().optional(),
      fines: z.string().optional(),
      accessories: z.string().optional(),
      otherExpenses: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await resolveClientId(input.token);
      const { token, ...rest } = input;
      return await updateExpense(rest.id, rest);
    }),

  deleteExpense: publicProcedure
    .input(z.object({ token: z.string(), id: z.number() }))
    .mutation(async ({ input }) => {
      await resolveClientId(input.token);
      return await deleteExpense(input.id);
    }),

  // OPERATIONAL
  createOperational: publicProcedure
    .input(z.object({
      token: z.string(),
      date: z.string(),
      kmInitial: z.string().default("0"),
      kmFinal: z.string().default("0"),
      timeInitial: z.string().optional(),
      timeFinal: z.string().optional(),
      rideCount: z.number().default(0),
      ridesUber: z.number().default(0),
      rides99: z.number().default(0),
      ridesIndrive: z.number().default(0),
      ridesParticular: z.number().default(0),
      ridesDeliveries: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      const totalRides = (input.ridesUber || 0) + (input.rides99 || 0) + (input.ridesIndrive || 0) + (input.ridesParticular || 0) + (input.ridesDeliveries || 0);
      return await createOperational({
        userId: clientId,
        date: input.date,
        kmInitial: input.kmInitial,
        kmFinal: input.kmFinal,
        timeInitial: input.timeInitial,
        timeFinal: input.timeFinal,
        rideCount: totalRides,
        ridesUber: input.ridesUber,
        rides99: input.rides99,
        ridesIndrive: input.ridesIndrive,
        ridesParticular: input.ridesParticular,
        ridesDeliveries: input.ridesDeliveries,
      });
    }),

  getOperationalByMonth: publicProcedure
    .input(z.object({ token: z.string(), month: z.string() }))
    .query(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await getOperationalByUserAndMonth(clientId, input.month);
    }),

  updateOperational: publicProcedure
    .input(z.object({
      token: z.string(),
      id: z.number(),
      kmInitial: z.string().optional(),
      kmFinal: z.string().optional(),
      timeInitial: z.string().optional(),
      timeFinal: z.string().optional(),
      rideCount: z.number().optional(),
      ridesUber: z.number().optional(),
      rides99: z.number().optional(),
      ridesIndrive: z.number().optional(),
      ridesParticular: z.number().optional(),
      ridesDeliveries: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      await resolveClientId(input.token);
      const { token, ...rest } = input;
      const data: any = { ...rest };
      if (
        rest.ridesUber !== undefined || rest.rides99 !== undefined || rest.ridesIndrive !== undefined ||
        rest.ridesParticular !== undefined || rest.ridesDeliveries !== undefined
      ) {
        data.rideCount = (rest.ridesUber || 0) + (rest.rides99 || 0) + (rest.ridesIndrive || 0) + (rest.ridesParticular || 0) + (rest.ridesDeliveries || 0);
      }
      return await updateOperational(rest.id, data);
    }),

  deleteOperational: publicProcedure
    .input(z.object({ token: z.string(), id: z.number() }))
    .mutation(async ({ input }) => {
      await resolveClientId(input.token);
      return await deleteOperational(input.id);
    }),

  // GOALS
  createGoal: publicProcedure
    .input(z.object({
      token: z.string(),
      month: z.string(),
      dailyGoal: z.string().default("0"),
      weeklyGoal: z.string().default("0"),
      monthlyGoal: z.string().default("0"),
    }))
    .mutation(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await createGoal({
        userId: clientId,
        month: input.month,
        dailyGoal: input.dailyGoal,
        weeklyGoal: input.weeklyGoal,
        monthlyGoal: input.monthlyGoal,
      });
    }),

  getGoalsByMonth: publicProcedure
    .input(z.object({ token: z.string(), month: z.string() }))
    .query(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      return await getGoalsByUserAndMonth(clientId, input.month);
    }),

  updateGoal: publicProcedure
    .input(z.object({
      token: z.string(),
      id: z.number(),
      dailyGoal: z.string().optional(),
      weeklyGoal: z.string().optional(),
      monthlyGoal: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await resolveClientId(input.token);
      const { token, ...rest } = input;
      return await updateGoal(rest.id, rest);
    }),

  deleteGoal: publicProcedure
    .input(z.object({ token: z.string(), id: z.number() }))
    .mutation(async ({ input }) => {
      await resolveClientId(input.token);
      return await deleteGoal(input.id);
    }),

  // === AUTENTICAÃ‡ÃƒO SPREADSHEET ===

  // Verificar se telefone tem cadastro (etapa 1 do novo fluxo)
  checkPhone: publicProcedure
    .input(z.object({
      identifier: z.string().min(8, "Informe telefone ou CPF"),
      isCpf: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        const raw = input.identifier.replace(/\D/g, '');
        // Usar flag explícita enviada pelo frontend; nunca inferir CPF apenas pelo comprimento
        const isCpf = input.isCpf === true;
        const normalizedPhone = isCpf ? null : raw;
        const normalizedCpf = isCpf ? raw : null;

        let client: any = null;

        if (isCpf) {
          // Buscar por CPF em spreadsheetClients
          const byCpfResult = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.cpf, normalizedCpf!)).limit(1);
          client = byCpfResult?.[0] || null;

          // Se não encontrou em spreadsheetClients, buscar em customers por CPF
          if (!client) {
            const customerResult = await db.select().from(customers)
              .where(eq(customers.cpf, normalizedCpf!)).limit(1);
            const customer = customerResult?.[0] || null;

                        if (!customer) {
              return { status: 'not_found' as const, clientName: null };
            }
            // Verificar bloqueio na tabela customers antes de criar spreadsheetClient
            if ((customer as any).blocked === 1) {
              return { status: 'blocked' as const, clientName: customer.name, blockReason: (customer as any).blockReason || 'Acesso bloqueado' };
            }
            // Verificar se já existe spreadsheetClient pelo telefone deste customer
            const existingByPhone = await db.select().from(spreadsheetClients)
              .where(eq(spreadsheetClients.phone, customer.phone.replace(/\D/g, ''))).limit(1);
            if (existingByPhone?.[0]) {
              // Atualizar CPF no registro existente e usar ele
              await db.update(spreadsheetClients)
                .set({ cpf: normalizedCpf, updatedAt: new Date() })
                .where(eq(spreadsheetClients.id, existingByPhone[0].id));
              client = { ...existingByPhone[0], cpf: normalizedCpf };
            } else {
              // Criar registro em spreadsheetClients a partir do customer
              const insertResult = await db.insert(spreadsheetClients).values({
                phone: customer.phone.replace(/\D/g, ''),
                name: customer.name,
                cpf: normalizedCpf,
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              client = {
                id: (insertResult as any).insertId,
                phone: customer.phone.replace(/\D/g, ''),
                name: customer.name,
                cpf: normalizedCpf,
                status: 'active',
              };
            }
          }
        } else {
          // Buscar por telefone em spreadsheetClients
          let clientResult = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.phone, normalizedPhone!)).limit(1);
          client = clientResult?.[0] || null;

          // Tentar sem DDD (9 dígitos finais) caso o banco tenha o número sem DDD
          if (!client && normalizedPhone!.length === 11) {
            const sem_ddd = normalizedPhone!.slice(2);
            const bySemDdd = await db.select().from(spreadsheetClients)
              .where(eq(spreadsheetClients.phone, sem_ddd)).limit(1);
            client = bySemDdd?.[0] || null;
          }

          // Se não encontrou em spreadsheetClients, buscar em customers (cadastro geral)
          if (!client) {
            // Tentar com e sem DDD no customers também
            let customerResult = await db.select().from(customers)
              .where(eq(customers.phone, normalizedPhone!)).limit(1);
            if (!customerResult?.[0] && normalizedPhone!.length === 11) {
              const sem_ddd = normalizedPhone!.slice(2);
              customerResult = await db.select().from(customers)
                .where(eq(customers.phone, sem_ddd)).limit(1);
            }
                        const customer = customerResult?.[0] || null;
            if (!customer) {
              return { status: 'not_found' as const, clientName: null };
            }
            // Verificar bloqueio na tabela customers antes de criar spreadsheetClient
            if ((customer as any).blocked === 1) {
              return { status: 'blocked' as const, clientName: customer.name, blockReason: (customer as any).blockReason || 'Acesso bloqueado' };
            }
            // Cliente existe em customers â€” criar registro em spreadsheetClients automaticamente
            const insertResult = await db.insert(spreadsheetClients).values({
              phone: normalizedPhone!,
              name: customer.name,
              cpf: customer.cpf || null,
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            client = {
              id: (insertResult as any).insertId,
              phone: normalizedPhone!,
              name: customer.name,
              cpf: customer.cpf || null,
              status: 'active',
            };
          }
        }

        if (client.status === 'blocked') {
          return { status: 'blocked' as const, clientName: client.name };
        }

        // Verificar bloqueio na tabela customers (mesmo que spreadsheetClient exista com status 'active')
        // O bloqueio no painel admin atualiza customers.blocked, não spreadsheetClients.status
        {
          const custPhone = client.phone || normalizedPhone || normalizedCpf;
          if (custPhone) {
            let custRows = await db.select({ blocked: customers.blocked, blockReason: customers.blockReason, name: customers.name })
              .from(customers).where(eq(customers.phone, custPhone)).limit(1);
            if (!custRows?.[0] && custPhone.length === 11) {
              custRows = await db.select({ blocked: customers.blocked, blockReason: customers.blockReason, name: customers.name })
                .from(customers).where(eq(customers.phone, custPhone.slice(2))).limit(1);
            }
            if (!custRows?.[0] && isCpf && normalizedCpf) {
              custRows = await db.select({ blocked: customers.blocked, blockReason: customers.blockReason, name: customers.name })
                .from(customers).where(eq(customers.cpf, normalizedCpf)).limit(1);
            }
            const custRow = custRows?.[0];
            if (custRow && (custRow as any).blocked === 1) {
              return { status: 'blocked' as const, clientName: client.name, blockReason: (custRow as any).blockReason || 'Acesso bloqueado' };
            }
          }
        }

        // Verificar se já tem senha ativa pendente (criada pelo cliente, aguardando admin)
        const pwResult = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, client.id),
            eq(spreadsheetPasswords.isActive, 1)
          )).limit(1);
        const pw = pwResult?.[0] || null;

        if (pw && pw.pendingApproval === 1) {
          return { status: 'pending_approval' as const, clientName: client.name };
        }

        if (pw && pw.expiresAt && new Date(pw.expiresAt) < new Date()) {
          return { status: 'expired' as const, clientName: client.name };
        }

        if (pw && !pw.expiresAt && pw.pendingApproval !== 1) {
          // Senha sem validade definida pelo admin (caso legado) - tratar como pendente
          return { status: 'pending_approval' as const, clientName: client.name };
        }

        if (pw) {
          return { status: 'has_password' as const, clientName: client.name };
        }

        // Verificar se já criou senha antes (mesmo inativa) - bloqueio histórico
        const anyClientPwResult = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, client.id),
            eq(spreadsheetPasswords.createdByClient, 1)
          )).limit(1);
        const anyClientPw = anyClientPwResult?.[0] || null;

        if (anyClientPw) {
          // Já criou senha antes mas está sem senha ativa (venceu e admin não renovou)
          return { status: 'expired_no_renew' as const, clientName: client.name };
        }

        // Tem cadastro mas não tem senha ainda
        return { status: 'no_password' as const, clientName: client.name };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao verificar telefone" });
      }
    }),

  // Cliente cria sua própria senha (etapa 2 do novo fluxo - APENAS primeiro acesso)
  clientCreatePassword: publicProcedure
    .input(z.object({
      phone: z.string().min(10, "Telefone inválido"),
      password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
      confirmPassword: z.string().min(6),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        if (input.password !== input.confirmPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "As senhas não coincidem" });
        }

        const normalizedPhone = input.phone.replace(/\D/g, '');

        let clientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, normalizedPhone)).limit(1);
        // Tentar sem DDD caso o banco tenha o número sem DDD
        if (!clientResult?.[0] && normalizedPhone.length === 11) {
          const sem_ddd = normalizedPhone.slice(2);
          clientResult = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.phone, sem_ddd)).limit(1);
        }
        const client = clientResult?.[0] || null;

        if (!client) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro não encontrado" });
        }
        if (client.status === 'blocked') {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso bloqueado" });
        }

        // NOVA REGRA: verificar se já existe senha bloqueada (já foi criada pelo cliente antes)
        const existingPwResult = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, client.id),
            eq(spreadsheetPasswords.isActive, 1)
          )).limit(1);
        const existingPw = existingPwResult?.[0] || null;

        if (existingPw && existingPw.passwordLocked === 1) {
          throw new TRPCError({ code: "FORBIDDEN", message: "PASSWORD_ALREADY_SET" });
        }

        // Verificar se já existe alguma senha criada pelo cliente (mesmo inativa) - bloqueio histórico
        const anyClientPwResult = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, client.id),
            eq(spreadsheetPasswords.createdByClient, 1)
          )).limit(1);
        const anyClientPw = anyClientPwResult?.[0] || null;

        if (anyClientPw) {
          throw new TRPCError({ code: "FORBIDDEN", message: "PASSWORD_ALREADY_SET" });
        }

        // Desativar senhas anteriores
        await db.update(spreadsheetPasswords)
          .set({ isActive: 0 })
          .where(eq(spreadsheetPasswords.clientId, client.id));

        // Criar senha pendente (sem validade - admin precisa definir)
        const passwordHash = bcrypt.hashSync(input.password, 10);
        await db.insert(spreadsheetPasswords).values({
          clientId: client.id,
          password: passwordHash,
          isActive: 1,
          pendingApproval: 1,
          createdByClient: 1,
          clientCreatedAt: new Date(),
          createdAt: new Date(),
          passwordLocked: 1, // Bloquear imediatamente - só pode criar senha uma vez
        });

        return { success: true, clientName: client.name };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar senha" });
      }
    }),

  // Admin define validade/vencimento de senha pendente
  adminSetExpiry: publicProcedure
    .input(z.object({
      clientId: z.number(),
      expirationHours: z.number().min(1).max(8760), // até 1 ano
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        const clientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.id, input.clientId)).limit(1);
        const client = clientResult?.[0] || null;
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });

        const pwResult = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, input.clientId),
            eq(spreadsheetPasswords.isActive, 1)
          )).limit(1);
        const pw = pwResult?.[0] || null;
        if (!pw) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma senha ativa encontrada" });

        const expiresAt = new Date(Date.now() + input.expirationHours * 60 * 60 * 1000);

        await db.update(spreadsheetPasswords)
          .set({ expiresAt, pendingApproval: 0 })
          .where(eq(spreadsheetPasswords.id, pw.id));

        return { success: true, clientName: client.name, expiresAt: expiresAt.toISOString() };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao definir validade" });
      }
    }),

  // Registrar acesso via sessão ativa (chamado ao abrir a planilha)
  // Incrementa accessCount na sessão para contagem precisa sem criar registros de audit em excesso
  recordAccess: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) return { success: false };
        const cleanToken = input.token.trim();
        const sessionResult = await db.select().from(spreadsheetSessions)
          .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
        const session = sessionResult?.[0] || null;
        if (!session || new Date(session.expiresAt) < new Date()) return { success: false };
        // Incrementar contador de acessos e atualizar lastAccessAt
        await db.update(spreadsheetSessions)
          .set({
            accessCount: (session.accessCount || 1) + 1,
            lastAccessAt: new Date(),
          })
          .where(eq(spreadsheetSessions.token, cleanToken));
        return { success: true };
      } catch (e) {
        console.error('[recordAccess] Error:', e);
        return { success: false };
      }
    }),

  // Login com telefone + senha
  login: publicProcedure
    .input(z.object({
      phone: z.string().min(10, "Telefone ou CPF inválido"),
      password: z.string().min(1, "Senha obrigatória"),
      isCpf: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        const raw = input.phone.replace(/\D/g, '');
        // Usar flag explícita; nunca inferir CPF apenas pelo comprimento do número
        const isCpf = input.isCpf === true;
        
        let client: any = null;

        if (isCpf) {
          // Buscar por CPF
          const byCpf = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.cpf, raw)).limit(1);
          client = byCpf?.[0] || null;
        } else {
          // Buscar por telefone: tentar com e sem DDD
          const byPhone = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.phone, raw)).limit(1);
          client = byPhone?.[0] || null;
          if (!client) {
            // Tentar sem DDD (9 dígitos finais) caso o banco tenha o número sem DDD
            const sem_ddd = raw.length === 11 ? raw.slice(2) : null;
            if (sem_ddd) {
              const bySemDdd = await db.select().from(spreadsheetClients)
                .where(eq(spreadsheetClients.phone, sem_ddd)).limit(1);
              client = bySemDdd?.[0] || null;
            }
          }
          if (!client) {
            const byPhoneOrig = await db.select().from(spreadsheetClients)
              .where(eq(spreadsheetClients.phone, input.phone)).limit(1);
            client = byPhoneOrig?.[0] || null;
          }
        }

        if (!client) {
          // Registrar tentativa falhada
          await db.insert(spreadsheetLoginAudit).values({
            phone: input.phone,
            status: "failed",
            ipAddress: (ctx.req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req?.socket?.remoteAddress || 'unknown',
            userAgent: (ctx.req?.headers?.['user-agent'] as string) || 'unknown',
          });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Telefone ou senha incorretos" });
        }

        if (client.status === "blocked") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Acesso bloqueado" });
        }

        // Buscar senha ativa do cliente
        const passwordResult = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, client.id),
            eq(spreadsheetPasswords.isActive, 1)
          )).limit(1);
        
        const passwordRecord = passwordResult?.[0] || null;

        if (!passwordRecord) {
          await db.insert(spreadsheetLoginAudit).values({
            clientId: client.id,
            phone: input.phone,
            status: "failed",
            ipAddress: (ctx.req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req?.socket?.remoteAddress || 'unknown',
            userAgent: (ctx.req?.headers?.['user-agent'] as string) || 'unknown',
          });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Nenhuma senha ativa para este cliente" });
        }

        // Bloquear se senha está pendente de aprovação (admin ainda não definiu validade)
        if (passwordRecord.pendingApproval === 1) {
          throw new TRPCError({ code: "FORBIDDEN", message: "PENDING_APPROVAL" });
        }

        // Bloquear se senha não tem validade definida (admin não configurou)
        if (!passwordRecord.expiresAt) {
          throw new TRPCError({ code: "FORBIDDEN", message: "PENDING_APPROVAL" });
        }

        // Verificar expiração
        if (passwordRecord.expiresAt && new Date(passwordRecord.expiresAt) < new Date()) {
          await db.insert(spreadsheetLoginAudit).values({
            clientId: client.id,
            phone: input.phone,
            status: "failed",
            ipAddress: (ctx.req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req?.socket?.remoteAddress || 'unknown',
            userAgent: (ctx.req?.headers?.['user-agent'] as string) || 'unknown',
          });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha expirada" });
        }

        // Comparar senha - suporta HASH bcrypt E texto plano automaticamente
        let storedPassword = passwordRecord.password;
        if (Buffer.isBuffer(storedPassword)) {
          storedPassword = storedPassword.toString('utf8');
        }
        if (typeof storedPassword !== 'string') {
          storedPassword = String(storedPassword);
        }

        let passwordValid = false;
        // Se a senha armazenada parece ser um hash bcrypt (começa com $2a$, $2b$ ou $2y$)
        if (/^\$2[aby]\$/.test(storedPassword)) {
          try {
            passwordValid = bcrypt.compareSync(input.password, storedPassword);
          } catch (e) {
            passwordValid = false;
          }
        } else {
          // Senha em texto plano
          passwordValid = input.password === storedPassword;
        }
        
        if (!passwordValid) {
          await db.insert(spreadsheetLoginAudit).values({
            clientId: client.id,
            phone: input.phone,
            status: "failed",
            ipAddress: (ctx.req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req?.socket?.remoteAddress || 'unknown',
            userAgent: (ctx.req?.headers?.['user-agent'] as string) || 'unknown',
          });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Telefone ou senha incorretos" });
        }

        // Gerar token de sessão
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + SESSION_DURATION_MS); // 90 dias (login persistente)

        console.log('[spreadsheet.login] Token gerado:', { token, expiresAt, clientId: client.id });

        await db.insert(spreadsheetSessions).values({
          clientId: client.id,
          token,
          expiresAt,
        });

        // Registrar sucesso
        await db.insert(spreadsheetLoginAudit).values({
          clientId: client.id,
          phone: input.phone,
          status: "success",
          ipAddress: (ctx.req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ctx.req?.socket?.remoteAddress || 'unknown',
          userAgent: (ctx.req?.headers?.['user-agent'] as string) || 'unknown',
        });

        console.log('[spreadsheet.login] Login bem-sucedido:', { token, clientId: client.id, clientName: client.name });
        
        return {
          success: true,
          token,
          clientId: client.id,
          clientName: client.name,
        };
      } catch (error) {
        console.error('[spreadsheet.login] Error:', error);
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao fazer login: ${error instanceof Error ? error.message : String(error)}` });
      }
    }),

  // Verificar se sessão é válida
  verifySession: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        const sessionResult = await db.select().from(spreadsheetSessions)
          .where(eq(spreadsheetSessions.token, input.token)).limit(1);
        
        const session = sessionResult?.[0] || null;

        if (!session || new Date(session.expiresAt) < new Date()) {
          return { valid: false };
        }

        const clientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.id, session.clientId)).limit(1);
        
        const client = clientResult?.[0] || null;

        return {
          valid: true,
          clientId: session.clientId,
          clientName: client?.name,
        };
      } catch (error) {
        return { valid: false };
      }
    }),

  // Retornar informações do plano para o cliente logado (vencimento da senha)
  getClientPlanInfo: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) return null;

        const sessionResult = await db.select().from(spreadsheetSessions)
          .where(eq(spreadsheetSessions.token, input.token)).limit(1);
        const session = sessionResult?.[0] || null;
        if (!session) return null;

        const clientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.id, session.clientId)).limit(1);
        const client = clientResult?.[0] || null;
        if (!client) return null;

        const pwResult = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, client.id),
            eq(spreadsheetPasswords.isActive, 1)
          )).limit(1);
        const pw = pwResult?.[0] || null;

        // Buscar foto do cadastro principal
        let profilePhotoUrl: string | null = null;
        try {
          const cleanPhone = String(client.phone || '').replace(/\D/g, '');
          const customerRows = await db.execute(`SELECT profilePhotoUrl FROM customers WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = '${cleanPhone}' LIMIT 1`);
          const customerRow = (customerRows as any)[0]?.[0];
          profilePhotoUrl = customerRow?.profilePhotoUrl || null;
        } catch (_) {}

        return {
          clientName: client.name,
          phone: client.phone,
          expiresAt: pw?.expiresAt ? new Date(pw.expiresAt).toISOString() : null,
          isActive: pw ? (pw.expiresAt ? new Date(pw.expiresAt) > new Date() : false) : false,
          profilePhotoUrl,
        };
      } catch (error) {
        return null;
      }
    }),

  // Logout
  logout: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) return { success: false };

        await db.delete(spreadsheetSessions).where(eq(spreadsheetSessions.token, input.token));
        return { success: true };
      } catch (error) {
        return { success: false };
      }
    }),

  // === ADMIN PROCEDURES ===
  // Criar novo cliente
  adminCreateClient: publicProcedure
    .input(z.object({
      phone: z.string().min(10, "Telefone inválido"),
      name: z.string().min(1, "Nome obrigatório"),
      password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        // Normalizar telefone
        const normalizedPhone = input.phone.replace(/\D/g, '');

        // Verificar se cliente já existe
        const existingClientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, normalizedPhone)).limit(1);
        
        const existingClient = existingClientResult?.[0] || null;

        if (existingClient) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente com este telefone já existe" });
        }

        // Criar cliente
        const result = await db.insert(spreadsheetClients).values({
          phone: normalizedPhone,
          name: input.name,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const clientId = (result as any).insertId;

        // Gerar hash da senha
        const passwordHash = bcrypt.hashSync(input.password, 12);

        // Criar senha para o cliente
        await db.insert(spreadsheetPasswords).values({
          clientId: clientId,
          password: passwordHash,
          isActive: 1,
          createdAt: new Date(),
        });

        return {
          success: true,
          clientId,
          phone: normalizedPhone,
          name: input.name,
          password: input.password,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao criar cliente",
        });
      }
    }),

  // Listar todos os clientes
  adminListClients: publicProcedure
    .query(async () => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        const clients = await db.select().from(spreadsheetClients);
        return clients;
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao listar clientes",
        });
      }
    }),

  // Gerar nova senha para cliente
  adminGeneratePassword: publicProcedure
    .input(z.object({
      clientId: z.number(),
      password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        // Verificar se cliente existe
        const clientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.id, input.clientId)).limit(1);
        
        const client = clientResult?.[0] || null;

        if (!client) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
        }

        // Desativar senhas anteriores
        await db.update(spreadsheetPasswords)
          .set({ isActive: 0 })
          .where(eq(spreadsheetPasswords.clientId, input.clientId));

        // Armazenar senha em texto plano (sem hash)
        // TODO: Considerar usar hash bcrypt no futuro se necessário
        const passwordValue = input.password;

        // Criar nova senha
        await db.insert(spreadsheetPasswords).values({
          clientId: input.clientId,
          password: passwordValue,
          isActive: 1,
          createdAt: new Date(),
        });

        return {
          success: true,
          clientId: input.clientId,
          clientName: client.name,
          password: input.password,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao gerar senha",
        });
      }
    }),

  // Buscar cliente por telefone na h2colombiano.com
  adminSearchCustomer: publicProcedure
    .input(z.object({
      phone: z.string().min(10, "Telefone inválido"),
    }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        // Normalizar telefone
        const normalizedPhone = input.phone.replace(/\D/g, '');

        // Buscar cliente em customers (h2colombiano.com) - usar db diretamente
        const customer = await db.select().from(customers).where(eq(customers.phone, normalizedPhone)).limit(1);

        if (!customer || customer.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado na h2colombiano.com" });
        }

        const customerData = customer[0];

        // Verificar se cliente já existe em spreadsheetClients
        const spreadsheetClient = await db.select().from(spreadsheetClients).where(eq(spreadsheetClients.phone, normalizedPhone)).limit(1);

        return {
          success: true,
          customer: {
            id: customerData.id,
            name: customerData.name,
            phone: customerData.phone,
            email: customerData.email,
            city: customerData.city,
            uf: customerData.uf,
          },
          spreadsheetClientId: spreadsheetClient?.[0]?.id || null,
          alreadyHasAccess: spreadsheetClient && spreadsheetClient.length > 0,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: error.code || "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao buscar cliente",
        });
      }
    }),

  // Gerar senha temporária com data de expiração
  adminGenerateTemporaryPassword: publicProcedure
    .input(z.object({
      phone: z.string().min(10, "Telefone inválido"),
      expirationHours: z.number().min(1).max(720).default(24),
      manualPassword: z.string().optional(),
      searchOnly: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        // Normalizar telefone
        const normalizedPhone = input.phone.replace(/\D/g, '');

        // Buscar cliente em customers (h2colombiano.com)
        const customerResult = await db.select().from(customers).where(eq(customers.phone, normalizedPhone)).limit(1);
        if (!customerResult || customerResult.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
        }
        const customer = customerResult[0];

        // Se for apenas busca, retornar dados do cliente
        if (input.searchOnly) {
          return {
            success: true,
            clientName: customer.name,
            phone: normalizedPhone,
            password: '',
            expiresAt: new Date().toISOString(),
            expirationHours: 0,
          };
        }

        // Verificar ou criar cliente em spreadsheetClients
        const existingClient = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, normalizedPhone)).limit(1);
        
        let spreadsheetClient: any;
        if (existingClient && existingClient.length > 0) {
          spreadsheetClient = existingClient[0];
        } else {
          // Criar cliente em spreadsheetClients
          const result = await db.insert(spreadsheetClients).values({
            phone: normalizedPhone,
            name: customer.name,
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          spreadsheetClient = {
            id: (result as any).insertId,
            phone: normalizedPhone,
            name: customer.name,
            status: "active",
          };
        }

        // Usar senha manual ou gerar automática
        const plainPassword = input.manualPassword || Math.random().toString(36).slice(-8);
        const passwordHash = bcrypt.hashSync(plainPassword, 12);

        // Calcular data de expiração
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + input.expirationHours);

        // Desativar senhas anteriores
        await db.update(spreadsheetPasswords)
          .set({ isActive: 0 })
          .where(eq(spreadsheetPasswords.clientId, spreadsheetClient.id));

        // Criar nova senha com expiração
        await db.insert(spreadsheetPasswords).values({
          clientId: spreadsheetClient.id,
          password: passwordHash,
          isActive: 1,
          expiresAt: expiresAt,
          createdAt: new Date(),
        });

        return {
          success: true,
          clientId: spreadsheetClient.id,
          clientName: customer.name,
          phone: normalizedPhone,
          password: plainPassword,
          expiresAt: expiresAt.toISOString(),
          expirationHours: input.expirationHours,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: error.code || "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao gerar senha temporária",
        });
      }
    }),

  // Deletar cliente
  adminDeleteClient: publicProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        // Deletar senhas do cliente
        await db.delete(spreadsheetPasswords).where(eq(spreadsheetPasswords.clientId, input.clientId));

        // Deletar cliente
        await db.delete(spreadsheetClients).where(eq(spreadsheetClients.id, input.clientId));

        return { success: true };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao deletar cliente",
        });
      }
    }),

  // Deletar apenas a senha do cliente (mantém o cadastro)
  adminDeletePassword: publicProcedure
    .input(z.object({ clientId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        // Desativar todas as senhas do cliente (não deleta o cliente)
        await db.delete(spreadsheetPasswords).where(eq(spreadsheetPasswords.clientId, input.clientId));

        return { success: true };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao deletar senha",
        });
      }
    }),

  // Admin renova acesso de cliente cujo plano venceu (reseta histórico para permitir nova senha)
  adminRenewAccess: publicProcedure
    .input(z.object({
      clientId: z.number(),
      expirationHours: z.number().min(1).max(8760).optional(), // opcional: se informado, já define nova validade
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        const clientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.id, input.clientId)).limit(1);
        const client = clientResult?.[0] || null;
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });

        // Preservar o vencimento da senha ativa atual (reset = troca de senha, não renovação)
        const activePwRows = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, input.clientId),
            eq(spreadsheetPasswords.isActive, 1)
          ));
        let preservedExpiresAt: Date | null = null;
        for (const pw of activePwRows) {
          if (pw.expiresAt && (!preservedExpiresAt || new Date(pw.expiresAt) > preservedExpiresAt)) {
            preservedExpiresAt = new Date(pw.expiresAt);
          }
        }
        // Salvar vencimento preservado no cliente (para uso na próxima criação de senha)
        if (preservedExpiresAt) {
          await db.update(spreadsheetClients)
            .set({ preservedExpiresAt })
            .where(eq(spreadsheetClients.id, input.clientId));
        }

        // Deletar TODAS as senhas (ativas e inativas) para resetar o histórico
        // Isso permite que o cliente crie uma nova senha no próximo acesso
        await db.delete(spreadsheetPasswords)
          .where(eq(spreadsheetPasswords.clientId, input.clientId));

        return { success: true, clientName: client.name };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao renovar acesso",
        });
      }
    }),

  // Listar todos os clientes do gestor de gastos com status da senha e último acesso
  adminListClientsWithStatus: publicProcedure
    .query(async () => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });
        // Migração automática: adicionar coluna allowedRoutes se não existir
        try { await db.execute(`ALTER TABLE spreadsheetClients ADD COLUMN allowedRoutes VARCHAR(255) NULL`); } catch (_) {}

        const clients = await db.select().from(spreadsheetClients);
        const now = new Date();
        const result = [] as any[];

        for (const client of clients) {
          // Senha ativa mais recente
          const passwords = await db.select().from(spreadsheetPasswords)
            .where(and(
              eq(spreadsheetPasswords.clientId, client.id),
              eq(spreadsheetPasswords.isActive, 1)
            ));
          // Escolher a senha ativa com created mais recente
          let activePassword: any = null;
          for (const p of passwords) {
            if (!activePassword || new Date(p.createdAt) > new Date(activePassword.createdAt)) {
              activePassword = p;
            }
          }

          // Contagem de acessos: soma de accessCount de todas as sessões do cliente
          // (cada vez que o usuário abre a planilha, accessCount é incrementado)
          const sessions = await db.select().from(spreadsheetSessions)
            .where(eq(spreadsheetSessions.clientId, client.id));
          let lastAccess: Date | null = null;
          let totalAccess = 0;
          let accessLast7Days = 0;
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          for (const s of sessions) {
            const cnt = s.accessCount || 1;
            totalAccess += cnt;
            // Para lastAccess: usar lastAccessAt se disponivel, senao createdAt
            const t = s.lastAccessAt ? new Date(s.lastAccessAt) : new Date(s.createdAt);
            if (!lastAccess || t > lastAccess) lastAccess = t;
            // Para acessos nos últimos 7 dias: aproximação com base no lastAccessAt
            if (t >= sevenDaysAgo) {
              // Se o último acesso foi nos últimos 7 dias, conta pelo menos 1 acesso recente
              accessLast7Days += Math.min(cnt, cnt); // conta todos os acessos da sessão como recentes se o último foi recente
            }
          }

          let passwordStatus: "active" | "expired" | "none" | "pending" = "none";
          let expiresAt: string | null = null;
          let clientCreatedAt: string | null = null;
          if (activePassword) {
            expiresAt = activePassword.expiresAt ? new Date(activePassword.expiresAt).toISOString() : null;
            clientCreatedAt = activePassword.clientCreatedAt ? new Date(activePassword.clientCreatedAt).toISOString() : null;
            if (activePassword.pendingApproval === 1) {
              passwordStatus = "pending";
            } else if (!activePassword.expiresAt) {
              // Sem validade definida - tratar como pendente
              passwordStatus = "pending";
            } else if (new Date(activePassword.expiresAt) < now) {
              passwordStatus = "expired";
            } else {
              passwordStatus = "active";
            }
          }

          // Verificar se cliente já criou senha antes (mesmo inativa) - para saber se precisa de renovação pelo admin
          const anyClientPwResult = await db.select().from(spreadsheetPasswords)
            .where(and(
              eq(spreadsheetPasswords.clientId, client.id),
              eq(spreadsheetPasswords.createdByClient, 1)
            )).limit(1);
          const hasEverCreatedPassword = (anyClientPwResult?.[0] || null) !== null;

          // Buscar foto do cadastro principal pelo telefone
          let profilePhotoUrl: string | null = null;
          try {
            const cleanPhone = String(client.phone || '').replace(/\D/g, '');
            const customerRows = await db.execute(`SELECT profilePhotoUrl FROM customers WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = '${cleanPhone}' LIMIT 1`);
            const customerRow = (customerRows as any)[0]?.[0];
            profilePhotoUrl = customerRow?.profilePhotoUrl || null;
          } catch (_) {}

          result.push({
            id: client.id,
            name: client.name,
            phone: client.phone,
            cpf: client.cpf || null,
            status: client.status,
            passwordStatus,
            expiresAt,
            clientCreatedAt,
            lastAccess: lastAccess ? lastAccess.toISOString() : null,
            createdAt: new Date(client.createdAt).toISOString(),
            totalAccess,
            accessLast7Days,
            hasEverCreatedPassword,
            profilePhotoUrl,
            allowedRoutes: (client as any).allowedRoutes || '',
          });
        }

        // Ordenar: ativos primeiro, depois por último acesso mais recente
        result.sort((a, b) => {
          if (a.passwordStatus === b.passwordStatus) {
            const la = a.lastAccess ? new Date(a.lastAccess).getTime() : 0;
            const lb = b.lastAccess ? new Date(b.lastAccess).getTime() : 0;
            return lb - la;
          }
          const order: Record<string, number> = { pending: 0, active: 1, expired: 2, none: 3 };
          return order[a.passwordStatus] - order[b.passwordStatus];
        });

        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "Erro ao listar clientes",
        });
      }
    }),

  // â”€â”€â”€ Toggle global de modo de senha â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Retorna o modo atual: 'manual' (ADM libera) ou 'auto' (cliente cria direto)
  getPasswordMode: publicProcedure
    .query(async () => {
      try {
        const db = await getDb() as any;
        if (!db) return { mode: 'manual' as const };
        const rows = await db.select().from(appSettings)
          .where(eq(appSettings.key, 'senha_gastos_ativa')).limit(1);
        const val = rows?.[0]?.value ?? 'true';
        // 'true' = modo manual (ADM libera), 'false' = modo auto (cliente cria direto)
        return { mode: val === 'false' ? 'auto' as const : 'manual' as const };
      } catch {
        return { mode: 'manual' as const };
      }
    }),

  // ADM alterna o modo
  setPasswordMode: publicProcedure
    .input(z.object({ mode: z.enum(['manual', 'auto']) }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível' });
        const val = input.mode === 'auto' ? 'false' : 'true';
        await db.insert(appSettings)
          .values({ key: 'senha_gastos_ativa', value: val })
          .onDuplicateKeyUpdate({ set: { value: val } });
        return { success: true, mode: input.mode };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao salvar configuração' });
      }
    }),

  // Cliente cria senha automaticamente (modo auto) â€” 30 dias, sem pendingApproval
  clientCreatePasswordAuto: publicProcedure
    .input(z.object({
      phone: z.string().min(10, 'Telefone inválido'),
      password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
      confirmPassword: z.string().min(6),
      sourceRoute: z.string().optional(), // rota de origem: 'gastos' ou 'emprestimo'
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível' });

        if (input.password !== input.confirmPassword) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'As senhas não coincidem' });
        }

        // Verificar se o modo auto está ativo
        const modeRows = await db.select().from(appSettings)
          .where(eq(appSettings.key, 'senha_gastos_ativa')).limit(1);
        const modeVal = modeRows?.[0]?.value ?? 'true';
        if (modeVal !== 'false') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Modo de auto-criação não está ativo' });
        }

        const normalizedPhone = input.phone.replace(/\D/g, '');
        let clientResultAuto = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, normalizedPhone)).limit(1);
        // Tentar sem DDD caso o banco tenha o número sem DDD
        if (!clientResultAuto?.[0] && normalizedPhone.length === 11) {
          const sem_ddd = normalizedPhone.slice(2);
          clientResultAuto = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.phone, sem_ddd)).limit(1);
        }
        let client: any = clientResultAuto?.[0] || null;

        // Se não encontrou em spreadsheetClients, buscar em customers e criar automaticamente
        if (!client) {
          let custResult = await db.select().from(customers)
            .where(eq(customers.phone, normalizedPhone)).limit(1);
          if (!custResult?.[0] && normalizedPhone.length === 11) {
            const sem_ddd = normalizedPhone.slice(2);
            custResult = await db.select().from(customers)
              .where(eq(customers.phone, sem_ddd)).limit(1);
          }
          const customer = custResult?.[0] || null;
          if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cadastro não encontrado' });
          if ((customer as any).blocked === 1) throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso bloqueado' });
          // Criar spreadsheetClient automaticamente a partir do customers
          const insertResult = await db.insert(spreadsheetClients).values({
            phone: normalizedPhone,
            name: customer.name,
            cpf: (customer as any).cpf || null,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          client = {
            id: (insertResult as any).insertId,
            phone: normalizedPhone,
            name: customer.name,
            status: 'active',
            preservedExpiresAt: null,
          };
        }

        if (!client) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cadastro não encontrado' });
        if (client.status === 'blocked') throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso bloqueado' });

        // Verificar se já tem senha ativa válida
        const existingPwResult = await db.select().from(spreadsheetPasswords)
          .where(and(
            eq(spreadsheetPasswords.clientId, client.id),
            eq(spreadsheetPasswords.isActive, 1)
          )).limit(1);
        const existingPw = existingPwResult?.[0] || null;

        if (existingPw && existingPw.expiresAt && new Date(existingPw.expiresAt) > new Date()) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Já existe uma senha ativa para este cadastro' });
        }

        // Desativar senhas anteriores
        await db.update(spreadsheetPasswords)
          .set({ isActive: 0 })
          .where(eq(spreadsheetPasswords.clientId, client.id));

        // Criar senha: se há vencimento preservado (reset = troca de senha), usa ele; senão 30 dias
        const bcryptLib = await import('bcryptjs');
        const passwordHash = bcryptLib.hashSync(input.password, 10);
        const preserved = client.preservedExpiresAt ? new Date(client.preservedExpiresAt) : null;
        const isPreserved = preserved && preserved > new Date();
        const expiresAt = isPreserved ? preserved! : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await db.insert(spreadsheetPasswords).values({
          clientId: client.id,
          password: passwordHash,
          isActive: 1,
          pendingApproval: 0,
          createdByClient: 1,
          clientCreatedAt: new Date(),
          createdAt: new Date(),
          passwordLocked: 1,
          expiresAt,
        });

                // Limpar o vencimento preservado após uso e salvar rota de origem
        const updateSet: any = { preservedExpiresAt: null };
        if (input.sourceRoute) {
          // Adicionar a rota de origem se ainda não estiver nas rotas permitidas
          const existingRoutes = ((client as any).allowedRoutes || '').split(',').map((r: string) => r.trim()).filter(Boolean);
          if (!existingRoutes.includes(input.sourceRoute)) {
            existingRoutes.push(input.sourceRoute);
          }
          updateSet.allowedRoutes = existingRoutes.join(',');
        }
        await db.update(spreadsheetClients)
          .set(updateSet)
          .where(eq(spreadsheetClients.id, client.id));
        return { success: true, clientName: client.name, expiresAt: expiresAt.toISOString() };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar senha' });
      }
    }),

  // Buscar rotas permitidas de um cliente pelo telefone
  getClientRoutesByPhone: publicProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) return { allowedRoutes: '' };
        try { await db.execute(`ALTER TABLE spreadsheetClients ADD COLUMN allowedRoutes VARCHAR(255) NULL`); } catch (_) {}
        const normalizedPhone = input.phone.replace(/\D/g, '');
        let result = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, normalizedPhone)).limit(1);
        if (!result?.[0] && normalizedPhone.length === 11) {
          result = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.phone, normalizedPhone.slice(2))).limit(1);
        }
        const client = result?.[0] || null;
        return { allowedRoutes: (client as any)?.allowedRoutes || '', clientId: client?.id || null };
      } catch (_) {
        return { allowedRoutes: '', clientId: null };
      }
    }),

  // Atualizar rotas permitidas pelo telefone do cliente (para o AdminCustomers)
  updateClientRoutesByPhone: publicProcedure
    .input(z.object({
      phone: z.string(),
      allowedRoutes: z.string(),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) return { success: false };
        try { await db.execute(`ALTER TABLE spreadsheetClients ADD COLUMN allowedRoutes VARCHAR(255) NULL`); } catch (_) {}
        const normalizedPhone = input.phone.replace(/\D/g, '');
        let result = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, normalizedPhone)).limit(1);
        if (!result?.[0] && normalizedPhone.length === 11) {
          result = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.phone, normalizedPhone.slice(2))).limit(1);
        }
        const client = result?.[0] || null;
        if (!client) {
          // Criar spreadsheetClient se não existir
          const custResult = await db.select().from(customers)
            .where(eq(customers.phone, normalizedPhone)).limit(1);
          const customer = custResult?.[0] || null;
          if (!customer) return { success: false, message: 'Cliente não encontrado' };
          await db.insert(spreadsheetClients).values({
            phone: normalizedPhone,
            name: customer.name,
            cpf: (customer as any).cpf || null,
            status: 'active',
            allowedRoutes: input.allowedRoutes || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } else {
          await db.update(spreadsheetClients)
            .set({ allowedRoutes: input.allowedRoutes || null, updatedAt: new Date() } as any)
            .where(eq(spreadsheetClients.id, client.id));
        }
        return { success: true };
      } catch (error) {
        return { success: false };
      }
    }),

  // ADM atualiza dados do cliente (nome, telefone, CPF)
  // Atualizar rotas permitidas por cliente
  adminUpdateAllowedRoutes: publicProcedure
    .input(z.object({
      clientId: z.number(),
      allowedRoutes: z.string(), // ex: "gastos,emprestimo" ou "gastos" ou ""
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível' });
        // Migração automática: adicionar coluna allowedRoutes se não existir
        try {
          await db.execute(`ALTER TABLE spreadsheetClients ADD COLUMN allowedRoutes VARCHAR(255) NULL`);
        } catch (_) { /* coluna já existe */ }
        await db.update(spreadsheetClients)
          .set({ allowedRoutes: input.allowedRoutes || null, updatedAt: new Date() } as any)
          .where(eq(spreadsheetClients.id, input.clientId));
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar rotas' });
      }
    }),

  // Verificar se cliente tem acesso a uma rota específica (por token de sessão)
  checkRouteAccess: publicProcedure
    .input(z.object({
      token: z.string(),
      route: z.string(), // ex: "gastos" ou "emprestimo"
    }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) return { allowed: true }; // se banco indisponível, não bloquear
        // Migração automática: garantir que a coluna allowedRoutes existe
        try { await db.execute(`ALTER TABLE spreadsheetClients ADD COLUMN allowedRoutes VARCHAR(255) NULL`); } catch (_) {}
        const cleanToken = input.token.trim();
        if (!cleanToken) return { allowed: true };

        let phone: string | null = null;

        // 1) Tentar como cp_token (sistema de senha do site - customerPasswordSessions)
        try {
          const cpSessionResult = await db.select().from(customerPasswordSessions)
            .where(eq(customerPasswordSessions.token, cleanToken)).limit(1);
          const cpSession = cpSessionResult?.[0] || null;
          if (cpSession && new Date(cpSession.expiresAt) >= new Date()) {
            phone = cpSession.phone ? cpSession.phone.replace(/\D/g, '') : null;
          }
        } catch (_) {}

        // 2) Se não encontrou como cp_token, tentar como spreadsheetSession
        if (!phone) {
          const sessionResult = await db.select().from(spreadsheetSessions)
            .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
          const session = sessionResult?.[0] || null;
          if (session && new Date(session.expiresAt) >= new Date()) {
            // Buscar telefone pelo clientId
            const clientResult = await db.select().from(spreadsheetClients)
              .where(eq(spreadsheetClients.id, session.clientId)).limit(1);
            const client = clientResult?.[0] || null;
            if (client) phone = (client as any).phone ? (client as any).phone.replace(/\D/g, '') : null;
          }
        }

        // Se não encontrou sessão válida, não bloquear (token pode ser de outro sistema)
        if (!phone) return { allowed: true };

        // Buscar allowedRoutes pelo telefone em spreadsheetClients
        const clientByPhone = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, phone)).limit(1);
        const client = clientByPhone?.[0] || null;

        // Se não tem spreadsheetClient, não bloquear
        if (!client) return { allowed: true };

        // null = sem restrição (acesso total a todas as rotas)
        if (!(client as any).allowedRoutes) return { allowed: true, allowedRoutes: [] };
        const routes = ((client as any).allowedRoutes || '').split(',').map((r: string) => r.trim()).filter(Boolean);
        return { allowed: routes.includes(input.route), allowedRoutes: routes };
      } catch (_) {
        return { allowed: true }; // em caso de erro, não bloquear
      }
    }),

  checkRouteAccessByPhone: publicProcedure
    .input(z.object({
      phone: z.string(),
      route: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) return { allowed: true };
        try { await db.execute(`ALTER TABLE spreadsheetClients ADD COLUMN allowedRoutes VARCHAR(255) NULL`); } catch (_) {}
        const cleanPhone = input.phone.replace(/\D/g, '');
        if (!cleanPhone) return { allowed: true };
        const clientByPhone = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, cleanPhone)).limit(1);
        const client = clientByPhone?.[0] || null;
        if (!client) return { allowed: true };
        if (!(client as any).allowedRoutes) return { allowed: true, allowedRoutes: [] };
        const routes = ((client as any).allowedRoutes || '').split(',').map((r: string) => r.trim()).filter(Boolean);
        return { allowed: routes.includes(input.route), allowedRoutes: routes };
      } catch (_) {
        return { allowed: true };
      }
    }),

  adminUpdateClient: publicProcedure
    .input(z.object({
      clientId: z.number(),
      name: z.string().min(1, 'Nome obrigatório').optional(),
      phone: z.string().min(10, 'Telefone inválido').optional(),
      cpf: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível' });

        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (input.name !== undefined) updateData.name = input.name.trim();
        if (input.phone !== undefined) updateData.phone = input.phone.replace(/\D/g, '');
        if (input.cpf !== undefined) {
          const cleanCpf = input.cpf.replace(/\D/g, '');
          updateData.cpf = cleanCpf || null;
        }

        await db.update(spreadsheetClients)
          .set(updateData)
          .where(eq(spreadsheetClients.id, input.clientId));

        const updated = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.id, input.clientId)).limit(1);
        const c = updated?.[0];
        if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });

        return { success: true, clientId: c.id, name: c.name, phone: c.phone, cpf: c.cpf || null };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar cliente' });
      }
    }),

  // Apagar TODOS os dados lançados pelo cliente (ganhos, gastos, operacional, metas)
  deleteAllData: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco de dados indisponível' });
      const { spreadsheetEarnings, spreadsheetExpenses, spreadsheetOperational, spreadsheetGoals } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      await db.delete(spreadsheetEarnings).where(eq(spreadsheetEarnings.userId, clientId));
      await db.delete(spreadsheetExpenses).where(eq(spreadsheetExpenses.userId, clientId));
      await db.delete(spreadsheetOperational).where(eq(spreadsheetOperational.userId, clientId));
      await db.delete(spreadsheetGoals).where(eq(spreadsheetGoals.userId, clientId));
      return { success: true };
    }),

});
