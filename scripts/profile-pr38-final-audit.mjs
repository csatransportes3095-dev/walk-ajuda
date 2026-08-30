import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function regexReplace(path, regex, replacement, expected = 1) {
  const source = read(path);
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const matches = [...source.matchAll(new RegExp(regex.source, flags))];
  if (matches.length !== expected) {
    throw new Error(`${path}: expected ${expected} regex match(es), found ${matches.length} for ${regex}`);
  }
  write(path, source.replace(regex, replacement));
}

function assertIncludes(path, needle, label) {
  const source = read(path);
  if (!source.includes(needle)) {
    throw new Error(`${path}: audit assertion failed: ${label}`);
  }
}

function assertNotIncludes(path, needle, label) {
  const source = read(path);
  if (source.includes(needle)) {
    throw new Error(`${path}: audit assertion failed: ${label}`);
  }
}

const centralMessage = 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.';

// 1) Gastos/Empréstimos não podem manter um segundo formulário de reparo de perfil.
// requiredProfilePhone agora apenas encaminha a identidade fixa para a tela central.
const gastosLogin = 'client/src/pages/GastosLoginPage.tsx';
regexReplace(
  gastosLogin,
  /  useEffect\(\(\) => \{\n    const phoneToComplete = normalizePhone\(requiredProfilePhone \|\| ''\);[\s\S]*?\n  \}, \[requiredProfilePhone\]\);/,
  `  useEffect(() => {\n    const phoneToComplete = normalizePhone(requiredProfilePhone || '');\n    if (!phoneToComplete) return;\n    const returnTo = requestedRoute === 'emprestimo' ? '/emprestimo' : '/gastos';\n    const params = new URLSearchParams({ phone: phoneToComplete, returnTo });\n    window.location.assign(\`/atualizarcadastro?\${params.toString()}\`);\n  }, [requiredProfilePhone, requestedRoute]);`,
);

// Cadastro inexistente em Gastos/Empréstimos volta ao cadastro principal. Não existe
// mais um segundo cadastro parcial nesta tela.
regexReplace(
  gastosLogin,
  /        case 'not_found':\n          setProfileUpdateLookup\(null\);\n          \/\/ Pré-preencher o telefone no formulário de cadastro novo\.\n          setRegPhone\(cleanPhone\);\n          setStep\('register'\);\n          break;/,
  `        case 'not_found':\n          sessionStorage.setItem('reg_phone_temp', cleanPhone);\n          toast.info('Faça primeiro o cadastro completo no site principal.');\n          window.location.assign('/');\n          return;`,
);

// 2) Endpoints antigos continuam tipados para não quebrar telas legadas, mas nunca
// alteram o banco. O retorno orienta qualquer UI antiga para o fluxo central.
const customerPassword = 'server/routers/customerPassword.ts';
regexReplace(
  customerPassword,
  /  saveCpf: publicProcedure[\s\S]*?(?=  clientCreateAuto: publicProcedure)/,
  `  saveCpf: publicProcedure\n    .input(z.object({ phone: z.string(), cpf: z.string().min(11) }))\n    .mutation(async () => {\n      return { success: false as const, message: '${centralMessage}' };\n    }),\n\n  // Cliente cria senha (modo auto)\n`,
);

const routers = 'server/routers.ts';
for (const endpoint of ['updateEmailByPhone', 'updateCpfByPhone', 'completeProfile']) {
  const pattern = new RegExp(`    ${endpoint}: publicProcedure[\\s\\S]*?(?=\\n    [A-Za-z0-9_]+: (?:public|admin)Procedure)`);
  regexReplace(
    routers,
    pattern,
    `    ${endpoint}: publicProcedure\n      .input(z.any())\n      .mutation(async () => {\n        return { success: false as const, message: '${centralMessage}' };\n      }),`,
  );
}

// 3) Asserções da auditoria estrutural. Se algum patch futuro reabrir esses caminhos,
// o workflow falha antes de commitá-los.
assertIncludes('client/src/components/PasswordGate.tsx', 'customerUpdateStatusMutation', 'PasswordGate must consult central profile status');
assertIncludes('client/src/pages/OrderTracking.tsx', "returnTo: '/acompanhar'", 'Order tracking must redirect incomplete customers centrally');
assertIncludes('client/src/pages/AdminCustomers.tsx', 'trpc.customerUpdate.adminUpdate.useMutation', 'ADM must use guarded customerUpdate.adminUpdate');
assertIncludes('client/src/pages/AdminCustomers.tsx', 'readOnly disabled', 'ADM phone field must be read-only');
assertIncludes('server/routers.ts', "Telefone é a identidade fixa do cliente e não pode ser alterado.", 'legacy backend must reject phone changes');
assertIncludes('server/customerProfile.ts', 'addressNumber', 'global completeness must include address number');
assertIncludes('server/customerProfile.ts', 'profilePhotoUrl', 'global completeness must include profile photo');
assertNotIncludes(customerPassword, 'await db.update(customers).set({ cpf: formattedCpf })', 'legacy saveCpf must not update CPF');

console.log('PR #38 final audit hardening applied: legacy bypasses closed and central flow asserted.');
