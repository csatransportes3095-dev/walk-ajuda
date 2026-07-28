import { describe, it, expect } from 'vitest';
import { createOperational, getOperationalByUserAndMonth, deleteOperational } from './db';

// Regressão da aba Operacional: corridas por plataforma + total.
// Grava Uber 50, 99 20, InDrive 12 (total 82) e valida persistência e soma.

const TEST_USER_ID = 987654322;
const TEST_MONTH = '2020-02';
const TEST_DATE = '2020-02-10';

describe('Operacional - corridas por plataforma', () => {
  it('salva corridas por plataforma e soma total corretamente', async () => {
    const pre = await getOperationalByUserAndMonth(TEST_USER_ID, TEST_MONTH);
    for (const row of pre as any[]) await deleteOperational(row.id);

    const total = 50 + 20 + 12;
    await createOperational({
      userId: TEST_USER_ID,
      date: TEST_DATE,
      kmInitial: '14980',
      kmFinal: '15036',
      ridesUber: 50,
      rides99: 20,
      ridesIndrive: 12,
      ridesParticular: 0,
      ridesDeliveries: 0,
      rideCount: total,
    } as any);

    const rows = await getOperationalByUserAndMonth(TEST_USER_ID, TEST_MONTH);
    expect((rows as any[]).length).toBe(1);
    const op = (rows as any[])[0];
    expect(op.ridesUber).toBe(50);
    expect(op.rides99).toBe(20);
    expect(op.ridesIndrive).toBe(12);

    const somaCorridas = (op.ridesUber || 0) + (op.rides99 || 0) + (op.ridesIndrive || 0) + (op.ridesParticular || 0) + (op.ridesDeliveries || 0);
    expect(somaCorridas).toBe(82);
    expect(op.rideCount).toBe(82);

    for (const row of rows as any[]) await deleteOperational(row.id);
    const after = await getOperationalByUserAndMonth(TEST_USER_ID, TEST_MONTH);
    expect((after as any[]).length).toBe(0);
  });
});
