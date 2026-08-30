from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: esperado 1 match, encontrado {count}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))


def replace_all(path, old, new, minimum=1):
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f'{path}: esperado >= {minimum} matches, encontrado {count}: {old[:120]!r}')
    write(path, text.replace(old, new))
    return count


def regex_once(path, pattern, repl, flags=0):
    text = read(path)
    new, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: regex esperado 1 match, encontrado {count}: {pattern[:120]!r}')
    write(path, new)


# 1) Banco / schema
replace_once(
    'drizzle/schema.ts',
    '    cpf: varchar("cpf", { length: 14 }),\n    city: varchar("city", { length: 100 }),\n    uf: varchar("uf", { length: 2 }),',
    '    cpf: varchar("cpf", { length: 14 }),\n    cep: varchar("cep", { length: 9 }),\n    street: varchar("street", { length: 255 }),\n    addressNumber: varchar("addressNumber", { length: 30 }),\n    neighborhood: varchar("neighborhood", { length: 150 }),\n    addressComplement: varchar("addressComplement", { length: 255 }),\n    city: varchar("city", { length: 100 }),\n    uf: varchar("uf", { length: 2 }),'
)

migration = '''import { createConnection } from 'mysql2/promise';

const COLUMNS: Array<[string, string]> = [
  ['cep', 'VARCHAR(9) NULL'],
  ['street', 'VARCHAR(255) NULL'],
  ['addressNumber', 'VARCHAR(30) NULL'],
  ['neighborhood', 'VARCHAR(150) NULL'],
  ['addressComplement', 'VARCHAR(255) NULL'],
];

async function hasColumn(connection: Awaited<ReturnType<typeof createConnection>>, column: string) {
  const [rows] = await connection.query('SHOW COLUMNS FROM `customers` LIKE ?', [column]) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    console.log('[customer-address-migrate] DATABASE_URL não configurada, pulando migration.');
    return;
  }
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    for (const [column, definition] of COLUMNS) {
      if (await hasColumn(connection, column)) continue;
      await connection.query(`ALTER TABLE \\`customers\\` ADD COLUMN \\`${column}\\` ${definition}`);
      console.log(`[customer-address-migrate] Coluna adicionada: customers.${column}`);
    }
    console.log('[customer-address-migrate] Endereço completo verificado com sucesso.');
  } catch (error) {
    console.error('[customer-address-migrate] Falha:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

void run();
'''
write('scripts/apply-customer-address-migration.ts', migration)

replace_once(
    'scripts/render-start.sh',
    'run_boot_step "db-migrate-option-card-appearance" pnpm run db:migrate:option-card-appearance\n',
    'run_boot_step "db-migrate-option-card-appearance" pnpm run db:migrate:option-card-appearance\nrun_boot_step "db-migrate-customer-address" pnpm exec tsx scripts/apply-customer-address-migration.ts\n'
)

# 2) Política central de atualização obrigatória
replace_once(
    'shared/customerProfileUpdate.ts',
    '  "email",\n  "city",\n  "uf",',
    '  "email",\n  "cep",\n  "street",\n  "addressNumber",\n  "neighborhood",\n  "city",\n  "uf",'
)
replace_once(
    'shared/customerProfileUpdate.ts',
    '  { id: "email", label: "E-mail" },\n  { id: "city", label: "Cidade" },',
    '  { id: "email", label: "E-mail" },\n  { id: "cep", label: "CEP" },\n  { id: "street", label: "Rua / Logradouro" },\n  { id: "addressNumber", label: "Número" },\n  { id: "neighborhood", label: "Bairro" },\n  { id: "city", label: "Cidade" },'
)
replace_once(
    'server/customerProfileUpdatePolicy.ts',
    '    case "email": return !!normalizeCustomerEmail(customer?.email);\n    case "city": return String(customer?.city || "").trim().length >= 2;',
    '    case "email": return !!normalizeCustomerEmail(customer?.email);\n    case "cep": return String(customer?.cep || "").replace(/\\D/g, "").length === 8;\n    case "street": return String(customer?.street || "").trim().length >= 2;\n    case "addressNumber": return String(customer?.addressNumber || "").trim().length >= 1;\n    case "neighborhood": return String(customer?.neighborhood || "").trim().length >= 2;\n    case "city": return String(customer?.city || "").trim().length >= 2;'
)

