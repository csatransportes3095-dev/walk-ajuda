import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import * as jose from "jose";
import { sql } from "drizzle-orm";
import { getDb, isIpBlocked } from "./db";
import {
  findMainCustomerByIdentity,
  getCustomerRouteRestrictionReason,
  getRouteAccess,
  normalizeCustomerPhone,
} from "./customerAccess";
import { requireCompleteMainCustomerProfile } from "./customerIdentity";
import { getCustomerProfileUpdateState } from "./customerProfileUpdatePolicy";

const SPREADSHEET_SESSION_MS = 90 * 24 * 60 * 60 * 1000;
const CC_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const CC_COOKIE = "cc_session";
const CC_JWT_SECRET = new TextEncoder().encode(
  process.env.CC_JWT_SECRET || process.env.JWT_SECRET || "cc-cartoes-secret-2024",
);

type SpreadsheetRoute = "gastos" | "emprestimo";

type AuthenticatedCustomer = {
  db: any;
  customer: any;
  phone: string;
};

async function rows(db: any, query: any): Promise<any[]> {
  const result = await db.execute(query);
  return ((result as any)?.[0] || result || []) as any[];
}

function requestIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return String(value || "").split(",")[0]?.trim() || "unknown";
  }
  return req.socket?.remoteAddress || "unknown";
}

function bearerToken(req: Request): string {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function samePhone(left: unknown, right: unknown): boolean {
  const a = normalizeCustomerPhone(left);
  const b = normalizeCustomerPhone(right);
  if (!a || !b) return false;
  return a === b || (a.length === 11 && b.length === 10 && a.slice(1) === b) || (b.length === 11 && a.length === 10 && b.slice(1) === a);
}

function cookieOptions(req: Request) {
  const host = String(req.headers.host || "");
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  return {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: (isLocalhost ? "lax" : "none") as "lax" | "none",
    path: "/",
  };
}

async function signCardToken(payload: { userId: number; phone: string }) {
  return new jose.SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(CC_JWT_SECRET);
}

async function authenticateCustomer(req: Request, res: Response): Promise<AuthenticatedCustomer | null> {
  const ip = requestIp(req);
  if (ip && ip !== "unknown") {
    try {
      if (await isIpBlocked(ip)) {
        res.status(403).json({ code: "IP_BLOCKED", message: "Acesso bloqueado. Entre em contato pelo WhatsApp." });
        return null;
      }
    } catch {
      // Falha de leitura do bloqueio não cria bloqueio falso; a sessão ainda será validada abaixo.
    }
  }

  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Sessão central não informada." });
    return null;
  }

  const db = await getDb() as any;
  if (!db) {
    res.status(503).json({ code: "DB_UNAVAILABLE", message: "Banco de dados indisponível." });
    return null;
  }

  const sessionRows = await rows(db, sql`
    SELECT phone, expiresAt
    FROM customerPasswordSessions
    WHERE token=${token}
    LIMIT 1
  `);
  const session = sessionRows[0];
  if (!session || !session.expiresAt || new Date(session.expiresAt) < new Date()) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Sessão central inválida ou expirada." });
    return null;
  }

  const phone = normalizeCustomerPhone(session.phone);
  const customer = phone ? await findMainCustomerByIdentity({ phone }, db) : null;
  if (!customer) {
    res.status(401).json({ code: "CUSTOMER_NOT_FOUND", message: "Cadastro principal não encontrado." });
    return null;
  }
  if (customer.blocked === true || Number(customer.blocked || 0) === 1) {
    res.status(403).json({ code: "CUSTOMER_BLOCKED", message: "Cadastro bloqueado pelo administrador." });
    return null;
  }

  const updateState = await getCustomerProfileUpdateState(customer);
  if (updateState.pending) {
    res.status(409).json({
      code: "PROFILE_INCOMPLETE",
      message: "Conclua todos os dados obrigatórios do cadastro para continuar.",
      phone: normalizeCustomerPhone(customer.phone) || phone,
      requiredFields: updateState.effectiveFields,
    });
    return null;
  }

  try {
    await requireCompleteMainCustomerProfile(db, { phone: customer.phone || phone, cpf: customer.cpf || "" });
  } catch (error: any) {
    res.status(409).json({
      code: "PROFILE_INCOMPLETE",
      message: error?.message || "Conclua todos os dados obrigatórios do cadastro para continuar.",
      phone: normalizeCustomerPhone(customer.phone) || phone,
      requiredFields: updateState.effectiveFields,
    });
    return null;
  }

  return { db, customer, phone: normalizeCustomerPhone(customer.phone) || phone };
}

async function ensureReferralDeclaration(db: any, clientId: number, route: SpreadsheetRoute, customer: any): Promise<void> {
  const existing = await rows(db, sql`
    SELECT id FROM spreadsheetReferralDeclarations
    WHERE clientId=${clientId} AND route=${route}
    LIMIT 1
  `);
  if (existing.length) return;

  const referrerName = String(customer?.referredBy || "").trim();
  const referrerPhone = normalizeCustomerPhone(customer?.referredByPhone);
  let referrerCustomerId: number | null = null;
  if (referrerPhone) {
    const referrer = await findMainCustomerByIdentity({ phone: referrerPhone }, db);
    referrerCustomerId = referrer?.id ? Number(referrer.id) : null;
  }
  const answer = referrerName || referrerPhone ? "yes" : "no";

  try {
    await db.execute(sql`
      INSERT INTO spreadsheetReferralDeclarations
        (clientId, route, answer, referrerName, referrerPhone, referrerCustomerId)
      VALUES
        (${clientId}, ${route}, ${answer}, ${referrerName || null}, ${referrerPhone || null}, ${referrerCustomerId})
    `);
  } catch (error: any) {
    if (!String(error?.code || "").includes("ER_DUP_ENTRY")) throw error;
  }
}

