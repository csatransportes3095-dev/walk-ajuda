import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isValidCPF } from "@shared/cpf";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  ensureCustomerIdentityInfrastructure,
  normalizeCustomerCpf,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "../customerAccess";
import {
  ensureStableCustomerIdentityInfrastructure,
  findCustomerByStableId,
  findCustomerByStableIdentity,
  linkCustomerAuthRows,
  recordCustomerIdentityAliases,
} from "../customerStableIdentity";
import { syncUnifiedCustomerRegistry } from "../customerIdentity";
import {
  getMissingCustomerProfileFields,
  isCustomerProfileComplete,
  isGenericRecoveredCustomerName,
  normalizeCustomerZipCode,
} from "../customerProfile";
import { storagePut } from "../storage";

const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const PASSWORD_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALREADY_UPDATED_MESSAGE = "Seu cadastro já está completo.";

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

async function passwordRows(db: any, customerId: number, phone: string) {
  await ensureStableCustomerIdentityInfrastructure(db);
  if (customerId) {
    const byCustomerId = await rows(db, sql`
      SELECT id, customerId, phone, password, isActive, pendingApproval, expiresAt
      FROM customerPasswords
      WHERE isActive=1 AND customerId=${customerId}
      ORDER BY id DESC
      LIMIT 1
    `);
    if (byCustomerId.length) return byCustomerId;
  }
  if (!phone) return [];
  return rows(db, sql`
    SELECT id, customerId, phone, password, isActive, pendingApproval, expiresAt
    FROM customerPasswords
    WHERE isActive=1
      AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 11)=${phone.slice(-11)}
    ORDER BY id DESC
    LIMIT 1
  `);
}

async function customerUpdateAlreadyCompleted(_db: any, customer: any) {
  // A fonte de verdade são SEMPRE os dados atuais. Um cadastro atualizado no
  // passado volta a ficar pendente se o ADM apagar/corrigir qualquer campo obrigatório.
  return isCustomerProfileComplete(customer);
}

function alreadyUpdatedError() {
  return new TRPCError({ code: "CONFLICT", message: ALREADY_UPDATED_MESSAGE });
}

async function requireCustomerSession(token: string) {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  await ensureStableCustomerIdentityInfrastructure(db);
  const sessions = await rows(db, sql`
    SELECT customerId, phone, expiresAt
    FROM customerPasswordSessions
    WHERE token=${token.trim()}
    LIMIT 1
  `);
  const session = sessions[0];
  if (!session || !session.expiresAt || new Date(session.expiresAt).getTime() < Date.now()) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão vencida. Entre novamente." });
  }

  let customer = Number(session.customerId || 0)
    ? await findCustomerByStableId(Number(session.customerId), db)
    : null;
  if (!customer && session.phone) {
    customer = await findCustomerByStableIdentity({ phone: session.phone }, db);
  }
  if (!customer || customer.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro não encontrado." });
  if (Number(customer.blocked) === 1) throw new TRPCError({ code: "FORBIDDEN", message: "Cadastro bloqueado. Fale com o atendimento." });

  await recordCustomerIdentityAliases(Number(customer.id), customer, db);
  await linkCustomerAuthRows(Number(customer.id), session.phone || customer.phone, db);
  if (!session.customerId) {
    await db.execute(sql`
      UPDATE customerPasswordSessions
      SET customerId=${customer.id}
      WHERE token=${token.trim()}
    `);
  }
  await db.execute(sql`UPDATE customerPasswordSessions SET lastAccessAt=NOW() WHERE token=${token.trim()}`);
  return { db, customer };
}

