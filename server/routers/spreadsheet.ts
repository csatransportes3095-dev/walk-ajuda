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
import { syncUnifiedCustomerRegistry, requireCompleteMainCustomerProfile } from "../customerIdentity";
import { findMainCustomerByIdentity, getRouteAccess, normalizeCustomerPhone, setCustomerRoutePermissions } from "../customerAccess";
import { spreadsheetClients, spreadsheetPasswords, spreadsheetSessions, spreadsheetLoginAudit, spreadsheetReferralDeclarations, customers, appSettings, customerPasswordSessions } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { isValidCPF, normalizeCpf } from "@shared/cpf";
import { resolveReferralDeclaration } from "../referral";
import { getCustomerProfileUpdateState } from "../customerProfileUpdatePolicy";

// Resolve o clientId a partir do token de sessão da planilha.
// Lança UNAUTHORIZED se o token for inválido ou expirado.
export async function resolveClientId(token: string): Promise<number> {
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

  // Regra de segurança no backend: um token não permite ignorar o perfil obrigatório
  // nem uma rota removida pelo ADM através de chamadas diretas à API.
  const clientResult = await db.select().from(spreadsheetClients)
    .where(eq(spreadsheetClients.id, session.clientId)).limit(1);
  const client = clientResult?.[0] || null;
  if (!client) throw new TRPCError({ code: "UNAUTHORIZED", message: "Cadastro de acesso não encontrado." });
  try {
    await requireCompleteMainCustomerProfile(db, { phone: client.phone || '', cpf: client.cpf || '' });
  } catch {
    throw new TRPCError({ code: "FORBIDDEN", message: "Atualize foto, e-mail, CPF e telefone no cadastro principal para continuar." });
  }
  const accessCustomer = await findMainCustomerByIdentity({ phone: client.phone || '', cpf: client.cpf || '' }, db);
  if (!accessCustomer) throw new TRPCError({ code: "FORBIDDEN", message: "Conclua o cadastro principal para continuar." });
  const access = await getRouteAccess(accessCustomer.id, db);
  if (access.restricted && !access.routes.includes('gastos')) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso não autorizado para a área de Gastos." });
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

// Resolve o cliente autenticado para o manifesto de indicação da rota informada.
// A validação é isolada e não altera o login, a sessão ou as permissões existentes.
async function resolveReferralManifestClient(token: string, route: 'gastos' | 'emprestimo') {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco de dados indisponível' });

  const cleanToken = token.trim();
  const sessionResult = await db.select().from(spreadsheetSessions)
    .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
  const session = sessionResult?.[0] || null;
  if (!session || new Date(session.expiresAt) < new Date()) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  const clientResult = await db.select().from(spreadsheetClients)
    .where(eq(spreadsheetClients.id, session.clientId)).limit(1);
  const client = clientResult?.[0] || null;
  if (!client) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Cadastro de acesso não encontrado.' });

  const mainCustomer = await findMainCustomerByIdentity({ phone: client.phone || '', cpf: client.cpf || '' }, db);
  if (mainCustomer) {
    const access = await getRouteAccess(mainCustomer.id, db);
    if (access.restricted && !access.routes.includes(route)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso não autorizado para esta área.' });
    }
  }

  return { db, client };
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
      requestedRoute: z.enum(['site', 'gastos', 'emprestimo']).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível" });

        // Usar flag explícita enviada pelo frontend; nunca inferir CPF apenas pelo comprimento.
        const isCpf = input.isCpf === true;
        const raw = isCpf ? normalizeCpf(input.identifier) : input.identifier.replace(/\D/g, '');
        if (isCpf && !isValidCPF(raw)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF inválido' });
        }
        const normalizedPhone = isCpf ? null : raw;
        const normalizedCpf = isCpf ? raw : null;

        let client: any = null;
        // O perfil principal identifica o cliente em todas as rotas, mesmo se
        // Gastos ainda tiver o telefone salvo em outro formato técnico.
        const mainCustomer = await findMainCustomerByIdentity({
          phone: normalizedPhone || undefined,
          cpf: normalizedCpf || undefined,
        }, db);
        if (mainCustomer) {
          try {
            await requireCompleteMainCustomerProfile(db, { phone: mainCustomer.phone || '', cpf: mainCustomer.cpf || '' });
          } catch (profileError: any) {
            const profile = { name: mainCustomer.name || '', phone: mainCustomer.phone || '', cpf: mainCustomer.cpf || '', email: mainCustomer.email || '', city: mainCustomer.city || '', uf: mainCustomer.uf || '', profilePhotoUrl: mainCustomer.profilePhotoUrl || '' };
            const policyState = await getCustomerProfileUpdateState(mainCustomer);
            const baseMissingFields = [!profile.name && 'name', !profile.phone && 'phone', !profile.cpf && 'cpf', !profile.email && 'email', !profile.profilePhotoUrl && 'photo'].filter(Boolean) as string[];
            const missingFields = Array.from(new Set([...baseMissingFields, ...policyState.effectiveFields]));
            return { status: 'profile_incomplete' as const, clientName: mainCustomer.name, message: profileError?.message || 'Atualize os dados pendentes para continuar.', profile, missingFields, requiredFields: missingFields };
          }
          const canonicalPhone = normalizeCustomerPhone(mainCustomer.phone);
          const existingTechnical = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.phone, canonicalPhone)).limit(1);
          if (existingTechnical?.[0]) {
            client = existingTechnical[0];
          } else {
            const insertResult = await db.insert(spreadsheetClients).values({
              phone: canonicalPhone,
              name: mainCustomer.name || 'CLIENTE',
              cpf: mainCustomer.cpf || null,
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            client = { id: (insertResult as any).insertId, phone: canonicalPhone, name: mainCustomer.name, cpf: mainCustomer.cpf || null, status: 'active' };
          }
        }

        if (isCpf && !client) {
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
        } else if (!client) {
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

        try {
          await requireCompleteMainCustomerProfile(db, { phone: client.phone || normalizedPhone || '', cpf: client.cpf || normalizedCpf || '' });
        } catch (profileError: any) {
          const mainProfile = await findMainCustomerByIdentity({ phone: client.phone || normalizedPhone || undefined, cpf: client.cpf || normalizedCpf || undefined }, db);
          const profile = { name: mainProfile?.name || client.name || '', phone: mainProfile?.phone || client.phone || normalizedPhone || '', cpf: mainProfile?.cpf || client.cpf || normalizedCpf || '', email: mainProfile?.email || '', city: mainProfile?.city || '', uf: mainProfile?.uf || '', profilePhotoUrl: mainProfile?.profilePhotoUrl || '' };
          const policyState = mainProfile ? await getCustomerProfileUpdateState(mainProfile) : null;
          const baseMissingFields = [!profile.name && 'name', !profile.phone && 'phone', !profile.cpf && 'cpf', !profile.email && 'email', !profile.profilePhotoUrl && 'photo'].filter(Boolean) as string[];
          const missingFields = Array.from(new Set([...baseMissingFields, ...(policyState?.effectiveFields || [])]));
          return { status: 'profile_incomplete' as const, clientName: profile.name, message: profileError?.message || 'Atualize os dados pendentes para continuar.', profile, missingFields, requiredFields: missingFields };
        }

        if (client.status === 'blocked') {
          return { status: 'blocked' as const, clientName: client.name };
        }

        const accessCustomer = await findMainCustomerByIdentity({ phone: client.phone || normalizedPhone || undefined, cpf: client.cpf || normalizedCpf || undefined }, db);
        const requestedRoute = input.requestedRoute || 'gastos';
        if (accessCustomer) {
          const profileUpdateState = await getCustomerProfileUpdateState(accessCustomer);
          if (profileUpdateState.pending) {
            const profile = { name: accessCustomer.name || '', phone: accessCustomer.phone || '', cpf: accessCustomer.cpf || '', email: accessCustomer.email || '', city: accessCustomer.city || '', uf: accessCustomer.uf || '', profilePhotoUrl: accessCustomer.profilePhotoUrl || '' };
            return {
              status: 'profile_incomplete' as const,
              clientName: accessCustomer.name,
              message: 'Atualização cadastral obrigatória pelo administrador. Conclua os campos solicitados para continuar.',
              profile,
              missingFields: profileUpdateState.effectiveFields,
              requiredFields: profileUpdateState.effectiveFields,
            };
          }
        }
        if (accessCustomer) {
          const access = await getRouteAccess(accessCustomer.id, db);
          if (access.restricted && !access.routes.includes(requestedRoute)) {
            return { status: 'access_restricted' as const, clientName: client.name, clientPhone: client.phone, allowedRoutes: access.routes };
          }
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

        // Usar flag explícita; nunca inferir CPF apenas pelo comprimento do número.
        const isCpf = input.isCpf === true;
        const raw = isCpf ? normalizeCpf(input.phone) : input.phone.replace(/\D/g, '');
        if (isCpf && !isValidCPF(raw)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF inválido' });
        }
        
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
        if (!client) return { valid: false };
        const mainCustomer = await findMainCustomerByIdentity({ phone: client.phone || undefined, cpf: client.cpf || undefined }, db);
        if (mainCustomer) {
          const profileUpdateState = await getCustomerProfileUpdateState(mainCustomer);
          if (profileUpdateState.pending) {
            return {
              valid: true,
              profileIncomplete: true,
              profileUpdateRequired: true,
              profileUpdateFields: profileUpdateState.effectiveFields,
              clientId: session.clientId,
              clientName: client.name,
              clientPhone: client.phone,
              message: 'Atualização cadastral obrigatória pelo administrador. Conclua os campos solicitados para continuar.',
            };
          }
        }
        try {
          await requireCompleteMainCustomerProfile(db, { phone: client.phone || '', cpf: client.cpf || '' });
        } catch (profileError: any) {
          return {
            valid: true,
            profileIncomplete: true,
            clientId: session.clientId,
            clientName: client.name,
            clientPhone: client.phone,
            message: profileError?.message || 'Atualize foto, e-mail, CPF e telefone para continuar.',
          };
        }
        return {
          valid: true,
          profileIncomplete: false,
          clientId: session.clientId,
          clientName: client.name,
          clientPhone: client.phone,
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

        // Buscar os dados completos exclusivamente do cadastro principal vinculado ao cliente logado.
        let mainProfile: { name?: string | null; phone?: string | null; cpf?: string | null; email?: string | null; profilePhotoUrl?: string | null } | null = null;
        try {
          const cleanPhone = String(client.phone || '').replace(/\D/g, '');
          const customerRows = await db.execute(`SELECT name, phone, cpf, email, profilePhotoUrl FROM customers WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = '${cleanPhone}' AND deletedAt IS NULL LIMIT 1`);
          mainProfile = (customerRows as any)[0]?.[0] || null;
        } catch (_) {}

        return {
          clientName: mainProfile?.name || client.name,
          phone: mainProfile?.phone || client.phone,
          cpf: mainProfile?.cpf || null,
          email: mainProfile?.email || null,
          expiresAt: pw?.expiresAt ? new Date(pw.expiresAt).toISOString() : null,
          isActive: pw ? (pw.expiresAt ? new Date(pw.expiresAt) > new Date() : false) : false,
          profilePhotoUrl: mainProfile?.profilePhotoUrl || null,
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

        // Normalizar telefone e exigir o mesmo perfil completo do cadastro principal.
        const normalizedPhone = input.phone.replace(/\D/g, '');
        let mainCustomer: any;
        try {
          mainCustomer = await requireCompleteMainCustomerProfile(db, { phone: normalizedPhone, cpf: '' });
        } catch (profileError: any) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: profileError?.message || 'Conclua o cadastro principal antes de liberar Gastos.' });
        }

        // Verificar se cliente já existe
        const existingClientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.phone, normalizedPhone)).limit(1);
        
        const existingClient = existingClientResult?.[0] || null;

        if (existingClient) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente com este telefone já existe" });
        }

        // Criar cliente
        const result = await db.insert(spreadsheetClients).values({
          phone: String(mainCustomer.phone).replace(/\D/g, ''),
          name: mainCustomer.name,
          cpf: mainCustomer.cpf || null,
          status: "active",
          allowedRoutes: "gastos",
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

        try { await syncUnifiedCustomerRegistry(); } catch (error: any) {
          console.warn('[spreadsheet.adminCreateClient] sincronização unificada não aplicada:', error?.message);
        }
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
        const declarations = await db.select().from(spreadsheetReferralDeclarations);
        const declarationsByClientId = new Map<number, any[]>();
        for (const declaration of declarations) {
          const current = declarationsByClientId.get(declaration.clientId) || [];
          current.push(declaration);
          declarationsByClientId.set(declaration.clientId, current);
        }
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
            referralDeclarations: (declarationsByClientId.get(client.id) || []).map((declaration) => ({
              route: declaration.route,
              answer: declaration.answer,
              referrerName: declaration.referrerName || '',
              referrerPhone: declaration.referrerPhone || '',
              createdAt: declaration.createdAt,
            })),
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

                // Limpar o vencimento preservado e registrar apenas a rota onde o cadastro foi concluído.
        // Quando a origem não vier informada, este fluxo é da planilha e libera somente gastos.
        const updateSet: any = { preservedExpiresAt: null };
        const routeOrigin = input.sourceRoute || 'gastos';
        const existingRoutes = ((client as any).allowedRoutes || '').split(',').map((r: string) => r.trim()).filter(Boolean);
        if (!existingRoutes.includes(routeOrigin)) {
          existingRoutes.push(routeOrigin);
        }
        updateSet.allowedRoutes = existingRoutes.join(',');
        await db.update(spreadsheetClients)
          .set(updateSet)
          .where(eq(spreadsheetClients.id, client.id));
        try { await syncUnifiedCustomerRegistry(); } catch (error: any) {
          console.warn('[spreadsheet.clientCreatePasswordAuto] sincronização unificada não aplicada:', error?.message);
        }
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
        const mainCustomer = await findMainCustomerByIdentity({ phone: input.phone }, db);
        if (!mainCustomer) return { allowedRoutes: '', clientId: null, customerId: null };
        const access = await getRouteAccess(mainCustomer.id, db);
        return { allowedRoutes: access.restricted ? access.routes.join(',') : '', clientId: null, customerId: mainCustomer.id };
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
        const mainCustomer = await findMainCustomerByIdentity({ phone: input.phone }, db);
        if (!mainCustomer) return { success: false, message: 'Cliente não encontrado' };
        const routes = input.allowedRoutes.split(',').map((route: string) => route.trim()).filter(Boolean);
        await setCustomerRoutePermissions(mainCustomer.id, routes, 'Administrador', db);
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
        const clientResult = await db.select().from(spreadsheetClients)
          .where(eq(spreadsheetClients.id, input.clientId)).limit(1);
        const client = clientResult?.[0] || null;
        if (client) {
          const mainCustomer = await findMainCustomerByIdentity({ phone: (client as any).phone || '', cpf: (client as any).cpf || '' }, db);
          if (mainCustomer) {
            const routes = input.allowedRoutes.split(',').map((route: string) => route.trim()).filter(Boolean);
            await setCustomerRoutePermissions(mainCustomer.id, routes, 'Administrador', db);
          }
        }
        // Mantém o campo histórico para a tela antiga de gestão, mas ele não é mais
        // usado para bloquear login ou rota: a fonte real é customerRoutePermissions.
        await db.update(spreadsheetClients)
          .set({ allowedRoutes: input.allowedRoutes || null, updatedAt: new Date() } as any)
          .where(eq(spreadsheetClients.id, input.clientId));
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao atualizar rotas' });
      }
    }),

  // Manifesto exibido uma única vez após o login, separado do cadastro e da autenticação.
  getReferralDeclaration: publicProcedure
    .input(z.object({ token: z.string(), route: z.enum(['gastos', 'emprestimo']) }))
    .query(async ({ input }) => {
      const { db, client } = await resolveReferralManifestClient(input.token, input.route);
      const rows = await db.select().from(spreadsheetReferralDeclarations)
        .where(and(
          eq(spreadsheetReferralDeclarations.clientId, client.id),
          eq(spreadsheetReferralDeclarations.route, input.route),
        )).limit(1);
      const declaration = rows?.[0] || null;
      return {
        answered: !!declaration,
        declaration: declaration ? {
          answer: declaration.answer,
          referrerName: declaration.referrerName || '',
          referrerPhone: declaration.referrerPhone || '',
          createdAt: declaration.createdAt,
        } : null,
      };
    }),

  submitReferralDeclaration: publicProcedure
    .input(z.object({
      token: z.string(),
      route: z.enum(['gastos', 'emprestimo']),
      answer: z.enum(['yes', 'no']),
      referrerName: z.string().trim().max(128).optional(),
      referrerPhone: z.string().trim().max(32).optional(),
    }))
    .mutation(async ({ input }) => {
      const { db, client } = await resolveReferralManifestClient(input.token, input.route);
      const existingRows = await db.select().from(spreadsheetReferralDeclarations)
        .where(and(
          eq(spreadsheetReferralDeclarations.clientId, client.id),
          eq(spreadsheetReferralDeclarations.route, input.route),
        )).limit(1);
      if (existingRows?.[0]) return { success: true, alreadyAnswered: true };

      const submittedName = input.answer === 'yes' ? String(input.referrerName || '').trim() : '';
      const submittedPhone = input.answer === 'yes' ? String(input.referrerPhone || '').trim() : '';
      if (input.answer === 'yes' && !submittedName && !submittedPhone) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe o nome, o telefone ou os dois dados de quem indicou você.' });
      }

      const referral = await resolveReferralDeclaration({
        customerPhone: client.phone,
        referrerName: submittedName,
        referrerPhone: submittedPhone,
      });
      if (referral.issue === 'invalid_phone') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Telefone do indicador inválido. Informe o número com DDD.' });
      }
      if (referral.issue === 'self_referral') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Você não pode indicar a si mesmo.' });
      }

      try {
        await db.insert(spreadsheetReferralDeclarations).values({
          clientId: client.id,
          route: input.route,
          answer: input.answer,
          // Mantém a declaração independente da comissão. Só o primeiro cadastro,
          // antes do primeiro pedido, pode criar vínculo que habilita comissão.
          referrerName: referral.declaredName || null,
          referrerPhone: referral.declaredPhone || null,
          referrerCustomerId: referral.linkedReferrer?.id ?? null,
        });
        return { success: true, alreadyAnswered: false };
      } catch (error: any) {
        if (String(error?.code || '').includes('ER_DUP_ENTRY')) return { success: true, alreadyAnswered: true };
        throw error;
      }
    }),

  // Verificação única de rota: usa exclusivamente customerRoutePermissions,
  // a mesma fonte que o ADM grava e que protege Gastos/Empréstimos no backend.
  checkRouteAccess: publicProcedure
    .input(z.object({
      token: z.string(),
      route: z.string(),
    }))
    .query(async ({ input }) => {
      try {
        const db = await getDb() as any;
        if (!db) return { allowed: true, allowedRoutes: [] };
        const cleanToken = input.token.trim();
        if (!cleanToken) return { allowed: true, allowedRoutes: [] };

        let phone: string | null = null;
        try {
          const cpSessionResult = await db.select().from(customerPasswordSessions)
            .where(eq(customerPasswordSessions.token, cleanToken)).limit(1);
          const cpSession = cpSessionResult?.[0] || null;
          if (cpSession && new Date(cpSession.expiresAt) >= new Date()) {
            phone = normalizeCustomerPhone(cpSession.phone);
          }
        } catch (_) {}

        if (!phone) {
          const sessionResult = await db.select().from(spreadsheetSessions)
            .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
          const session = sessionResult?.[0] || null;
          if (session && new Date(session.expiresAt) >= new Date()) {
            const clientResult = await db.select().from(spreadsheetClients)
              .where(eq(spreadsheetClients.id, session.clientId)).limit(1);
            phone = normalizeCustomerPhone((clientResult?.[0] as any)?.phone);
          }
        }

        if (!phone) return { allowed: true, allowedRoutes: [] };
        const mainCustomer = await findMainCustomerByIdentity({ phone }, db);
        if (!mainCustomer) return { allowed: true, allowedRoutes: [] };
        const access = await getRouteAccess(mainCustomer.id, db);
        const allowed = !access.restricted || access.routes.includes(input.route as any);
        return { allowed, allowedRoutes: access.restricted ? access.routes : [] };
      } catch (_) {
        // Erro de infraestrutura não pode virar bloqueio falso para um cliente autenticado.
        return { allowed: true, allowedRoutes: [] };
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
        if (!db) return { allowed: true, allowedRoutes: [] };
        const phone = normalizeCustomerPhone(input.phone);
        if (!phone) return { allowed: true, allowedRoutes: [] };
        const mainCustomer = await findMainCustomerByIdentity({ phone }, db);
        if (!mainCustomer) return { allowed: true, allowedRoutes: [] };
        const access = await getRouteAccess(mainCustomer.id, db);
        const allowed = !access.restricted || access.routes.includes(input.route as any);
        return { allowed, allowedRoutes: access.restricted ? access.routes : [] };
      } catch (_) {
        return { allowed: true, allowedRoutes: [] };
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

  // === ANALISADOR DE CORRIDAS ===

  getVehicleConfig: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      const db = await getDb() as any;
      if (!db) return null;
      try {
        await db.execute(`CREATE TABLE IF NOT EXISTS spreadsheetVehicleConfig (
          id INT AUTO_INCREMENT PRIMARY KEY,
          userId INT NOT NULL UNIQUE,
          vehicleName VARCHAR(100) DEFAULT 'Meu Veículo',
          kmPerLiter DECIMAL(8,2) DEFAULT 10,
          fuelPricePerLiter DECIMAL(8,2) DEFAULT 6,
          tankCapacityLiters DECIMAL(8,2) DEFAULT 50,
          minRatePerKm DECIMAL(8,2) DEFAULT 2,
          minRatePerMin DECIMAL(8,2) DEFAULT 0.60,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);
      } catch {}
      const { spreadsheetVehicleConfig } = await import('../../drizzle/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const rows = await db.select().from(spreadsheetVehicleConfig).where(eqOp(spreadsheetVehicleConfig.userId, clientId)).limit(1);
      return rows[0] || null;
    }),

  saveVehicleConfig: publicProcedure
    .input(z.object({
      token: z.string(),
      vehicleName: z.string().optional(),
      kmPerLiter: z.string().optional(),
      fuelPricePerLiter: z.string().optional(),
      tankCapacityLiters: z.string().optional(),
      minRatePerKm: z.string().optional(),
      minRatePerMin: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível' });
      try {
        await db.execute(`CREATE TABLE IF NOT EXISTS spreadsheetVehicleConfig (
          id INT AUTO_INCREMENT PRIMARY KEY,
          userId INT NOT NULL UNIQUE,
          vehicleName VARCHAR(100) DEFAULT 'Meu Veículo',
          kmPerLiter DECIMAL(8,2) DEFAULT 10,
          fuelPricePerLiter DECIMAL(8,2) DEFAULT 6,
          tankCapacityLiters DECIMAL(8,2) DEFAULT 50,
          minRatePerKm DECIMAL(8,2) DEFAULT 2,
          minRatePerMin DECIMAL(8,2) DEFAULT 0.60,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`);
      } catch {}
      const { spreadsheetVehicleConfig } = await import('../../drizzle/schema');
      const { eq: eqOp } = await import('drizzle-orm');
      const { token, ...data } = input;
      const existing = await db.select().from(spreadsheetVehicleConfig).where(eqOp(spreadsheetVehicleConfig.userId, clientId)).limit(1);
      if (existing.length > 0) {
        await db.update(spreadsheetVehicleConfig).set({ ...data, updatedAt: new Date() }).where(eqOp(spreadsheetVehicleConfig.userId, clientId));
      } else {
        await db.insert(spreadsheetVehicleConfig).values({ userId: clientId, ...data });
      }
      return { success: true };
    }),

  // Registrar corrida analisada (aceitar e lançar nos ganhos + operacional)
  acceptRide: publicProcedure
    .input(z.object({
      token: z.string(),
      date: z.string(), // YYYY-MM-DD
      platform: z.enum(['uber', 'ninetynine', 'indrive', 'particular', 'deliveries']),
      fareValue: z.string(), // valor da corrida em R$
      pickupKm: z.string().default('0'),
      tripKm: z.string().default('0'),
      note: z.number().optional(), // nota calculada 0-100
    }))
    .mutation(async ({ input }) => {
      const clientId = await resolveClientId(input.token);
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível' });
      const { spreadsheetEarnings, spreadsheetOperational } = await import('../../drizzle/schema');
      const { eq: eqOp, and: andOp } = await import('drizzle-orm');

      // 1. Atualizar ou criar registro de ganhos do dia
      const existingEarning = await db.select().from(spreadsheetEarnings)
        .where(andOp(eqOp(spreadsheetEarnings.userId, clientId), eqOp(spreadsheetEarnings.date, input.date))).limit(1);
      const fare = parseFloat(input.fareValue) || 0;
      if (existingEarning.length > 0) {
        const current = existingEarning[0];
        const fieldMap: Record<string, string> = { uber: 'uber', ninetynine: 'ninetynine', indrive: 'indrive', particular: 'particular', deliveries: 'deliveries' };
        const field = fieldMap[input.platform];
        const currentVal = parseFloat((current as any)[field] || '0');
        await db.update(spreadsheetEarnings).set({ [field]: String(currentVal + fare), updatedAt: new Date() })
          .where(andOp(eqOp(spreadsheetEarnings.userId, clientId), eqOp(spreadsheetEarnings.date, input.date)));
      } else {
        const earningData: any = { userId: clientId, date: input.date, uber: '0', ninetynine: '0', indrive: '0', particular: '0', deliveries: '0', tips: '0', otherEarnings: '0' };
        const fieldMap: Record<string, string> = { uber: 'uber', ninetynine: 'ninetynine', indrive: 'indrive', particular: 'particular', deliveries: 'deliveries' };
        earningData[fieldMap[input.platform]] = String(fare);
        await db.insert(spreadsheetEarnings).values(earningData);
      }

      // 2. Atualizar ou criar registro operacional do dia
      const existingOp = await db.select().from(spreadsheetOperational)
        .where(andOp(eqOp(spreadsheetOperational.userId, clientId), eqOp(spreadsheetOperational.date, input.date))).limit(1);
      const rideFieldMap: Record<string, string> = { uber: 'ridesUber', ninetynine: 'rides99', indrive: 'ridesIndrive', particular: 'ridesParticular', deliveries: 'ridesDeliveries' };
      const rideField = rideFieldMap[input.platform];
      const totalKm = (parseFloat(input.pickupKm) || 0) + (parseFloat(input.tripKm) || 0);
      if (existingOp.length > 0) {
        const current = existingOp[0];
        const currentRides = parseInt((current as any)[rideField] || '0');
        const currentKmFinal = parseFloat((current as any).kmFinal || '0');
        const currentRideCount = parseInt((current as any).rideCount || '0');
        await db.update(spreadsheetOperational).set({
          [rideField]: currentRides + 1,
          rideCount: currentRideCount + 1,
          kmFinal: String(currentKmFinal + totalKm),
          updatedAt: new Date()
        }).where(andOp(eqOp(spreadsheetOperational.userId, clientId), eqOp(spreadsheetOperational.date, input.date)));
      } else {
        const opData: any = { userId: clientId, date: input.date, kmInitial: '0', kmFinal: String(totalKm), ridesUber: 0, rides99: 0, ridesIndrive: 0, ridesParticular: 0, ridesDeliveries: 0, rideCount: 1 };
        opData[rideField] = 1;
        await db.insert(spreadsheetOperational).values(opData);
      }

      return { success: true };
    }),
});