async function spreadsheetSession(req: Request, res: Response, route: SpreadsheetRoute) {
  const auth = await authenticateCustomer(req, res);
  if (!auth) return;
  const { db, customer, phone } = auth;

  const access = await getRouteAccess(Number(customer.id), db);
  if (access.restricted && !access.routes.includes(route)) {
    const restriction = await getCustomerRouteRestrictionReason(Number(customer.id), route, db);
    const savedRestrictionReason = String(restriction?.reason || "").trim();

    res.status(403).json({
      code: "ROUTE_NOT_ALLOWED",
      message: savedRestrictionReason || "Esta área ainda não foi liberada pelo administrador.",
      allowedRoutes: access.routes,
      restrictionReason: savedRestrictionReason || null,
    });
    return;
  }

  const technicalRows = await rows(db, sql`SELECT id, phone, name, cpf, status FROM spreadsheetClients`);
  let client = technicalRows.find((item: any) => samePhone(item.phone, phone));
  if (client && String(client.status || "active") === "blocked") {
    res.status(403).json({ code: "CUSTOMER_BLOCKED", message: "Acesso bloqueado." });
    return;
  }

  if (!client) {
    await db.execute(sql`
      INSERT INTO spreadsheetClients (phone, name, cpf, status, allowedRoutes, createdAt, updatedAt)
      VALUES (${phone}, ${String(customer.name || "CLIENTE")}, ${String(customer.cpf || "").replace(/\D/g, "") || null}, 'active', ${route}, NOW(), NOW())
    `);
    const afterInsert = await rows(db, sql`SELECT id, phone, name, cpf, status FROM spreadsheetClients`);
    client = afterInsert.find((item: any) => samePhone(item.phone, phone));
  }

  if (!client?.id) {
    res.status(500).json({ code: "SESSION_ERROR", message: "Não foi possível preparar o acesso da área." });
    return;
  }

  await ensureReferralDeclaration(db, Number(client.id), route, customer);

  const activeSessions = await rows(db, sql`
    SELECT token, expiresAt
    FROM spreadsheetSessions
    WHERE clientId=${Number(client.id)} AND expiresAt > NOW()
    LIMIT 1
  `);
  let token = String(activeSessions[0]?.token || "");
  if (!token) {
    token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SPREADSHEET_SESSION_MS);
    await db.execute(sql`
      INSERT INTO spreadsheetSessions (clientId, token, expiresAt)
      VALUES (${Number(client.id)}, ${token}, ${expiresAt})
    `);
  }

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    success: true,
    token,
    clientId: Number(client.id),
    clientName: String(customer.name || client.name || "CLIENTE"),
  });
}

async function cardSession(req: Request, res: Response) {
  const auth = await authenticateCustomer(req, res);
  if (!auth) return;
  const { db, customer, phone } = auth;

  const users = await rows(db, sql`SELECT id, phone, name FROM cc_app_users`);
  let user = users.find((item: any) => samePhone(item.phone, phone));
  if (!user) {
    const randomPassword = randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    await db.execute(sql`
      INSERT INTO cc_app_users (phone, passwordHash, name)
      VALUES (${phone}, ${passwordHash}, ${String(customer.name || "CLIENTE")})
    `);
    const afterInsert = await rows(db, sql`SELECT id, phone, name FROM cc_app_users`);
    user = afterInsert.find((item: any) => samePhone(item.phone, phone));
  }

  if (!user?.id) {
    res.status(500).json({ code: "SESSION_ERROR", message: "Não foi possível preparar o acesso aos cartões." });
    return;
  }

  const token = await signCardToken({ userId: Number(user.id), phone: String(user.phone || phone) });
  res.cookie(CC_COOKIE, token, { ...cookieOptions(req), maxAge: CC_SESSION_MS });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    success: true,
    user: { id: Number(user.id), phone: String(user.phone || phone), name: String(user.name || customer.name || "CLIENTE") },
  });
}

/**
 * Ponte técnica da sessão central (cp_token) para módulos legados.
 * O cliente se autentica/cadastra uma única vez; Gastos, Empréstimos e Cartões
 * recebem apenas a sessão interna necessária, sem pedir outra senha ou cadastro.
 */
export function registerUnifiedCustomerSessionRoutes(app: Express): void {
  app.post("/api/customer-session/gastos", (req, res) => {
    void spreadsheetSession(req, res, "gastos").catch((error) => {
      console.error("[UnifiedCustomerSession] gastos:", error);
      if (!res.headersSent) res.status(500).json({ code: "SESSION_ERROR", message: "Não foi possível preparar o acesso." });
    });
  });

  app.post("/api/customer-session/emprestimo", (req, res) => {
    void spreadsheetSession(req, res, "emprestimo").catch((error) => {
      console.error("[UnifiedCustomerSession] emprestimo:", error);
      if (!res.headersSent) res.status(500).json({ code: "SESSION_ERROR", message: "Não foi possível preparar o acesso." });
    });
  });

  app.post("/api/customer-session/cartoes", (req, res) => {
    void cardSession(req, res).catch((error) => {
      console.error("[UnifiedCustomerSession] cartoes:", error);
      if (!res.headersSent) res.status(500).json({ code: "SESSION_ERROR", message: "Não foi possível preparar o acesso." });
    });
  });
}
