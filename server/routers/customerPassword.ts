// Router de senha do sistema de cadastro (h2colombiano.com/admin/customers)
// Mesma lógica do Gestor de Gastos (spreadsheet), adaptada para a tabela customers

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { canCustomerRecoverPassword, passwordRecoveryCodeHash } from "../customerPasswordRecoveryPolicy";
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
  spreadsheetSessions,
  spreadsheetClients,
} from "../../drizzle/schema";
import { eq, and, sql, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ensureCustomerIdentityInfrastructure, getRouteAccess, setCustomerRoutePermissions, type CustomerRoute } from "../customerAccess";
import { getMissingCustomerProfileFields } from "../customerProfileRequirements";
import { deliverOwnSiteCode } from "../siteAccessCodeDelivery";
import { generateOwnSiteCode } from "../siteAccessOwnCodes";
import { emailBelongsToAnotherCustomer, CUSTOMER_EMAIL_IN_USE_MESSAGE } from "../customerEmailOwnership";

const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias
const LOGIN_EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const LOGIN_EMAIL_CODE_RESEND_MS = 60 * 1000;
const LOGIN_EMAIL_PROOF_TTL_MS = 20 * 60 * 1000;

type LoginEmailPending = {
  phone: string;
  email: string;
  code: string;
  codeHash: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
};

type LoginEmailProof = {
  phone: string;
  email: string;
  expiresAt: number;
};

const loginEmailPending = new Map<string, LoginEmailPending>();
const loginEmailProofs = new Map<string, LoginEmailProof>();

function loginEmailKey(phone: string, email: string) {
  return phone + "|" + email.trim().toLowerCase();
}

function loginEmailCodeHash(phone: string, email: string, code: string) {
  return createHash("sha256").update("h2-login-email|" + phone + "|" + email.trim().toLowerCase() + "|" + code).digest("hex");
}

function assertLoginEmailProof(phone: string, token: string) {
  const proof = loginEmailProofs.get(token);
  if (!proof || proof.phone !== phone || proof.expiresAt < Date.now()) {
    if (proof) loginEmailProofs.delete(token);
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Confirmação de e-mail expirada. Confirme o código novamente." });
  }
  return proof;
}
function getProfileUpdateMeta(customer: any) {
  const fields = customer ? getMissingCustomerProfileFields(customer) : [];
  return { profileUpdateRequired: fields.length > 0, profileUpdateFields: fields };
}

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

type VerifiedLoginResult =
  | { success: true; token: string; profileUpdateRequired: boolean; profileUpdateFields: string[]; error?: undefined; blockReason?: undefined }
  | { success: false; error: "blocked" | "no_password" | "pending_approval" | "expired" | "wrong_password"; blockReason?: string; token?: undefined; profileUpdateRequired?: undefined; profileUpdateFields?: undefined };