# 3) Backend de atualização cadastral
p = 'server/routers/customerUpdate.ts'
replace_once(p,
    '  if (!normalizeCustomerCpf(customer?.cpf) || !isValidCPF(normalizeCustomerCpf(customer?.cpf))) missing.push("cpf");\n  if (String(customer?.city || "").trim().length < 2) missing.push("city");',
    '  if (!normalizeCustomerCpf(customer?.cpf) || !isValidCPF(normalizeCustomerCpf(customer?.cpf))) missing.push("cpf");\n  if (String(customer?.cep || "").replace(/\\D/g, "").length !== 8) missing.push("cep");\n  if (String(customer?.street || "").trim().length < 2) missing.push("street");\n  if (String(customer?.addressNumber || "").trim().length < 1) missing.push("addressNumber");\n  if (String(customer?.neighborhood || "").trim().length < 2) missing.push("neighborhood");\n  if (String(customer?.city || "").trim().length < 2) missing.push("city");'
)
replace_once(p,
    '        cpf: normalizeCustomerCpf(customer.cpf),\n        city: String(customer.city || "").trim(),',
    '        cpf: normalizeCustomerCpf(customer.cpf),\n        cep: String(customer.cep || "").trim(),\n        street: String(customer.street || "").trim(),\n        addressNumber: String(customer.addressNumber || "").trim(),\n        neighborhood: String(customer.neighborhood || "").trim(),\n        addressComplement: String(customer.addressComplement || "").trim(),\n        city: String(customer.city || "").trim(),'
)
replace_once(p,
    '      cpf: z.string().max(18).optional(),\n      city: z.string().trim().max(128).optional(),',
    '      cpf: z.string().max(18).optional(),\n      cep: z.string().trim().max(9).optional(),\n      street: z.string().trim().max(255).optional(),\n      addressNumber: z.string().trim().max(30).optional(),\n      neighborhood: z.string().trim().max(150).optional(),\n      addressComplement: z.string().trim().max(255).optional(),\n      city: z.string().trim().max(128).optional(),'
)
replace_once(p,
    '      const selected = new Set([...missingFields(customer), ...policyState.effectiveFields]);',
    '      const selected = new Set([...missingFields(customer), ...policyState.effectiveFields, "cep", "street", "addressNumber", "neighborhood", "city", "uf"]);'
)
replace_once(p,
    '      const cpf = selected.has("cpf") ? normalizeCustomerCpf(input.cpf || "") : normalizeCustomerCpf(customer.cpf);\n      const city = selected.has("city") ? String(input.city || "").trim().replace(/\\s+/g, " ") : String(customer.city || "").trim();',
    '      const cpf = selected.has("cpf") ? normalizeCustomerCpf(input.cpf || "") : normalizeCustomerCpf(customer.cpf);\n      const cep = String(input.cep || customer.cep || "").replace(/\\D/g, "").slice(0, 8);\n      const street = String(input.street || customer.street || "").trim().replace(/\\s+/g, " ");\n      const addressNumber = String(input.addressNumber || customer.addressNumber || "").trim().replace(/\\s+/g, " ");\n      const neighborhood = String(input.neighborhood || customer.neighborhood || "").trim().replace(/\\s+/g, " ");\n      const addressComplement = String(input.addressComplement ?? customer.addressComplement ?? "").trim().replace(/\\s+/g, " ");\n      const city = selected.has("city") ? String(input.city || "").trim().replace(/\\s+/g, " ") : String(customer.city || "").trim();'
)
replace_once(p,
    '      if (selected.has("cpf") && (!cpf || !isValidCPF(cpf))) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });\n      if (selected.has("city") && city.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe sua cidade." });',
    '      if (selected.has("cpf") && (!cpf || !isValidCPF(cpf))) throw new TRPCError({ code: "BAD_REQUEST", message: "CPF inválido." });\n      if (cep.length !== 8) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe um CEP válido." });\n      if (street.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a rua / logradouro." });\n      if (!addressNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o número do endereço." });\n      if (neighborhood.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o bairro." });\n      if (selected.has("city") && city.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe sua cidade." });'
)
replace_once(p,
    '          name=${name}, phone=${phone}, email=${email}, cpf=${cpf}, city=${city}, uf=${uf},',
    '          name=${name}, phone=${phone}, email=${email}, cpf=${cpf}, cep=${cep}, street=${street}, addressNumber=${addressNumber}, neighborhood=${neighborhood}, addressComplement=${addressComplement || null}, city=${city}, uf=${uf},'
)

