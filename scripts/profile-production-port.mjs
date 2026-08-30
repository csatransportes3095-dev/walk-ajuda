import fs from 'node:fs';

function patchFile(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch nao alterou o arquivo`);
  fs.writeFileSync(path, after);
}
function replaceOne(src, search, replacement, label) {
  if (!src.includes(search)) throw new Error(`${label}: trecho nao encontrado`);
  return src.replace(search, replacement);
}
function replaceRx(src, regex, replacement, label) {
  if (!regex.test(src)) throw new Error(`${label}: trecho nao encontrado`);
  regex.lastIndex = 0;
  return src.replace(regex, replacement);
}

patchFile('server/routers/customerUpdate.ts', (src) => {
  src = replaceOne(src, '      phone: z.string().min(10).max(32).optional(),\n', '', 'central schema phone');
  src = replaceOne(src,
    '      const phone = selected.has("phone") ? normalizeCustomerPhone(input.phone || "") : normalizeCustomerPhone(customer.phone);',
    '      const phone = normalizeCustomerPhone(customer.phone);',
    'central fixed phone');
  src = src.replace('      if (selected.has("phone") && (!phone || phone.length < 10 || phone.length > 11)) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido." });\n', '');
  src = replaceRx(src,
    /      const phoneConflict = await findMainCustomerByIdentity\(\{ phone \}, db\);[\s\S]*?      const cpfConflict =/,
    '      const cpfConflict =',
    'central phone conflict');
  src = replaceOne(src,
    '          name=${name}, phone=${phone}, email=${email}, cpf=${cpf}, cep=${cep}, street=${street}, addressNumber=${addressNumber}, neighborhood=${neighborhood}, addressComplement=${addressComplement || null}, city=${city}, uf=${uf},\n          normalizedPhone=${phone},\n          normalizedCpf=${cpf}, normalizedEmail=${email}, updatedAt=NOW()',
    '          name=${name}, email=${email}, cpf=${cpf}, cep=${cep}, street=${street}, addressNumber=${addressNumber}, neighborhood=${neighborhood}, addressComplement=${addressComplement || null}, city=${city}, uf=${uf},\n          normalizedCpf=${cpf}, normalizedEmail=${email}, updatedAt=NOW()',
    'central SQL fixed phone');
  src = replaceRx(src,
    /      const previousIdentity = \{ phone: customer\.phone, cpf: customer\.cpf \};\n      const oldPhone = normalizeCustomerPhone\(customer\.phone\);[\s\S]*?\n      const synchronization = await syncUnifiedCustomerRegistry/,
    '      const previousIdentity = { phone: customer.phone, cpf: customer.cpf };\n      const synchronization = await syncUnifiedCustomerRegistry',
    'central remove phone propagation');
  return src;
});

patchFile('server/routers.ts', (src) => {
  src = replaceRx(src,
    /    updateEmailByPhone: publicProcedure[\s\S]*?\n\n    updateCpfByPhone:/,
    `    updateEmailByPhone: publicProcedure\n      .input(z.object({ phone: z.string().min(1), email: z.string() }))\n      .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),\n\n    updateCpfByPhone:`,
    'disable legacy email');
  src = replaceRx(src,
    /    updateCpfByPhone: publicProcedure[\s\S]*?\n\n    \/\/ Completar o perfil/,
    `    updateCpfByPhone: publicProcedure\n      .input(z.object({ phone: z.string().min(1), cpf: z.string().min(1) }))\n      .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),\n\n    // Completar o perfil`,
    'disable legacy cpf');
  src = replaceRx(src,
    /    completeProfile: publicProcedure[\s\S]*?\n\n    register: publicProcedure/,
    `    completeProfile: publicProcedure\n      .input(z.object({ lookupIdentifier: z.string().min(1) }).passthrough())\n      .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),\n\n    register: publicProcedure`,
    'disable legacy completeProfile');

  src = replaceRx(src,
    /    update: adminProcedure\n      \.input\(z\.object\(\{\n        id: z\.number\(\),\n        name: z\.string\(\)\.optional\(\),\n        phone: z\.string\(\)\.regex\(\/\^\\d\{10,11\}\$\/\)\.optional\(\),\n        email: z\.string\(\)\.email\(\)\.optional\(\),\n        city: z\.string\(\)\.optional\(\),\n        uf: z\.string\(\)\.length\(2\)\.optional\(\),\n        referredBy: z\.string\(\)\.optional\(\),\n        referredByPhone: z\.string\(\)\.optional\(\),\n        profilePhotoUrl: z\.string\(\)\.optional\(\),\n        customerNumber: z\.number\(\)\.int\(\)\.positive\(\)\.nullable\(\)\.optional\(\),\n        cpf: z\.string\(\)\.regex\(\/\^\\d\{11\}\$\/\)\.optional\(\),\n      \}\)\)/,
    `    update: adminProcedure\n      .input(z.object({\n        id: z.number(),\n        name: z.string().optional(),\n        email: z.string().optional(),\n        cep: z.string().optional(),\n        street: z.string().optional(),\n        addressNumber: z.string().optional(),\n        neighborhood: z.string().optional(),\n        addressComplement: z.string().optional(),\n        city: z.string().optional(),\n        uf: z.string().optional(),\n        referredBy: z.string().optional(),\n        referredByPhone: z.string().optional(),\n        profilePhotoUrl: z.string().optional(),\n        customerNumber: z.number().int().positive().nullable().optional(),\n        cpf: z.string().optional(),\n      }))`,
    'admin customer schema');
  src = replaceRx(src,
    /        const \{ id, \.\.\.rawData \} = input;\n        const data = \{\n          \.\.\.rawData,\n          phone: rawData\.phone\?\.replace\(\/\\D\/g, ''\) \|\| undefined,\n          cpf: rawData\.cpf\?\.replace\(\/\\D\/g, ''\) \|\| undefined,\n          referredByPhone: rawData\.referredByPhone\?\.replace\(\/\\D\/g, ''\) \|\| undefined,\n        \};/,
    `        const { id, ...rawData } = input;\n        const data = {\n          ...rawData,\n          cpf: rawData.cpf !== undefined ? rawData.cpf.replace(/\\D/g, '') : undefined,\n          referredByPhone: rawData.referredByPhone !== undefined ? rawData.referredByPhone.replace(/\\D/g, '') : undefined,\n        };`,
    'admin customer data');
  src = replaceRx(src,
    /        const oldPhone = String\(current\.phone \|\| ''\)\.replace\(\/\\D\/g, ''\);[\s\S]*?\n        \/\/ Primeiro grava o cadastro principal\./,
    `        const oldPhone = String(current.phone || '').replace(/\\D/g, '');\n\n        // Primeiro grava o cadastro principal.`,
    'admin phone identity prechange');
  src = replaceRx(src,
    /\n        if \(phoneChanged\) \{[\s\S]*?\n        \}\n        \/\/ Reúne novamente/,
    '\n        // Reúne novamente',
    'admin phone propagation');
  return src;
});

