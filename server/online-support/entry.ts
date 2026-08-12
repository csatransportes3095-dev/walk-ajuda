import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { hasRouteAccess, type CustomerRoute } from "../customerAccess";

export type OnlineEntrySession = {
  customerId: number;
  customerNumber: number | null;
  name: string;
  phone: string;
  email: string | null;
  profilePhotoUrl: string | null;
};

function resultRows(result: any): any[] {
  return (result?.[0] || result || []) as any[];
}

/**
 * Valida o token emitido pelo login oficial do cliente. O Atendimento Online
 * não recebe, armazena nem devolve a senha; apenas usa a sessão já validada.
 */
export async function requireOnlineEntrySession(token: string): Promise<OnlineEntrySession> {
  const db = await getDb() as any;
  if (!db) throw new Error("Banco indisponível");
  const safeToken = String(token || "").trim();
  if (!safeToken) throw new Error("Sessão inválida");

  const rows = resultRows(await db.execute(sql`
    SELECT c.id, c.customerNumber, c.name, c.phone, c.email, c.profilePhotoUrl, c.blocked,
           s.expiresAt
    FROM customerPasswordSessions s
    INNER JOIN customers c ON c.phone = s.phone
    WHERE s.token=${safeToken} AND c.deletedAt IS NULL
    LIMIT 1
  `));
  const session = rows[0];
  if (!session || !session.expiresAt || new Date(session.expiresAt) < new Date()) {
    throw new Error("Sessão expirada. Informe telefone e senha novamente.");
  }
  if (Number(session.blocked) === 1) throw new Error("Acesso bloqueado. Entre em contato com o administrador.");

  return {
    customerId: Number(session.id),
    customerNumber: session.customerNumber == null ? null : Number(session.customerNumber),
    name: String(session.name || "Cliente"),
    phone: String(session.phone || ""),
    email: session.email ? String(session.email) : null,
    profilePhotoUrl: session.profilePhotoUrl ? String(session.profilePhotoUrl) : null,
  };
}

export async function requireOnlineRoute(token: string, route: CustomerRoute) {
  const session = await requireOnlineEntrySession(token);
  const access = await hasRouteAccess(session.customerId, route);
  if (!access.allowed) {
    throw new Error(`Acesso não autorizado para ${route}. Solicite a liberação ao administrador.`);
  }
  return { session, access };
}
