import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content); }
function exactReplace(path, before, after, expected = 1) {
  const source = read(path);
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`${path}: expected ${expected} exact match(es), found ${count}`);
  write(path, source.replace(before, after));
}
function regexReplace(path, regex, replacer, expected = 1) {
  const source = read(path);
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))];
  if (matches.length !== expected) throw new Error(`${path}: expected ${expected} regex match(es), found ${matches.length}`);
  write(path, source.replace(regex, replacer));
}

// 1) PasswordGate: toda identidade existente incompleta vai ao fluxo central antes
// de referral/senha/foto/CPF isolados.
const passwordGate = 'client/src/components/PasswordGate.tsx';
exactReplace(
  passwordGate,
  '  const cpwdSaveCpfMutation = trpc.customerPassword.saveCpf.useMutation();\n',
  '  const cpwdSaveCpfMutation = trpc.customerPassword.saveCpf.useMutation();\n  const customerUpdateStatusMutation = trpc.customerUpdate.status.useMutation();\n'
);
exactReplace(
  passwordGate,
  '      setCustomerExists(true);\n\n      // Verificar link de indicação\n',
  `      setCustomerExists(true);\n\n      // Cadastro existente: qualquer pendência é resolvida exclusivamente no fluxo central.\n      const centralProfileStatus = await customerUpdateStatusMutation.mutateAsync({ phone: canonical });\n      if (centralProfileStatus.status !== 'completed' && centralProfileStatus.status !== 'blocked' && centralProfileStatus.status !== 'not_found') {\n        const params = new URLSearchParams({ phone: canonical, returnTo: '/' });\n        window.location.assign(\`/atualizarcadastro?\${params.toString()}\`);\n        return;\n      }\n\n      // Verificar link de indicação\n`
);
regexReplace(
  passwordGate,
  /      if \(result\.success\) \{\n        toast\.success\("Cadastro realizado com sucesso!"\);[\s\S]*?        setGateStep\("cpwd_create"\);\n      \}/,
  `      if (result.success) {\n        // O cadastro inicial apenas fixa a identidade pelo telefone. A conclusão\n        // obrigatória acontece no fluxo central antes de qualquer acesso ao site.\n        toast.success("Cadastro inicial salvo. Complete os dados obrigatórios para continuar.");\n        const params = new URLSearchParams({ phone: clientPhoneDigits, returnTo: '/' });\n        window.location.assign(\`/atualizarcadastro?\${params.toString()}\`);\n        return;\n      }`
);

// 2) Gastos/Empréstimos: cliente já existente e incompleto não usa mais o formulário local.
const gastosLogin = 'client/src/pages/GastosLoginPage.tsx';
regexReplace(
  gastosLogin,
  /        case 'profile_incomplete': \{[\s\S]*?          break;\n        \}\n        case 'no_password':/,
  `        case 'profile_incomplete': {\n          const existingProfile = (result as any).profile || {};\n          const fixedPhone = normalizePhone(existingProfile.phone || (result as any).clientPhone || cleanPhone);\n          if (!fixedPhone) {\n            setError('Cadastro encontrado, mas não foi possível confirmar o telefone da identidade.');\n            break;\n          }\n          const returnTo = sourceRoute === 'emprestimo' ? '/emprestimo' : '/gastos';\n          const params = new URLSearchParams({ phone: fixedPhone, returnTo });\n          window.location.assign(\`/atualizarcadastro?\${params.toString()}\`);\n          return;\n        }\n        case 'no_password':`
);