// Login e reset bloqueiam as mesmas linhas, na mesma ordem. Assim um login
// que tenha lido a senha antiga não pode criar sessão depois da revogação.
async function authenticateVerifiedCustomer(db: any, phone: string, password: string, verificationToken: string): Promise<VerifiedLoginResult> {
  return db.transaction(async (tx: any) => {
    const proof = assertLoginEmailProof(phone, verificationToken);
    const custRows = await tx.select().from(customers)
      .where(eq(customers.phone, phone)).limit(1).for("update");
    const customer = custRows?.[0];
    if (!customer || customer.deletedAt) return { success: false, error: "no_password" as const };
    if (String(customer.email || "").trim().toLowerCase() !== proof.email) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Confirme o e-mail do cadastro novamente." });
    }
    // An OTP proves mailbox access, not that it belongs to this customer's identity.
    if (await emailBelongsToAnotherCustomer(tx, proof.email, Number(customer.id))) {
      throw new TRPCError({ code: "CONFLICT", message: CUSTOMER_EMAIL_IN_USE_MESSAGE });
    }
    if (Number(customer.blocked || 0) === 1) {
      return { success: false, error: "blocked" as const, blockReason: customer.blockReason || "Acesso bloqueado" };
    }
    const pwRows = await tx.select().from(customerPasswords)
      .where(and(eq(customerPasswords.phone, phone), eq(customerPasswords.isActive, 1)))
      .limit(1).for("update");
    const pwd = pwRows?.[0];
    if (!pwd) return { success: false, error: "no_password" as const };
    if (pwd.pendingApproval === 1) return { success: false, error: "pending_approval" as const };
    if (!pwd.expiresAt || new Date(pwd.expiresAt) < new Date()) return { success: false, error: "expired" as const };
    if (!await bcrypt.compare(password, pwd.password)) return { success: false, error: "wrong_password" as const };
    const token = randomBytes(32).toString("hex");
    await tx.insert(customerPasswordSessions).values({
      phone, token, expiresAt: new Date(Date.now() + SESSION_DURATION_MS), lastAccessAt: new Date(),
    });
    try { await tx.insert(customerLoginHistory).values({ phone, loginAt: new Date() }); } catch {}
    loginEmailProofs.delete(verificationToken);
    return { success: true, token, ...getProfileUpdateMeta(customer) };
  });
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

  // Confirmação de e-mail do login/cadastro.
  // Usa o mesmo gerador e entrega dos códigos de e-mail, mas NÃO consulta
  // a lista de e-mails autorizados do Acesso Restrito.
  startLoginEmailVerification: publicProcedure
    .input(z.object({
      phone: z.string().min(10).max(32),
      email: z.string().email().max(320),
    }))
    .mutation(async ({ input }) => {
      const cleanPhone = input.phone.replace(/\D/g, "");
      if (cleanPhone.length !== 11) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido." });
      }
      const email = input.email.trim().toLowerCase();
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Não foi possível verificar o cadastro agora." });
      const customer = await getCustomerByCleanPhone(cleanPhone);
      if (customer?.deletedAt) {
        return { success: false, error: "customer_unavailable" as const, message: "Cadastro indisponível. Entre em contato com o atendimento." };
      }

      // Cliente existente precisa confirmar exatamente o e-mail salvo no cadastro.
      // Cliente novo pode confirmar qualquer e-mail válido informado por ele.
      if (customer) {
        const registeredEmail = String((customer as any).email || "").trim().toLowerCase();
        if (!registeredEmail) {
          return { success: false, error: "email_missing" as const, message: "Este cadastro não possui e-mail. Entre em contato com o atendimento." };
        }
        if (registeredEmail !== email) {
          return { success: false, error: "email_mismatch" as const, message: "O e-mail informado não corresponde ao cadastro deste telefone." };
        }
      }

      // Before issuing OR resending any code, reject mailboxes owned by other IDs.
      // Compare database identity, not just whether this phone exists.
      if (await emailBelongsToAnotherCustomer(db, email, customer ? Number(customer.id) : null)) {
        return { success: false, error: "email_in_use" as const, message: CUSTOMER_EMAIL_IN_USE_MESSAGE };
      }

      const key = loginEmailKey(cleanPhone, email);
      const current = loginEmailPending.get(key);
      const now = Date.now();

      if (current && current.expiresAt > now) {
        if (now - current.lastSentAt < LOGIN_EMAIL_CODE_RESEND_MS) {
          const retryAfter = Math.ceil((LOGIN_EMAIL_CODE_RESEND_MS - (now - current.lastSentAt)) / 1000);
          return { success: false, error: "cooldown" as const, retryAfter, message: "Aguarde " + retryAfter + "s para reenviar o código." };
        }

        try {
          await deliverOwnSiteCode(email, current.code);
          current.lastSentAt = now;
        } catch (error) {
          console.error("[customerPassword] login email code resend failed", error instanceof Error ? error.message : String(error));
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível reenviar o código agora. Tente novamente." });
        }

        return {
          success: true,
          existingCustomer: !!customer,
          email,
          reusedCode: true,
          expiresIn: Math.max(1, Math.floor((current.expiresAt - now) / 1000)),
        };
      }

      if (current) loginEmailPending.delete(key);

      const code = generateOwnSiteCode();
      loginEmailPending.set(key, {
        phone: cleanPhone,
        email,
        code,
        codeHash: loginEmailCodeHash(cleanPhone, email, code),
        expiresAt: now + LOGIN_EMAIL_CODE_TTL_MS,
        lastSentAt: now,
        attempts: 0,
      });

      try {
        await deliverOwnSiteCode(email, code);
      } catch (error) {
        loginEmailPending.delete(key);
        console.error("[customerPassword] login email code delivery failed", error instanceof Error ? error.message : String(error));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível enviar o código agora. Tente novamente." });
      }

      return {
        success: true,
        existingCustomer: !!customer,
        email,
        reusedCode: false,
        expiresIn: Math.floor(LOGIN_EMAIL_CODE_TTL_MS / 1000),
      };
    }),

  verifyLoginEmailCode: publicProcedure
    .input(z.object({
      phone: z.string().min(10).max(32),
      email: z.string().email().max(320),
      code: z.string().regex(/^\d{6}$/),
    }))
    .mutation(async ({ input }) => {
      const cleanPhone = input.phone.replace(/\D/g, "");
      const email = input.email.trim().toLowerCase();
      const key = loginEmailKey(cleanPhone, email);
      const pending = loginEmailPending.get(key);

      if (!pending) return { success: false, error: "missing" as const, message: "Solicite um novo código." };
      if (pending.expiresAt < Date.now()) {
        loginEmailPending.delete(key);
        return { success: false, error: "expired" as const, message: "Código expirado. Solicite um novo código." };
      }
      if (pending.attempts >= 5) {
        loginEmailPending.delete(key);
        return { success: false, error: "locked" as const, message: "Muitas tentativas. Solicite um novo código." };
      }

      // An email may have been assigned elsewhere after an OTP was issued.
      // Never mint proof tokens from stale or cross-account mailboxes.
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Não foi possível verificar o cadastro agora." });
      const customer = await getCustomerByCleanPhone(cleanPhone);
      if (customer?.deletedAt ||
          (customer && String(customer.email || "").trim().toLowerCase() !== email) ||
          await emailBelongsToAnotherCustomer(db, email, customer ? Number(customer.id) : null)) {
        loginEmailPending.delete(key);
        return { success: false, error: "email_in_use" as const, message: CUSTOMER_EMAIL_IN_USE_MESSAGE };
      }

      pending.attempts += 1;
      if (loginEmailCodeHash(cleanPhone, email, input.code) !== pending.codeHash) {
        return { success: false, error: "invalid_code" as const, message: "Código incorreto." };
      }

      loginEmailPending.delete(key);
      const verificationToken = randomBytes(32).toString("hex");
      loginEmailProofs.set(verificationToken, {
        phone: cleanPhone,
        email,
        expiresAt: Date.now() + LOGIN_EMAIL_PROOF_TTL_MS,
      });
      return { success: true, verificationToken, email };
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
      const profileUpdateMeta = getProfileUpdateMeta(cust);
      if (!pwd) return { status: "no_password" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name, ...profileUpdateMeta };
      if (pwd.pendingApproval === 1) return { status: "pending_approval" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name, ...profileUpdateMeta };
      if (!pwd.expiresAt) return { status: "pending_approval" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name, ...profileUpdateMeta };
      if (new Date(pwd.expiresAt) < new Date()) return { status: "expired" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name, ...profileUpdateMeta };

      return { status: "active" as const, name: cust.name, phone: resolvedPhone, hasCpf: !!(cust.cpf), ...profileUpdateMeta };
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
      const profileUpdateMeta = getProfileUpdateMeta(cust);
      if (!pwd) return { status: "no_password" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name, ...profileUpdateMeta };
      if (pwd.pendingApproval === 1) return { status: "pending_approval" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name, ...profileUpdateMeta };
      if (!pwd.expiresAt) return { status: "pending_approval" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name, ...profileUpdateMeta };
      if (new Date(pwd.expiresAt) < new Date()) return { status: "expired" as const, phone: resolvedPhone, hasCpf: !!(cust.cpf), name: cust.name, ...profileUpdateMeta };

      return { status: "active" as const, name: cust.name, phone: resolvedPhone, hasCpf: !!(cust.cpf), ...profileUpdateMeta };
    }),

  // â”€â”€ Salvar CPF do cliente (obrigatório antes de criar senha) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  saveCpf: publicProcedure
    .input(z.object({ phone: z.string(), cpf: z.string().min(1) }))
    .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),

  // Cliente cria senha pelo fluxo normal; reparo de CPF fica centralizado.

  clientCreateAuto: publicProcedure
    .input(z.object({ phone: z.string(), password: z.string().min(4), emailVerificationToken: z.string().min(32).optional() }))
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

      // A criacao inicial exige a mesma confirmacao de e-mail usada pelo login central.
      // Telefone e senha, sozinhos, nunca autorizam criar credenciais.
      if (!input.emailVerificationToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Confirme o e-mail no login principal." });
      const proof = assertLoginEmailProof(cleanPhone, input.emailVerificationToken);
      if (String((cust as any).email || "").trim().toLowerCase() !== proof.email) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Confirme o e-mail do cadastro novamente." });
      }
      if (await emailBelongsToAnotherCustomer(db, proof.email, Number(cust.id))) {
        throw new TRPCError({ code: "CONFLICT", message: CUSTOMER_EMAIL_IN_USE_MESSAGE });
      }

      // Verificar bloqueio de cadastro
      if ((cust as any).blocked === 1) {
        return { success: false, error: "blocked" as const, blockReason: (cust as any).blockReason || 'Acesso bloqueado' };
      }

      // Uma criacao inicial nao pode substituir credenciais existentes por telefone.
      // Trocas exigem o fluxo de recuperacao por e-mail ou uma acao do ADM.
      if (await getActivePassword(cleanPhone)) {
        throw new TRPCError({ code: "CONFLICT", message: "Senha ja cadastrada. Use a recuperacao autorizada." });
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

      loginEmailProofs.delete(input.emailVerificationToken);
      return { success: true, token, expiresAt: expiresAt.getTime() };
    }),

  // â”€â”€ Cliente cria senha (modo manual) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  clientCreateManual: publicProcedure
    .input(z.object({ phone: z.string(), password: z.string().min(4), emailVerificationToken: z.string().min(32).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanPhone = input.phone.replace(/\D/g, "");

      if (await getPasswordMode() !== "manual") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Aprovacao manual nao esta ativa." });
      }

      // Verificar se cliente existe
      const cust = await getCustomerByCleanPhone(cleanPhone);
      if (!cust) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });
      }

      // A criacao inicial exige a mesma confirmacao de e-mail usada pelo login central.
      // Telefone e senha, sozinhos, nunca autorizam criar credenciais.
      if (!input.emailVerificationToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Confirme o e-mail no login principal." });
      const proof = assertLoginEmailProof(cleanPhone, input.emailVerificationToken);
      if (String((cust as any).email || "").trim().toLowerCase() !== proof.email) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Confirme o e-mail do cadastro novamente." });
      }
      if (await emailBelongsToAnotherCustomer(db, proof.email, Number(cust.id))) {
        throw new TRPCError({ code: "CONFLICT", message: CUSTOMER_EMAIL_IN_USE_MESSAGE });
      }

      // Verificar bloqueio de cadastro
      if ((cust as any).blocked === 1) {
        return { success: false, error: "blocked" as const, blockReason: (cust as any).blockReason || 'Acesso bloqueado' };
      }

      // Uma criacao inicial nao pode substituir credenciais existentes por telefone.
      // Trocas exigem o fluxo de recuperacao por e-mail ou uma acao do ADM.
      if (await getActivePassword(cleanPhone)) {
        throw new TRPCError({ code: "CONFLICT", message: "Senha ja cadastrada. Use a recuperacao autorizada." });
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

      loginEmailProofs.delete(input.emailVerificationToken);
      return { success: true, pending: true };
    }),

  // Os dois pontos de entrada usam a mesma autenticação transacional.
  loginVerified: publicProcedure
    .input(z.object({ phone: z.string(), password: z.string(), emailVerificationToken: z.string().min(32) }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      return authenticateVerifiedCustomer(db, input.phone.replace(/\D/g, ""), input.password, input.emailVerificationToken);
    }),

  login: publicProcedure
    .input(z.object({ phone: z.string(), password: z.string(), emailVerificationToken: z.string().min(32).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      if (!input.emailVerificationToken) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Confirme seu e-mail no login principal." });
      }
      return authenticateVerifiedCustomer(db, input.phone.replace(/\D/g, ""), input.password, input.emailVerificationToken);
    }),

  checkSession: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanToken = input.token.trim();
      if (!cleanToken) return { valid: false, reason: 'missing' as const };

      const rows = await db.select().from(customerPasswordSessions)
        .where(eq(customerPasswordSessions.token, cleanToken)).limit(1);
      let session: any = rows?.[0] || null;
      let source: 'customer' | 'spreadsheet' = 'customer';
      let phone = session?.phone || '';

      if (!session) {
        const legacyRows = await db.select().from(spreadsheetSessions)
          .where(eq(spreadsheetSessions.token, cleanToken)).limit(1);
        const legacySession = legacyRows?.[0] || null;
        if (legacySession) {
          const clientRows = await db.select().from(spreadsheetClients)
            .where(eq(spreadsheetClients.id, legacySession.clientId)).limit(1);
          const client = clientRows?.[0] || null;
          if (!client) return { valid: false, reason: 'missing' as const };
          session = legacySession;
          source = 'spreadsheet';
          phone = String(client.phone || '');
        }
      }

      if (!session) return { valid: false, reason: 'missing' as const };
      if (!session.expiresAt || new Date(session.expiresAt) < new Date()) return { valid: false, reason: 'expired' as const };

      const customerForSession = await getCustomerByCleanPhone(String(phone).replace(/\D/g, ''));
      if (!customerForSession || customerForSession.deletedAt) return { valid: false, reason: 'missing' as const };
      if (customerForSession && (customerForSession as any).blocked === 1) {
        return { valid: false, blocked: true, reason: 'blocked' as const, blockReason: (customerForSession as any).blockReason || 'Acesso bloqueado' };
      }
      const profileUpdateMeta = getProfileUpdateMeta(customerForSession);

      try {
        const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
        const diff = newExpiry.getTime() - new Date(session.expiresAt).getTime();
        if (diff > 24 * 60 * 60 * 1000) {
          if (source === 'customer') {
            await db.update(customerPasswordSessions).set({ expiresAt: newExpiry, lastAccessAt: new Date() })
              .where(eq(customerPasswordSessions.token, cleanToken));
          } else {
            await db.update(spreadsheetSessions).set({ expiresAt: newExpiry, lastAccessAt: new Date() })
              .where(eq(spreadsheetSessions.token, cleanToken));
          }
        }
      } catch {}

      return { valid: true, phone, source, ...profileUpdateMeta };
    }),

  // â”€â”€ Logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  logout: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      const cleanToken = input.token.trim();
      await db.delete(customerPasswordSessions).where(eq(customerPasswordSessions.token, cleanToken));
      await db.delete(spreadsheetSessions).where(eq(spreadsheetSessions.token, cleanToken));
      return { success: true };
    }),

  // â”€â”€ ADM: listar pendentes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


  // Independent from login OTP: recovery never grants route access or extends validity.
  requestPasswordRecovery: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(32) }))
    .mutation(async ({ input }) => {
      const generic = { success: true as const, message: "Se o cadastro estiver habilitado, enviaremos um codigo ao e-mail cadastrado." };
      const phone = input.phone.replace(/\D/g, "");
      if (!/^\d{10,11}$/.test(phone)) return generic;
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Servico temporariamente indisponivel." });
      const customer = await getCustomerByCleanPhone(phone);
      const password = await getActivePassword(phone);
      if (!canCustomerRecoverPassword(await getPasswordMode(), customer, password)) return generic;
      await db.execute(sql`CREATE TABLE IF NOT EXISTS customerPasswordRecovery (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, phone VARCHAR(32) NOT NULL,
        codeHash CHAR(64) NOT NULL, expiresAt DATETIME NOT NULL,
        attempts INT NOT NULL DEFAULT 0, usedAt DATETIME NULL, createdAt DATETIME NOT NULL,
        INDEX recovery_phone_created (phone,createdAt)
      ) ENGINE=InnoDB`);
      // Uma linha do cliente serializa o cooldown mesmo no primeiro pedido.
      // Entrega e INSERT estão na mesma transação: falha de SMTP faz rollback.
      return db.transaction(async (tx: any) => {
        const custRows = await tx.select().from(customers)
          .where(eq(customers.phone, phone)).limit(1).for("update");
        const modeRows = await tx.select().from(appSettings)
          .where(eq(appSettings.key, "senha_cadastro_ativa")).limit(1);
        const pwRows = await tx.select().from(customerPasswords)
          .where(and(eq(customerPasswords.phone, phone), eq(customerPasswords.isActive, 1)))
          .limit(1).for("update");
        const lockedCustomer = custRows?.[0];
        if (!canCustomerRecoverPassword(modeRows?.[0]?.value === "false" ? "auto" : "manual", lockedCustomer, pwRows?.[0])) return generic;
        const [recentRows] = await tx.execute(sql`
          SELECT createdAt FROM customerPasswordRecovery WHERE phone=${phone}
          ORDER BY id DESC LIMIT 1`);
        const recent = (recentRows as any[])?.[0];
        if (recent && Date.now() - new Date(recent.createdAt).getTime() < 60_000) return generic;
        const code = generateOwnSiteCode();
        const codeHash = passwordRecoveryCodeHash(phone, code);
        const expiresAt = new Date(Date.now() + 10 * 60_000);
        await tx.execute(sql`INSERT INTO customerPasswordRecovery(phone,codeHash,expiresAt,createdAt)
          VALUES (${phone},${codeHash},${expiresAt},NOW())`);
        try { await deliverOwnSiteCode(String(lockedCustomer.email).trim().toLowerCase(), code, "password-recovery"); }
        catch { throw new TRPCError({ code:"SERVICE_UNAVAILABLE", message:"Nao foi possivel enviar o codigo. Tente novamente." }); }
        return generic;
      });
    }),

  finishPasswordRecovery: publicProcedure
    .input(z.object({
      phone: z.string().min(10).max(32),
      code: z.string().regex(/^\d{6}$/),
      newPassword: z.string().min(8).max(72),
    }))
    .mutation(async ({ input }) => {
      const phone = input.phone.replace(/\D/g,"");
      const db = (await getDb()) as any;
      if (!db) throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:"Servico indisponivel."});
      // Validation and mutation must be atomic; manual ADM mode always wins.
      return db.transaction(async (tx: any) => {
        const modeRows = await tx.select().from(appSettings)
          .where(eq(appSettings.key, "senha_cadastro_ativa")).limit(1).for("update");
        if (modeRows?.[0]?.value !== "false") throw new TRPCError({code:"FORBIDDEN",message:"Recuperacao disponivel somente no modo automatico."});
        const customersRows = await tx.select().from(customers).where(eq(customers.phone,phone)).limit(1).for("update");
        const customer=customersRows?.[0];
        const pwRows=await tx.select().from(customerPasswords)
          .where(and(eq(customerPasswords.phone,phone),eq(customerPasswords.isActive,1))).limit(1).for("update");
        const pw=pwRows?.[0];
        if(!canCustomerRecoverPassword("auto",customer,pw)) throw new TRPCError({code:"FORBIDDEN",message:"Recuperacao indisponivel para este cadastro."});
        const [raw]=await tx.execute(sql`SELECT id,codeHash,attempts,expiresAt,usedAt FROM customerPasswordRecovery
          WHERE phone=${phone} ORDER BY id DESC LIMIT 1 FOR UPDATE`);
        const rec=(raw as any[])?.[0];
        if (!rec || rec.usedAt || new Date(rec.expiresAt).getTime() <= Date.now() || Number(rec.attempts)>=5)
          throw new TRPCError({code:"BAD_REQUEST",message:"Codigo invalido ou expirado."});
        await tx.execute(sql`UPDATE customerPasswordRecovery SET attempts=attempts+1 WHERE id=${rec.id}`);
        const actual=Buffer.from(String(rec.codeHash),"hex");
        const expected=Buffer.from(passwordRecoveryCodeHash(phone, input.code),"hex");
        if(actual.length!==expected.length || !timingSafeEqual(actual,expected))
          return {success:false as const, message:"Codigo invalido ou expirado."};
        const hash=await bcrypt.hash(input.newPassword,12);
        await tx.update(customerPasswords).set({password:hash}).where(eq(customerPasswords.id,pw.id));
        await tx.execute(sql`UPDATE customerPasswordRecovery SET usedAt=NOW() WHERE id=${rec.id}`);
        // Todas as sessões da identidade são revogadas, inclusive telefones
        // formatados e múltiplos cadastros legados associados ao mesmo número.
        await tx.execute(sql`DELETE FROM customerPasswordSessions
          WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${phone}`);
        await tx.execute(sql`DELETE FROM spreadsheetSessions WHERE clientId IN
          (SELECT id FROM spreadsheetClients WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${phone})`);
        return {success:true as const};
      });
    }),

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