# 4) Tela /atualizarcadastro
p = 'client/src/pages/AtualizarCadastro.tsx'
replace_once(p,
    'function formatCpf(value: string) {',
    'function formatCep(value: string) {\n  const digits = value.replace(/\\D/g, "").slice(0, 8);\n  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;\n}\n\nfunction formatCpf(value: string) {'
)
replace_once(p,
    '  const [cpf, setCpf] = useState("");\n  const [city, setCity] = useState("");',
    '  const [cpf, setCpf] = useState("");\n  const [cep, setCep] = useState("");\n  const [street, setStreet] = useState("");\n  const [addressNumber, setAddressNumber] = useState("");\n  const [neighborhood, setNeighborhood] = useState("");\n  const [addressComplement, setAddressComplement] = useState("");\n  const [cepLoading, setCepLoading] = useState(false);\n  const [city, setCity] = useState("");'
)
replace_once(p,
    '    setCpf(formatCpf(profile.cpf || ""));\n    setCity(profile.city || "");',
    '    setCpf(formatCpf(profile.cpf || ""));\n    setCep(formatCep(profile.cep || ""));\n    setStreet(profile.street || "");\n    setAddressNumber(profile.addressNumber || "");\n    setNeighborhood(profile.neighborhood || "");\n    setAddressComplement(profile.addressComplement || "");\n    setCity(profile.city || "");'
)
replace_once(p,
    '  async function saveProfile(event: FormEvent) {',
    '  async function lookupCep(value: string) {\n    const digits = value.replace(/\\D/g, "");\n    if (digits.length !== 8) return;\n    setCepLoading(true);\n    try {\n      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);\n      const data = await response.json();\n      if (data.erro) return toast.error("CEP não encontrado. Preencha o endereço manualmente.");\n      if (data.logradouro) setStreet(data.logradouro);\n      if (data.bairro) setNeighborhood(data.bairro);\n      if (data.localidade) setCity(data.localidade);\n      if (data.uf) setUf(String(data.uf).toUpperCase());\n    } catch {\n      toast.error("Não foi possível consultar o CEP. Preencha manualmente.");\n    } finally {\n      setCepLoading(false);\n    }\n  }\n\n  async function saveProfile(event: FormEvent) {'
)
replace_once(p,
    '    if (isRequired("cpf") && !isValidCPF(normalizeCpf(cpf))) return toast.error("Digite um CPF válido.");\n    if (!photoUrl) return toast.error("Envie sua foto de perfil.");',
    '    if (isRequired("cpf") && !isValidCPF(normalizeCpf(cpf))) return toast.error("Digite um CPF válido.");\n    if (cep.replace(/\\D/g, "").length !== 8) return toast.error("Digite um CEP válido.");\n    if (street.trim().length < 2) return toast.error("Informe a rua / logradouro.");\n    if (!addressNumber.trim()) return toast.error("Informe o número do endereço.");\n    if (neighborhood.trim().length < 2) return toast.error("Informe o bairro.");\n    if (city.trim().length < 2 || uf.trim().length !== 2) return toast.error("Informe cidade e estado.");\n    if (!photoUrl) return toast.error("Envie sua foto de perfil.");'
)
replace_once(p,
    '      await saveMutation.mutateAsync({ token, phone: normalizePhone(phone), name, email, cpf, city, uf });',
    '      await saveMutation.mutateAsync({ token, phone: normalizePhone(phone), name, email, cpf, cep: formatCep(cep), street, addressNumber, neighborhood, addressComplement, city, uf });'
)
replace_once(p,
    '    cpf: "CPF",\n    city: "Cidade",',
    '    cpf: "CPF",\n    cep: "CEP",\n    street: "Rua / Logradouro",\n    addressNumber: "Número",\n    neighborhood: "Bairro",\n    city: "Cidade",'
)
address_fields = '''              <Field label="CEP · obrigatório"><input value={cep} onChange={(e) => { const next = formatCep(e.target.value); setCep(next); if (next.replace(/\\D/g, "").length === 8) void lookupCep(next); }} onBlur={(e) => void lookupCep(e.target.value)} className={INPUT_CLASS} required inputMode="numeric" placeholder="00000-000" />{cepLoading && <span className="mt-1 block text-xs text-violet-300">Buscando CEP...</span>}</Field>\n              <Field label="Rua / Logradouro · obrigatório"><input value={street} onChange={(e) => setStreet(e.target.value)} className={INPUT_CLASS} required placeholder="Rua, Avenida..." /></Field>\n              <div className="grid grid-cols-[120px_1fr] gap-3"><Field label="Número · obrigatório"><input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} className={INPUT_CLASS} required placeholder="123 ou S/N" /></Field><Field label="Bairro · obrigatório"><input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={INPUT_CLASS} required /></Field></div>\n              <Field label="Complemento · opcional"><input value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} className={INPUT_CLASS} placeholder="Apto, bloco, fundos..." /></Field>\n'''
replace_once(p,
    '              <div className="grid grid-cols-[1fr_92px] gap-3"><Field label={`Cidade${isRequired("city") ? " · obrigatório nesta revisão" : ""}`}',
    address_fields + '              <div className="grid grid-cols-[1fr_92px] gap-3"><Field label={`Cidade${isRequired("city") ? " · obrigatório nesta revisão" : ""}`}'
)

