import assert from 'node:assert/strict';
import {
  isValidBrazilianCpf,
  normalizeCustomerCpf,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from '../server/customerAccess';
import { isValidCPF, normalizeCpf } from '../shared/cpf';
import { validateMainCustomerProfile } from '../server/db';

assert.equal(normalizeCustomerPhone('(11) 99342-5306'), '11993425306');
assert.equal(normalizeCustomerPhone('+55 11 99342-5306'), '11993425306');
assert.equal(normalizeCustomerCpf('529.982.247-25'), '52998224725');
assert.equal(normalizeCustomerEmail(' H2Colombiano@GMAIL.com '), 'h2colombiano@gmail.com');
assert.equal(normalizeCpf('529.982.247-25'), '52998224725');

const validCpfs = ['529.982.247-25', '52998224725', '289.965.818-28'];
const invalidCpfs = [
  '',
  '529.982.247-2',
  '529.982.247-255',
  '529.982.247-2a',
  '000.000.000-00',
  '111.111.111-11',
  '222.222.222-22',
  '333.333.333-33',
  '444.444.444-44',
  '555.555.555-55',
  '666.666.666-66',
  '777.777.777-77',
  '888.888.888-88',
  '999.999.999-99',
  '123.456.789-00',
  '289.965.818-00',
];

for (const cpf of validCpfs) {
  assert.equal(isValidCPF(cpf), true, `CPF válido foi rejeitado: ${cpf}`);
  assert.equal(isValidBrazilianCpf(cpf), true, `Adaptador do cadastro rejeitou: ${cpf}`);
}
for (const cpf of invalidCpfs) {
  assert.equal(isValidCPF(cpf), false, `CPF inválido foi aceito: ${cpf}`);
  assert.equal(isValidBrazilianCpf(cpf), false, `Adaptador do cadastro aceitou: ${cpf}`);
}

const profile = validateMainCustomerProfile({
  name: 'Cliente de Teste',
  phone: '+55 (11) 99342-5306',
  cpf: '529.982.247-25',
  email: ' TESTE@EXEMPLO.COM ',
  profilePhotoUrl: 'https://example.com/foto.jpg',
});
assert.deepEqual(profile, {
  phone: '11993425306',
  cpf: '52998224725',
  email: 'teste@exemplo.com',
  photoUrl: 'https://example.com/foto.jpg',
});

assert.throws(
  () => validateMainCustomerProfile({
    name: 'Cliente de Teste',
    phone: '11993425306',
    cpf: '289.965.818-00',
    email: 'teste@exemplo.com',
    profilePhotoUrl: 'https://example.com/foto.jpg',
  }),
  /CPF válido/,
);

console.log('Validação matemática de CPF e identidade concluída com sucesso.');