// 3) Acompanhar: PIN legado também obedece à mesma completude central.
const tracking = 'client/src/pages/OrderTracking.tsx';
exactReplace(
  tracking,
  '  const updateCpfMutation = trpc.customers.updateCpfByPhone.useMutation();\n',
  '  const updateCpfMutation = trpc.customers.updateCpfByPhone.useMutation();\n  const customerProfileStatusMutation = trpc.customerUpdate.status.useMutation();\n'
);
regexReplace(
  tracking,
  /      \/\/ Verificar CPF antes de liberar acesso\n      const custCheck = await customerCheckQuery\.refetch\(\);\n      if \(!\(custCheck\.data\?\.customer as any\)\?\.cpf\) \{\n        setNeedsCpfUpdate\(true\);\n        setPinError\(false\);\n        return;\n      \}/,
  `      // PIN legado não pode ignorar pendências do cadastro principal.\n      const profileStatus = await customerProfileStatusMutation.mutateAsync({ phone: searchPhone });\n      if (profileStatus.status !== 'completed') {\n        const params = new URLSearchParams({ phone: searchPhone, returnTo: '/acompanhar' });\n        window.location.assign(\`/atualizarcadastro?\${params.toString()}\`);\n        return;\n      }`
);
regexReplace(
  tracking,
  /    \/\/ Verificar CPF antes de liberar acesso\n    const custCheck2 = await customerCheckQuery\.refetch\(\);\n    if \(!\(custCheck2\.data\?\.customer as any\)\?\.cpf\) \{\n      setNeedsCpfUpdate\(true\);\n      setShowCreatePin\(false\);\n      return;\n    \}/,
  `    // Após criar o PIN, perfil incompleto continua obrigado ao fluxo central.\n    const profileStatus = await customerProfileStatusMutation.mutateAsync({ phone: searchPhone });\n    if (profileStatus.status !== 'completed') {\n      const params = new URLSearchParams({ phone: searchPhone, returnTo: '/acompanhar' });\n      window.location.assign(\`/atualizarcadastro?\${params.toString()}\`);\n      return;\n    }`
);

// 4) A sessão de /atualizarcadastro é uma customerPasswordSession válida: ao concluir,
// reaproveitar como cp_token para voltar autenticado à rota de origem.
const central = 'client/src/pages/AtualizarCadastro.tsx';
exactReplace(
  central,
  'const TOKEN_KEY = "customer_update_token";\n',
  'const TOKEN_KEY = "customer_update_token";\nconst CP_TOKEN_KEY = "cp_token";\n'
);
exactReplace(
  central,
  '  function acceptToken(nextToken: string) {\n    localStorage.setItem(TOKEN_KEY, nextToken);\n',
  '  function acceptToken(nextToken: string) {\n    localStorage.setItem(TOKEN_KEY, nextToken);\n    localStorage.setItem(CP_TOKEN_KEY, nextToken);\n'
);
exactReplace(
  central,
  '      localStorage.removeItem(TOKEN_KEY);\n      setToken("");\n      setStep("done");\n',
  '      localStorage.setItem(CP_TOKEN_KEY, token);\n      localStorage.removeItem(TOKEN_KEY);\n      setToken("");\n      setStep("done");\n'
);

// 5) Drizzle: refletir oficialmente as colunas já provisionadas/migradas.
const schema = 'drizzle/schema.ts';
exactReplace(
  schema,
  '  cpf: varchar("cpf", { length: 14 }),\n  referredBy: varchar("referredBy", { length: 128 }),\n',
  '  cpf: varchar("cpf", { length: 14 }),\n  zipCode: varchar("zipCode", { length: 10 }),\n  addressLine: varchar("addressLine", { length: 255 }),\n  neighborhood: varchar("neighborhood", { length: 128 }),\n  addressNumber: varchar("addressNumber", { length: 32 }),\n  addressComplement: varchar("addressComplement", { length: 128 }),\n  normalizedPhone: varchar("normalizedPhone", { length: 16 }),\n  normalizedCpf: varchar("normalizedCpf", { length: 11 }),\n  normalizedEmail: varchar("normalizedEmail", { length: 320 }),\n  referredBy: varchar("referredBy", { length: 128 }),\n'
);

console.log('PR #38 guarded profile patch applied successfully.');