# 5) Cadastro novo - estados, ViaCEP, payload, campos obrigatórios
p = 'client/src/components/PasswordGate.tsx'
replace_once(p,
    '  const [regCep, setRegCep] = useState("");\n  const [cepLoading, setCepLoading] = useState(false);\n  const [regCity, setRegCity] = useState("");',
    '  const [regCep, setRegCep] = useState("");\n  const [regStreet, setRegStreet] = useState("");\n  const [regAddressNumber, setRegAddressNumber] = useState("");\n  const [regNeighborhood, setRegNeighborhood] = useState("");\n  const [regAddressComplement, setRegAddressComplement] = useState("");\n  const [cepLoading, setCepLoading] = useState(false);\n  const [regCity, setRegCity] = useState("");'
)
replace_once(p,
    "        const uf = data.uf?.toUpperCase() || '';\n        const cidade = data.localidade || '';",
    "        const uf = data.uf?.toUpperCase() || '';\n        const cidade = data.localidade || '';\n        if (data.logradouro) setRegStreet(String(data.logradouro));\n        if (data.bairro) setRegNeighborhood(String(data.bairro));"
)
replace_once(p,
    '        cpf: regCpf.trim(),\n        city: regCity.trim(),',
    '        cpf: regCpf.trim(),\n        cep: regCep.trim(),\n        street: regStreet.trim(),\n        addressNumber: regAddressNumber.trim(),\n        neighborhood: regNeighborhood.trim(),\n        addressComplement: regAddressComplement.trim() || undefined,\n        city: regCity.trim(),'
)
replace_once(p,
    '<label className="text-white mb-2 block text-sm font-medium">CEP <span className="text-gray-400 font-normal text-xs">(opcional — preenche Estado e Cidade)</span></label>',
    '<label className="text-white mb-2 block text-sm font-medium">CEP <span className="text-red-400">*</span> <span className="text-gray-400 font-normal text-xs">(preenche endereço automaticamente)</span></label>'
)
# Torna o input de CEP obrigatório sem afetar outros inputs
replace_once(p,
    '<input type="text" inputMode="numeric" placeholder="00000-000" value={regCep}',
    '<input type="text" inputMode="numeric" placeholder="00000-000" value={regCep} required'
)
new_registration_fields = '''\n                {/* Endereço completo */}\n                <div>\n                  <label className="text-white mb-2 block text-sm font-medium">Rua / Logradouro <span className="text-red-400">*</span></label>\n                  <input type="text" value={regStreet} onChange={(e) => setRegStreet(e.target.value)} required placeholder="Rua, Avenida..." className="w-full px-4 py-4 bg-white text-black text-lg font-medium rounded-xl border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-all" />\n                </div>\n                <div className="grid grid-cols-[120px_1fr] gap-3">\n                  <div><label className="text-white mb-2 block text-sm font-medium">Número <span className="text-red-400">*</span></label><input type="text" value={regAddressNumber} onChange={(e) => setRegAddressNumber(e.target.value)} required placeholder="123 ou S/N" className="w-full px-3 py-4 bg-white text-black text-lg font-medium rounded-xl border-2 border-black focus:border-primary outline-none" /></div>\n                  <div><label className="text-white mb-2 block text-sm font-medium">Bairro <span className="text-red-400">*</span></label><input type="text" value={regNeighborhood} onChange={(e) => setRegNeighborhood(e.target.value)} required className="w-full px-3 py-4 bg-white text-black text-lg font-medium rounded-xl border-2 border-black focus:border-primary outline-none" /></div>\n                </div>\n                <div><label className="text-white mb-2 block text-sm font-medium">Complemento <span className="text-gray-400 font-normal text-xs">(opcional)</span></label><input type="text" value={regAddressComplement} onChange={(e) => setRegAddressComplement(e.target.value)} placeholder="Apto, bloco, fundos..." className="w-full px-4 py-4 bg-white text-black text-lg font-medium rounded-xl border-2 border-black focus:border-primary outline-none" /></div>\n'''
replace_once(p,
    '                {/* Estado com autocomplete */}',
    new_registration_fields + '\n                {/* Estado com autocomplete */}'
)
# Estado/cidade já eram obrigatórios; validação explícita antes do cadastro
replace_once(p,
    '      const result = await registerMutation.mutateAsync({',
    '      if (regCep.replace(/\\D/g, "").length !== 8 || regStreet.trim().length < 2 || !regAddressNumber.trim() || regNeighborhood.trim().length < 2 || regCity.trim().length < 2 || regUf.trim().length !== 2) {\n        toast.error("Preencha o endereço completo: CEP, rua, número, bairro, cidade e estado.");\n        return;\n      }\n      const result = await registerMutation.mutateAsync({'
)