async function createSession(db: any, customer: any, authPhone: string) {
  await ensureStableCustomerIdentityInfrastructure(db);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const phoneForSession = normalizeCustomerPhone(customer.phone) || normalizeCustomerPhone(authPhone);
  if (!phoneForSession) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cadastre um telefone válido para continuar." });
  }
  await db.execute(sql`
    INSERT INTO customerPasswordSessions (customerId, phone, token, expiresAt, createdAt, lastAccessAt)
    VALUES (${customer.id}, ${phoneForSession}, ${token}, ${expiresAt}, NOW(), NOW())
  `);
  await recordCustomerIdentityAliases(Number(customer.id), customer, db);
  return token;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export const customerUpdateRouter = router({
  status: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(32) }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const phone = normalizeCustomerPhone(input.phone);
      if (!phone) return { status: "not_found" as const };
      const customer = await findCustomerByStableIdentity({ phone }, db);
      if (!customer) return { status: "not_found" as const };
      if (Number(customer.blocked) === 1) return { status: "blocked" as const };
      await recordCustomerIdentityAliases(Number(customer.id), customer, db);
      await linkCustomerAuthRows(Number(customer.id), phone, db);
      if (await customerUpdateAlreadyCompleted(db, customer)) return { status: "completed" as const };
      const passwords = await passwordRows(db, Number(customer.id), phone);
      return {
        status: passwords.length ? "password" as const : "create_password" as const,
        missing: getMissingCustomerProfileFields(customer),
      };
    }),

  login: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(32), password: z.string().min(4).max(72) }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const phone = normalizeCustomerPhone(input.phone);
      const customer = phone ? await findCustomerByStableIdentity({ phone }, db) : null;
      if (!customer || Number(customer.blocked) === 1) return { success: false as const, error: "invalid" as const };
      if (await customerUpdateAlreadyCompleted(db, customer)) return { success: false as const, error: "completed" as const };
      await recordCustomerIdentityAliases(Number(customer.id), customer, db);
      await linkCustomerAuthRows(Number(customer.id), phone, db);
      const passwords = await passwordRows(db, Number(customer.id), phone);
      if (!passwords[0]) return { success: false as const, error: "no_password" as const };
      const matches = await bcrypt.compare(input.password, String(passwords[0].password || ""));
      if (!matches) return { success: false as const, error: "wrong_password" as const };
      const token = await createSession(db, customer, phone);
      return { success: true as const, token };
    }),

  createPassword: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(32), password: z.string().min(4).max(72) }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const phone = normalizeCustomerPhone(input.phone);
      const customer = phone ? await findCustomerByStableIdentity({ phone }, db) : null;
      if (!customer || Number(customer.blocked) === 1) return { success: false as const, error: "invalid" as const };
      if (await customerUpdateAlreadyCompleted(db, customer)) return { success: false as const, error: "completed" as const };
      await recordCustomerIdentityAliases(Number(customer.id), customer, db);
      await linkCustomerAuthRows(Number(customer.id), phone, db);
      const existing = await passwordRows(db, Number(customer.id), phone);
      if (existing.length) return { success: false as const, error: "password_exists" as const };
      const hash = await bcrypt.hash(input.password, 10);
      const expiresAt = new Date(Date.now() + PASSWORD_DURATION_MS);
      const authPhone = normalizeCustomerPhone(customer.phone) || phone;
      await db.execute(sql`
        INSERT INTO customerPasswords
          (customerId, phone, password, isActive, expiresAt, pendingApproval, createdByClient, clientCreatedAt, createdAt)
        VALUES
          (${customer.id}, ${authPhone}, ${hash}, 1, ${expiresAt}, 0, 1, NOW(), NOW())
      `);
      const token = await createSession(db, customer, phone);
      return { success: true as const, token };
    }),

  profile: publicProcedure
    .input(z.object({ token: z.string().min(32).max(255) }))
    .query(async ({ input }) => {
      const { db, customer } = await requireCustomerSession(input.token);
      const name = String(customer.name || "").trim();
      return {
        completed: await customerUpdateAlreadyCompleted(db, customer),
        customerNumber: customer.customerNumber || null,
        phone: normalizeCustomerPhone(customer.phone),
        name: isGenericRecoveredCustomerName(name) ? "" : name,
        email: normalizeCustomerEmail(customer.email),
        cpf: normalizeCustomerCpf(customer.cpf),
        zipCode: normalizeCustomerZipCode(customer.zipCode),
        addressLine: String(customer.addressLine || "").trim(),
        neighborhood: String(customer.neighborhood || "").trim(),
        addressNumber: String(customer.addressNumber || "").trim(),
        addressComplement: String(customer.addressComplement || "").trim(),
        city: String(customer.city || "").trim(),
        uf: String(customer.uf || "").trim().toUpperCase(),
        profilePhotoUrl: String(customer.profilePhotoUrl || "").trim(),
        missing: getMissingCustomerProfileFields(customer),
      };
    }),

  uploadPhoto: publicProcedure
    .input(z.object({ token: z.string().min(32).max(255), imageBase64: z.string().min(100).max(8_000_000) }))
    .mutation(async ({ input }) => {
      const { db, customer } = await requireCustomerSession(input.token);
      if (await customerUpdateAlreadyCompleted(db, customer)) throw alreadyUpdatedError();
      const comma = input.imageBase64.indexOf(",");
      const pureBase64 = (comma >= 0 ? input.imageBase64.slice(comma + 1) : input.imageBase64).trim();
      const buffer = Buffer.from(pureBase64, "base64");
      if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A foto deve ter no máximo 5 MB." });
      }
      const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
      const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
      if (!isJpeg && !isPng && !isWebp) throw new TRPCError({ code: "BAD_REQUEST", message: "Use uma foto JPG, PNG ou WEBP." });
      const ext = isJpeg ? "jpg" : isPng ? "png" : "webp";
      const mime = isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp";
      const stableKey = `customer-${customer.id}`;
      const fileKey = `profile-photos/${stableKey}-${Date.now()}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, mime);
      await db.execute(sql`UPDATE customers SET profilePhotoUrl=${url}, updatedAt=NOW() WHERE id=${customer.id}`);
      return { success: true, url };
    }),

  adminUpdate: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().max(128).optional(),
      email: z.string().max(320).nullable().optional(),
      cpf: z.string().max(18).nullable().optional(),
      zipCode: z.string().max(10).nullable().optional(),
      addressLine: z.string().max(255).nullable().optional(),
      neighborhood: z.string().max(128).nullable().optional(),
      addressNumber: z.string().max(32).nullable().optional(),
      addressComplement: z.string().max(128).nullable().optional(),
      city: z.string().max(128).nullable().optional(),
      uf: z.string().max(2).nullable().optional(),
      profilePhotoUrl: z.string().max(2048).nullable().optional(),
      referredBy: z.string().max(128).nullable().optional(),
      referredByPhone: z.string().max(32).nullable().optional(),
      customerNumber: z.number().int().positive().nullable().optional(),
      isReseller: z.number().int().min(0).max(1).optional(),
      resellerDiscountType: z.enum(["percent", "fixed"]).nullable().optional(),
      resellerDiscountValue: z.union([z.string(), z.number()]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      await ensureCustomerIdentityInfrastructure(db);
      await ensureStableCustomerIdentityInfrastructure(db);

      const current = (await rows(db, sql`
        SELECT id, customerNumber, name, phone, email, cpf, zipCode, addressLine,
               neighborhood, addressNumber, addressComplement, city, uf, profilePhotoUrl,
               referredBy, referredByPhone, isReseller, resellerDiscountType, resellerDiscountValue
        FROM customers
        WHERE id=${input.id} AND deletedAt IS NULL
        LIMIT 1
      `))[0];
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado." });

      // Telefone propositalmente não existe no input: é a identidade fixa do cliente.
      const nextName = hasOwn(input, "name") ? String(input.name ?? "").trim().replace(/\s+/g, " ") : String(current.name || "");
      const rawEmail = hasOwn(input, "email") ? String(input.email ?? "").trim() : String(current.email || "");
      const nextEmail = rawEmail ? normalizeCustomerEmail(rawEmail) : "";
      if (rawEmail && !nextEmail) throw new TRPCError({ code: "BAD_REQUEST", message: "E-mail inválido." });

      const rawCpf = hasOwn(input, "cpf") ? String(input.cpf ?? "") : String(current.cpf || "");
      const nextCpf = rawCpf ? normalizeCustomerCpf(rawCpf) : "";
      if (rawCpf && (!nextCpf || !isValidCPF(nextCpf))) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });

      const rawZipCode = hasOwn(input, "zipCode") ? String(input.zipCode ?? "") : String(current.zipCode || "");
      const nextZipCode = rawZipCode ? normalizeCustomerZipCode(rawZipCode) : "";
      if (rawZipCode && !nextZipCode) throw new TRPCError({ code: "BAD_REQUEST", message: "CEP inválido." });

      const nextAddressLine = hasOwn(input, "addressLine") ? String(input.addressLine ?? "").trim().replace(/\s+/g, " ") : String(current.addressLine || "");
      const nextNeighborhood = hasOwn(input, "neighborhood") ? String(input.neighborhood ?? "").trim().replace(/\s+/g, " ") : String(current.neighborhood || "");
      const nextAddressNumber = hasOwn(input, "addressNumber") ? String(input.addressNumber ?? "").trim() : String(current.addressNumber || "");
      const nextAddressComplement = hasOwn(input, "addressComplement") ? String(input.addressComplement ?? "").trim().replace(/\s+/g, " ") : String(current.addressComplement || "");
      const nextCity = hasOwn(input, "city") ? String(input.city ?? "").trim().replace(/\s+/g, " ") : String(current.city || "");
      const rawUf = hasOwn(input, "uf") ? String(input.uf ?? "").trim().toUpperCase() : String(current.uf || "").trim().toUpperCase();
      if (rawUf && !/^[A-Z]{2}$/.test(rawUf)) throw new TRPCError({ code: "BAD_REQUEST", message: "UF inválida." });
      const nextPhoto = hasOwn(input, "profilePhotoUrl") ? String(input.profilePhotoUrl ?? "").trim() : String(current.profilePhotoUrl || "");
      const nextReferredBy = hasOwn(input, "referredBy") ? String(input.referredBy ?? "").trim() : String(current.referredBy || "");
      const rawReferredByPhone = hasOwn(input, "referredByPhone") ? String(input.referredByPhone ?? "") : String(current.referredByPhone || "");
      const nextReferredByPhone = rawReferredByPhone ? normalizeCustomerPhone(rawReferredByPhone) : "";
      if (rawReferredByPhone && !nextReferredByPhone) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone do indicador inválido." });
      const nextCustomerNumber = hasOwn(input, "customerNumber") ? input.customerNumber ?? null : current.customerNumber ?? null;
      const nextIsReseller = hasOwn(input, "isReseller") ? Number(input.isReseller || 0) : Number(current.isReseller || 0);
      const nextDiscountType = hasOwn(input, "resellerDiscountType") ? input.resellerDiscountType || "percent" : String(current.resellerDiscountType || "percent");
      const nextDiscountValue = hasOwn(input, "resellerDiscountValue") ? String(input.resellerDiscountValue ?? "0") : String(current.resellerDiscountValue ?? "0");

      if (nextCpf) {
        const conflict = await findCustomerByStableIdentity({ cpf: nextCpf }, db);
        if (conflict && Number(conflict.id) !== Number(input.id)) throw new TRPCError({ code: "CONFLICT", message: "CPF já pertence a outro cadastro." });
      }
      if (nextEmail) {
        const conflict = await findCustomerByStableIdentity({ email: nextEmail }, db);
        if (conflict && Number(conflict.id) !== Number(input.id)) throw new TRPCError({ code: "CONFLICT", message: "E-mail já pertence a outro cadastro." });
      }

      const previousIdentity = { phone: current.phone, cpf: current.cpf, email: current.email };
      await recordCustomerIdentityAliases(Number(input.id), previousIdentity, db);
      await db.execute(sql`
        UPDATE customers SET
          customerNumber=${nextCustomerNumber}, name=${nextName},
          email=${nextEmail || null}, cpf=${nextCpf || null},
          zipCode=${nextZipCode || null}, addressLine=${nextAddressLine || null},
          neighborhood=${nextNeighborhood || null}, addressNumber=${nextAddressNumber || null},
          addressComplement=${nextAddressComplement || null}, city=${nextCity || null}, uf=${rawUf || null},
          profilePhotoUrl=${nextPhoto || null}, referredBy=${nextReferredBy || null},
          referredByPhone=${nextReferredByPhone || null}, isReseller=${nextIsReseller},
          resellerDiscountType=${nextDiscountType}, resellerDiscountValue=${nextDiscountValue},
          normalizedPhone=${normalizeCustomerPhone(current.phone)},
          normalizedCpf=${nextCpf || null}, normalizedEmail=${nextEmail || null}, updatedAt=NOW()
        WHERE id=${input.id} AND deletedAt IS NULL
      `);
      await recordCustomerIdentityAliases(Number(input.id), { phone: current.phone, cpf: nextCpf, email: nextEmail }, db);
      const synchronization = await syncUnifiedCustomerRegistry([previousIdentity]);
      const customer = await findCustomerByStableId(Number(input.id), db);
      return { success: true, customer, incomplete: customer ? !isCustomerProfileComplete(customer) : true, synchronization };
    }),

  adminCreatePartial: adminProcedure
    .input(z.object({
      phone: z.string().min(10).max(32),
      name: z.string().max(128).optional(),
      email: z.string().max(320).optional(),
      cpf: z.string().max(18).optional(),
      zipCode: z.string().max(10).optional(),
      addressLine: z.string().max(255).optional(),
      neighborhood: z.string().max(128).optional(),
      addressNumber: z.string().max(32).optional(),
      addressComplement: z.string().max(128).optional(),
      city: z.string().max(128).optional(),
      uf: z.string().max(2).optional(),
      profilePhotoUrl: z.string().max(2048).optional(),
      referredBy: z.string().max(128).optional(),
      referredByPhone: z.string().max(32).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      await ensureCustomerIdentityInfrastructure(db);
      await ensureStableCustomerIdentityInfrastructure(db);

      const phone = normalizeCustomerPhone(input.phone);
      if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido." });
      const duplicate = (await rows(db, sql`SELECT id FROM customers WHERE phone=${phone} LIMIT 1`))[0];
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "Este telefone já identifica outro cadastro." });

      const email = input.email?.trim() ? normalizeCustomerEmail(input.email) : "";
      if (input.email?.trim() && !email) throw new TRPCError({ code: "BAD_REQUEST", message: "E-mail inválido." });
      const cpf = input.cpf?.trim() ? normalizeCustomerCpf(input.cpf) : "";
      if (input.cpf?.trim() && (!cpf || !isValidCPF(cpf))) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });
      const zipCode = input.zipCode?.trim() ? normalizeCustomerZipCode(input.zipCode) : "";
      if (input.zipCode?.trim() && !zipCode) throw new TRPCError({ code: "BAD_REQUEST", message: "CEP inválido." });
      const uf = String(input.uf || "").trim().toUpperCase();
      if (uf && !/^[A-Z]{2}$/.test(uf)) throw new TRPCError({ code: "BAD_REQUEST", message: "UF inválida." });
      const referredByPhone = input.referredByPhone?.trim() ? normalizeCustomerPhone(input.referredByPhone) : "";
      if (input.referredByPhone?.trim() && !referredByPhone) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone do indicador inválido." });

      if (cpf) {
        const conflict = await findCustomerByStableIdentity({ cpf }, db);
        if (conflict) throw new TRPCError({ code: "CONFLICT", message: "CPF já pertence a outro cadastro." });
      }
      if (email) {
        const conflict = await findCustomerByStableIdentity({ email }, db);
        if (conflict) throw new TRPCError({ code: "CONFLICT", message: "E-mail já pertence a outro cadastro." });
      }

      const nextRows = await rows(db, sql`SELECT COALESCE(MAX(customerNumber), 0) + 1 AS nextNum FROM customers`);
      const customerNumber = Number(nextRows[0]?.nextNum || 1);
      const name = String(input.name || "").trim().replace(/\s+/g, " ") || "CADASTRO RECUPERADO";
      await db.execute(sql`
        INSERT INTO customers (
          customerNumber, name, phone, email, cpf,
          zipCode, addressLine, neighborhood, addressNumber, addressComplement,
          city, uf, profilePhotoUrl, referredBy, referredByPhone,
          normalizedPhone, normalizedCpf, normalizedEmail, createdAt, updatedAt
        ) VALUES (
          ${customerNumber}, ${name}, ${phone}, ${email || null}, ${cpf || null},
          ${zipCode || null}, ${String(input.addressLine || "").trim() || null},
          ${String(input.neighborhood || "").trim() || null}, ${String(input.addressNumber || "").trim() || null},
          ${String(input.addressComplement || "").trim() || null}, ${String(input.city || "").trim() || null},
          ${uf || null}, ${String(input.profilePhotoUrl || "").trim() || null},
          ${String(input.referredBy || "").trim() || null}, ${referredByPhone || null},
          ${phone}, ${cpf || null}, ${email || null}, NOW(), NOW()
        )
      `);
      const customer = await findCustomerByStableIdentity({ phone }, db);
      if (!customer) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível recuperar o cadastro criado." });
      await recordCustomerIdentityAliases(Number(customer.id), customer, db);
      return { success: true, customer, incomplete: !isCustomerProfileComplete(customer) };
    }),

  save: publicProcedure
    .input(z.object({
      token: z.string().min(32).max(255),
      name: z.string().trim().min(2).max(128),
      email: z.string().trim().email().max(320),
      cpf: z.string().min(11).max(18),
      zipCode: z.string().min(8).max(10),
      addressLine: z.string().trim().min(2).max(255),
      neighborhood: z.string().trim().min(2).max(128),
      addressNumber: z.string().trim().min(1).max(32),
      addressComplement: z.string().trim().max(128).optional().default(""),
      city: z.string().trim().min(2).max(128),
      uf: z.string().trim().length(2),
    }))
    .mutation(async ({ input }) => {
      const { db, customer } = await requireCustomerSession(input.token);
      if (await customerUpdateAlreadyCompleted(db, customer)) throw alreadyUpdatedError();
      await ensureCustomerIdentityInfrastructure(db);
      await ensureStableCustomerIdentityInfrastructure(db);
      const name = input.name.trim().replace(/\s+/g, " ");
      const email = normalizeCustomerEmail(input.email);
      const cpf = normalizeCustomerCpf(input.cpf);
      const zipCode = normalizeCustomerZipCode(input.zipCode);
      const addressLine = input.addressLine.trim().replace(/\s+/g, " ");
      const neighborhood = input.neighborhood.trim().replace(/\s+/g, " ");
      const addressNumber = input.addressNumber.trim();
      const addressComplement = input.addressComplement.trim().replace(/\s+/g, " ");
      const city = input.city.trim().replace(/\s+/g, " ");
      const uf = input.uf.trim().toUpperCase();
      if (isGenericRecoveredCustomerName(name)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe seu nome completo." });
      if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "E-mail inválido." });
      if (!cpf || !isValidCPF(cpf)) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });
      if (!zipCode) throw new TRPCError({ code: "BAD_REQUEST", message: "CEP inválido." });
      if (!/^[A-Z]{2}$/.test(uf)) throw new TRPCError({ code: "BAD_REQUEST", message: "UF inválida." });
      const photoRows = await rows(db, sql`SELECT profilePhotoUrl FROM customers WHERE id=${customer.id} LIMIT 1`);
      if (!String(photoRows[0]?.profilePhotoUrl || "").trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envie sua foto de perfil." });
      }
      const cpfConflict = await findCustomerByStableIdentity({ cpf }, db);
      const emailConflict = await findCustomerByStableIdentity({ email }, db);
      if ((cpfConflict && Number(cpfConflict.id) !== Number(customer.id)) || (emailConflict && Number(emailConflict.id) !== Number(customer.id))) {
        throw new TRPCError({ code: "CONFLICT", message: "CPF ou e-mail já pertence a outro cadastro." });
      }
      const previousIdentity = { phone: customer.phone, cpf: customer.cpf, email: customer.email };
      await recordCustomerIdentityAliases(Number(customer.id), previousIdentity, db);
      await db.execute(sql`
        UPDATE customers SET
          name=${name}, email=${email}, cpf=${cpf},
          zipCode=${zipCode}, addressLine=${addressLine}, neighborhood=${neighborhood},
          addressNumber=${addressNumber}, addressComplement=${addressComplement || null},
          city=${city}, uf=${uf},
          normalizedPhone=${normalizeCustomerPhone(customer.phone) || null},
          normalizedCpf=${cpf}, normalizedEmail=${email}, updatedAt=NOW()
        WHERE id=${customer.id} AND deletedAt IS NULL
      `);
      await recordCustomerIdentityAliases(Number(customer.id), { phone: customer.phone, cpf, email }, db);
      const synchronization = await syncUnifiedCustomerRegistry([previousIdentity]);
      return { success: true, synchronization };
    }),
});