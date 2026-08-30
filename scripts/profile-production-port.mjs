import fs from 'node:fs';

function edit(path, fn) {
  const before = fs.readFileSync(path, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`${path}: nenhuma alteracao aplicada`);
  fs.writeFileSync(path, after);
}
function one(text, search, replace, label) {
  const count = text.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1, encontrado ${count}`);
  return text.replace(search, replace);
}
function rx(text, regex, replace, label) {
  const matches = text.match(regex);
  if (!matches) throw new Error(`${label}: trecho nao encontrado`);
  return text.replace(regex, replace);
}

// 1) Fluxo central: telefone e identidade fixa e nunca entra no UPDATE.
edit('server/routers/customerUpdate.ts', (src) => {
  src = one(src, '      phone: z.string().min(10).max(32).optional(),\n', '', 'customerUpdate schema phone');
  src = one(src,
    '      const phone = selected.has("phone") ? normalizeCustomerPhone(input.phone || "") : normalizeCustomerPhone(customer.phone);',
    '      const phone = normalizeCustomerPhone(customer.phone);',
    'customerUpdate fixed phone');
  src = src.replace('      if (selected.has("phone") && (!phone || phone.length < 10 || phone.length > 11)) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido." });\n', '');
  src = rx(src,
    /      const phoneConflict = await findMainCustomerByIdentity\(\{ phone \}, db\);[\s\S]*?      }\n      const cpfConflict =/,
    '      const cpfConflict =',
    'customerUpdate remove phone conflict');
  src = one(src,
    '          name=${name}, phone=${phone}, email=${email}, cpf=${cpf}, cep=${cep}, street=${street}, addressNumber=${addressNumber}, neighborhood=${neighborhood}, addressComplement=${addressComplement || null}, city=${city}, uf=${uf},\n          normalizedPhone=${phone},\n          normalizedCpf=${cpf}, normalizedEmail=${email}, updatedAt=NOW()',
    '          name=${name}, email=${email}, cpf=${cpf}, cep=${cep}, street=${street}, addressNumber=${addressNumber}, neighborhood=${neighborhood}, addressComplement=${addressComplement || null}, city=${city}, uf=${uf},\n          normalizedCpf=${cpf}, normalizedEmail=${email}, updatedAt=NOW()',
    'customerUpdate SQL phone');
  src = rx(src,
    /      const oldPhone = normalizeCustomerPhone\(customer\.phone\);\n[\s\S]*?\n      const synchronization = await syncUnifiedCustomerRegistry/,
    '      const synchronization = await syncUnifiedCustomerRegistry',
    'customerUpdate remove phone propagation');
  return src;
});

// 2) Endpoints paralelos antigos deixam de alterar perfil. Tudo passa por /atualizarcadastro.
edit('server/routers.ts', (src) => {
  src = rx(src,
    /    updateEmailByPhone: publicProcedure[\s\S]*?\n\n    updateCpfByPhone:/,
    `    updateEmailByPhone: publicProcedure\n      .input(z.object({ phone: z.string().min(1), email: z.string() }))\n      .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),\n\n    updateCpfByPhone:`,
    'disable updateEmailByPhone');
  src = rx(src,
    /    updateCpfByPhone: publicProcedure[\s\S]*?\n\n    \/\/ Completar o perfil de um cliente existente\. Nunca cria um segundo cadastro\./,
    `    updateCpfByPhone: publicProcedure\n      .input(z.object({ phone: z.string().min(1), cpf: z.string().min(1) }))\n      .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),\n\n    // Completar o perfil de um cliente existente. Nunca cria um segundo cadastro.`,
    'disable updateCpfByPhone');
  src = rx(src,
    /    completeProfile: publicProcedure[\s\S]*?\n\n    register: publicProcedure/,
    `    completeProfile: publicProcedure\n      .input(z.object({ lookupIdentifier: z.string().min(1) }).passthrough())\n      .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),\n\n    register: publicProcedure`,
    'disable completeProfile');

  src = one(src, '        phone: z.string().regex(/^\\d{10,11}$/).optional(),\n', '', 'admin update schema phone');
  src = one(src, '        name: z.string().optional(),\n', '        name: z.string().optional(),\n        cep: z.string().optional(),\n        street: z.string().optional(),\n        addressNumber: z.string().optional(),\n        neighborhood: z.string().optional(),\n        addressComplement: z.string().optional(),\n', 'admin address schema');
  src = one(src, '        email: z.string().email().optional(),', '        email: z.string().optional(),', 'admin blank email');
  src = one(src, '        uf: z.string().length(2).optional(),', '        uf: z.string().optional(),', 'admin blank uf');
  src = one(src, '        cpf: z.string().regex(/^\\d{11}$/).optional(),', '        cpf: z.string().optional(),', 'admin blank cpf');
  src = one(src,
    "          phone: rawData.phone?.replace(/\\D/g, '') || undefined,\n          cpf: rawData.cpf?.replace(/\\D/g, '') || undefined,\n          referredByPhone: rawData.referredByPhone?.replace(/\\D/g, '') || undefined,",
    "          cpf: rawData.cpf !== undefined ? rawData.cpf.replace(/\\D/g, '') : undefined,\n          referredByPhone: rawData.referredByPhone !== undefined ? rawData.referredByPhone.replace(/\\D/g, '') : undefined,",
    'admin data fixed phone');
  src = rx(src,
    /        const oldPhone = String\(current\.phone \|\| ''\)\.replace\(\/\\D\/g, ''\);[\s\S]*?\n        \/\/ Primeiro grava o cadastro principal\./,
    "        const oldPhone = String(current.phone || '').replace(/\\D/g, '');\n\n        // Primeiro grava o cadastro principal.",
    'admin remove phone prechange');
  src = rx(src,
    /\n        if \(phoneChanged\) \{[\s\S]*?\n        \}\n        \/\/ Reúne novamente/,
    '\n        // Reúne novamente',
    'admin remove phone propagation');
  return src;
});

