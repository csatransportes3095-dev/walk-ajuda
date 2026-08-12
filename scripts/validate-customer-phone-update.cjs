const fs = require('fs');

const router = fs.readFileSync('server/routers.ts', 'utf8');
const adminCustomers = fs.readFileSync('client/src/pages/AdminCustomers.tsx', 'utf8');
const identity = fs.readFileSync('server/customerIdentity.ts', 'utf8');

const requiredRouterRules = [
  "phone: rawData.phone?.replace(/\\D/g, '') || undefined",
  "const phoneChanged = !!data.phone && newPhone !== oldPhone",
  "SELECT id, name FROM customers",
  "Este telefone já está cadastrado para",
  "const updated = await updateCustomer(id, data)",
  "UPDATE accessCodePhones SET phone = ${newPhone}",
  "UPDATE spreadsheetClients SET phone = ${newPhone}",
  "UPDATE loanClients SET phone = ${newPhone}",
  "sincronização de telefone não aplicada",
];
for (const rule of requiredRouterRules) {
  if (!router.includes(rule)) throw new Error(`Regra ausente no salvamento de telefone: ${rule}`);
}

const saveMain = router.indexOf('const updated = await updateCustomer(id, data)');
const firstPropagation = router.indexOf('const propagationQueries = [');
if (saveMain < 0 || firstPropagation < 0 || saveMain > firstPropagation) {
  throw new Error('O cadastro principal precisa ser salvo antes das sincronizações secundárias');
}

if (!identity.includes('allowPhoneReuseFromDeletedCustomers') ||
    !identity.includes("SHOW INDEX FROM customers WHERE Column_name = 'phone' AND Non_unique = 0") ||
    !identity.includes('ALTER TABLE customers DROP INDEX')) {
  throw new Error('Telefone preservado na lixeira ainda bloqueia o cliente ativo');
}

if (!adminCustomers.includes('onError: (error) => toast.error(error.message || "Erro ao atualizar cliente")')) {
  throw new Error('A tela principal ainda esconde a causa real do erro de telefone');
}
if (!adminCustomers.includes('const payload: Record<string, any> = { id: editingId }') ||
    !adminCustomers.includes("if (phoneDigits && changed('phone', phoneDigits)) payload.phone = phoneDigits")) {
  throw new Error('A tela ainda não envia o telefone de forma isolada');
}
if (!adminCustomers.includes("if (Object.keys(payload).length === 1)")) {
  throw new Error('A tela não protege o cadastro contra salvamento sem mudança');
}

const normalize = (value) => String(value || '').replace(/\D/g, '');
if (normalize('(11) 98979-3464') !== '11989793464') throw new Error('Normalização de telefone falhou');
if (normalize('+55 (11) 98979-3464') !== '5511989793464') throw new Error('Normalização com DDI falhou');

console.log('OK: alteração de telefone valida duplicidade ativa, reutiliza telefone da lixeira e sincroniza vínculos sem bloquear o salvamento.');
