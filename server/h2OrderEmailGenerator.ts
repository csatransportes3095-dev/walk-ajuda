import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb, getSystemConfig } from "./db";

const H2_EMAIL_CONFIG_KEY = "h2_email_generator_config_v1";

type H2EmailConfig = {
  prefix: string;
  domains: string[];
  activeDomain: string;
};

export type OrderMainCustomerIdentity = {
  customerId: number;
  customerNumber: number;
  customerName: string;
  customerPhone: string;
  orderNumber: number | null;
};

const DEFAULT_CONFIG: H2EmailConfig = {
  prefix: "h2walk",
  domains: ["h2colombiano.com"],
  activeDomain: "h2colombiano.com",
};

function normalizeDomain(value: string) {
  let normalized = String(value || "").trim().toLowerCase();
  normalized = normalized.replace(/^https?:\/\//, "");
  if (normalized.includes("@")) normalized = normalized.split("@").pop() || "";
  return normalized.split("/")[0].replace(/^\.+|\.+$/g, "");
}

function validDomain(value: string) {
  return /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value);
}

function normalizePrefix(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48);
}

function parseConfig(raw: string | null): H2EmailConfig {
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<H2EmailConfig>;
    const domains = Array.isArray(parsed.domains)
      ? Array.from(new Set(parsed.domains.map(item => normalizeDomain(String(item))).filter(validDomain)))
      : [];
    const safeDomains = domains.length ? domains : DEFAULT_CONFIG.domains;
    const activeCandidate = normalizeDomain(String(parsed.activeDomain || ""));
    const activeDomain = safeDomains.includes(activeCandidate) ? activeCandidate : safeDomains[0];
    const prefix = normalizePrefix(String(parsed.prefix || DEFAULT_CONFIG.prefix)) || DEFAULT_CONFIG.prefix;
    return { prefix, domains: safeDomains, activeDomain };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function randomAlias() {
  const consonants = "bcdfghjklmnpqrstvwxyz";
  const vowels = "aeiou";
  const length = randomInt(3, 6);
  let result = "";
  let useConsonant = randomInt(0, 2) === 1;
  for (let index = 0; index < length; index += 1) {
    const source = useConsonant ? consonants : vowels;
    result += source[randomInt(0, source.length)];
    useConsonant = !useConsonant;
  }
  return result;
}

export function buildOrderH2EmailAddress(prefix: string, alias: string, customerNumber: number, domain: string) {
  if (!Number.isSafeInteger(customerNumber) || customerNumber <= 0) {
    throw new Error("customerNumber invalido");
  }
  const safePrefix = normalizePrefix(prefix) || DEFAULT_CONFIG.prefix;
  const safeAlias = normalizePrefix(alias);
  const safeDomain = normalizeDomain(domain);
  if (!safeAlias || !validDomain(safeDomain)) throw new Error("Dados invalidos para gerar email H2");
  return `${safePrefix}.${safeAlias}.${customerNumber}@${safeDomain}`.toLowerCase();
}

function resultRows(result: unknown): any[] {
  return Array.isArray((result as any)?.[0]) ? (result as any)[0] : [];
}

function normalizePhoneTail(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 11 ? digits.slice(-11) : digits;
}

export async function resolveOrderMainCustomerIdentity(registrationId: number): Promise<OrderMainCustomerIdentity> {
  if (!Number.isSafeInteger(registrationId) || registrationId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Pedido invalido." });
  }

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponivel." });

  const orderResult = await (db as any).execute(sql`
    SELECT
      osh.customerPhone AS historyPhone,
      acp.phone AS accessPhone,
      (
        SELECT osh2.orderNumber
        FROM orderStatusHistory osh2
        WHERE osh2.registrationId = ${registrationId}
          AND osh2.orderNumber IS NOT NULL
        ORDER BY osh2.createdAt ASC, osh2.id ASC
        LIMIT 1
      ) AS orderNumber
    FROM orderStatusHistory osh
    LEFT JOIN accessCodePhones acp ON acp.id = osh.registrationId
    WHERE osh.registrationId = ${registrationId}
    ORDER BY osh.createdAt DESC, osh.id DESC
    LIMIT 1
  `);

  const orderRow = resultRows(orderResult)[0];
  if (!orderRow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pedido nao encontrado no historico." });
  }

  const phones = Array.from(new Set([
    normalizePhoneTail(orderRow.historyPhone),
    normalizePhoneTail(orderRow.accessPhone),
  ].filter(phone => phone.length >= 10)));

  if (!phones.length) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pedido sem telefone valido para localizar o cadastro principal." });
  }

  const phoneA = phones[0] || "__sem_telefone__";
  const phoneB = phones[1] || "__sem_telefone__";
  const customerResult = await (db as any).execute(sql`
    SELECT id, customerNumber, name, phone
    FROM customers
    WHERE deletedAt IS NULL
      AND customerNumber IS NOT NULL
      AND customerNumber > 0
      AND (
        RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 11) = ${phoneA}
        OR RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 11) = ${phoneB}
      )
    ORDER BY id DESC
    LIMIT 3
  `);

  const customers = resultRows(customerResult);
  if (customers.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Cadastro principal do cliente nao encontrado. O e-mail H2 nao foi gerado.",
    });
  }
  if (customers.length !== 1) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Mais de um cadastro principal corresponde a este pedido. A geracao foi bloqueada para evitar codigo incorreto.",
    });
  }

  const customer = customers[0];
  const customerNumber = Number(customer.customerNumber);
  if (!Number.isSafeInteger(customerNumber) || customerNumber <= 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "O cadastro principal nao possui codigo de cliente valido.",
    });
  }

  return {
    customerId: Number(customer.id),
    customerNumber,
    customerName: String(customer.name || "Cliente").trim() || "Cliente",
    customerPhone: String(customer.phone || "").trim(),
    orderNumber: orderRow.orderNumber == null ? null : Number(orderRow.orderNumber),
  };
}

