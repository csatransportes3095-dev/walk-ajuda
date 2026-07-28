import { validateAccessCode } from './server/db.ts';

// Testar com o telefone do cliente: (11) 99342-5306 -> 11993425306
const phone = '11993425306';
const code = 'SEXTA25';

console.log('Testando validação:', { code, phone });
try {
  const result = await validateAccessCode(code, phone);
  console.log('Resultado:', JSON.stringify(result, null, 2));
} catch (e) {
  console.error('ERRO:', e.message);
  console.error(e.stack);
}
process.exit(0);
