import { describe, expect, it } from 'vitest';
import {
  isAnalysisOrderStatusSemantic,
  isScheduleClosedStatusInFlow,
} from '../shared/scheduleOrderLifecycle';

const statuses = [
  { key: 'recebido', label: 'Pedido recebido' },
  { key: 'em_analise', label: 'Em análise' },
  { key: 'foto_em_analise', label: 'Foto em análise' },
  { key: 'revisao_personalizada', label: 'Revisão personalizada' },
  { key: 'entregue', label: 'Entregue' },
];
const flowStatusKeys = statuses.map(status => status.key);

describe('ciclo do agendamento pelo status do pedido', () => {
  it('mantem Em analise como unica etapa de espera pelo agendamento', () => {
    expect(isAnalysisOrderStatusSemantic('em_analise', 'Em análise')).toBe(true);
    expect(isScheduleClosedStatusInFlow({ targetKey: 'em_analise', targetLabel: 'Em análise', flowStatusKeys, statuses })).toBe(false);
  });

  it('encerra exatamente em Foto em analise', () => {
    expect(isScheduleClosedStatusInFlow({ targetKey: 'foto_em_analise', targetLabel: 'Foto em análise', flowStatusKeys, statuses })).toBe(true);
  });

  it('encerra status configuravel posterior a Foto em analise sem lista fixa', () => {
    expect(isScheduleClosedStatusInFlow({ targetKey: 'revisao_personalizada', targetLabel: 'Revisão personalizada', flowStatusKeys, statuses })).toBe(true);
  });

  it('nao encerra status configurado antes de Foto em analise', () => {
    expect(isScheduleClosedStatusInFlow({ targetKey: 'recebido', targetLabel: 'Pedido recebido', flowStatusKeys, statuses })).toBe(false);
  });

  it('reconhece Foto em analise pela label mesmo com chave personalizada', () => {
    expect(isScheduleClosedStatusInFlow({
      targetKey: 'etapa_foto_customizada',
      targetLabel: 'Foto em análise',
      flowStatusKeys: ['em_analise', 'etapa_foto_customizada'],
      statuses: [{ key: 'em_analise', label: 'Em análise' }, { key: 'etapa_foto_customizada', label: 'Foto em análise' }],
    })).toBe(true);
  });
});
