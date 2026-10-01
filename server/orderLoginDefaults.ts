import { and, desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { orderLoginDefaults, customerPasswordSessions, orderStatusHistory } from '../drizzle/schema';
import type { getDb } from './db';
import { globalOrderGroupSchema, safeLoginLink } from '../shared/orderLoginPresentation';

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function readOrderLoginDefaults(db: Db) {
  const rows = await db.select().from(orderLoginDefaults).where(eq(orderLoginDefaults.id, 1)).limit(1);
  return rows[0] ?? null;
}
export async function saveOrderGroupDefault(db: Db, input: { groupLink: string; expectedRevision: number }) {
  const parsed = globalOrderGroupSchema.parse(input);
  const groupLink = parsed.groupLink.trim() ? safeLoginLink(parsed.groupLink)! : null;
  const conflict = () => new TRPCError({ code: 'CONFLICT', message: 'O grupo foi alterado em outra tela. Reabra a configuração antes de salvar.' });
  if (parsed.expectedRevision === 0) {
    try {
      await db.insert(orderLoginDefaults).values({ id: 1, groupLink, revision: 1 });
    } catch (error) {
      const cause = (error as any)?.cause ?? error;
      if (cause?.code === 'ER_DUP_ENTRY') throw conflict();
      throw error;
    }
  } else {
    const result = await db.update(orderLoginDefaults).set({ groupLink, revision: parsed.expectedRevision + 1 })
      .where(and(eq(orderLoginDefaults.id, 1), eq(orderLoginDefaults.revision, parsed.expectedRevision)));
    if (result[0].affectedRows !== 1) throw conflict();
  }
  return { configured: true, groupLink, revision: parsed.expectedRevision + 1 };
}

// Only the new CNH/global fields require this check. Existing password and OTP
// routines are not replaced. A real admin session may preview an owned order.
export async function canReadOrderLoginExtras(db: Db, input: { registrationId: number; customerPhone: string; cpToken?: string }, isAdmin = false) {
  const phone = input.customerPhone.replace(/\D/g, '');
  if (!phone) return false;
  if (!isAdmin) {
    if (!input.cpToken || input.cpToken.length < 20) return false;
    const rows = await db.select({ phone: customerPasswordSessions.phone, expiresAt: customerPasswordSessions.expiresAt }).from(customerPasswordSessions).where(eq(customerPasswordSessions.token, input.cpToken)).limit(1);
    const session = rows[0];
    if (!session || new Date(session.expiresAt).getTime() <= Date.now() || session.phone.replace(/\D/g, '') !== phone) return false;
  }
  const statuses = await db.select({ customerPhone: orderStatusHistory.customerPhone, status: orderStatusHistory.status })
    .from(orderStatusHistory).where(eq(orderStatusHistory.registrationId, input.registrationId))
    .orderBy(desc(orderStatusHistory.createdAt), desc(orderStatusHistory.id)).limit(1);
  const current = statuses[0];
  return !!current && current.customerPhone.replace(/\D/g, '') === phone && ['entregue', 'pedido_entregue'].includes(current.status);
}
