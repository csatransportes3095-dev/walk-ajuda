import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { isValidCPF, normalizeCpf } from "@shared/cpf";

export const CUSTOMER_ROUTES = ["site", "acompanhar", "gastos", "emprestimo"] as const;
export type CustomerRoute = (typeof CUSTOMER_ROUTES)[number];

type MainCustomer = {
  id: number;
  customerNumber?: number | null;
  name?: string | null;
  phone?: string | null;
  cpf?: string | null;
  email?: string | null;
  profilePhotoUrl?: string | null;
  deletedAt?: Date | string | null;
};

type IdentityInput = { phone?: string | null; cpf?: string | null; email?: string | null };

let infrastructureReady = false;
let infrastructurePromise: Promise<void> | null = null;

export function normalizeCustomerPhone(value: unknown): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return /^\d{10,11}$/.test(digits) ? digits : "";
}

export function normalizeCustomerCpf(value: unknown): string {
  const cpf = normalizeCpf(value);
  return /^\d{11}$/.test(cpf) ? cpf : "";
}

export function normalizeCustomerEmail(value: unknown): string {
  const email = String(value ?? "").trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? email : "";
}

export const isValidBrazilianCpf = isValidCPF;

function samePhone(a: unknown, b: unknown): boolean {
  const left = normalizeCustomerPhone(a);
  const right = normalizeCustomerPhone(b);
  if (!left || !right) return false;
  return left === right || (left.length === 11 && right.length === 10 && left.slice(1) === right) || (right.length === 11 && left.length === 10 && right.slice(1) === left);
}

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return (result[0] || result || []) as any[];
}

/**
 * Retorna o perfil principal ativo usando CPF, telefone ou e-mail normalizados.
 * A comparação é feita em JavaScript de propósito: evita funções SQL incompatíveis
 * e reconhece dados legados salvos com pontuação, espaços ou DDI.
 */
export async function findMainCustomerByIdentity(identity: IdentityInput, dbArg?: any): Promise<MainCustomer | null> {
  const db = dbArg || await getDb() as any;
  if (!db) return null;
  const phone = normalizeCustomerPhone(identity.phone);
  const cpf = normalizeCustomerCpf(identity.cpf);
  const email = normalizeCustomerEmail(identity.email);
  if (!phone && !cpf && !email) return null;

  const candidates = await rows(db, sql`
    SELECT id, customerNumber, name, phone, cpf, email, profilePhotoUrl, deletedAt
    FROM customers
    WHERE deletedAt IS NULL
  `);
  return candidates.find((customer: MainCustomer) =>
    (phone && samePhone(customer.phone, phone)) ||
    (cpf && normalizeCustomerCpf(customer.cpf) === cpf) ||
    (email && normalizeCustomerEmail(customer.email) === email)
  ) || null;
}

export async function getRouteAccess(customerId: number, dbArg?: any): Promise<{ restricted: boolean; routes: CustomerRoute[] }> {
  const db = dbArg || await getDb() as any;
  if (!db) return { restricted: false, routes: [] };
  await ensureCustomerIdentityInfrastructure(db);
  const permissions = await rows(db, sql`
    SELECT route FROM customerRoutePermissions
    WHERE customerId=${customerId} AND status='approved'
  `);
  const routes = permissions
    .map((row: any) => String(row.route || ""))
    .filter((route: string): route is CustomerRoute => (CUSTOMER_ROUTES as readonly string[]).includes(route));
  // Sem registro = cliente antigo. Preserva o acesso total já existente.
  return { restricted: routes.length > 0, routes };
}

export async function hasRouteAccess(customerId: number, route: CustomerRoute, dbArg?: any): Promise<{ allowed: boolean; restricted: boolean; routes: CustomerRoute[] }> {
  const access = await getRouteAccess(customerId, dbArg);
  return { ...access, allowed: !access.restricted || access.routes.includes(route) };
}

export type RouteReleaseMode = 'automatico' | 'manual';

