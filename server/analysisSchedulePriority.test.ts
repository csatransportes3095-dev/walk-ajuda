import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

const state = vi.hoisted(() => ({
  appointment: null as any,
  snapshot: null as any,
  option: null as any,
  failCreate: false,
  nextId: 100,
  labels: {} as Record<string, string>,
}));
const dbMock = vi.hoisted(() => ({
  createAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
  completeOpenAppointmentsForOrder: vi.fn(),
}));
const email = vi.hoisted(() => vi.fn());

vi.mock('./_core/sendMailDirect', () => ({ sendMailDirect: email }));
vi.mock('./productScheduleAliases', () => ({ loadAutomaticProductAliases: vi.fn(async () => new Map()) }));
vi.mock('./customerAccess', () => ({
  normalizeCustomerPhone: (value: unknown) => String(value ?? '').replace(/\D/g, '').slice(-11),
  findMainCustomerByIdentity: vi.fn(async () => ({ name: 'Teste', email: 'test@example.invalid' })),
}));
vi.mock('./db', () => ({
  getDb: vi.fn(async () => ({ execute: vi.fn(async () => [state.option ? [state.option] : []]) })),
  getLatestOrderStatus: vi.fn(async () => state.snapshot),
  getCurrentSubOrderStatusSnapshot: vi.fn(async () => state.snapshot),
  getStatusLabelFromDb: vi.fn(async (key: string) => state.labels[key] ?? key),
  getAppointmentByOrder: vi.fn(async (registrationId: number, subOrderIndex: number) =>
    state.appointment?.registrationId === registrationId && state.appointment?.subOrderIndex === subOrderIndex
      ? state.appointment : null),
  createAppointment: dbMock.createAppointment,
  deleteAppointment: dbMock.deleteAppointment,
  completeOpenAppointmentsForOrder: dbMock.completeOpenAppointmentsForOrder,
  isScheduleClosedByOrderStatus: vi.fn(async (input: any) => {
    const { isScheduleClosedStatusInFlow } = await import('../shared/scheduleOrderLifecycle');
    return isScheduleClosedStatusInFlow({ targetKey: input.statusKey, targetLabel: input.statusLabel, flowStatusKeys: [], statuses: [] });
  }),
}));

import { ensureActiveAutomaticScheduleForAnalysis, ensureAutomaticScheduleForOrder } from './autoSchedule';
import { confirmationPredatesAnalysis, reconcileAnalysisScheduleForOrder } from './analysisScheduleReconcile';
import { isAnalysisOrderStatusSemantic, isPhotoAnalysisOrderStatusSemantic, isScheduleClosedStatusInFlow } from '../shared/scheduleOrderLifecycle';

const input = { registrationId: 10, subOrderIndex: 0, customerPhone: '11900000000', serviceName: 'Servico de teste', notifyCustomer: false };
const oldAppointment = (status: string) => ({
  id: 20, registrationId: 10, subOrderIndex: 0, customerPhone: input.customerPhone,
  token: 'old-token', status,
  createdAt: new Date('2026-10-15T12:00:00Z'),
  confirmedAt: new Date('2026-10-15T13:00:00Z'),
});

beforeEach(() => {
  vi.clearAllMocks();
  state.appointment = null;
  state.option = null;
  state.failCreate = false;
  state.nextId = 100;
  state.labels = { legacy_analysis: '🟠 EM ANÁLISE', legacy_photo: '🟡 FOTO EM ANÁLISE', recebido: 'Pedido recebido' };
  state.snapshot = { id: 80, status: 'legacy_analysis', customerPhone: input.customerPhone, serviceName: input.serviceName, serviceOption: 'Opcao antiga', orderNumber: 1000, createdAt: new Date('2026-10-19T12:00:00Z') };
  dbMock.createAppointment.mockImplementation(async (data: any) => {
    if (state.failCreate) throw new Error('database unavailable');
    state.appointment = { ...data, id: ++state.nextId, status: 'pending', createdAt: new Date(), confirmedAt: null };
    return state.appointment;
  });
  dbMock.deleteAppointment.mockImplementation(async (id: number) => {
    if (state.appointment?.id === id) state.appointment = null;
  });
  dbMock.completeOpenAppointmentsForOrder.mockImplementation(async (registrationId: number, subOrderIndex: number) => {
    if (state.appointment?.registrationId === registrationId && state.appointment?.subOrderIndex === subOrderIndex && ['pending', 'confirmed'].includes(state.appointment.status)) {
      state.appointment.status = 'completed';
      return 1;
    }
    return 0;
  });
});