# 6) Backend principal: cadastro + pedidos ADM
p = 'server/routers.ts'
# Input do cadastro (escopo pelo primeiro bloco que contém cpf/city/uf no register)
text = read(p)
needle = '        cpf: z.string().min(11).max(14),\n        city: z.string().max(100).optional(),\n        uf: z.string().max(2).optional(),'
if needle not in text:
    needle = '        cpf: z.string().min(11).max(14),\n        city: z.string().optional(),\n        uf: z.string().optional(),'
if needle not in text:
    raise RuntimeError('server/routers.ts: bloco de input do cadastro não encontrado')
text = text.replace(needle,
    '        cpf: z.string().min(11).max(14),\n        cep: z.string().trim().min(8).max(9),\n        street: z.string().trim().min(2).max(255),\n        addressNumber: z.string().trim().min(1).max(30),\n        neighborhood: z.string().trim().min(2).max(150),\n        addressComplement: z.string().trim().max(255).optional(),\n        city: z.string().trim().min(2).max(100),\n        uf: z.string().trim().length(2),', 1)
write(p, text)
# Criação do cliente
text = read(p)
old = '          cpf: input.cpf.trim(),\n          city: input.city?.trim() || undefined,\n          uf: input.uf?.trim().toUpperCase() || undefined,'
if old not in text:
    old = '          cpf: input.cpf.trim(),\n          city: input.city?.trim(),\n          uf: input.uf?.trim().toUpperCase(),'
if old not in text:
    raise RuntimeError('server/routers.ts: criação de cliente não encontrada')