export async function getRouteReleaseMode(route: CustomerRoute, dbArg?: any): Promise<RouteReleaseMode> {
  const db = dbArg || await getDb() as any;
  if (!db) return 'automatico';
  await ensureCustomerIdentityInfrastructure(db);
  const config = await rows(db, sql`SELECT releaseMode FROM customerRouteReleaseModes WHERE route=${route} LIMIT 1`);
  return config[0]?.releaseMode === 'manual' ? 'manual' : 'automatico';
}

export async function setRouteReleaseMode(route: CustomerRoute, mode: RouteReleaseMode, updatedBy = 'Administrador', dbArg?: any): Promise<RouteReleaseMode> {
  const db = dbArg || await getDb() as any;
  if (!db) throw new Error('Banco de dados indisponível');
  await ensureCustomerIdentityInfrastructure(db);
  await db.execute(sql`
    INSERT INTO customerRouteReleaseModes (route, releaseMode, updatedBy, updatedAt)
    VALUES (${route}, ${mode}, ${updatedBy}, NOW())
    ON DUPLICATE KEY UPDATE releaseMode=VALUES(releaseMode), updatedBy=VALUES(updatedBy), updatedAt=NOW()
  `);
  return mode;
}

export async function listRouteReleaseModes(dbArg?: any): Promise<Record<CustomerRoute, RouteReleaseMode>> {
  const db = dbArg || await getDb() as any;
  const defaults: Record<CustomerRoute, RouteReleaseMode> = { site: 'automatico', acompanhar: 'automatico', gastos: 'automatico', emprestimo: 'automatico' };
  if (!db) return defaults;
  await ensureCustomerIdentityInfrastructure(db);
  const configs = await rows(db, sql`SELECT route, releaseMode FROM customerRouteReleaseModes`);
  for (const config of configs) {
    const route = String(config.route || '') as CustomerRoute;
    if ((CUSTOMER_ROUTES as readonly string[]).includes(route)) {
      defaults[route] = config.releaseMode === 'manual' ? 'manual' : 'automatico';
    }
  }
  return defaults;
}

export async function setCustomerRoutePermissions(
  customerId: number,
  routesInput: string[],
  grantedBy = "Administrador",
  dbArg?: any,
): Promise<CustomerRoute[]> {
  const db = dbArg || await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");
  await ensureCustomerIdentityInfrastructure(db);
  const routes = [...new Set(routesInput.filter((route): route is CustomerRoute => (CUSTOMER_ROUTES as readonly string[]).includes(route)))];
  await db.execute(sql`DELETE FROM customerRoutePermissions WHERE customerId=${customerId}`);
  for (const route of routes) {
    await db.execute(sql`
      INSERT INTO customerRoutePermissions (customerId, route, status, grantedBy, grantedAt, updatedAt)
      VALUES (${customerId}, ${route}, 'approved', ${grantedBy}, NOW(), NOW())
    `);
  }
  return routes;
}

export async function requestCustomerRouteAccess(customerId: number, route: CustomerRoute, dbArg?: any): Promise<{ created: boolean; pending: boolean }> {
  const db = dbArg || await getDb() as any;
  if (!db) throw new Error("Banco de dados indisponível");
  await ensureCustomerIdentityInfrastructure(db);
  const pending = await rows(db, sql`
    SELECT id FROM customerAccessRequests
    WHERE customerId=${customerId} AND route=${route} AND pendingKey=1
    LIMIT 1
  `);
  if (pending.length) return { created: false, pending: true };
  await db.execute(sql`
    INSERT INTO customerAccessRequests (customerId, route, status, pendingKey, createdAt)
    VALUES (${customerId}, ${route}, 'pending', 1, NOW())
  `);
  return { created: true, pending: true };
}

