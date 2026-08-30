// Router de senha do sistema de cadastro (h2colombiano.com/admin/customers)
// Mesma lógica do Gestor de Gastos (spreadsheet), adaptada para a tabela customers

import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { formatCPF, isValidCPF, normalizeCpf } from "@shared/cpf";
import {
  customerPasswords,
  customerPasswordSessions,
  customers,
  appSettings,
  customerLoginHistory,
} from "../../drizzle/schema";
import { eq, and, sql, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ensureCustomerIdentityInfrastructure, getRouteAccess, setCustomerRoutePermissions, type CustomerRoute } from "../customerAccess";

const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getPasswordMode(): Promise<"auto" | "manual"> {
  const db = (await getDb()) as any;
  if (!db) return "manual";
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, "senha_cadastro_ativa"))
    .limit(1);
  const val = rows?.[0]?.value ?? "true";
  // 'false' = auto, 'true' = manual
  return val === "false" ? "auto" : "manual";
}

async function getActivePassword(phone: string) {
  const db = (await getDb()) as any;
  if (!db) return null;
  const cleanPhone = phone.replace(/\D/g, "");
  const rows = await db
    .select()
    .from(customerPasswords)
    .where(
      and(
        eq(customerPasswords.phone, cleanPhone),
        eq(customerPasswords.isActive, 1)
      )
    )
    .limit(1);
  return rows?.[0] ?? null;
}

async function getCustomerByCleanPhone(cleanPhone: string) {
  const db = (await getDb()) as any;
  if (!db) return null;
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, cleanPhone))
    .limit(1);
  return rows?.[0] ?? null;
}

// Busca por telefone OU CPF (aceita ambos)
async function getCustomerByPhoneOrCpf(input: string, isCpf = false) {
  const db = (await getDb()) as any;
  if (!db) return null;
  const clean = normalizeCpf(input);
  if (isCpf && !isValidCPF(clean)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF inválido' });
  }
  // Tenta por telefone primeiro
  const byPhone = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, clean))
    .limit(1);
  if (byPhone?.[0]) return { customer: byPhone[0], resolvedPhone: clean };
  // Tenta por CPF (11 dígitos)
  if (clean.length === 11) {
    const byCpf = await db
      .select()
      .from(customers)
      .where(eq(customers.cpf, clean))
      .limit(1);
    if (byCpf?.[0]) return { customer: byCpf[0], resolvedPhone: byCpf[0].phone as string };
    // Tenta CPF formatado (000.000.000-00)
    const formatted = `${clean.slice(0,3)}.${clean.slice(3,6)}.${clean.slice(6,9)}-${clean.slice(9)}`;
    const byCpfFormatted = await db
      .select()
      .from(customers)
      .where(eq(customers.cpf, formatted))
      .limit(1);
    if (byCpfFormatted?.[0]) return { customer: byCpfFormatted[0], resolvedPhone: byCpfFormatted[0].phone as string };
  }
  return null;
}

