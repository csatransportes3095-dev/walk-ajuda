import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { customerPasswordSessions, customers } from "../drizzle/schema";
import { getDb } from "./db";

export type CustomerSessionIdentity = {
  phone: string;
};

export function normalizeSessionPhone(phone?: string | null): string {
  return String(phone || "").replace(/\D/g, "");
}

export function getCustomerSessionTokenFromRequest(req: Request): string {
  const raw = req.headers["x-customer-session"];
  return Array.isArray(raw) ? String(raw[0] || "").trim() : String(raw || "").trim();
}

/**
 * A sessão de cliente é a fonte de verdade para ações após o login.
 * O telefone recebido do navegador só pode confirmar a mesma identidade,
 * nunca trocar o cliente autorizado pelo token.
 */
export async function requireCustomerSession(
  token: string | null | undefined,
  requestedPhone?: string | null,
): Promise<CustomerSessionIdentity> {
  const sessionToken = String(token || "").trim();
  if (sessionToken.length < 32) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão expirada. Faça login novamente." });
  }

  const db = await getDb() as any;
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
  }

  const sessionRows = await db
    .select({ phone: customerPasswordSessions.phone, expiresAt: customerPasswordSessions.expiresAt })
    .from(customerPasswordSessions)
    .where(eq(customerPasswordSessions.token, sessionToken))
    .limit(1);
  const session = sessionRows?.[0];
  if (!session || new Date(session.expiresAt) < new Date()) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão expirada. Faça login novamente." });
  }

  const sessionPhone = normalizeSessionPhone(session.phone);
  const expectedPhone = normalizeSessionPhone(requestedPhone);
  if (!sessionPhone || (expectedPhone && expectedPhone !== sessionPhone)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A sessão não autoriza este cliente." });
  }

  const customerRows = await db
    .select({ phone: customers.phone, blocked: customers.blocked })
    .from(customers)
    .where(eq(customers.phone, sessionPhone))
    .limit(1);
  const customer = customerRows?.[0];
  if (!customer) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Cliente não encontrado para esta sessão." });
  }
  if (Number((customer as { blocked?: number | null }).blocked || 0) === 1) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso bloqueado. Entre em contato pelo WhatsApp." });
  }

  return { phone: sessionPhone };
}
