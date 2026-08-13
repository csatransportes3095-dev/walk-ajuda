import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { hasRouteAccess, type CustomerRoute } from "../customerAccess";

export type OnlineEntrySession = {
  customerId: number;
  customerNumber: number | null;
  name: string;
  phone: string;
  cpf: string | null;
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
    SELECT c.id, c.customerNumber, c.name, c.phone, c.cpf, c.email, c.profilePhotoUrl, c.blocked,
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
    cpf: session.cpf ? String(session.cpf).replace(/\D/g, '') : null,
    email: session.email ? String(session.email) : null,
    profilePhotoUrl: session.profilePhotoUrl ? String(session.profilePhotoUrl) : null,
  };
}

export async function getOnlineCustomerOrders(token: string) {
  const session = await requireOnlineEntrySession(token);
  const db = await getDb() as any;
  // A tabela técnica accessCodePhones pode conter vínculos antigos. A lista é
  // sempre calculada pelo customerPhone do próprio histórico do pedido.
  const phone = session.phone.replace(/\D/g, '');
  const rows = resultRows(await db.execute(sql`
    SELECT currentStatus.registrationId, currentStatus.orderNumber, currentStatus.serviceName,
           currentStatus.serviceOption, currentStatus.status, currentStatus.note,
           currentStatus.deliveryEstimate, currentStatus.createdAt AS updatedAt
    FROM orderStatusHistory currentStatus
    INNER JOIN (
      SELECT registrationId, MAX(id) AS id
      FROM orderStatusHistory
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(customerPhone,'(',''),')',''),'-',''),' ','')=${phone}
      GROUP BY registrationId
    ) latest ON latest.id=currentStatus.id
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(currentStatus.customerPhone,'(',''),')',''),'-',''),' ','')=${phone}
    ORDER BY currentStatus.createdAt DESC, currentStatus.id DESC
  `));
  return rows.map((row: any) => ({
    registrationId: Number(row.registrationId), orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
    serviceName: row.serviceName || null, serviceOption: row.serviceOption || null, status: row.status || null,
    note: row.note || null, deliveryEstimate: row.deliveryEstimate == null ? null : Number(row.deliveryEstimate),
    createdAt: row.updatedAt || null, updatedAt: row.updatedAt || null,
  }));
}

export async function getOnlineOrderDetails(token: string, registrationId: number) {
  const { session } = await requireOnlineRoute(token, 'acompanhar');
  const db = await getDb() as any;
  const phone = session.phone.replace(/\D/g, '');
  const ownership = resultRows(await db.execute(sql`
    SELECT id FROM orderStatusHistory
    WHERE registrationId=${registrationId}
      AND REPLACE(REPLACE(REPLACE(REPLACE(customerPhone,'(',''),')',''),'-',''),' ','')=${phone}
    LIMIT 1
  `));
  if (!ownership[0]) throw new Error('Pedido não pertence ao cliente autenticado.');
  const history = resultRows(await db.execute(sql`
    SELECT orderNumber, status, note, serviceName, serviceOption, pricePaid, answers, deliveryEstimate, createdAt
    FROM orderStatusHistory
    WHERE registrationId=${registrationId}
      AND REPLACE(REPLACE(REPLACE(REPLACE(customerPhone,'(',''),')',''),'-',''),' ','')=${phone}
    ORDER BY createdAt ASC, id ASC
  `));
  if (!history.length) throw new Error('Pedido não encontrado.');
  return { registrationId, current: history[history.length - 1], history };
}

