import { describe, it, expect } from 'vitest';

// ============================================================
// Testes para a lógica de inclusão de pedidos ÓRFÁOS no admin (listOrders)
//
// Contexto do bug: alguns pedidos possuem histórico (orderStatusHistory) cujo
// registrationId NÁO existe em accessCodePhones (dados importados/migrados de
// versões anteriores). O admin, que lista pedidos fazendo JOIN entre
// accessCodePhones.id e orderStatusHistory.registrationId, nunca enxergava esses
// pedidos, embora o cliente os visse em "Acompanhar Pedido" (busca por telefone).
//
// A correção reconstrói uma linha "virtual" de accessCodePhones para cada
// registrationId órfão. Esta suíte valida a função pura que replica a decisão
// de quais registrationIds devem ser incluídos e a garantia de não duplicar.
// ============================================================

type Row = { id: number };

/**
 * Replica a lógica do listOrders: combina os acp reais com os órfãos,
 * filtrando qualquer órfão cujo id já esteja presente entre os acp reais
 * (segurança extra contra duplicação).
 */
function combineAcpWithOrphans(acpRows: Row[], orphanRows: Row[]): Row[] {
  const knownAcpIds = new Set<number>((acpRows || []).map((r) => Number(r.id)));
  const filteredOrphans = (orphanRows || []).filter((r) => !knownAcpIds.has(Number(r.id)));
  return [...(acpRows || []), ...filteredOrphans];
}

/**
 * Replica a query dos órfãos: dado o histórico e os ids existentes em
 * accessCodePhones, retorna os registrationIds distintos que são órfãos
 * (não existem em accessCodePhones) e estão aprovados.
 */
function findOrphanRegIds(
  history: Array<{ registrationId: number; approval: string }>,
  acpIds: number[],
): number[] {
  const acpSet = new Set(acpIds);
  const orphanSet = new Set<number>();
  for (const h of history) {
    if (h.approval === 'approved' && !acpSet.has(h.registrationId)) {
      orphanSet.add(h.registrationId);
    }
  }
  return Array.from(orphanSet).sort((a, b) => a - b);
}

describe('Inclusão de pedidos órfãos no admin', () => {
  it('inclui registrationIds que não existem em accessCodePhones', () => {
    const acpRows: Row[] = [{ id: 14580002 }];
    const orphanRows: Row[] = [{ id: 1440002 }, { id: 2220001 }];
    const combined = combineAcpWithOrphans(acpRows, orphanRows);
    const ids = combined.map((r) => r.id);
    expect(ids).toContain(14580002);
    expect(ids).toContain(1440002);
    expect(ids).toContain(2220001);
    expect(combined).toHaveLength(3);
  });

  it('não duplica um id que já existe em accessCodePhones', () => {
    const acpRows: Row[] = [{ id: 100 }, { id: 200 }];
    // 200 aparece indevidamente entre os órfãos: deve ser filtrado
    const orphanRows: Row[] = [{ id: 200 }, { id: 300 }];
    const combined = combineAcpWithOrphans(acpRows, orphanRows);
    const ids = combined.map((r) => r.id).sort((a, b) => a - b);
    expect(ids).toEqual([100, 200, 300]);
    // 200 não pode aparecer duas vezes
    expect(ids.filter((x) => x === 200)).toHaveLength(1);
  });

  it('sem órfãos, retorna apenas os acp reais', () => {
    const acpRows: Row[] = [{ id: 1 }, { id: 2 }];
    const combined = combineAcpWithOrphans(acpRows, []);
    expect(combined).toHaveLength(2);
  });

  it('quando não há acp reais, retorna somente os órfãos', () => {
    const combined = combineAcpWithOrphans([], [{ id: 5 }, { id: 6 }]);
    expect(combined.map((r) => r.id).sort((a, b) => a - b)).toEqual([5, 6]);
  });

  it('detecta órfãos aprovados a partir do histórico', () => {
    const history = [
      { registrationId: 1440002, approval: 'approved' },
      { registrationId: 1440002, approval: 'approved' },
      { registrationId: 2220001, approval: 'approved' },
      { registrationId: 14580002, approval: 'approved' }, // existe em acp -> não é órfão
    ];
    const acpIds = [14580002];
    expect(findOrphanRegIds(history, acpIds)).toEqual([1440002, 2220001]);
  });

  it('não considera órfão um pedido pendente (approval != approved)', () => {
    const history = [
      { registrationId: 999001, approval: 'pending' },
      { registrationId: 999002, approval: 'approved' },
    ];
    expect(findOrphanRegIds(history, [])).toEqual([999002]);
  });
});
