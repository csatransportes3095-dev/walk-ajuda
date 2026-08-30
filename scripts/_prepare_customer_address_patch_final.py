from pathlib import Path

p = Path('scripts/_apply_customer_address_patch.py')
s = p.read_text(encoding='utf-8')

start = s.index('# 1) Banco / schema')
end = s.index("migration = '''", start)
schema_block = r'''# 1) Banco / schema
replace_once(
    'drizzle/schema.ts',
    '  email: varchar("email", { length: 320 }),\n  city: varchar("city", { length: 128 }),\n  uf: varchar("uf", { length: 2 }),\n  cpf: varchar("cpf", { length: 14 }),',
    '  email: varchar("email", { length: 320 }),\n  cep: varchar("cep", { length: 9 }),\n  street: varchar("street", { length: 255 }),\n  addressNumber: varchar("addressNumber", { length: 30 }),\n  neighborhood: varchar("neighborhood", { length: 150 }),\n  addressComplement: varchar("addressComplement", { length: 255 }),\n  city: varchar("city", { length: 128 }),\n  uf: varchar("uf", { length: 2 }),\n  cpf: varchar("cpf", { length: 14 }),'
)

'''
s = s[:start] + schema_block + s[end:]

start = s.index('# 2) Política central de atualização obrigatória')
end = s.index('# 3) Backend de atualização cadastral', start)
policy_block = r'''# 2) Política central de atualização obrigatória
replace_once(
    'shared/customerProfileUpdate.ts',
    '  { id: "email", label: "E-mail" },\n  { id: "city", label: "Cidade" },',
    '  { id: "email", label: "E-mail" },\n  { id: "cep", label: "CEP" },\n  { id: "street", label: "Rua / Logradouro" },\n  { id: "addressNumber", label: "Número" },\n  { id: "neighborhood", label: "Bairro" },\n  { id: "city", label: "Cidade" },'
)
replace_once(
    'shared/customerProfileUpdate.ts',
    '    case "email":\n      return !/^\\S+@\\S+\\.\\S+$/.test(String(customer?.email || "").trim());\n    case "city":',
    '    case "email":\n      return !/^\\S+@\\S+\\.\\S+$/.test(String(customer?.email || "").trim());\n    case "cep":\n      return String(customer?.cep || "").replace(/\\D/g, "").length !== 8;\n    case "street":\n      return String(customer?.street || "").trim().length < 2;\n    case "addressNumber":\n      return String(customer?.addressNumber || "").trim().length < 1;\n    case "neighborhood":\n      return String(customer?.neighborhood || "").trim().length < 2;\n    case "city":'
)

'''
s = s[:start] + policy_block + s[end:]

