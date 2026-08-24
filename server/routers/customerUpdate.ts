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
  findMainCustomerByIdentity,
  normalizeCustomerCpf,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "../customerAccess";
import { syncUnifiedCustomerRegistry } from "../customerIdentity";
import { storagePut } from "../storage";

const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const PASSWORD_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const GENERIC_NAME = /^(?:CLIENTE|CADASTRO|PEDIDO)\s+RECUPERAD[OA]|^RECUPERAD[OA](?:\s|$)/i;

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

function missingFields(customer: any) {
  const missing: string[] = [];
  const name = String(customer?.name || "").trim();
  if (name.length < 2 || GENERIC_NAME.test(name)) missing.push("name");
  if (!normalizeCustomerEmail(customer?.email)) missing.push("email");
  if (!normalizeCustomerCpf(customer?.cpf) || !isValidCPF(normalizeCustomerCpf(customer?.cpf))) missing.push("cpf");
  if (String(customer?.city || "").trim().length < 2) missing.push("city");
  if (!/^[A-Z]{2}$/.test(String(customer?.uf || "").trim().toUpperCase())) missing.push("uf");
  if (!String(customer?.profilePhotoUrl || "").trim()) missing.push("profilePhotoUrl");
  return missing;
}

async function passwordRows(db: any, phone: string) {
  return rows(db, sql`
    SELECT id, phone, password, isActive, pendingApproval, expiresAt
    FROM customerPasswords
    WHERE isActive=1
      AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 11)=${phone.slice(-11)}
    ORDER BY id DESC
    LIMIT 1
  `);
}

async function requireCustomerSession(token: string) {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const sessions = await rows(db, sql`
    SELECT phone, expiresAt
    FROM customerPasswordSessions
    WHERE token=${token.trim()}
    LIMIT 1
  `);
  const session = sessions[0];
  if (!session || !session.expiresAt || new Date(session.expiresAt).getTime() < Date.now()) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão vencida. Entre novamente." });
  }
  const customer = await findMainCustomerByIdentity({ phone: session.phone }, db);
  if (!customer || customer.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro não encontrado." });
  if (Number(customer.blocked) === 1) throw new TRPCError({ code: "FORBIDDEN", message: "Cadastro bloqueado. Fale com o atendimento." });
  await db.execute(sql`UPDATE customerPasswordSessions SET lastAccessAt=NOW() WHERE token=${token.trim()}`);
  return { db, customer };
}