describe('chaves e nomes reais de status', () => {
  it('ignora emojis e acentos e respeita label renomeada sobre chave legada', () => {
    expect(isAnalysisOrderStatusSemantic('foto_em_analise', '🟠 EM ANÁLISE')).toBe(true);
    expect(isPhotoAnalysisOrderStatusSemantic('foto_em_analise', '🟠 EM ANÁLISE')).toBe(false);
    expect(isAnalysisOrderStatusSemantic('em_analise', '🟡 FOTO EM ANÁLISE')).toBe(false);
    expect(isPhotoAnalysisOrderStatusSemantic('em_analise', '🟡 FOTO EM ANÁLISE')).toBe(true);
  });
  it('Em Analise nunca fecha agenda por posicao visual ou chave herdada', () => {
    expect(isScheduleClosedStatusInFlow({ targetKey: 'foto_aprovada', targetLabel: '🟠 EM ANÁLISE', flowStatusKeys: ['legacy_photo', 'foto_aprovada'], statuses: [{ key: 'legacy_photo', label: '🟡 FOTO EM ANÁLISE' }] })).toBe(false);
  });
});

describe('regra prioritaria de retorno para analise', () => {
  it.each(['completed', 'cancelled', 'missing'])('gera novo token com agenda %s mesmo sem opcao automatica', async status => {
    state.appointment = status === 'missing' ? null : oldAppointment(status);
    const result = await ensureActiveAutomaticScheduleForAnalysis(input);
    expect(result.created).toBe(true);
    expect(result.token).not.toBe('old-token');
    expect(state.appointment.status).toBe('pending');
    expect(dbMock.createAppointment).toHaveBeenCalledTimes(1);
    expect(dbMock.completeOpenAppointmentsForOrder).toHaveBeenCalledWith(10, 0, input.customerPhone, false);
    expect(email).not.toHaveBeenCalled();
  });
  it.each(['pending', 'confirmed'])('nao duplica agenda %s em releitura/salvamento da mesma etapa', async status => {
    state.appointment = oldAppointment(status);
    expect((await ensureActiveAutomaticScheduleForAnalysis(input)).token).toBe('old-token');
    expect(dbMock.createAppointment).not.toHaveBeenCalled();
  });
  it('nova transicao solicita novo token mesmo se a agenda anterior esta ativa', async () => {
    state.appointment = oldAppointment('confirmed');
    expect((await ensureActiveAutomaticScheduleForAnalysis({ ...input, forceNewOnReturn: true })).token).not.toBe('old-token');
    expect(state.appointment.status).toBe('pending');
  });
  it('duas consultas simultaneas do ADM criam somente um agendamento', async () => {
    state.appointment = oldAppointment('completed');
    const results = await Promise.all([ensureActiveAutomaticScheduleForAnalysis(input), ensureActiveAutomaticScheduleForAnalysis(input)]);
    expect(dbMock.createAppointment).toHaveBeenCalledTimes(1);
    expect(results[0].token).toBe(results[1].token);
  });
  it('falha real e propagada e permite nova tentativa sem trava pendente', async () => {
    state.failCreate = true;
    await expect(ensureActiveAutomaticScheduleForAnalysis(input)).rejects.toThrow('database unavailable');
    state.failCreate = false;
    expect((await ensureActiveAutomaticScheduleForAnalysis(input)).created).toBe(true);
  });
});