export async function getOnlineCustomerLoans(token: string) {
  const { session } = await requireOnlineRoute(token, 'emprestimo');
  const db = await getDb() as any;
  const clients = resultRows(await db.execute(sql`
    SELECT id, name, cpf, phone, status, loanEnabled FROM loanClients
    WHERE phone=${session.phone} OR (${session.cpf || null} IS NOT NULL AND REPLACE(REPLACE(REPLACE(cpf,'.',''),'-',''),' ','')=${session.cpf || null})
  `));
  const clientIds = clients.map((client: any) => Number(client.id)).filter(Boolean);
  if (!clientIds.length) return { client: null, loans: [], nextInstallment: null };
  const ids = sql.raw(clientIds.join(','));
  const loans = resultRows(await db.execute(sql`
    SELECT l.*,
      (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id AND status='pago') AS paidInstallments,
      (SELECT COUNT(*) FROM loanInstallments WHERE loanId=l.id) AS totalInstallments,
      (SELECT COALESCE(SUM(amount),0) FROM loanInstallments WHERE loanId=l.id AND status='pago') AS totalPaid,
      (SELECT COALESCE(SUM(amount),0) FROM loanInstallments WHERE loanId=l.id AND status!='pago') AS remainingBalance
    FROM loans l WHERE l.clientId IN (${ids}) ORDER BY l.createdAt DESC
  `));
  const next = resultRows(await db.execute(sql`
    SELECT li.*, l.id AS loanId FROM loanInstallments li JOIN loans l ON l.id=li.loanId
    WHERE l.clientId IN (${ids}) AND li.status IN ('pendente','atrasado','em_analise')
    ORDER BY li.dueDate ASC LIMIT 1
  `))[0] || null;
  return { client: clients[0] || null, loans, nextInstallment: next };
}

export async function getOnlineLoanInstallments(token: string, loanId: number) {
  const { session } = await requireOnlineRoute(token, 'emprestimo');
  const db = await getDb() as any;
  const owned = resultRows(await db.execute(sql`
    SELECT l.id FROM loans l JOIN loanClients lc ON lc.id=l.clientId
    WHERE l.id=${loanId} AND (lc.phone=${session.phone} OR (${session.cpf || null} IS NOT NULL AND REPLACE(REPLACE(REPLACE(lc.cpf,'.',''),'-',''),' ','')=${session.cpf || null})) LIMIT 1
  `));
  if (!owned[0]) throw new Error('Empréstimo não pertence ao cliente autenticado.');
  return resultRows(await db.execute(sql`SELECT * FROM loanInstallments WHERE loanId=${loanId} ORDER BY installmentNumber ASC`));
}

export async function submitOnlineInstallmentProof(input: { token: string; installmentId: number; fileBase64: string; fileName: string; mimeType: string }) {
  const { session } = await requireOnlineRoute(input.token, 'emprestimo');
  const db = await getDb() as any;
  const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (!allowedMime.has(input.mimeType)) throw new Error('Envie imagem JPG, PNG, WEBP ou PDF.');
  const rawBase64 = String(input.fileBase64 || '').split(',').pop() || '';
  const buffer = Buffer.from(rawBase64, 'base64');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('O comprovante deve ter até 10 MB.');
  const rows = resultRows(await db.execute(sql`
    SELECT li.id, li.status, li.proofSentAt, lc.id AS clientId
    FROM loanInstallments li
    JOIN loans l ON l.id=li.loanId
    JOIN loanClients lc ON lc.id=l.clientId
    WHERE li.id=${input.installmentId} AND (lc.phone=${session.phone} OR (${session.cpf || null} IS NOT NULL AND REPLACE(REPLACE(REPLACE(lc.cpf,'.',''),'-',''),' ','')=${session.cpf || null}))
    LIMIT 1
  `));
  const installment = rows[0];
  if (!installment) throw new Error('Parcela não pertence ao cliente autenticado.');
  if (String(installment.status) === 'em_analise' || installment.proofSentAt) throw new Error('Já existe um comprovante em análise para esta parcela.');
  const safeName = String(input.fileName || 'comprovante').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const key = `loan-proofs/${Number(installment.clientId)}/${input.installmentId}-${Date.now()}-${safeName}`;
  const { url } = await storagePut(key, buffer, input.mimeType);
  await db.execute(sql`UPDATE loanInstallments SET proofUrl=${url}, proofSentAt=NOW(), status='em_analise' WHERE id=${input.installmentId}`);
  return { success: true, url };
}

export async function requireOnlineRoute(token: string, route: CustomerRoute) {
  const session = await requireOnlineEntrySession(token);
  const access = await hasRouteAccess(session.customerId, route);
  const isOrdersRoute = route === 'site' || route === 'acompanhar';
  const linkedOrdersAccess = isOrdersRoute && !access.allowed
    ? await hasRouteAccess(session.customerId, route === 'site' ? 'acompanhar' : 'site')
    : null;
  if (!access.allowed && !linkedOrdersAccess?.allowed) {
    throw new Error(`Acesso não autorizado para ${route}. Solicite a liberação ao administrador.`);
  }
  return { session, access: access.allowed ? access : linkedOrdersAccess! };
}