async function createSession(db: any, phone: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.execute(sql`
    INSERT INTO customerPasswordSessions (phone, token, expiresAt, createdAt, lastAccessAt)
    VALUES (${phone}, ${token}, ${expiresAt}, NOW(), NOW())
  `);
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
      const customer = await findMainCustomerByIdentity({ phone }, db);
      if (!customer) return { status: "not_found" as const };
      if (Number(customer.blocked) === 1) return { status: "blocked" as const };
      const passwords = await passwordRows(db, phone);
      return { status: passwords.length ? "password" as const : "create_password" as const };
    }),

  login: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(32), password: z.string().min(4).max(72) }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const phone = normalizeCustomerPhone(input.phone);
      const customer = phone ? await findMainCustomerByIdentity({ phone }, db) : null;
      if (!customer || Number(customer.blocked) === 1) return { success: false as const, error: "invalid" as const };
      const passwords = await passwordRows(db, phone);
      if (!passwords[0]) return { success: false as const, error: "no_password" as const };
      const matches = await bcrypt.compare(input.password, String(passwords[0].password || ""));
      if (!matches) return { success: false as const, error: "wrong_password" as const };
      const token = await createSession(db, normalizeCustomerPhone(customer.phone) || phone);
      return { success: true as const, token };
    }),

  createPassword: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(32), password: z.string().min(4).max(72) }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      const phone = normalizeCustomerPhone(input.phone);
      const customer = phone ? await findMainCustomerByIdentity({ phone }, db) : null;
      if (!customer || Number(customer.blocked) === 1) return { success: false as const, error: "invalid" as const };
      const existing = await passwordRows(db, phone);
      if (existing.length) return { success: false as const, error: "password_exists" as const };
      const hash = await bcrypt.hash(input.password, 10);
      const expiresAt = new Date(Date.now() + PASSWORD_DURATION_MS);
      await db.execute(sql`
        INSERT INTO customerPasswords
          (phone, password, isActive, expiresAt, pendingApproval, createdByClient, clientCreatedAt, createdAt)
        VALUES
          (${normalizeCustomerPhone(customer.phone) || phone}, ${hash}, 1, ${expiresAt}, 0, 1, NOW(), NOW())
      `);
      const token = await createSession(db, normalizeCustomerPhone(customer.phone) || phone);
      return { success: true as const, token };
    }),

  profile: publicProcedure
    .input(z.object({ token: z.string().min(32).max(255) }))
    .query(async ({ input }) => {
      const { customer } = await requireCustomerSession(input.token);
      const name = String(customer.name || "").trim();
      return {
        customerNumber: customer.customerNumber || null,
        phone: normalizeCustomerPhone(customer.phone),
        name: GENERIC_NAME.test(name) ? "" : name,
        email: normalizeCustomerEmail(customer.email),
        cpf: normalizeCustomerCpf(customer.cpf),
        city: String(customer.city || "").trim(),
        uf: String(customer.uf || "").trim().toUpperCase(),
        profilePhotoUrl: String(customer.profilePhotoUrl || "").trim(),
        missing: missingFields(customer),
      };
    }),

  uploadPhoto: publicProcedure
    .input(z.object({ token: z.string().min(32).max(255), imageBase64: z.string().min(100).max(8_000_000) }))
    .mutation(async ({ input }) => {
      const { db, customer } = await requireCustomerSession(input.token);
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
      const phone = normalizeCustomerPhone(customer.phone);
      const fileKey = `profile-photos/${phone}-${Date.now()}.${ext}`;
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
      city: z.string().trim().min(2).max(128),
      uf: z.string().trim().length(2),
    }))
    .mutation(async ({ input }) => {
      const { db, customer } = await requireCustomerSession(input.token);
      await ensureCustomerIdentityInfrastructure(db);
      const name = input.name.trim().replace(/\s+/g, " ");
      const email = normalizeCustomerEmail(input.email);
      const cpf = normalizeCustomerCpf(input.cpf);
      const city = input.city.trim().replace(/\s+/g, " ");
      const uf = input.uf.trim().toUpperCase();
      if (GENERIC_NAME.test(name)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe seu nome completo." });
      if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "E-mail inválido." });
      if (!cpf || !isValidCPF(cpf)) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });
      if (!/^[A-Z]{2}$/.test(uf)) throw new TRPCError({ code: "BAD_REQUEST", message: "UF inválida." });
      const photoRows = await rows(db, sql`SELECT profilePhotoUrl FROM customers WHERE id=${customer.id} LIMIT 1`);
      if (!String(photoRows[0]?.profilePhotoUrl || "").trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Envie sua foto de perfil." });
      }
      const cpfConflict = await findMainCustomerByIdentity({ cpf }, db);
      const emailConflict = await findMainCustomerByIdentity({ email }, db);
      if ((cpfConflict && Number(cpfConflict.id) !== Number(customer.id)) || (emailConflict && Number(emailConflict.id) !== Number(customer.id))) {
        throw new TRPCError({ code: "CONFLICT", message: "CPF ou e-mail já pertence a outro cadastro." });
      }
      const previousIdentity = { phone: customer.phone, cpf: customer.cpf };
      await db.execute(sql`
        UPDATE customers SET
          name=${name}, email=${email}, cpf=${cpf}, city=${city}, uf=${uf},
          normalizedPhone=${normalizeCustomerPhone(customer.phone)},
          normalizedCpf=${cpf}, normalizedEmail=${email}, updatedAt=NOW()
        WHERE id=${customer.id} AND deletedAt IS NULL
      `);
      const synchronization = await syncUnifiedCustomerRegistry([previousIdentity]);
      return { success: true, synchronization };
    }),
});