async function emailAlreadyUsed(db: any, email: string) {
  const result = await db.execute(sql`
    SELECT 1 AS used
    FROM emailGeneratorHistory
    WHERE LOWER(TRIM(emailAddress)) = ${email}
    LIMIT 1
  `);
  if (resultRows(result).length > 0) return true;

  const orderResult = await db.execute(sql`
    SELECT 1 AS used
    FROM orderLoginData
    WHERE loginEmail IS NOT NULL
      AND LOWER(TRIM(loginEmail)) = ${email}
    LIMIT 1
  `);
  return resultRows(orderResult).length > 0;
}

export async function generateOrderH2Email(registrationId: number) {
  const identity = await resolveOrderMainCustomerIdentity(registrationId);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponivel." });

  const config = parseConfig(await getSystemConfig(H2_EMAIL_CONFIG_KEY));

  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const email = buildOrderH2EmailAddress(
      config.prefix,
      randomAlias(),
      identity.customerNumber,
      config.activeDomain,
    );

    if (await emailAlreadyUsed(db as any, email)) continue;

    const insertResult = await (db as any).execute(sql`
      INSERT IGNORE INTO emailGeneratorHistory (emailAddress, domain, createdAt, updatedAt)
      VALUES (${email}, ${config.activeDomain}, NOW(), NOW())
    `);
    const packet = (insertResult as any)?.[0];
    if (Number(packet?.affectedRows || 0) !== 1) continue;

    return {
      email,
      customerNumber: identity.customerNumber,
      customerName: identity.customerName,
      orderNumber: identity.orderNumber,
      registrationId,
    };
  }

  throw new TRPCError({
    code: "CONFLICT",
    message: "Nao foi possivel gerar um e-mail H2 unico para este cliente. Tente novamente.",
  });
}
