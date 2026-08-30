import fs from 'node:fs';

function exactReplace(path, before, after, expected = 1) {
  const source = fs.readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== expected) throw new Error(`${path}: expected ${expected} exact match(es), found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

// Apenas telefone é identidade/alias permanente. CPF e e-mail podem ser corrigidos
// pelo ADM e não devem continuar funcionando como identidades antigas.
exactReplace(
  'server/customerStableIdentity.ts',
  `function normalizedIdentities(identity: CustomerIdentityInput) {\n  const phone = normalizeCustomerPhone(identity.phone);\n  const cpf = normalizeCustomerCpf(identity.cpf);\n  const email = normalizeCustomerEmail(identity.email);\n  return [\n    phone ? { type: "phone", value: phone } : null,\n    cpf ? { type: "cpf", value: cpf } : null,\n    email ? { type: "email", value: email } : null,\n  ].filter(Boolean) as Array<{ type: "phone" | "cpf" | "email"; value: string }>;\n}\n`,
  `function normalizedIdentities(identity: CustomerIdentityInput) {\n  const phone = normalizeCustomerPhone(identity.phone);\n  return phone ? [{ type: "phone" as const, value: phone }] : [];\n}\n`,
);

// Endpoint legado: bloqueio de servidor. Mesmo se alguma UI antiga enviar phone,
// a identidade fixa não pode ser alterada.
exactReplace(
  'server/routers.ts',
  `        const phoneChanged = !!data.phone && newPhone !== oldPhone;\n\n        // Verifica duplicidade antes de tocar em tabelas relacionadas. Assim não há\n`,
  `        const phoneChanged = !!data.phone && newPhone !== oldPhone;\n        if (phoneChanged) {\n          throw new TRPCError({ code: 'FORBIDDEN', message: 'Telefone é a identidade fixa do cliente e não pode ser alterado.' });\n        }\n\n        // Verifica duplicidade antes de tocar em tabelas relacionadas. Assim não há\n`,
);

console.log('PR #38 immutable phone hardening applied successfully.');
