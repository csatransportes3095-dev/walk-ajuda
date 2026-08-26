import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(process.cwd());
const gastosSource = fs.readFileSync(path.join(root, 'client/src/pages/GastosLoginPage.tsx'), 'utf8');
const manifestSource = fs.readFileSync(path.join(root, 'client/src/components/ReferralAccessManifest.tsx'), 'utf8');
const homeSource = fs.readFileSync(path.join(root, 'client/src/components/HomeAccessManifest.tsx'), 'utf8');

describe('padrão de indicação antes do cadastro', () => {
  it('exibe a mesma sequência de telefone e indicação separada', () => {
    expect(manifestSource).toContain("'Antes de continuar'");
    expect(manifestSource).toContain("'Quem indicou você?'");
    expect(manifestSource).toContain('Telefone de quem indicou');
    expect(manifestSource).toContain('A indicação precisa pertencer a um cliente cadastrado e ativo.');
    expect(manifestSource).toContain('entryStartByPhone.useMutation');
  });

  it('Gastos usa o gate separado antes do novo cadastro', () => {
    expect(gastosSource).toContain("| 'referral'");
    expect(gastosSource).toContain("setStep('referral')");
    expect(gastosSource).toContain('<ReferralAccessManifest');
    expect(gastosSource).toContain('initialPhone={regPhone}');
    expect(gastosSource).toContain("setRegReferralPhone(referralPhone || '')");
    expect(gastosSource).toContain("setStep('register')");
    expect(gastosSource).toContain('referredByPhone: cleanReferralPhone');
    expect(gastosSource).not.toContain('referredBy: regReferralName');
  });

  it('o site usa o mesmo componente e preserva a sessão existente', () => {
    expect(homeSource).toContain("import { ReferralAccessManifest } from './ReferralAccessManifest';");
    expect(homeSource).toContain("sessionStorage.setItem('walk_home_referral_phone', referralPhone)");
    expect(homeSource).toContain("sessionStorage.setItem('walk_home_existing_phone', phone)");
  });
});
