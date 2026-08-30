import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { findMainCustomerByIdentity, normalizeCustomerEmail, normalizeCustomerPhone, type CustomerRoute } from "../customerAccess";
import { isValidCPF, normalizeCpf } from "@shared/cpf";

export type OnlineRegistrationStep = 'route' | 'identity' | 'name' | 'phone' | 'cpf' | 'email' | 'cep' | 'addressLine' | 'addressNumber' | 'neighborhood' | 'addressComplement' | 'uf' | 'city' | 'referrer' | 'photo' | 'confirm';
export type OnlineRegistrationDraftData = Record<string, string>;

let infrastructurePromise: Promise<void> | null = null;
function asRows(result: any): any[] { return (result?.[0] || result || []) as any[]; }

async function ensureInfrastructure() {
  if (infrastructurePromise) return infrastructurePromise;
  infrastructurePromise = (async () => {
    const db = await getDb() as any;
    if (!db) throw new Error('Banco indisponível');
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS onlineSupportRegistrationDrafts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversationId INT NOT NULL,
        visitorId VARCHAR(128) NOT NULL,
        requestedRoute VARCHAR(32) NOT NULL,
        step VARCHAR(32) NOT NULL,
        dataJson LONGTEXT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY online_support_registration_draft_conversation_unique (conversationId),
        KEY online_support_registration_draft_visitor (visitorId, updatedAt)
      )
    `));
  })();
  return infrastructurePromise;
}

function parseData(value: unknown): OnlineRegistrationDraftData {
  try {
    const raw = JSON.parse(String(value || '{}'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, String(item ?? '')]));
  } catch { return {}; }
}

function validateField(field: string, value: string) {
  const text = String(value || '').trim();
  if (['name', 'uf', 'city', 'profilePhotoUrl', 'addressNumber'].includes(field) && !text) throw new Error('Campo obrigatório.');
  if (['addressLine', 'neighborhood'].includes(field) && text.length < 2) throw new Error('Campo obrigatório.');
  if (field === 'phone' && !normalizeCustomerPhone(text)) throw new Error('Telefone inválido. Informe DDD e número.');
  if (field === 'cpf' && !isValidCPF(normalizeCpf(text))) throw new Error('CPF inválido. Digite um CPF válido para continuar.');
  if (field === 'email' && !normalizeCustomerEmail(text)) throw new Error('E-mail inválido.');
  if ((field === 'cep' || field === 'zipCode') && !/^\d{8}$/.test(text.replace(/\D/g, ''))) throw new Error('CEP inválido.');
}

export async function getOnlineRegistrationDraft(conversationId: number, visitorId: string) {
  await ensureInfrastructure();
  const db = await getDb() as any;
  const rows = asRows(await db.execute(sql`SELECT * FROM onlineSupportRegistrationDrafts WHERE conversationId=${conversationId} AND visitorId=${visitorId} LIMIT 1`));
  if (!rows[0]) return null;
  return { ...rows[0], data: parseData(rows[0].dataJson) };
}

export async function saveOnlineRegistrationDraft(input: { conversationId: number; visitorId: string; requestedRoute: CustomerRoute; step: OnlineRegistrationStep; field?: string; value?: string; data?: OnlineRegistrationDraftData }) {
  await ensureInfrastructure();
  const db = await getDb() as any;
  const existing = await getOnlineRegistrationDraft(input.conversationId, input.visitorId);
  const data = { ...(existing?.data || {}), ...(input.data || {}) };
  if (input.field) {
    validateField(input.field, input.value || '');
    const raw = String(input.value || '').trim();
    data[input.field] = input.field === 'phone' ? normalizeCustomerPhone(raw) : input.field === 'cpf' ? normalizeCpf(raw) : input.field === 'email' ? normalizeCustomerEmail(raw) : raw;
  }
  await db.execute(sql`
    INSERT INTO onlineSupportRegistrationDrafts (conversationId, visitorId, requestedRoute, step, dataJson)
    VALUES (${input.conversationId}, ${input.visitorId}, ${input.requestedRoute}, ${input.step}, ${JSON.stringify(data)})
    ON DUPLICATE KEY UPDATE requestedRoute=VALUES(requestedRoute), step=VALUES(step), dataJson=VALUES(dataJson), updatedAt=NOW()
  `);
  return { requestedRoute: input.requestedRoute, step: input.step, data };
}

export async function findOnlineRegistrationIdentity(input: { phone?: string; cpf?: string; email?: string }) {
  const customer = await findMainCustomerByIdentity(input);
  if (!customer) return { exists: false as const };
  return { exists: true as const, customer: { customerNumber: customer.customerNumber || null, name: customer.name || 'Cliente' } };
}

export async function cancelOnlineRegistrationDraft(conversationId: number, visitorId: string) {
  await ensureInfrastructure();
  const db = await getDb() as any;
  await db.execute(sql`DELETE FROM onlineSupportRegistrationDrafts WHERE conversationId=${conversationId} AND visitorId=${visitorId}`);
  return { success: true };
}
