import fs from 'node:fs';

function mustReplace(path, from, to, label) {
  let s = fs.readFileSync(path, 'utf8');
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: esperado 1, encontrado ${n}`);
  s = s.replace(from, to);
  fs.writeFileSync(path, s);
}

// 1) Regra central: só há atualização quando falta campo obrigatório.
mustReplace(
  'server/customerProfileUpdatePolicy.ts',
  '    // Uma nova ativação/revisão exige uma confirmação nova, mesmo que o valor anterior ainda seja válido.\n    pending: missingFields.length > 0 || (policy.enabled && completedRevision < policy.revision),',
  '    // Regra única: só existe atualização quando há campo obrigatório realmente ausente ou inválido.\n    pending: missingFields.length > 0,',
  'pending apenas por campo faltante',
);

// 2) Remove o controle manual do card de clientes no ADM.
{
  const path = 'client/src/pages/AdminCustomers.tsx';
  let s = fs.readFileSync(path, 'utf8');
  s = s.replace('import { CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS, type CustomerProfileUpdateField } from "@shared/customerProfileUpdate";\n', '');
  s = s.replace(/\n  profileUpdatePolicy\?: \{[\s\S]*?\n  \};\n(?=\};)/, '\n');
  const fnRe = /\nfunction CustomerProfileUpdatePolicyCard\([\s\S]*?\nfunction /;
  if (!fnRe.test(s)) throw new Error('card CustomerProfileUpdatePolicyCard nao encontrado');
  s = s.replace(fnRe, '\nfunction ');
  const before = s;
  s = s.replace(/\s*<CustomerProfileUpdatePolicyCard[\s\S]*?\/>/g, '');
  if (s === before) throw new Error('uso do CustomerProfileUpdatePolicyCard nao encontrado');
  fs.writeFileSync(path, s);
}

// 3) Endpoint manual do ADM deixa de criar exigência.
{
  const path = 'server/routers.ts';
  let s = fs.readFileSync(path, 'utf8');
  const re = /\n    setProfileUpdatePolicy: adminProcedure[\s\S]*?\n      \}\),/;
  if (!re.test(s)) throw new Error('endpoint setProfileUpdatePolicy nao encontrado');
  s = s.replace(re, `\n    setProfileUpdatePolicy: adminProcedure\n      .input(z.object({\n        customerId: z.number().int().positive(),\n        enabled: z.boolean(),\n        fields: z.array(z.string()),\n      }))\n      .mutation(async () => {\n        throw new TRPCError({\n          code: 'BAD_REQUEST',\n          message: 'A atualização cadastral agora é automática e só ocorre quando faltam dados obrigatórios.',\n        });\n      }),`);
  fs.writeFileSync(path, s);
}

console.log('Regra manual do ADM removida; atualização agora depende somente de campos obrigatórios faltantes.');
