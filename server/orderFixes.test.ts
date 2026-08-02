import { describe, it, expect } from 'vitest';

// ============================================================
// Testes para a lógica de splitIntoSubOrders com status dinâmico
// ============================================================

function splitIntoSubOrders(history: any[], initialStatus: string): any[][] {
  if (history.length === 0) return [];
  const result: any[][] = [];
  let current: any[] = [];
  for (const entry of history) {
    if ((entry.status === initialStatus || entry.status === 'recebido') && current.length > 0) {
      result.push(current);
      current = [entry];
    } else {
      current.push(entry);
    }
  }
  if (current.length > 0) result.push(current);
  return result.reverse();
}

describe('splitIntoSubOrders com status dinâmico', () => {
  it('deve retornar array vazio para histórico vazio', () => {
    expect(splitIntoSubOrders([], 'pedido_recebido')).toEqual([]);
  });

  it('deve retornar 1 sub-pedido quando há apenas 1 entrada', () => {
    const history = [{ id: 1, status: 'pedido_recebido' }];
    const result = splitIntoSubOrders(history, 'pedido_recebido');
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
  });

  it('deve retornar 1 sub-pedido quando todos os status são do mesmo pedido', () => {
    const history = [
      { id: 1, status: 'pedido_recebido' },
      { id: 2, status: 'pagamento_recebido' },
      { id: 3, status: 'entregue' },
    ];
    const result = splitIntoSubOrders(history, 'pedido_recebido');
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(3);
  });

  it('deve dividir em 2 sub-pedidos quando há 2 entradas com status inicial', () => {
    const history = [
      { id: 1, status: 'pedido_recebido' },
      { id: 2, status: 'pagamento_recebido' },
      { id: 3, status: 'pedido_recebido' }, // novo pedido
      { id: 4, status: 'entregue' },
    ];
    const result = splitIntoSubOrders(history, 'pedido_recebido');
    expect(result).toHaveLength(2);
    // Mais recente primeiro (índice 0)
    expect(result[0][0].id).toBe(3);
    expect(result[1][0].id).toBe(1);
  });

  it('NÁO deve dividir quando há 2 itens do carrinho com mesmo status (1 único pedido)', () => {
    // Caso do bug: 2 itens do carrinho com mesmo registrationId e mesmo timestamp
    // Após correção: createManualOrderMultiple cria 1 única entrada
    const history = [
      { id: 1, status: 'pedido_recebido', serviceName: 'UBER CARRO (NOME/ALEATORIO) + 99 MOTO (NOME/ALEATORIO)' },
    ];
    const result = splitIntoSubOrders(history, 'pedido_recebido');
    expect(result).toHaveLength(1);
    expect(result[0][0].serviceName).toContain('+');
  });

  it('deve funcionar com status "recebido" legado como fallback', () => {
    const history = [
      { id: 1, status: 'recebido' },
      { id: 2, status: 'entregue' },
      { id: 3, status: 'recebido' },
    ];
    const result = splitIntoSubOrders(history, 'pedido_recebido');
    // 'recebido' também é tratado como marcador de divisão
    expect(result).toHaveLength(2);
  });
});

// ============================================================
// Testes para a lógica de combinação de produtos do carrinho
// ============================================================

describe('combinação de produtos no createManualOrderMultiple', () => {
  function combineItems(items: { serviceName: string; serviceOption?: string; answers?: string }[]) {
    const combinedServiceName = items
      .map(item => item.serviceOption ? `${item.serviceName} (${item.serviceOption})` : item.serviceName)
      .join(' + ');
    const combinedServiceOption = items.length > 1
      ? `${items.length} produtos`
      : (items[0]?.serviceOption || undefined);
    const combinedAnswers = items
      .map(item => item.answers)
      .filter(Boolean)
      .join(' | ') || undefined;
    return { combinedServiceName, combinedServiceOption, combinedAnswers };
  }

  it('deve combinar 2 produtos em uma única string', () => {
    const items = [
      { serviceName: 'UBER CARRO', serviceOption: 'NOME / ALEATORIO' },
      { serviceName: '99 MOTO', serviceOption: 'NOME / ALEATORIO' },
    ];
    const result = combineItems(items);
    expect(result.combinedServiceName).toBe('UBER CARRO (NOME / ALEATORIO) + 99 MOTO (NOME / ALEATORIO)');
    expect(result.combinedServiceOption).toBe('2 produtos');
  });

  it('deve manter serviceOption original para 1 produto', () => {
    const items = [{ serviceName: 'UBER CARRO', serviceOption: 'NOME / ALEATORIO' }];
    const result = combineItems(items);
    expect(result.combinedServiceName).toBe('UBER CARRO (NOME / ALEATORIO)');
    expect(result.combinedServiceOption).toBe('NOME / ALEATORIO');
  });

  it('deve combinar respostas de múltiplos produtos', () => {
    const items = [
      { serviceName: 'UBER CARRO', answers: 'CPF: 123' },
      { serviceName: '99 MOTO', answers: 'CPF: 456' },
    ];
    const result = combineItems(items);
    expect(result.combinedAnswers).toBe('CPF: 123 | CPF: 456');
  });

  it('deve retornar undefined para answers quando nenhum item tem respostas', () => {
    const items = [
      { serviceName: 'UBER CARRO' },
      { serviceName: '99 MOTO' },
    ];
    const result = combineItems(items);
    expect(result.combinedAnswers).toBeUndefined();
  });

  it('deve combinar 3 produtos corretamente', () => {
    const items = [
      { serviceName: 'UBER CARRO', serviceOption: 'OPT A' },
      { serviceName: '99 MOTO', serviceOption: 'OPT B' },
      { serviceName: 'INDRIVE', serviceOption: 'OPT C' },
    ];
    const result = combineItems(items);
    expect(result.combinedServiceName).toBe('UBER CARRO (OPT A) + 99 MOTO (OPT B) + INDRIVE (OPT C)');
    expect(result.combinedServiceOption).toBe('3 produtos');
  });
});