new = '          cpf: input.cpf.trim(),\n          cep: input.cep.replace(/\\D/g, "").replace(/^(\\d{5})(\\d{3})$/, "$1-$2"),\n          street: input.street.trim(),\n          addressNumber: input.addressNumber.trim(),\n          neighborhood: input.neighborhood.trim(),\n          addressComplement: input.addressComplement?.trim() || undefined,\n          city: input.city.trim(),\n          uf: input.uf.trim().toUpperCase(),'
write(p, text.replace(old, new, 1))
# Campos de endereço nas duas consultas principais de pedidos
replace_all(p,
    '          c.city as customerCity,\n          c.uf as customerUf,',
    '          c.cep as customerCep,\n          c.street as customerStreet,\n          c.addressNumber as customerAddressNumber,\n          c.neighborhood as customerNeighborhood,\n          c.addressComplement as customerAddressComplement,\n          c.city as customerCity,\n          c.uf as customerUf,',
    minimum=1
)
replace_all(p,
    '            c.city AS customerCity,\n            c.uf AS customerUf,',
    '            c.cep AS customerCep,\n            c.street AS customerStreet,\n            c.addressNumber AS customerAddressNumber,\n            c.neighborhood AS customerNeighborhood,\n            c.addressComplement AS customerAddressComplement,\n            c.city AS customerCity,\n            c.uf AS customerUf,',
    minimum=1
)
# Mapeamentos dos rows de pedido
replace_all(p,
    '            customerCity: row.customerCity,\n            customerUf: row.customerUf,',
    '            customerCep: row.customerCep,\n            customerStreet: row.customerStreet,\n            customerAddressNumber: row.customerAddressNumber,\n            customerNeighborhood: row.customerNeighborhood,\n            customerAddressComplement: row.customerAddressComplement,\n            customerCity: row.customerCity,\n            customerUf: row.customerUf,',
    minimum=1
)

# 7) ADM clientes: mostrar endereço completo; SELECT c.* já traz as novas colunas
p = 'client/src/pages/AdminCustomers.tsx'
address_admin = '''\n                  {((c as any).street || (c as any).addressNumber || (c as any).neighborhood || (c as any).cep) && (\n                    <div className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2 text-[11px] leading-5 text-slate-300">\n                      <p className="font-bold text-cyan-200">📍 Endereço</p>\n                      <p>{[(c as any).street, (c as any).addressNumber].filter(Boolean).join(", ")}</p>\n                      <p>{[(c as any).neighborhood, c.city, c.uf].filter(Boolean).join(" · ")}</p>\n                      {(c as any).addressComplement && <p>Complemento: {(c as any).addressComplement}</p>}\n                      {(c as any).cep && <p>CEP: {(c as any).cep}</p>}\n                    </div>\n                  )}\n'''
marker = '                  <p className="text-xs flex items-center gap-1.5" style={{ color: c.referredBy === \'Não informou\''
text = read(p)
if marker not in text:
    raise RuntimeError('AdminCustomers: marcador após localização não encontrado')
text = text.replace(marker, address_admin + marker, 1)
write(p, text)

# 8) ADM pedidos: tipagem + exibição do endereço completo no card
p = 'client/src/pages/AdminOrders.tsx'
replace_once(p,
    '  customerName: string | null;\n  customerCity: string | null;',
    '  customerName: string | null;\n  customerCep: string | null;\n  customerStreet: string | null;\n  customerAddressNumber: string | null;\n  customerNeighborhood: string | null;\n  customerAddressComplement: string | null;\n  customerCity: string | null;'
)
old_display = '''                        {(order.customerCity || order.customerUf) && (\n                          <p className="text-xs text-muted-foreground">\n                            {[order.customerCity, order.customerUf].filter(Boolean).join(" - ")}\n                          </p>\n                        )}'''
new_display = '''                        {(order.customerStreet || order.customerAddressNumber || order.customerNeighborhood || order.customerCep || order.customerCity || order.customerUf) && (\n                          <div className="mt-1 text-xs text-muted-foreground">\n                            {(order.customerStreet || order.customerAddressNumber) && <p>{[order.customerStreet, order.customerAddressNumber].filter(Boolean).join(", ")}</p>}\n                            {(order.customerNeighborhood || order.customerCity || order.customerUf) && <p>{[order.customerNeighborhood, order.customerCity, order.customerUf].filter(Boolean).join(" · ")}</p>}\n                            {order.customerAddressComplement && <p>Complemento: {order.customerAddressComplement}</p>}\n                            {order.customerCep && <p>CEP: {order.customerCep}</p>}\n                          </div>\n                        )}'''
replace_once(p, old_display, new_display)

# Garantia de escopo: nunca tocar nos arquivos proibidos.
for forbidden in [
    'client/src/components/StorefrontProductCard.tsx',
    'client/src/components/ui/tabs.tsx',
    'client/src/pages/Gastos.tsx',
]:
    if not (ROOT / forbidden).exists():
        continue

print('PATCH_ENDERECO_COMPLETO_OK')
