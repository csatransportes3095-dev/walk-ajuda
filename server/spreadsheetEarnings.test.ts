import { describe, it, expect } from 'vitest';
import { createEarning, getEarningsByUserAndMonth, deleteEarning } from './db';

// ============================================================
// Teste de regressão do bug "Total de Ganhos = R$ 0,00".
//
// Causa raiz: o cliente Drizzle foi inicializado como drizzle(DATABASE_URL)
// SEM registrar o schema, portanto a API relacional db.query.*.findMany/findFirst
// não funciona (retorna vazio). getEarningsByUserAndMonth usava db.query.findMany,
// então os ganhos nunca chegavam ao frontend, mesmo estando salvos no banco.
//
// A correção passou a usar db.select().from(...) (mesmo padrão dos gastos, que
// sempre funcionaram). Este teste grava um ganho, busca pelo mês e valida a soma.
// ============================================================

// userId sintético, alto, para não colidir com dados reais
const TEST_USER_ID = 987654321;
const TEST_MONTH = '2020-01';
const TEST_DATE = '2020-01-15';

function sumEarning(e: any): number {
  return (
    parseFloat(e.uber || '0') +
    parseFloat(e.ninetynine || '0') +
    parseFloat(e.indrive || '0') +
    parseFloat(e.particular || '0') +
    parseFloat(e.deliveries || '0') +
    parseFloat(e.tips || '0') +
    parseFloat(e.otherEarnings || '0')
  );
}

describe('getEarningsByUserAndMonth (regressão Total de Ganhos = 0)', () => {
  it('retorna o ganho salvo e a soma bate com os valores digitados', async () => {
    // Limpa qualquer resíduo do usuário de teste
    const pre = await getEarningsByUserAndMonth(TEST_USER_ID, TEST_MONTH);
    for (const row of pre as any[]) {
      await deleteEarning(row.id);
    }

    // Uber=50, 99=100, InDrive=30 → total esperado 180
    await createEarning({
      userId: TEST_USER_ID,
      date: TEST_DATE,
      uber: '50',
      ninetynine: '100',
      indrive: '30',
      particular: '0',
      deliveries: '0',
      tips: '0',
      otherEarnings: '0',
    } as any);

    const rows = await getEarningsByUserAndMonth(TEST_USER_ID, TEST_MONTH);
    expect(Array.isArray(rows)).toBe(true);
    expect((rows as any[]).length).toBeGreaterThan(0);

    const total = (rows as any[]).reduce((s, e) => s + sumEarning(e), 0);
    expect(total).toBe(180);

    // Limpeza
    for (const row of rows as any[]) {
      await deleteEarning(row.id);
    }

    // Confirma limpeza
    const after = await getEarningsByUserAndMonth(TEST_USER_ID, TEST_MONTH);
    expect((after as any[]).length).toBe(0);
  });
});
