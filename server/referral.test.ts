import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  getDb: vi.fn(),
}));

import { getDb } from './db';
import { normalizeReferralName, normalizeReferralPhone, resolveReferralDeclaration, restrictedReferralAccessError } from './referral';

const getDbMock = vi.mocked(getDb);

describe('regra central de indicação', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('normaliza máscara e DDI +55 sem alterar o número brasileiro', () => {
    expect(normalizeReferralPhone('+55 (11) 99999-8888')).toBe('11999998888');
    expect(normalizeReferralPhone('(11) 9999-8888')).toBe('1199998888');
    expect(normalizeReferralName('  Maria   da   Silva  ')).toBe('Maria da Silva');
  });

  it('preserva indicação declarada por nome sem exigir telefone', async () => {
    const result = await resolveReferralDeclaration({
      customerPhone: '11988887777',
      referrerName: 'João da Oficina',
    });
    expect(result).toMatchObject({
      declaredName: 'João da Oficina',
      declaredPhone: null,
      linkedReferrer: null,
      issue: null,
    });
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('rejeita somente telefone estruturalmente inválido', async () => {
    const result = await resolveReferralDeclaration({
      customerPhone: '11988887777',
      referrerPhone: '12345',
    });
    expect(result.issue).toBe('invalid_phone');
    expect(result.declaredPhone).toBeNull();
  });

  it('impede autorreferência mesmo com máscara e DDI', async () => {
    const result = await resolveReferralDeclaration({
      customerPhone: '11988887777',
      referrerPhone: '+55 (11) 98888-7777',
    });
    expect(result.issue).toBe('self_referral');
  });

  it('aceita telefone não localizado como origem declarada sem bloquear', async () => {
    getDbMock.mockResolvedValue({ execute: vi.fn().mockResolvedValue([[]]) } as any);
    const result = await resolveReferralDeclaration({
      customerPhone: '11988887777',
      referrerName: 'Indicador informado',
      referrerPhone: '(21) 97777-6666',
    });
    expect(result).toMatchObject({
      declaredName: 'Indicador informado',
      declaredPhone: '21977776666',
      linkedReferrer: null,
      issue: null,
    });
  });

  it('bloqueia o primeiro acesso sem telefone, com autorreferência ou sem indicador localizado', () => {
    expect(restrictedReferralAccessError({ declaredName: null, declaredPhone: null, linkedReferrer: null, issue: null }))
      .toContain('Acesso restrito');
    expect(restrictedReferralAccessError({ declaredName: 'Eu', declaredPhone: '11988887777', linkedReferrer: null, issue: 'self_referral' }))
      .toContain('não pode indicar a si mesmo');
    expect(restrictedReferralAccessError({ declaredName: 'Desconhecido', declaredPhone: '11999990000', linkedReferrer: null, issue: null }))
      .toContain('Indicador não localizado');
  });

  it('libera o primeiro acesso somente quando o indicador existe e está vinculado', () => {
    expect(restrictedReferralAccessError({
      declaredName: 'Ana',
      declaredPhone: '11999990000',
      linkedReferrer: { id: 41, name: 'ANA INDICADORA', phone: '11999990000' },
      issue: null,
    })).toBeNull();
  });

  it('vincula o indicador encontrado pelo telefone normalizado', async () => {
    getDbMock.mockResolvedValue({
      execute: vi.fn().mockResolvedValue([[{ id: 41, name: 'ANA INDICADORA', phone: '(11) 99999-0000' }]]),
    } as any);
    const result = await resolveReferralDeclaration({
      customerPhone: '21988887777',
      referrerName: 'Ana',
      referrerPhone: '+55 11 99999-0000',
    });
    expect(result.issue).toBeNull();
    expect(result.linkedReferrer).toEqual({ id: 41, name: 'ANA INDICADORA', phone: '11999990000' });
  });
});