// â”€â”€â”€ router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const customerPasswordRouter = router({
  // â”€â”€ Modo global (auto / manual) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getMode: publicProcedure.query(async () => {
    const mode = await getPasswordMode();
    return { mode };
  }),

  setMode: adminProcedure
    .input(z.object({ mode: z.enum(["auto", "manual"]) }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const val = input.mode === "auto" ? "false" : "true";
      await db
        .insert(appSettings)
        .values({ key: "senha_cadastro_ativa", value: val })
        .onDuplicateKeyUpdate({ set: { value: val } });
      return { success: true, mode: input.mode };
    }),

  // â”€â”€ Verificar status do cliente (para a tela de login) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  checkStatus: publicProcedure
    .input(z.object({ phone: z.string(), isCpf: z.boolean().optional() }))
    .query(async ({ input }) => {
      const found = await getCustomerByPhoneOrCpf(input.phone, input.isCpf === true);
      if (!found) return { status: "not_found" as const };
      const { customer: cust, resolvedPhone } = found;
      if ((cust as any).blocked === 1) return { status: "blocked" as const, blockReason: (cust as any).blockReason || 'Acesso bloqueado' };

      const pwd = await getActivePassword(resolvedPhone);
      if (!pwd) return { status: "no_password" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name };
      if (pwd.pendingApproval === 1) return { status: "pending_approval" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name };
      if (!pwd.expiresAt) return { status: "pending_approval" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name };
      if (new Date(pwd.expiresAt) < new Date()) return { status: "expired" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name };

      return { status: "active" as const, name: cust.name, phone: resolvedPhone, hasCpf: !!(cust.cpf) };
    }),

  // â”€â”€ Verificar status da senha (mutation para uso dinâmico) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  checkStatusMutation: publicProcedure
    .input(z.object({ phone: z.string(), isCpf: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const found = await getCustomerByPhoneOrCpf(input.phone, input.isCpf === true);
      if (!found) return { status: "not_found" as const };
      const { customer: cust, resolvedPhone } = found;
      if ((cust as any).blocked === 1) return { status: "blocked" as const, blockReason: (cust as any).blockReason || 'Acesso bloqueado' };

      const pwd = await getActivePassword(resolvedPhone);
      if (!pwd) return { status: "no_password" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name };
      if (pwd.pendingApproval === 1) return { status: "pending_approval" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name };
      if (!pwd.expiresAt) return { status: "pending_approval" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name };
      if (new Date(pwd.expiresAt) < new Date()) return { status: "expired" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name };

      return { status: "active" as const, name: cust.name, phone: resolvedPhone, hasCpf: !!(cust.cpf) };
    }),

  // â”€â”€ Salvar CPF do cliente (obrigatório antes de criar senha) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  saveCpf: publicProcedure
    .input(z.object({ phone: z.string(), cpf: z.string().min(11) }))
    .mutation(async () => {
      return { success: false as const, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' };
    }),

  // Cliente cria senha (modo auto)
  clientCreateAuto: publicProcedure
    .input(z.object({ phone: z.string(), password: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanPhone = input.phone.replace(/\D/g, "");

      const mode = await getPasswordMode();
      if (mode !== "auto") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Modo automático não está ativo." });
      }

      // Verificar se cliente existe
      const cust = await getCustomerByCleanPhone(cleanPhone);
      if (!cust) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      }

      // Verificar bloqueio de cadastro
      if ((cust as any).blocked === 1) {
        return { success: false, error: "blocked" as const, blockReason: (cust as any).blockReason || 'Acesso bloqueado' };
      }

      // Desativar senhas anteriores
      await db
        .update(customerPasswords)
        .set({ isActive: 0 })
        .where(eq(customerPasswords.phone, cleanPhone));

      const hash = await bcrypt.hash(input.password, 10);

      // Verificar se há vencimento preservado
      const preservedRows = await db
        .select()
        .from(customerPasswords)
        .where(
          and(
            eq(customerPasswords.phone, cleanPhone),
            sql`${customerPasswords.preservedExpiresAt} IS NOT NULL`
          )
        )
        .orderBy(sql`${customerPasswords.id} DESC`)
        .limit(1);
      const preservedRow = preservedRows?.[0];
      let expiresAt: Date;
      if (preservedRow?.preservedExpiresAt && new Date(preservedRow.preservedExpiresAt) > new Date()) {
        expiresAt = new Date(preservedRow.preservedExpiresAt);
        // Limpar preservedExpiresAt
        await db
          .update(customerPasswords)
          .set({ preservedExpiresAt: null })
          .where(eq(customerPasswords.phone, cleanPhone));
      } else {
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias
      }

      await db.insert(customerPasswords).values({
        phone: cleanPhone,
        password: hash,
        isActive: 1,
        expiresAt,
        pendingApproval: 0,
        createdByClient: 1,
        clientCreatedAt: new Date(),
      });

      // Criar sessão
      const token = randomBytes(32).toString("hex");
      const sessionExpiry = new Date(Date.now() + SESSION_DURATION_MS);
      await db.insert(customerPasswordSessions).values({
        phone: cleanPhone,
        token,
        expiresAt: sessionExpiry,
        lastAccessAt: new Date(),
      });

      return { success: true, token, expiresAt: expiresAt.getTime() };
    }),

  // â”€â”€ Cliente cria senha (modo manual) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  clientCreateManual: publicProcedure
    .input(z.object({ phone: z.string(), password: z.string().min(4) }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanPhone = input.phone.replace(/\D/g, "");

      // Verificar se cliente existe
      const cust = await getCustomerByCleanPhone(cleanPhone);
      if (!cust) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      }

      // Verificar bloqueio de cadastro
      if ((cust as any).blocked === 1) {
        return { success: false, error: "blocked" as const, blockReason: (cust as any).blockReason || 'Acesso bloqueado' };
      }

      // Desativar senhas anteriores
      await db
        .update(customerPasswords)
        .set({ isActive: 0 })
        .where(eq(customerPasswords.phone, cleanPhone));

      const hash = await bcrypt.hash(input.password, 10);
      await db.insert(customerPasswords).values({
        phone: cleanPhone,
        password: hash,
        isActive: 1,
        expiresAt: null, // pendente
        pendingApproval: 1,
        createdByClient: 1,
        clientCreatedAt: new Date(),
      });

      return { success: true, pending: true };
    }),

  // â”€â”€ Cliente faz login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  login: publicProcedure
    .input(z.object({ phone: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanPhone = input.phone.replace(/\D/g, "");

      // Verificar bloqueio de cadastro antes de autenticar
      try {
        const custRows = await db.select().from(customers).where(eq(customers.phone, cleanPhone)).limit(1);
        const custForBlock = custRows?.[0];
        if (custForBlock && (custForBlock as any).blocked === 1) {
          return { success: false, error: "blocked" as const, blockReason: (custForBlock as any).blockReason || 'Acesso bloqueado' };
        }
      } catch {}

      const pwd = await getActivePassword(cleanPhone);
      if (!pwd) return { success: false, error: "no_password" as const };
      if (pwd.pendingApproval === 1) return { success: false, error: "pending_approval" as const };
      if (!pwd.expiresAt || new Date(pwd.expiresAt) < new Date()) return { success: false, error: "expired" as const };

      const match = await bcrypt.compare(input.password, pwd.password);
      if (!match) return { success: false, error: "wrong_password" as const };

      // Criar sessão
      const token = randomBytes(32).toString("hex");
      const sessionExpiry = new Date(Date.now() + SESSION_DURATION_MS);
      await db.insert(customerPasswordSessions).values({
        phone: cleanPhone,
        token,
        expiresAt: sessionExpiry,
        lastAccessAt: new Date(),
      });

      // Registrar no histórico de logins
      try {
        await db.insert(customerLoginHistory).values({
          phone: cleanPhone,
          loginAt: new Date(),
        });
      } catch {}

      return { success: true, token };
    }),

  // â”€â”€ Verificar sessão â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  checkSession: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) return { valid: false };
      const rows = await db
        .select()
        .from(customerPasswordSessions)
        .where(eq(customerPasswordSessions.token, input.token.trim()))
        .limit(1);
      const session = rows?.[0];
      if (!session) return { valid: false };
      if (new Date(session.expiresAt) < new Date()) return { valid: false };
      // Verificar se o cliente foi bloqueado após criar a sessão
      try {
        const custRows2 = await db.select().from(customers).where(eq(customers.phone, session.phone)).limit(1);
        const custForBlock2 = custRows2?.[0];
        if (custForBlock2 && (custForBlock2 as any).blocked === 1) {
          return { valid: false, blocked: true, blockReason: (custForBlock2 as any).blockReason || 'Acesso bloqueado' };
        }
      } catch {}
      // Renovar sessão
      try {
        const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
        const diff = newExpiry.getTime() - new Date(session.expiresAt).getTime();
        if (diff > 24 * 60 * 60 * 1000) {
          await db
            .update(customerPasswordSessions)
            .set({ expiresAt: newExpiry, lastAccessAt: new Date() })
            .where(eq(customerPasswordSessions.token, input.token.trim()));
        }
      } catch {}
      return { valid: true, phone: session.phone };
    }),

  // â”€â”€ Logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  logout: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) return { success: true };
      await db
        .delete(customerPasswordSessions)
        .where(eq(customerPasswordSessions.token, input.token.trim()));
      return { success: true };
    }),

  // â”€â”€ ADM: listar pendentes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  adminListPending: adminProcedure.query(async () => {
    const db = (await getDb()) as any;
    if (!db) return [];
    const rows = await db
      .select({
        id: customerPasswords.id,
        phone: customerPasswords.phone,
        clientCreatedAt: customerPasswords.clientCreatedAt,
        name: customers.name,
        customerId: customers.id,
        profilePhotoUrl: customers.profilePhotoUrl,
      })
      .from(customerPasswords)
      .leftJoin(customers, eq(customers.phone, customerPasswords.phone))
      .where(
        and(
          eq(customerPasswords.isActive, 1),
          eq(customerPasswords.pendingApproval, 1)
        )
      )
      .orderBy(sql`${customerPasswords.clientCreatedAt} DESC`);
    return (rows as any[]).map((r: any) => ({
      id: r.id,
      phone: r.phone,
      name: r.name ?? r.phone,
      customerId: r.customerId,
      clientCreatedAt: r.clientCreatedAt ? new Date(r.clientCreatedAt).getTime() : null,
      profilePhotoUrl: r.profilePhotoUrl ?? null,
    }));
  }),

  // Solicitações de acesso de Site, Gastos e Empréstimos usam a mesma tela
  // de liberação de senha: foto, telefone, WhatsApp e botão Liberar.
  adminListPendingAccess: adminProcedure.query(async () => {
    const db = (await getDb()) as any;
    if (!db) return [];
    await ensureCustomerIdentityInfrastructure(db);
    const [rows] = await db.execute(sql`
      SELECT r.id, r.customerId, r.route, r.createdAt, c.name, c.phone, c.profilePhotoUrl
      FROM customerAccessRequests r
      JOIN customers c ON c.id=r.customerId
      WHERE r.status='pending' AND r.pendingKey=1
      ORDER BY r.createdAt ASC
    `) as any;
    return (rows || []).map((row: any) => ({
      id: Number(row.id),
      customerId: Number(row.customerId),
      route: String(row.route) as CustomerRoute,
      name: row.name || row.phone,
      phone: row.phone || '',
      profilePhotoUrl: row.profilePhotoUrl || null,
      createdAt: row.createdAt ? new Date(row.createdAt).getTime() : null,
    }));
  }),

  adminDecideAccess: adminProcedure
    .input(z.object({ requestId: z.number().int().positive(), approved: z.boolean(), adminName: z.string().min(1).default('Administrador') }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });
      await ensureCustomerIdentityInfrastructure(db);
      const [rows] = await db.execute(sql`
        SELECT customerId, route FROM customerAccessRequests
        WHERE id=${input.requestId} AND status='pending' AND pendingKey=1 LIMIT 1
      `) as any;
      const request = rows?.[0];
      if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Solicitação pendente não encontrada.' });
      const route = String(request.route) as CustomerRoute;
      if (input.approved) {
        const access = await getRouteAccess(Number(request.customerId), db);
        await setCustomerRoutePermissions(Number(request.customerId), [...access.routes, route], input.adminName, db);
      }
      await db.execute(sql`
        UPDATE customerAccessRequests
        SET status=${input.approved ? 'approved' : 'denied'}, pendingKey=NULL, analyzedAt=NOW(), analyzedBy=${input.adminName}
        WHERE id=${input.requestId}
      `);
      return { success: true };
    }),

  // â”€â”€ ADM: liberar senha pendente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  adminApprove: adminProcedure
    .input(z.object({ passwordId: z.number(), days: z.number().min(1).max(3650) }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      // Buscar senha e telefone antes de liberar
      const [row] = await db
        .select({ phone: customerPasswords.phone, password: customerPasswords.password })
        .from(customerPasswords)
        .where(eq(customerPasswords.id, input.passwordId))
        .limit(1);
      const expiresAt = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
      await db
        .update(customerPasswords)
        .set({ pendingApproval: 0, expiresAt })
        .where(eq(customerPasswords.id, input.passwordId));
      // Buscar nome do cliente
      let customerName: string | null = null;
      if (row?.phone) {
        const [cust] = await db.select({ name: customers.name }).from(customers).where(eq(customers.phone, row.phone)).limit(1);
        customerName = cust?.name ?? null;
      }
      return { success: true, phone: row?.phone ?? null, password: row?.password ?? null, name: customerName };
    }),

  // â”€â”€ ADM: resetar senha de um cliente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  adminReset: adminProcedure
    .input(z.object({ phone: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanPhone = input.phone.replace(/\D/g, "");

      // Preservar vencimento da senha ativa
      const active = await getActivePassword(cleanPhone);
      if (active?.expiresAt && new Date(active.expiresAt) > new Date()) {
        await db
          .update(customerPasswords)
          .set({ preservedExpiresAt: active.expiresAt })
          .where(
            and(
              eq(customerPasswords.phone, cleanPhone),
              eq(customerPasswords.isActive, 1)
            )
          );
      }

      // Desativar todas as senhas
      await db
        .update(customerPasswords)
        .set({ isActive: 0 })
        .where(eq(customerPasswords.phone, cleanPhone));

      // Invalidar sessões
      await db
        .delete(customerPasswordSessions)
        .where(eq(customerPasswordSessions.phone, cleanPhone));

      return { success: true };
    }),

  // â”€â”€ ADM: definir senha manualmente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  adminSetPassword: adminProcedure
    .input(z.object({ phone: z.string(), password: z.string().min(4), days: z.number().min(1).max(3650) }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanPhone = input.phone.replace(/\D/g, "");

      // Desativar senhas anteriores
      await db
        .update(customerPasswords)
        .set({ isActive: 0 })
        .where(eq(customerPasswords.phone, cleanPhone));

      const hash = await bcrypt.hash(input.password, 10);
      const expiresAt = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
      await db.insert(customerPasswords).values({
        phone: cleanPhone,
        password: hash,
        isActive: 1,
        expiresAt,
        pendingApproval: 0,
        createdByClient: 0,
        clientCreatedAt: null,
      });

      return { success: true };
    }),

  // â”€â”€ ADM: ver status de senha de um cliente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  adminGetStatus: adminProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const cleanPhone = input.phone.replace(/\D/g, "");
      const pwd = await getActivePassword(cleanPhone);
      if (!pwd) return { hasPassword: false };
      return {
        hasPassword: true,
        pending: pwd.pendingApproval === 1,
        expiresAt: pwd.expiresAt ? new Date(pwd.expiresAt).getTime() : null,
        createdByClient: pwd.createdByClient === 1,
        clientCreatedAt: pwd.clientCreatedAt ? new Date(pwd.clientCreatedAt).getTime() : null,
      };
    }),

  // â”€â”€ Histórico de logins (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  adminGetLoginHistory: adminProcedure
    .input(z.object({ phone: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) return { total: 0, recent: [] };
      const cleanPhone = input.phone.replace(/\D/g, "");

      // Total de logins
      const countRows = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(customerLoginHistory)
        .where(eq(customerLoginHistory.phone, cleanPhone));
      const total = Number(countRows?.[0]?.count ?? 0);

      // 5 últimos logins
      const recent = await db
        .select({ loginAt: customerLoginHistory.loginAt })
        .from(customerLoginHistory)
        .where(eq(customerLoginHistory.phone, cleanPhone))
        .orderBy(sql`loginAt DESC`)
        .limit(5);

      return {
        total,
        recent: recent.map((r: any) => new Date(r.loginAt).getTime()),
      };
    }),
});
