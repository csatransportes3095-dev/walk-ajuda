import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isValidCPF } from "@shared/cpf";
import { publicProcedure, router } from "../_core/trpc";
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
