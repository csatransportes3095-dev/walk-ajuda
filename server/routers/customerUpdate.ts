import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isValidCPF } from "@shared/cpf";
import { isRecoveredCustomerName } from "../../shared/customerProfile";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
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
import { getMissingCustomerProfileFields } from "../customerProfileRequirements";

const SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const PASSWORD_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALREADY_UPDATED_MESSAGE = "Seu cadastro já foi atualizado. Aguarde a liberação do site.";

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

function missingFields(customer: any) {
  return getMissingCustomerProfileFields(customer);
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

async function ensureCustomerUpdateCompletionInfrastructure(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customerProfileUpdateCompletions (
      customerId INT NOT NULL PRIMARY KEY,
      phone VARCHAR(32) NOT NULL,
      completedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY customerProfileUpdateCompletions_phone_unique (phone),
      KEY customerProfileUpdateCompletions_completedAt_idx (completedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function customerUpdateAlreadyCompleted(_db: any, customer: any) {
  return missingFields(customer).length === 0;
}

function alreadyUpdatedError() {
  return new TRPCError({ code: "CONFLICT", message: ALREADY_UPDATED_MESSAGE });
}

async function requireCustomerSession(token: string) {
  const db = await getDb() as any;
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  const cleanToken = token.trim();
  let sessions = await rows(db, sql`
    SELECT phone, expiresAt
    FROM customerPasswordSessions
    WHERE token=${cleanToken}
    LIMIT 1
  `);
  if (!sessions[0]) {
    sessions = await rows(db, sql`
      SELECT sc.phone, s.expiresAt
      FROM spreadsheetSessions s
      INNER JOIN spreadsheetClients sc ON sc.id=s.clientId
      WHERE s.token=${cleanToken}
      LIMIT 1
    `);
  }
  const session = sessions[0];
  if (!session || !session.expiresAt || new Date(session.expiresAt).getTime() < Date.now()) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão vencida. Entre novamente." });
  }
  const customer = await findMainCustomerByIdentity({ phone: session.phone }, db);
  if (!customer || customer.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Cadastro não encontrado." });
  if (Number(customer.blocked) === 1) throw new TRPCError({ code: "FORBIDDEN", message: "Cadastro bloqueado. Fale com o atendimento." });
  try {
    await db.execute(sql`UPDATE customerPasswordSessions SET lastAccessAt=NOW() WHERE token=${cleanToken}`);
    await db.execute(sql`UPDATE spreadsheetSessions SET lastAccessAt=NOW() WHERE token=${cleanToken}`);
  } catch {}
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
      if (await customerUpdateAlreadyCompleted(db, customer)) return { status: "completed" as const };
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
      if (await customerUpdateAlreadyCompleted(db, customer)) return { success: false as const, error: "completed" as const };
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
      if (await customerUpdateAlreadyCompleted(db, customer)) return { success: false as const, error: "completed" as const };
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
      const { db, customer } = await requireCustomerSession(input.token);
      const name = String(customer.name || "").trim();
      const requiredFields = missingFields(customer);
      return {
        completed: await customerUpdateAlreadyCompleted(db, customer),
        policyEnabled: false,
        requiredFields,
        pendingFields: requiredFields,
        policyRevision: 0,
        customerNumber: customer.customerNumber || null,
        phone: normalizeCustomerPhone(customer.phone),
        name: isRecoveredCustomerName(name) ? "" : name,
        email: normalizeCustomerEmail(customer.email),
        cpf: normalizeCustomerCpf(customer.cpf),
        cep: String(customer.cep || "").trim(),
        street: String(customer.street || "").trim(),
        addressNumber: String(customer.addressNumber || "").trim(),
        neighborhood: String(customer.neighborhood || "").trim(),
        addressComplement: String(customer.addressComplement || "").trim(),
        city: String(customer.city || "").trim(),
        uf: String(customer.uf || "").trim().toUpperCase(),
        profilePhotoUrl: String(customer.profilePhotoUrl || "").trim(),
        missing: requiredFields,
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
      const phone = normalizeCustomerPhone(customer.phone);
      const fileKey = `profile-photos/${phone}-${Date.now()}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, mime);
      await db.execute(sql`UPDATE customers SET profilePhotoUrl=${url}, updatedAt=NOW() WHERE id=${customer.id}`);
      return { success: true, url };
    }),

  adminCreatePartial: adminProcedure
    .input(z.object({
      phone: z.string().min(10).max(32),
      name: z.string().max(128).optional(),
      email: z.string().max(320).optional(),
      cpf: z.string().max(18).optional(),
      city: z.string().max(128).optional(),
      uf: z.string().max(2).optional(),
      profilePhotoUrl: z.string().max(2048).optional(),
      referredByPhone: z.string().max(32).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      await ensureCustomerIdentityInfrastructure(db);

      const phone = normalizeCustomerPhone(input.phone);
      if (!phone || !/^\d{10,11}$/.test(phone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido." });
      }
      const duplicate = await findMainCustomerByIdentity({ phone }, db);
      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "Este telefone já identifica outro cadastro." });
      }

      const email = input.email?.trim() ? normalizeCustomerEmail(input.email) : "";
      if (input.email?.trim() && !email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "E-mail inválido." });
      }
      const cpf = input.cpf?.trim() ? normalizeCustomerCpf(input.cpf) : "";
      if (input.cpf?.trim() && (!cpf || !isValidCPF(cpf))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });
      }
      const uf = String(input.uf || "").trim().toUpperCase();
      if (uf && !/^[A-Z]{2}$/.test(uf)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "UF inválida." });
      }

      if (cpf) {
        const conflict = await findMainCustomerByIdentity({ cpf }, db);
        if (conflict) throw new TRPCError({ code: "CONFLICT", message: "CPF já pertence a outro cadastro." });
      }
      if (email) {
        const conflict = await findMainCustomerByIdentity({ email }, db);
        if (conflict) throw new TRPCError({ code: "CONFLICT", message: "E-mail já pertence a outro cadastro." });
      }

      let referredBy = "";
      const referredByPhone = input.referredByPhone?.trim() ? normalizeCustomerPhone(input.referredByPhone) : "";
      if (input.referredByPhone?.trim()) {
        if (!referredByPhone || !/^\d{10,11}$/.test(referredByPhone)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone do indicador inválido." });
        }
        const referrer = await findMainCustomerByIdentity({ phone: referredByPhone }, db);
        if (!referrer) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone do indicador não encontrado no sistema." });
        }
        referredBy = String(referrer.name || "").trim();
      }

      const nextRows = await rows(db, sql`SELECT COALESCE(MAX(CASE WHEN customerNumber <> 99999 THEN customerNumber END), 451) + 1 AS nextNum FROM customers`);
      const customerNumber = Number(nextRows[0]?.nextNum || 1);
      const name = String(input.name || "").trim().replace(/\s+/g, " ") || "CADASTRO RECUPERADO";
      const city = String(input.city || "").trim().replace(/\s+/g, " ");
      const profilePhotoUrl = String(input.profilePhotoUrl || "").trim();

      await db.execute(sql`
        INSERT INTO customers (
          customerNumber, name, phone, email, city, uf, cpf,
          referredBy, referredByPhone, profilePhotoUrl
        ) VALUES (
          ${customerNumber}, ${name.toUpperCase()}, ${phone}, ${email || null},
          ${city ? city.toUpperCase() : null}, ${uf || null}, ${cpf || null},
          ${referredBy ? referredBy.toUpperCase() : null}, ${referredByPhone || null}, ${profilePhotoUrl || null}
        )
      `);

      try {
        await syncUnifiedCustomerRegistry();
      } catch (error: any) {
        console.warn('[customerUpdate.adminCreatePartial] sincronização unificada não aplicada:', error?.message);
      }
      const customer = await findMainCustomerByIdentity({ phone }, db);
      return { success: true, customer, incomplete: customer ? missingFields(customer).length > 0 : true };
    }),

  // O telefone pode ser corrigido somente pelo ADM. A troca preserva o mesmo
  // cliente e os mesmos pedidos; apenas atualiza os vínculos que usam telefone.
  adminChangePhone: adminProcedure
    .input(z.object({
      currentPhone: z.string().min(10).max(32),
      newPhone: z.string().min(10).max(32),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb() as any;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
      await ensureCustomerIdentityInfrastructure(db);
      await ensureCustomerUpdateCompletionInfrastructure(db);

      const oldPhone = normalizeCustomerPhone(input.currentPhone);
      const newPhone = normalizeCustomerPhone(input.newPhone);
      if (!oldPhone || !newPhone) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um telefone válido com DDD." });
      }

      const customer = await findMainCustomerByIdentity({ phone: oldPhone }, db);
      if (!customer || customer.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado para o telefone atual." });
      }
      if (oldPhone === newPhone) {
        return { success: true, phone: newPhone, updatedOrders: 0, unchanged: true };
      }

      const duplicate = await findMainCustomerByIdentity({ phone: newPhone }, db);
      if (duplicate && Number(duplicate.id) !== Number(customer.id)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Este telefone já está cadastrado para ${String(duplicate.name || "outro cliente")}.`,
        });
      }

      const registrationRows = await rows(db, sql`
        SELECT id FROM accessCodePhones
        WHERE REGEXP_REPLACE(phone, '[^0-9]', '') = ${oldPhone}
      `);
      const registrationIds = registrationRows
        .map((row: any) => Number(row.id))
        .filter((id: number) => Number.isFinite(id) && id > 0);

      // A identidade principal é atualizada primeiro. Falha aqui interrompe tudo.
      await db.execute(sql`
        UPDATE customers
        SET phone=${newPhone}, updatedAt=NOW()
        WHERE id=${Number(customer.id)} AND deletedAt IS NULL
      `);

      const propagationQueries = [
        sql`UPDATE customerPasswordSessions SET phone=${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE customerPasswords SET phone=${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE customerLoginHistory SET phone=${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE customerPins SET phone=${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE spreadsheetClients SET phone=${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE loanClients SET phone=${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE accessCodes SET accessedByPhone=${newPhone} WHERE REGEXP_REPLACE(accessedByPhone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE accessCodePhones SET phone=${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE customerProductAccess SET phone=${newPhone} WHERE REGEXP_REPLACE(phone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE customerProfileUpdateCompletions SET phone=${newPhone} WHERE customerId=${Number(customer.id)}`,
        sql`UPDATE customers SET referredByPhone=${newPhone} WHERE deletedAt IS NULL AND REGEXP_REPLACE(referredByPhone, '[^0-9]', '')=${oldPhone}`,
        sql`UPDATE referralUsages SET clientPhone=${newPhone} WHERE REGEXP_REPLACE(clientPhone, '[^0-9]', '')=${oldPhone}`,
      ];
      for (const query of propagationQueries) {
        try {
          await db.execute(query);
        } catch (error: any) {
          console.warn('[customerUpdate.adminChangePhone] sincronização auxiliar não aplicada:', error?.message);
        }
      }

      if (registrationIds.length) {
        const registrationList = sql.join(registrationIds.map((registrationId: number) => sql`${registrationId}`), sql`, `);
        const orderQueries = [
          sql`UPDATE orderStatusHistory SET customerPhone=${newPhone} WHERE registrationId IN (${registrationList})`,
          sql`UPDATE orderFiles SET customerPhone=${newPhone} WHERE registrationId IN (${registrationList})`,
          sql`UPDATE orderLoginData SET customerPhone=${newPhone} WHERE registrationId IN (${registrationList})`,
          sql`UPDATE scheduleAppointments SET customerPhone=${newPhone} WHERE registrationId IN (${registrationList})`,
          sql`UPDATE docRequests SET customerPhone=${newPhone} WHERE registrationId IN (${registrationList})`,
          sql`UPDATE uploadSessions SET customerPhone=${newPhone} WHERE registrationId IN (${registrationList})`,
          sql`UPDATE hiddenSubOrders SET customerPhone=${newPhone} WHERE registrationId IN (${registrationList})`,
        ];
        for (const query of orderQueries) {
          try {
            await db.execute(query);
          } catch (error: any) {
            console.warn('[customerUpdate.adminChangePhone] sincronização do pedido não aplicada:', error?.message);
          }
        }
      }

      try {
        await syncUnifiedCustomerRegistry([{ phone: oldPhone, cpf: String(customer.cpf || "").replace(/\D/g, "") }]);
      } catch (error: any) {
        console.warn('[customerUpdate.adminChangePhone] sincronização unificada não aplicada:', error?.message);
      }

      return { success: true, phone: newPhone, updatedOrders: registrationIds.length, unchanged: false };
    }),

  save: publicProcedure
    .input(z.object({
      token: z.string().min(32).max(255),
      name: z.string().trim().max(128).optional(),
      email: z.string().trim().max(320).optional(),
      cpf: z.string().max(18).optional(),
      cep: z.string().trim().max(9).optional(),
      street: z.string().trim().max(255).optional(),
      addressNumber: z.string().trim().max(30).optional(),
      neighborhood: z.string().trim().max(150).optional(),
      addressComplement: z.string().trim().max(255).optional(),
      city: z.string().trim().max(128).optional(),
      uf: z.string().trim().max(2).optional(),
    }))
    .mutation(async ({ input }) => {
      const { db, customer } = await requireCustomerSession(input.token);
      if (await customerUpdateAlreadyCompleted(db, customer)) throw alreadyUpdatedError();
      const selected = new Set([...missingFields(customer), "cep", "street", "addressNumber", "neighborhood", "city", "uf"]);
      await ensureCustomerIdentityInfrastructure(db);
      const name = selected.has("name") ? String(input.name || "").trim().replace(/\s+/g, " ") : String(customer.name || "").trim();
      const phone = normalizeCustomerPhone(customer.phone);
      const email = selected.has("email") ? normalizeCustomerEmail(input.email || "") : normalizeCustomerEmail(customer.email);
      const cpf = selected.has("cpf") ? normalizeCustomerCpf(input.cpf || "") : normalizeCustomerCpf(customer.cpf);
      const cep = String(input.cep || customer.cep || "").replace(/\D/g, "").slice(0, 8);
      const street = String(input.street || customer.street || "").trim().replace(/\s+/g, " ");
      const addressNumber = String(input.addressNumber || customer.addressNumber || "").trim().replace(/\s+/g, " ");
      const neighborhood = String(input.neighborhood || customer.neighborhood || "").trim().replace(/\s+/g, " ");
      const addressComplement = String(input.addressComplement ?? customer.addressComplement ?? "").trim().replace(/\s+/g, " ");
      const city = selected.has("city") ? String(input.city || "").trim().replace(/\s+/g, " ") : String(customer.city || "").trim();
      const uf = selected.has("uf") ? String(input.uf || "").trim().toUpperCase() : String(customer.uf || "").trim().toUpperCase();
      if (selected.has("name") && (name.length < 2 || isRecoveredCustomerName(name))) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe seu nome completo, sem a indicação de cadastro recuperado." });
      if (selected.has("email") && !email) throw new TRPCError({ code: "BAD_REQUEST", message: "E-mail inválido." });
      if (selected.has("cpf") && (!cpf || !isValidCPF(cpf))) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });
      if (cep.length !== 8) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CEP válido." });
      if (street.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a rua / logradouro." });
      if (!addressNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o número do endereço." });
      if (neighborhood.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o bairro." });
      if (selected.has("city") && city.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe sua cidade." });
      if (selected.has("uf") && !/^[A-Z]{2}$/.test(uf)) throw new TRPCError({ code: "BAD_REQUEST", message: "UF inválida." });
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

      // Grava os dados atuais do perfil antes de concluir a atualização.
      // O telefone não participa do UPDATE: continua sendo a identidade fixa do cliente.
      await db.execute(sql`
        UPDATE customers SET
          name=${name},
          email=${email},
          cpf=${cpf},
          cep=${cep},
          street=${street},
          addressNumber=${addressNumber},
          neighborhood=${neighborhood},
          addressComplement=${addressComplement || null},
          city=${city},
          uf=${uf},
          normalizedCpf=${cpf},
          normalizedEmail=${email},
          updatedAt=NOW()
        WHERE id=${customer.id} AND deletedAt IS NULL
      `);

      const synchronization = await syncUnifiedCustomerRegistry([previousIdentity]);
      await ensureCustomerUpdateCompletionInfrastructure(db);
      await db.execute(sql`
        INSERT INTO customerProfileUpdateCompletions (customerId, phone, completedAt)
        VALUES (${customer.id}, ${phone}, NOW())
        ON DUPLICATE KEY UPDATE phone=${phone}, completedAt=completedAt
      `);
      return { success: true, synchronization };
    }),
});
