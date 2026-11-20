import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { TrpcContext } from './_core/context';
import { syntheticVehicle, syntheticVehicleText } from '../scripts/tests/vehicle-vault-owner-fixtures.mjs';

const isolated = vi.hoisted(() => ({ getDb: vi.fn(async () => null) }));
vi.mock('./db', () => ({ getDb: isolated.getDb }));
vi.mock('./locadora/storage', () => ({
  storeLocadoraPrivateFile: vi.fn(), readLocadoraPrivateFile: vi.fn(), deleteLocadoraPrivateFile: vi.fn(),
}));
import { parseVehicleVaultOwnerName } from './vehicleVaultOwner';
import { vehicleVaultRouter } from './routers/vehicleVault';

const secret = 'isolated-vehicle-owner-authorization-secret-20261120';
function context(cookie = '', user: any = null): TrpcContext {
  return { user, req: { headers: { cookie } } as TrpcContext['req'], res: {} as TrpcContext['res'] };
}
const adminCookie = () => 'admin_token=' + jwt.sign({ sub: 'owner-fixture-admin', role: 'admin' }, secret);
const crlv = (block: string) => `CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO - DIGITAL\n${block}`;

describe('Vehicle owner — labelled extraction without guessing identities', () => {
  it.each([
    ['Nome do proprietário: Ana Sintética da Silva', 'ANA SINTÉTICA DA SILVA'],
    ['Nome do proprietário - ANA SINTÉTICA', 'ANA SINTÉTICA'],
    ['Nome do proprietário: Ana Sintética'.normalize('NFD'), 'ANA SINTÉTICA'],
    ['CRLV-e\nNOME: ANA SINTÉTICA CPF/CNPJ: 000.000.000-00', 'ANA SINTÉTICA'],
    ['PROPRIETÁRIO\nANA SINTÉTICA DA SILVA\nCPF: 000.000.000-00', 'ANA SINTÉTICA DA SILVA'],
    ['Nome do Proprietário = Empresa Sintética & Filhos LTDA\nCNPJ: 00.000.000/0000-00', 'EMPRESA SINTÉTICA & FILHOS LTDA'],
    [crlv('NOME\nJOÃO SINTÉTICO D\'ÁVILA\nCPF/CNPJ\n000.000.000-00'), "JOÃO SINTÉTICO D'ÁVILA"],
    [crlv('NOME                                CPF/CNPJ\nEMPRESA SINTÉTICA S/A                00.000.000/0000-00'), 'EMPRESA SINTÉTICA S/A'],
    ['Nome do proprietário: Ana Sintética\nNome do proprietário: Ana Sintética', 'ANA SINTÉTICA'],
  ])('extracts the named owner from %s', (text, expected) => {
    expect(parseVehicleVaultOwnerName(text)).toBe(expected);
  });

  it.each([
    'PLACA TST1A23\nANO DO MODELO 2025',
    'CPF: 000.000.000-00\nCNPJ: 00.000.000/0000-00',
    'NOME DO PROPRIETÁRIO\nCPF/CNPJ\n000.000.000-00',
    'NOME DO PROPRIETÁRIO: 000.000.000-00',
    'NOME DO PROPRIETÁRIO: 00.000.000/0000-00',
    'LOCATÁRIO: PESSOA SINTÉTICA LOCATÁRIA\nARRENDATÁRIO: EMPRESA SINTÉTICA LOCATÁRIA',
    'PROPRIETÁRIO ANTERIOR: PESSOA SINTÉTICA ANTERIOR',
    'FORMULÁRIO DE SEGURO\nNOME\nPESSOA SINTÉTICA SEGURADA\nCPF/CNPJ\n000.000.000-00',
    'NOME DO PROPRIETÁRIO: ANA SINTÉTICA\nNOME DO PROPRIETÁRIO: BEATRIZ SINTÉTICA',
  ])('returns empty for absent, non-owner or ambiguous input: %s', text => {
    expect(parseVehicleVaultOwnerName(text)).toBe('');
  });

  it('keeps the actual owner separate from a tenant and former owner', () => {
    expect(parseVehicleVaultOwnerName([
      'LOCATÁRIO: PESSOA SINTÉTICA LOCATÁRIA',
      'PROPRIETÁRIO ANTERIOR: PESSOA SINTÉTICA ANTERIOR',
      'NOME DO PROPRIETÁRIO: EMPRESA SINTÉTICA ATUAL LTDA',
      'CNPJ: 00.000.000/0000-00',
    ].join('\n'))).toBe('EMPRESA SINTÉTICA ATUAL LTDA');
  });

  it('reads the labelled owner beyond column 100 without taking the vehicle text on its left', () => {
    const text = crlv([
      'PLACA'.padEnd(104) + 'NOME',
      'TST1A23'.padEnd(104) + 'PESSOA SINTÉTICA DA DIREITA',
      'ANO FABRICAÇÃO ANO MODELO'.padEnd(104) + 'CPF/CNPJ',
      '2024 2025'.padEnd(104) + '000.000.000-00',
    ].join('\n'));
    expect(parseVehicleVaultOwnerName(text)).toBe('PESSOA SINTÉTICA DA DIREITA');
  });
});

describe('Vehicle owner — real private procedures', () => {
  beforeEach(() => { vi.stubEnv('JWT_SECRET', secret); isolated.getDb.mockClear(); });
  afterEach(() => vi.unstubAllEnvs());

  it('returns the optional owner with the existing vehicle fields from previewText', async () => {
    const caller = vehicleVaultRouter.createCaller(context(adminCookie()));
    const found = await caller.previewText({ text: syntheticVehicleText('ANA SINTÉTICA DO TESTE') });
    expect(found).toMatchObject({ ...syntheticVehicle, ownerName: 'ANA SINTÉTICA DO TESTE', missing: [] });
    expect(isolated.getDb).not.toHaveBeenCalled();
  });

  it('does not add the absent owner to the seven mandatory fields', async () => {
    const caller = vehicleVaultRouter.createCaller(context(adminCookie()));
    const found = await caller.previewText({ text: syntheticVehicleText() });
    expect(found).toMatchObject({ ownerName: '', missing: [] });
  });

  it.each(['absent', 'malformed', 'regular', 'expired', 'context-admin'])('rejects %s credentials before reading files or the DB', async mode => {
    const token = mode === 'regular' ? jwt.sign({ role: 'user' }, secret)
      : mode === 'expired' ? jwt.sign({ role: 'admin', exp: 1 }, secret)
      : mode === 'malformed' ? 'invalid' : '';
    const caller = vehicleVaultRouter.createCaller(context(token ? 'admin_token=' + token : '', mode === 'context-admin' ? { role: 'admin' } : null));
    await expect(caller.previewText({ text: syntheticVehicleText('PESSOA SINTÉTICA') })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.previewPdf({ base64: Buffer.from('%PDF-1.4 synthetic fixture never processed').toString('base64') })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.save({ ...syntheticVehicle, ownerName: 'PESSOA SINTÉTICA', sourceText: '' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller.details({ id: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(isolated.getDb).not.toHaveBeenCalled();
  });

  it('rejects names over 200 characters instead of silently truncating them', async () => {
    const caller = vehicleVaultRouter.createCaller(context(adminCookie()));
    await expect(caller.save({ ...syntheticVehicle, ownerName: 'A'.repeat(201), sourceText: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(isolated.getDb).not.toHaveBeenCalled();
  });
});