describe('recuperacao da agenda existente no ADM', () => {
  it('substitui finalizado de pedido que ja estava em analise antes do deploy', async () => {
    state.appointment = oldAppointment('completed');
    const result = await reconcileAnalysisScheduleForOrder(10, 0);
    expect(result.isAnalysis).toBe(true);
    expect(result.appointment?.status).toBe('pending');
    expect(email).not.toHaveBeenCalled();
  });
  it('uma confirmacao antiga nao desfaz o retorno a analise', async () => {
    state.appointment = oldAppointment('confirmed');
    expect((await reconcileAnalysisScheduleForOrder(10, 0)).appointment?.token).not.toBe('old-token');
  });
  it('preserva confirmacao que ocorreu depois da entrada em analise', async () => {
    state.appointment = { ...oldAppointment('confirmed'), confirmedAt: new Date('2026-10-19T13:00:00Z') };
    expect((await reconcileAnalysisScheduleForOrder(10, 0)).appointment?.token).toBe('old-token');
    expect(dbMock.createAppointment).not.toHaveBeenCalled();
  });
  it('sem historico persistido nunca cria agenda a partir do navegador', async () => {
    state.snapshot = null;
    await reconcileAnalysisScheduleForOrder(10, 0);
    expect(dbMock.createAppointment).not.toHaveBeenCalled();
  });
  it('Foto em Analise encerra a agenda exata sem gerar outra', async () => {
    state.snapshot.status = 'legacy_photo';
    state.appointment = oldAppointment('confirmed');
    const result = await reconcileAnalysisScheduleForOrder(10, 0);
    expect(result.appointment?.status).toBe('completed');
    expect(dbMock.createAppointment).not.toHaveBeenCalled();
    expect(dbMock.completeOpenAppointmentsForOrder).toHaveBeenCalledWith(10, 0, input.customerPhone, false);
  });
  it('somente confirmacao anterior a transicao exige um novo ciclo', () => {
    expect(confirmationPredatesAnalysis(oldAppointment('pending'), '2026-10-19T12:00:00Z')).toBe(false);
    expect(confirmationPredatesAnalysis(oldAppointment('confirmed'), 'invalid')).toBe(false);
    expect(confirmationPredatesAnalysis(oldAppointment('confirmed'), '2026-10-19T12:00:00Z')).toBe(true);
  });
});

describe('checkout de pedidos novos continua independente', () => {
  beforeEach(() => {
    state.snapshot.status = 'recebido';
    state.option = { id: 7, productId: 3, autoScheduleEnabled: 1, productName: 'Servico de teste', label: 'Padrao' };
  });
  it('finalizacao cria agendamento automatico para opcao habilitada', async () => {
    const result = await ensureAutomaticScheduleForOrder({ ...input, optionId: 7 });
    expect(result.created).toBe(true);
    expect(result.url).toContain('/agendar/');
    expect(state.appointment.status).toBe('pending');
  });
  it('preserva a configuracao de produto desabilitado no checkout', async () => {
    state.option = null;
    expect((await ensureAutomaticScheduleForOrder({ ...input, optionId: 7 })).created).toBe(false);
    expect(dbMock.createAppointment).not.toHaveBeenCalled();
  });
  it('repeticao do checkout nao substitui reserva confirmada', async () => {
    state.appointment = oldAppointment('confirmed');
    expect((await ensureAutomaticScheduleForOrder({ ...input, optionId: 7 })).token).toBe('old-token');
    expect(dbMock.createAppointment).not.toHaveBeenCalled();
    expect(dbMock.completeOpenAppointmentsForOrder).not.toHaveBeenCalled();
  });
});

describe('integracao real dos pontos de entrada', () => {
  it('transicao chama forceNewOnReturn e GET usa o status persistido', () => {
    const db = fs.readFileSync('server/db.ts', 'utf8');
    const router = fs.readFileSync('server/routers/schedule.ts', 'utf8');
    const get = router.slice(router.indexOf('  getForOrder: adminProcedure'), router.indexOf('  createForOrder: adminProcedure'));
    expect(db).toContain('forceNewOnReturn: true');
    expect(db).not.toContain('if (targetIsAnalysis && !previousIsAnalysis)');
    expect(get).toContain('reconcileAnalysisScheduleForOrder(input.registrationId, input.subOrderIndex)');
    expect(get).not.toContain('updateLastOrderStatus(');
    expect(get).not.toContain("String(input.orderStatus || '')");
  });
});