start = s.index('# 6) Backend principal: cadastro + pedidos ADM')
end = s.index('# 7) ADM clientes:', start)
routers_block = r'''# 6) Backend principal: cadastro + pedidos ADM
p = 'server/routers.ts'
text = read(p)
customers_start = text.index('  customers: router({')
reg_start = text.index('    register: publicProcedure', customers_start)
prefix, reg = text[:reg_start], text[reg_start:]
old_input = '        cpf: z.string().min(11, "CPF inválido").max(18),\n        city: z.string().min(1, "Cidade é obrigatória"),\n        uf: z.string().length(2, "UF deve ter 2 caracteres"),'
new_input = '        cpf: z.string().min(11, "CPF inválido").max(18),\n        cep: z.string().trim().min(8).max(9).optional(),\n        street: z.string().trim().min(2).max(255).optional(),\n        addressNumber: z.string().trim().min(1).max(30).optional(),\n        neighborhood: z.string().trim().min(2).max(150).optional(),\n        addressComplement: z.string().trim().max(255).optional(),\n        city: z.string().min(1, "Cidade é obrigatória"),\n        uf: z.string().length(2, "UF deve ter 2 caracteres"),'
if reg.count(old_input) != 1:
    raise RuntimeError(f'customers.register input: esperado 1, encontrado {reg.count(old_input)}')
reg = reg.replace(old_input, new_input, 1)
old_profile = '          cpf: normalizeCustomerCpf(input.cpf),\n          profilePhotoUrl: input.profilePhotoUrl,\n          city: input.city || undefined,\n          uf: input.uf || undefined,'
new_profile = '          cpf: normalizeCustomerCpf(input.cpf),\n          cep: input.cep ? input.cep.replace(/\\D/g, "").replace(/^(\\d{5})(\\d{3})$/, "$1-$2") : undefined,\n          street: input.street?.trim() || undefined,\n          addressNumber: input.addressNumber?.trim() || undefined,\n          neighborhood: input.neighborhood?.trim() || undefined,\n          addressComplement: input.addressComplement?.trim() || undefined,\n          profilePhotoUrl: input.profilePhotoUrl,\n          city: input.city || undefined,\n          uf: input.uf || undefined,'
if reg.count(old_profile) != 1:
    raise RuntimeError(f'customers.register profile: esperado 1, encontrado {reg.count(old_profile)}')
reg = reg.replace(old_profile, new_profile, 1)
text = prefix + reg
old_policy = "        fields: z.array(z.enum(['name', 'phone', 'cpf', 'email', 'city', 'uf', 'profilePhotoUrl'])).max(7),"
new_policy = "        fields: z.array(z.enum(['name', 'phone', 'cpf', 'email', 'cep', 'street', 'addressNumber', 'neighborhood', 'city', 'uf', 'profilePhotoUrl'])).max(11),"
if text.count(old_policy) != 1:
    raise RuntimeError(f'policy enum: esperado 1, encontrado {text.count(old_policy)}')
text = text.replace(old_policy, new_policy, 1)
old_select = 'SELECT id, name, phone, email, cpf, city, uf, profilePhotoUrl FROM customers'
new_select = 'SELECT id, name, phone, email, cpf, cep, street, addressNumber, neighborhood, addressComplement, city, uf, profilePhotoUrl FROM customers'
if text.count(old_select) != 2:
    raise RuntimeError(f'policy selects: esperado 2, encontrado {text.count(old_select)}')
text = text.replace(old_select, new_select, 2)
write(p, text)
replace_all(p,
    '          c.city as customerCity,\n          c.uf as customerUf,',
    '          c.cep as customerCep,\n          c.street as customerStreet,\n          c.addressNumber as customerAddressNumber,\n          c.neighborhood as customerNeighborhood,\n          c.addressComplement as customerAddressComplement,\n          c.city as customerCity,\n          c.uf as customerUf,', minimum=1)
replace_all(p,
    '            c.city AS customerCity,\n            c.uf AS customerUf,',
    '            c.cep AS customerCep,\n            c.street AS customerStreet,\n            c.addressNumber AS customerAddressNumber,\n            c.neighborhood AS customerNeighborhood,\n            c.addressComplement AS customerAddressComplement,\n            c.city AS customerCity,\n            c.uf AS customerUf,', minimum=1)
replace_all(p,
    '            customerCity: row.customerCity,\n            customerUf: row.customerUf,',
    '            customerCep: row.customerCep,\n            customerStreet: row.customerStreet,\n            customerAddressNumber: row.customerAddressNumber,\n            customerNeighborhood: row.customerNeighborhood,\n            customerAddressComplement: row.customerAddressComplement,\n            customerCity: row.customerCity,\n            customerUf: row.customerUf,', minimum=1)
replace_once('server/customerAccess.ts',
    '  email?: string | null;\n  profilePhotoUrl?: string | null;\n  city?: string | null;',
    '  email?: string | null;\n  profilePhotoUrl?: string | null;\n  cep?: string | null;\n  street?: string | null;\n  addressNumber?: string | null;\n  neighborhood?: string | null;\n  addressComplement?: string | null;\n  city?: string | null;')
replace_once('server/customerAccess.ts',
    'SELECT id, customerNumber, name, phone, cpf, email, city, uf, referredBy, referredByPhone, profilePhotoUrl, blocked, deletedAt',
    'SELECT id, customerNumber, name, phone, cpf, email, cep, street, addressNumber, neighborhood, addressComplement, city, uf, referredBy, referredByPhone, profilePhotoUrl, blocked, deletedAt')

'''
s = s[:start] + routers_block + s[end:]
p.write_text(s, encoding='utf-8')
print('PREPARE_ADDRESS_PATCH_FINAL_OK')