export async function ensureCustomerIdentityInfrastructure(dbArg?: any): Promise<void> {
  if (infrastructureReady) return;
  if (infrastructurePromise) return infrastructurePromise;
  infrastructurePromise = (async () => {
    const db = dbArg || await getDb() as any;
    if (!db) return;
    try {
      const customerColumns = await rows(db, sql`SHOW COLUMNS FROM customers`);
      const customerColumnNames = new Set(customerColumns.map((column: any) => String(column.Field || "").toLowerCase()));
      if (!customerColumnNames.has("normalizedphone")) {
        await db.execute(sql.raw("ALTER TABLE customers ADD COLUMN normalizedPhone VARCHAR(16) NULL"));
      }
      if (!customerColumnNames.has("normalizedcpf")) {
        await db.execute(sql.raw("ALTER TABLE customers ADD COLUMN normalizedCpf VARCHAR(11) NULL"));
      }
      if (!customerColumnNames.has("normalizedemail")) {
        await db.execute(sql.raw("ALTER TABLE customers ADD COLUMN normalizedEmail VARCHAR(320) NULL"));
      }

      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS customerRoutePermissions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customerId INT NOT NULL,
          route VARCHAR(32) NOT NULL,
          status VARCHAR(16) NOT NULL DEFAULT 'approved',
          grantedBy VARCHAR(100) NULL,
          grantedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY customer_route_permission_unique (customerId, route),
          KEY customer_route_permission_route_status (route, status)
        )
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS customerRouteReleaseModes (
          route VARCHAR(32) PRIMARY KEY,
          releaseMode VARCHAR(16) NOT NULL DEFAULT 'automatico',
          updatedBy VARCHAR(100) NULL,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `));
      for (const route of CUSTOMER_ROUTES) {
        await db.execute(sql`
          INSERT IGNORE INTO customerRouteReleaseModes (route, releaseMode, updatedBy)
          VALUES (${route}, 'automatico', 'Sistema')
        `);
      }
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS customerAccessRequests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customerId INT NOT NULL,
          route VARCHAR(32) NOT NULL,
          status VARCHAR(16) NOT NULL DEFAULT 'pending',
          pendingKey TINYINT NULL,
          requestedAt DATETIME NULL,
          analyzedAt DATETIME NULL,
          analyzedBy VARCHAR(100) NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY customer_access_request_pending_unique (customerId, route, pendingKey),
          KEY customer_access_request_status (status, createdAt)
        )
      `));

      const customers = await rows(db, sql`SELECT id, phone, cpf, email FROM customers WHERE deletedAt IS NULL`);
      for (const customer of customers) {
        const phone = normalizeCustomerPhone(customer.phone) || null;
        const cpf = normalizeCustomerCpf(customer.cpf) || null;
        const email = normalizeCustomerEmail(customer.email) || null;
        await db.execute(sql`
          UPDATE customers
          SET normalizedPhone=${phone}, normalizedCpf=${cpf}, normalizedEmail=${email}
          WHERE id=${customer.id}
        `);
      }

      const duplicatePhone = await rows(db, sql`
        SELECT normalizedPhone FROM customers
        WHERE normalizedPhone IS NOT NULL
        GROUP BY normalizedPhone HAVING COUNT(*) > 1 LIMIT 1
      `);
      const duplicateCpf = await rows(db, sql`
        SELECT normalizedCpf FROM customers
        WHERE normalizedCpf IS NOT NULL
        GROUP BY normalizedCpf HAVING COUNT(*) > 1 LIMIT 1
      `);
      const indexes = await rows(db, sql`SHOW INDEX FROM customers`);
      const indexNames = new Set(indexes.map((index: any) => String(index.Key_name || "").toLowerCase()));
      if (!duplicatePhone.length && !indexNames.has("customers_normalized_phone_unique")) {
        await db.execute(sql.raw("CREATE UNIQUE INDEX customers_normalized_phone_unique ON customers (normalizedPhone)"));
      }
      if (!duplicateCpf.length && !indexNames.has("customers_normalized_cpf_unique")) {
        await db.execute(sql.raw("CREATE UNIQUE INDEX customers_normalized_cpf_unique ON customers (normalizedCpf)"));
      }
      if (!indexNames.has("customers_normalized_email_index")) {
        await db.execute(sql.raw("CREATE INDEX customers_normalized_email_index ON customers (normalizedEmail)"));
      }
      infrastructureReady = true;
    } catch (error) {
      infrastructurePromise = null;
      throw error;
    }
  })();
  return infrastructurePromise;
}
