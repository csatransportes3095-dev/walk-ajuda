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

export async function getOnlineCustomerOrders(token: string) {
  const session = await requireOnlineEntrySession(token);
  const db = await getDb() as any;
  const rows = resultRows(await db.execute(sql`
    SELECT acp.id AS registrationId,
           COALESCE(NULLIF(lastStatus.orderNumber, 0), firstStatus.orderNumber) AS orderNumber,
           COALESCE(NULLIF(lastStatus.serviceName, 'NULL'), NULLIF(firstStatus.serviceName, 'NULL')) AS serviceName,
           COALESCE(NULLIF(lastStatus.serviceOption, 'NULL'), NULLIF(firstStatus.serviceOption, 'NULL')) AS serviceOption,
           lastStatus.status AS status, lastStatus.note AS note,
           lastStatus.deliveryEstimate AS deliveryEstimate, lastStatus.createdAt AS updatedAt,
           acp.accessedAt AS createdAt
    FROM accessCodePhones acp
    LEFT JOIN (SELECT registrationId, MAX(id) AS id FROM orderStatusHistory GROUP BY registrationId) latest ON latest.registrationId=acp.id
    LEFT JOIN orderStatusHistory lastStatus ON lastStatus.id=latest.id
    LEFT JOIN (SELECT registrationId, MIN(id) AS id FROM orderStatusHistory GROUP BY registrationId) firstRow ON firstRow.registrationId=acp.id
    LEFT JOIN orderStatusHistory firstStatus ON firstStatus.id=firstRow.id
    WHERE acp.phone=${session.phone} AND COALESCE(acp.archived, 0)=0
    ORDER BY acp.accessedAt DESC
  `));
  return rows.map((row: any) => ({
    registrationId: Number(row.registrationId), orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
    serviceName: row.serviceName || null, serviceOption: row.serviceOption || null, status: row.status || null,
    note: row.note || null, deliveryEstimate: row.deliveryEstimate == null ? null : Number(row.deliveryEstimate),
    createdAt: row.createdAt || null, updatedAt: row.updatedAt || null,
  }));
}

export async function getOnlineOrderDetails(token: string, registrationId: number) {
  const session = await requireOnlineEntrySession(token);
  const db = await getDb() as any;
  const ownership = resultRows(await db.execute(sql`SELECT id FROM accessCodePhones WHERE id=${registrationId} AND phone=${session.phone} LIMIT 1`));
  if (!ownership[0]) throw new Error('Pedido não pertence ao cliente autenticado.');
  const history = resultRows(await db.execute(sql`
    SELECT orderNumber, status, note, serviceName, serviceOption, pricePaid, answers, deliveryEstimate, createdAt
    FROM orderStatusHistory WHERE registrationId=${registrationId} AND customerPhone=${session.phone}
    ORDER BY createdAt ASC, id ASC
  `));
  if (!history.length) throw new Error('Pedido não encontrado.');
  return { registrationId, current: history[history.length - 1], history };
}

export async function requireOnlineRoute(token: string, route: CustomerRoute) {
  const session = await requireOnlineEntrySession(token);
  const access = await hasRouteAccess(session.customerId, route);
  if (!access.allowed) {
    throw new Error(`Acesso não autorizado para ${route}. Solicite a liberação ao administrador.`);
  }
  return { session, access };
}
