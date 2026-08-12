import assert from 'node:assert/strict';
import {
  isValidBrazilianCpf,
  normalizeCustomerCpf,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from '../server/customerAccess';
import { validateMainCustomerProfile } from '../server/db';

assert.equal(normalizeCustomerPhone('(11) 99342-5306'), '11993425306');
assert.equal(normalizeCustomerPhone('+55 11 99342-5306'), '11993425306');
assert.equal(normalizeCustomerCpf('529.982.247-25'), '52998224725');
assert.equal(normalizeCustomerEmail(' H2Colombiano@GMAIL.com '), 'h2colombiano@gmail.com');
assert.equal(isValidBrazilianCpf('529.982.247-25'), true);
assert.equal(isValidBrazilianCpf('111.111.111-11'), false);
assert.equal(isValidBrazilianCpf('123.456.789-00'), false);
assert.equal(isValidBrazilianCpf('289.965.818-28'), true);

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

console.log('Validação de identidade concluída com sucesso.');
