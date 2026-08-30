import fs from 'node:fs';

function mustReplace(path, from, to, label) {
  let s = fs.readFileSync(path, 'utf8');
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: esperado 1, encontrado ${n}`);
  s = s.replace(from, to);
  fs.writeFileSync(path, s);
}

mustReplace(
  'server/customerProfileUpdatePolicy.ts',
  '    // Uma nova ativação/revisão exige uma confirmação nova, mesmo que o valor anterior ainda seja válido.\n    pending: missingFields.length > 0 || (policy.enabled && completedRevision < policy.revision),',
  '    // Regra única: só existe atualização quando há campo obrigatório realmente ausente ou inválido.\n    pending: missingFields.length > 0,',
  'pending apenas por campo faltante',
);

{
  const path = 'client/src/pages/AdminCustomers.tsx';
  let s = fs.readFileSync(path, 'utf8');
  s = s.replace('import { CUSTOMER_PROFILE_UPDATE_FIELD_OPTIONS, type CustomerProfileUpdateField } from "@shared/customerProfileUpdate";\n', '');
  s = s.replace(/\n  profileUpdatePolicy\?: \{[\s\S]*?\n  \};\n(?=\};)/, '\n');

  const start = s.indexOf('\nfunction CustomerProfileUpdatePolicyCard');
  const endMarker = '\nexport default function AdminCustomers()';
  const end = s.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('bloco CustomerProfileUpdatePolicyCard nao encontrado');
  s = s.slice(0, start) + '\n' + s.slice(end);

  const use = '                    <CustomerProfileUpdatePolicyCard customer={c} onSaved={() => customersQuery.refetch()} />\n';
  if (!s.includes(use)) throw new Error('uso do card no cadastro do cliente nao encontrado');
  s = s.replace(use, '');
  fs.writeFileSync(path, s);
}

{
  const path = 'server/routers.ts';
  let s = fs.readFileSync(path, 'utf8');
  const re = /\n    setProfileUpdatePolicy: adminProcedure[\s\S]*?\n      \}\),/;
  if (!re.test(s)) throw new Error('endpoint setProfileUpdatePolicy nao encontrado');
  s = s.replace(re, `\n    setProfileUpdatePolicy: adminProcedure\n      .input(z.object({\n        customerId: z.number().int().positive(),\n        enabled: z.boolean(),\n        fields: z.array(z.string()),\n      }))\n      .mutation(async () => {\n        throw new TRPCError({\n          code: 'BAD_REQUEST',\n          message: 'A atualização cadastral é automática e só ocorre quando faltam dados obrigatórios.',\n        });\n      }),`);
  fs.writeFileSync(path, s);
}

console.log('Regra manual do ADM removida; atualização depende somente de campos obrigatórios faltantes.');