patchFile('server/routers/customerPassword.ts', (src) => {
  src = replaceRx(src,
    /  saveCpf: publicProcedure[\s\S]*?\n\n  \/\/[^\n]*\n\n  clientCreateAuto:/,
    `  saveCpf: publicProcedure\n    .input(z.object({ phone: z.string(), cpf: z.string().min(1) }))\n    .mutation(async () => ({ success: false, message: 'Cadastro incompleto. Use /atualizarcadastro para corrigir todos os dados obrigatórios juntos.' })),\n\n  // Cliente cria senha pelo fluxo normal; reparo de CPF fica centralizado.\n\n  clientCreateAuto:`,
    'disable password saveCpf');
  return src;
});

patchFile('client/src/pages/AdminCustomers.tsx', (src) => {
  src = replaceOne(src,
    '  email: string | null;\n  city: string | null;',
    '  email: string | null;\n  cep?: string | null;\n  street?: string | null;\n  addressNumber?: string | null;\n  neighborhood?: string | null;\n  addressComplement?: string | null;\n  city: string | null;',
    'admin type address');
  src = replaceOne(src,
    '  const [editPhone, setEditPhone] = useState("");\n  const [editCity, setEditCity] = useState("");',
    '  const [editPhone, setEditPhone] = useState("");\n  const [editCep, setEditCep] = useState("");\n  const [editStreet, setEditStreet] = useState("");\n  const [editAddressNumber, setEditAddressNumber] = useState("");\n  const [editNeighborhood, setEditNeighborhood] = useState("");\n  const [editAddressComplement, setEditAddressComplement] = useState("");\n  const [editProfilePhotoUrl, setEditProfilePhotoUrl] = useState("");\n  const [editCity, setEditCity] = useState("");',
    'admin states address');
  src = replaceOne(src,
    "      phone: String(c.phone || '').replace(/\\D/g, ''),\n      city: String(c.city || '').trim(),",
    "      phone: String(c.phone || '').replace(/\\D/g, ''),\n      cep: String(c.cep || '').trim(),\n      street: String(c.street || '').trim(),\n      addressNumber: String(c.addressNumber || '').trim(),\n      neighborhood: String(c.neighborhood || '').trim(),\n      addressComplement: String(c.addressComplement || '').trim(),\n      profilePhotoUrl: String(c.profilePhotoUrl || '').trim(),\n      city: String(c.city || '').trim(),",
    'admin original address');
  src = replaceOne(src,
    '    setEditPhone(c.phone || "");\n    setEditCity(c.city || "");',
    '    setEditPhone(c.phone || "");\n    setEditCep(c.cep || "");\n    setEditStreet(c.street || "");\n    setEditAddressNumber(c.addressNumber || "");\n    setEditNeighborhood(c.neighborhood || "");\n    setEditAddressComplement(c.addressComplement || "");\n    setEditProfilePhotoUrl(c.profilePhotoUrl || "");\n    setEditCity(c.city || "");',
    'admin start address');
  src = replaceRx(src,
    /    const phoneDigits = editPhone\.replace\(\/\\D\/g, ""\);\n    if \(phoneDigits && phoneDigits\.length < 10\) \{[\s\S]*?\n    \}\n/,
    '',
    'admin no phone validation');
  src = replaceOne(src,
    '    const city = editCity.trim();',
    '    const cep = editCep.trim();\n    const street = editStreet.trim();\n    const addressNumber = editAddressNumber.trim();\n    const neighborhood = editNeighborhood.trim();\n    const addressComplement = editAddressComplement.trim();\n    const profilePhotoUrl = editProfilePhotoUrl.trim();\n    const city = editCity.trim();',
    'admin address vars');
  src = replaceRx(src,
    /    if \(name && changed\('name', name\)\) payload\.name = name;[\s\S]*?    if \(customerNumber && changed\('customerNumber', customerNumber\)\) payload\.customerNumber = parsedCustomerNumber;/,
    `    if (changed('name', name)) payload.name = name;\n    if (changed('email', email)) payload.email = email;\n    if (changed('cep', cep)) payload.cep = cep;\n    if (changed('street', street)) payload.street = street;\n    if (changed('addressNumber', addressNumber)) payload.addressNumber = addressNumber;\n    if (changed('neighborhood', neighborhood)) payload.neighborhood = neighborhood;\n    if (changed('addressComplement', addressComplement)) payload.addressComplement = addressComplement;\n    if (changed('profilePhotoUrl', profilePhotoUrl)) payload.profilePhotoUrl = profilePhotoUrl;\n    if (changed('city', city)) payload.city = city;\n    if (changed('uf', uf)) payload.uf = uf;\n    if (changed('referredBy', referredBy)) payload.referredBy = referredBy;\n    if (changed('referredByPhone', referredByPhone)) payload.referredByPhone = referredByPhone;\n    if (changed('cpf', cpf)) payload.cpf = cpf;\n    if (changed('customerNumber', customerNumber)) payload.customerNumber = parsedCustomerNumber;`,
    'admin blank payload');
  src = replaceOne(src,
    '<input type="tel" value={editPhone} onChange={(e) => setEditPhone(formatPhoneInput(e.target.value))} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground mt-0.5 focus:outline-none focus:ring-1 focus:ring-primary/50" placeholder="(11) 99999-9999" />',
    '<input type="tel" value={editPhone} readOnly disabled title="Telefone é a identidade fixa do cliente e não pode ser alterado" className="w-full px-2 py-1.5 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground mt-0.5 cursor-not-allowed" />',
    'admin readonly phone');
  src = replaceOne(src,
    '                  <div className="grid grid-cols-2 gap-2">\n                    <div>\n                      <label className="text-xs text-muted-foreground">Cidade</label>',
    `                  <div className="grid grid-cols-2 gap-2">\n                    <div><label className="text-xs text-muted-foreground">CEP</label><input type="text" value={editCep} onChange={(e) => setEditCep(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                    <div><label className="text-xs text-muted-foreground">Número</label><input type="text" value={editAddressNumber} onChange={(e) => setEditAddressNumber(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                  </div>\n                  <div><label className="text-xs text-muted-foreground">Rua / Logradouro</label><input type="text" value={editStreet} onChange={(e) => setEditStreet(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                  <div><label className="text-xs text-muted-foreground">Bairro</label><input type="text" value={editNeighborhood} onChange={(e) => setEditNeighborhood(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                  <div><label className="text-xs text-muted-foreground">Complemento</label><input type="text" value={editAddressComplement} onChange={(e) => setEditAddressComplement(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" /></div>\n                  <div><label className="text-xs text-muted-foreground">URL da foto de perfil</label><input type="text" value={editProfilePhotoUrl} onChange={(e) => setEditProfilePhotoUrl(e.target.value)} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-sm mt-0.5" placeholder="Pode deixar vazio para exigir nova foto" /></div>\n                  <div className="grid grid-cols-2 gap-2">\n                    <div>\n                      <label className="text-xs text-muted-foreground">Cidade</label>`,
    'admin address form');
  return src;
});

console.log('Profile production port v2 applied.');