// 3) CPF isolado da senha tambem delega ao fluxo central.
edit('server/routers/customerPassword.ts', (src) => {
  src = rx(src,
    /  saveCpf: publicProcedure[\s\S]*?\n\n  \/\/ â[^\n]*Cliente cria senha/,
    `  saveCpf: publicProcedure\n    .input(z.object({ phone: z.string(), cpf: z.string().min(1) }))\n    .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),\n\n  // Cliente cria senha`,
    'disable password saveCpf');
  return src;
});

// 4) ADM: telefone somente leitura; demais campos podem inclusive ser limpos.
edit('client/src/pages/AdminCustomers.tsx', (src) => {
  src = one(src,
    '  email: string | null;\n  city: string | null;',
    '  email: string | null;\n  cep?: string | null;\n  street?: string | null;\n  addressNumber?: string | null;\n  neighborhood?: string | null;\n  addressComplement?: string | null;\n  city: string | null;',
    'admin customer address type');
  src = one(src,
    '  const [editPhone, setEditPhone] = useState("");\n  const [editCity, setEditCity] = useState("");',
    '  const [editPhone, setEditPhone] = useState("");\n  const [editCep, setEditCep] = useState("");\n  const [editStreet, setEditStreet] = useState("");\n  const [editAddressNumber, setEditAddressNumber] = useState("");\n  const [editNeighborhood, setEditNeighborhood] = useState("");\n  const [editAddressComplement, setEditAddressComplement] = useState("");\n  const [editProfilePhotoUrl, setEditProfilePhotoUrl] = useState("");\n  const [editCity, setEditCity] = useState("");',
    'admin edit address states');
  src = one(src,
    "      phone: String(c.phone || '').replace(/\\D/g, ''),\n      city: String(c.city || '').trim(),",
    "      phone: String(c.phone || '').replace(/\\D/g, ''),\n      cep: String(c.cep || '').trim(),\n      street: String(c.street || '').trim(),\n      addressNumber: String(c.addressNumber || '').trim(),\n      neighborhood: String(c.neighborhood || '').trim(),\n      addressComplement: String(c.addressComplement || '').trim(),\n      profilePhotoUrl: String(c.profilePhotoUrl || '').trim(),\n      city: String(c.city || '').trim(),",
    'admin original address');
  src = one(src,
    '    setEditPhone(c.phone || "");\n    setEditCity(c.city || "");',
    '    setEditPhone(c.phone || "");\n    setEditCep(c.cep || "");\n    setEditStreet(c.street || "");\n    setEditAddressNumber(c.addressNumber || "");\n    setEditNeighborhood(c.neighborhood || "");\n    setEditAddressComplement(c.addressComplement || "");\n    setEditProfilePhotoUrl(c.profilePhotoUrl || "");\n    setEditCity(c.city || "");',
    'admin start edit address');
  src = rx(src,
    /    const phoneDigits = editPhone\.replace\(\/\\D\/g, ""\);\n    if \(phoneDigits && phoneDigits\.length < 10\) \{[\s\S]*?\n    \}\n/,
    '',
    'admin remove phone validation');
  src = one(src,
    "    const city = editCity.trim();",
    "    const cep = editCep.trim();\n    const street = editStreet.trim();\n    const addressNumber = editAddressNumber.trim();\n    const neighborhood = editNeighborhood.trim();\n    const addressComplement = editAddressComplement.trim();\n    const profilePhotoUrl = editProfilePhotoUrl.trim();\n    const city = editCity.trim();",
    'admin payload address vars');
  src = one(src,
    "    if (name && changed('name', name)) payload.name = name;\n    if (phoneDigits && changed('phone', phoneDigits)) payload.phone = phoneDigits;\n    if (email && changed('email', email)) payload.email = email;\n    if (city && changed('city', city)) payload.city = city;\n    if (uf && changed('uf', uf)) payload.uf = uf;\n    if (referredBy && changed('referredBy', referredBy)) payload.referredBy = referredBy;\n    if (referredByPhone && changed('referredByPhone', referredByPhone)) payload.referredByPhone = referredByPhone;\n    if (cpf && changed('cpf', cpf)) payload.cpf = cpf;\n    if (customerNumber && changed('customerNumber', customerNumber)) payload.customerNumber = parsedCustomerNumber;",
    "    if (changed('name', name)) payload.name = name;\n    if (changed('email', email)) payload.email = email;\n    if (changed('cep', cep)) payload.cep = cep;\n    if (changed('street', street)) payload.street = street;\n    if (changed('addressNumber', addressNumber)) payload.addressNumber = addressNumber;\n    if (changed('neighborhood', neighborhood)) payload.neighborhood = neighborhood;\n    if (changed('addressComplement', addressComplement)) payload.addressComplement = addressComplement;\n    if (changed('profilePhotoUrl', profilePhotoUrl)) payload.profilePhotoUrl = profilePhotoUrl;\n    if (changed('city', city)) payload.city = city;\n    if (changed('uf', uf)) payload.uf = uf;\n    if (changed('referredBy', referredBy)) payload.referredBy = referredBy;\n    if (changed('referredByPhone', referredByPhone)) payload.referredByPhone = referredByPhone;\n    if (changed('cpf', cpf)) payload.cpf = cpf;\n    if (changed('customerNumber', customerNumber)) payload.customerNumber = parsedCustomerNumber;",
    'admin payload fixed phone blank fields');
  src = one(src,
    '<input type="tel" value={editPhone} onChange={(e) => setEditPhone(formatPhoneInput(e.target.value))} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="(11) 99999-9999" />',
    '<input type="tel" value={editPhone} readOnly disabled title="Telefone é a identidade fixa do cliente e não pode ser alterado" className="w-full px-2 py-1.5 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground mt-0.5 cursor-not-allowed" />',
    'admin readonly phone input');
  src = one(src,
    '                  <div className="grid grid-cols-2 gap-2">\n                    <div>\n                      <label className="text-xs text-muted-foreground">Cidade</label>',
    `                  <div className="grid grid-cols-2 gap-2">\n                    <div><label className="text-xs text-muted-foreground">CEP</label><input type="text" value={editCep} onChange={(e) => setEditCep(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                    <div><label className="text-xs text-muted-foreground">Número</label><input type="text" value={editAddressNumber} onChange={(e) => setEditAddressNumber(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                  </div>\n                  <div><label className="text-xs text-muted-foreground">Rua / Logradouro</label><input type="text" value={editStreet} onChange={(e) => setEditStreet(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                  <div><label className="text-xs text-muted-foreground">Bairro</label><input type="text" value={editNeighborhood} onChange={(e) => setEditNeighborhood(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                  <div><label className="text-xs text-muted-foreground">Complemento</label><input type="text" value={editAddressComplement} onChange={(e) => setEditAddressComplement(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                  <div><label className="text-xs text-muted-foreground">URL da foto de perfil</label><input type="text" value={editProfilePhotoUrl} onChange={(e) => setEditProfilePhotoUrl(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" placeholder="Pode deixar vazio para exigir nova foto" /></div>\n                  <div className="grid grid-cols-2 gap-2">\n                    <div>\n                      <label className="text-xs text-muted-foreground">Cidade</label>`,
    'admin address inputs');
  return src;
});

console.log('Profile production port applied safely.');
