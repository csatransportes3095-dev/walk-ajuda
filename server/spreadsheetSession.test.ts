import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { spreadsheetClients, spreadsheetSessions } from '../drizzle/schema';
import { spreadsheetRouter } from './routers/spreadsheet';

// ============================================================
// Teste de regressão do bug "desloga sozinho / precisa dar F5".
//
// Correções cobertas:
// 1. verifySession valida corretamente uma sessão existente (restauração
//    automática ao recarregar a página).
// 2. Sessão passou de 24h para 90 dias e é RENOVADA (sliding) a cada uso
//    ativo em resolveClientId -> login persistente.
// ============================================================

const db = drizzle(process.env.DATABASE_URL as string);
const caller = spreadsheetRouter.createCaller({} as any);

const TEST_CLIENT_ID = 987654322; // id sintético alto
let TEST_TOKEN = '';

describe('Sessão persistente do Gestor de Gastos', () => {
  beforeAll(async () => {
    // Cria cliente de teste (idempotente)
    await db.delete(spreadsheetClients).where(eq(spreadsheetClients.id, TEST_CLIENT_ID));
    await db.insert(spreadsheetClients).values({
      id: TEST_CLIENT_ID,
      name: 'Cliente Teste Sessao',
      phone: '00000000000',
    } as any);

    // Insere sessão com expiração CURTA (2 dias) para provar a renovação
    TEST_TOKEN = randomBytes(32).toString('hex');
    const shortExpiry = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await db.insert(spreadsheetSessions).values({
      clientId: TEST_CLIENT_ID,
      token: TEST_TOKEN,
      expiresAt: shortExpiry,
    } as any);
  });

  afterAll(async () => {
    await db.delete(spreadsheetSessions).where(eq(spreadsheetSessions.token, TEST_TOKEN));
    await db.delete(spreadsheetClients).where(eq(spreadsheetClients.id, TEST_CLIENT_ID));
  });

  it('verifySession retorna válido para uma sessão existente', async () => {
    const res = await caller.verifySession({ token: TEST_TOKEN });
    expect(res.valid).toBe(true);
    expect(res.clientId).toBe(TEST_CLIENT_ID);
  });

  it('renova a validade da sessão (sliding) ao usar uma procedure protegida', async () => {
    // Antes: expiração ~2 dias
    const before = await db.select().from(spreadsheetSessions)
      .where(eq(spreadsheetSessions.token, TEST_TOKEN)).limit(1);
    const beforeExpiry = new Date(before[0].expiresAt).getTime();

    // Uso ativo: chama uma procedure que passa por resolveClientId
    const rows = await caller.getEarningsByMonth({ token: TEST_TOKEN, month: '2020-01' });
    expect(Array.isArray(rows)).toBe(true);

    // Depois: expiração deve ter saltado para bem mais que 2 dias (perto de 90)
    const after = await db.select().from(spreadsheetSessions)
      .where(eq(spreadsheetSessions.token, TEST_TOKEN)).limit(1);
    const afterExpiry = new Date(after[0].expiresAt).getTime();

    expect(afterExpiry).toBeGreaterThan(beforeExpiry);
    // Deve estar a mais de 80 dias no futuro (login persistente)
    const daysAhead = (afterExpiry - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysAhead).toBeGreaterThan(80);
  });

  it('verifySession retorna inválido para token inexistente', async () => {
    const res = await caller.verifySession({ token: 'token-que-nao-existe-123' });
    expect(res.valid).toBe(false);
  });
});
