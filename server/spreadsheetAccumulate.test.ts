import { describe, it, expect } from 'vitest';
import {
  createExpense, getExpensesByUserAndMonth, deleteExpense,
  createEarning, getEarningsByUserAndMonth, deleteEarning,
} from './db';

// ============================================================
// Regressão do bug "lançamento na mesma data e categoria substitui o anterior".
//
// Comportamento correto: cada createExpense/createEarning cria um NOVO registro.
// Assim, dois lançamentos de Combustível na mesma data (7 e 10) devem:
//   - aparecer como 2 registros separados
//   - somar 17 no total
// (antes, o upsert por data fazia UPDATE e substituía o valor -> ficava 10)
// ============================================================

const TEST_USER_ID = 987654322; // sintético, não colide com dados reais
const TEST_MONTH = '2020-02';
const TEST_DATE = '2020-02-10';

function sumExpense(e: any): number {
  return (
    parseFloat(e.fuel || '0') + parseFloat(e.carRental || '0') + parseFloat(e.maintenance || '0') +
    parseFloat(e.oilChange || '0') + parseFloat(e.washing || '0') + parseFloat(e.insurance || '0') +
    parseFloat(e.internetPhone || '0') + parseFloat(e.food || '0') + parseFloat(e.parking || '0') +
    parseFloat(e.tolls || '0') + parseFloat(e.financing || '0') + parseFloat(e.fines || '0') +
    parseFloat(e.accessories || '0') + parseFloat(e.otherExpenses || '0')
  );
}

function sumEarning(e: any): number {
  return (
    parseFloat(e.uber || '0') + parseFloat(e.ninetynine || '0') + parseFloat(e.indrive || '0') +
    parseFloat(e.particular || '0') + parseFloat(e.deliveries || '0') + parseFloat(e.tips || '0') +
    parseFloat(e.otherEarnings || '0')
  );
}

async function cleanupExpenses() {
  const rows = await getExpensesByUserAndMonth(TEST_USER_ID, TEST_MONTH);
  for (const row of rows as any[]) await deleteExpense(row.id);
}

async function cleanupEarnings() {
  const rows = await getEarningsByUserAndMonth(TEST_USER_ID, TEST_MONTH);
  for (const row of rows as any[]) await deleteEarning(row.id);
}

describe('Gastos: dois lançamentos na mesma data/categoria são separados e somam', () => {
  it('Combustível 7 + 10 => 2 registros, total 17', async () => {
    await cleanupExpenses();

    await createExpense({ userId: TEST_USER_ID, date: TEST_DATE, fuel: '7' } as any);
    await createExpense({ userId: TEST_USER_ID, date: TEST_DATE, fuel: '10' } as any);

    const rows = await getExpensesByUserAndMonth(TEST_USER_ID, TEST_MONTH) as any[];
    const sameDate = rows.filter(r => r.date === TEST_DATE);

    // Devem existir 2 registros separados na mesma data
    expect(sameDate.length).toBe(2);

    // A soma total deve ser 17 (não 10 como no bug de substituição)
    const total = sameDate.reduce((s, e) => s + sumExpense(e), 0);
    expect(total).toBe(17);

    await cleanupExpenses();
    const after = await getExpensesByUserAndMonth(TEST_USER_ID, TEST_MONTH) as any[];
    expect(after.length).toBe(0);
  });
});

describe('Ganhos: dois lançamentos na mesma data são separados e somam', () => {
  it('Uber 80 + 20 => 2 registros, total 100', async () => {
    await cleanupEarnings();

    await createEarning({ userId: TEST_USER_ID, date: TEST_DATE, uber: '80' } as any);
    await createEarning({ userId: TEST_USER_ID, date: TEST_DATE, uber: '20' } as any);

    const rows = await getEarningsByUserAndMonth(TEST_USER_ID, TEST_MONTH) as any[];
    const sameDate = rows.filter(r => r.date === TEST_DATE);

    expect(sameDate.length).toBe(2);

    const total = sameDate.reduce((s, e) => s + sumEarning(e), 0);
    expect(total).toBe(100);

    await cleanupEarnings();
    const after = await getEarningsByUserAndMonth(TEST_USER_ID, TEST_MONTH) as any[];
    expect(after.length).toBe(0);
  });
});
