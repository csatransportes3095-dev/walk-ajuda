from pathlib import Path

p = Path('server/routers.ts')
s = p.read_text(encoding='utf-8')
start = s.index('    adminCreate: adminProcedure')
end = s.index('    // Admin:', start + 20) if '    // Admin:' in s[start + 20:] else len(s)
block = s[start:end]
needle = "        referredByPhone: z.string().regex(/^\\d{10,11}$/, 'Informe o telefone válido do indicador cadastrado'),\n        city: z.string().optional(),"
replacement = "        referredByPhone: z.string().regex(/^\\d{10,11}$/, 'Informe o telefone válido do indicador cadastrado'),\n        cep: z.string().trim().min(8).max(9).optional(),\n        street: z.string().trim().min(2).max(255).optional(),\n        addressNumber: z.string().trim().min(1).max(30).optional(),\n        neighborhood: z.string().trim().min(2).max(150).optional(),\n        addressComplement: z.string().trim().max(255).optional(),\n        city: z.string().optional(),"
if needle not in block:
    raise RuntimeError('adminCreate input esperado não encontrado')
block = block.replace(needle, replacement, 1)
s = s[:start] + block + s[end:]
p.write_text(s, encoding='utf-8')
print('FIX_ADMIN_CREATE_ADDRESS_INPUT_OK')
