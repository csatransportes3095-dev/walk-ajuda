import fs from 'node:fs';

function replaceOnce(path, from, to, label) {
  const current = fs.readFileSync(path, 'utf8');
  const count = current.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  fs.writeFileSync(path, current.replace(from, to));
}

replaceOnce(
  'client/src/pages/AtualizarCadastro.tsx',
`  useEffect(() => {\n    if (step !== "done" && step !== "already_done") return;\n    const timer = window.setTimeout(() => {\n      window.location.replace("/login");\n    }, 1800);\n    return () => window.clearTimeout(timer);\n  }, [step]);`,
`  useEffect(() => {\n    if (step !== "done" && step !== "already_done") return;\n    localStorage.removeItem(TOKEN_KEY);\n    localStorage.removeItem("customer_update_phone_hint");\n    const timer = window.setTimeout(() => {\n      window.location.replace("/");\n    }, 1200);\n    return () => window.clearTimeout(timer);\n  }, [step]);`,
  'redirect final para home',
);

replaceOnce(
  'server/routers/customerUpdate.ts',
`async function customerUpdateAlreadyCompleted(db: any, customer: any) {\n  const policyState = await getCustomerProfileUpdateState(customer);\n  if (policyState.pending) return false;\n  if (policyState.enabled) return true;\n\n  // A foto ausente nunca pode ser ignorada por uma conclusão legada.\n  if (!String(customer?.profilePhotoUrl || "").trim()) return false;\n  // Cadastros completos também não precisam entrar novamente no formulário.\n  if (missingFields(customer).length === 0) return true;\n\n  // Compatibilidade com conclusões registradas antes da política individual.\n  await ensureCustomerUpdateCompletionInfrastructure(db);\n  const phone = normalizeCustomerPhone(customer?.phone);\n  const completed = await rows(db, sql\`\n    SELECT customerId\n    FROM customerProfileUpdateCompletions\n    WHERE customerId=\${Number(customer?.id) || 0}\n       OR phone=\${phone}\n    LIMIT 1\n  \`);\n  return completed.length > 0;\n}`,
`async function customerUpdateAlreadyCompleted(_db: any, customer: any) {\n  const policyState = await getCustomerProfileUpdateState(customer);\n  if (policyState.pending) return false;\n\n  // A conclusão antiga nunca pode esconder campo obrigatório vazio hoje.\n  // Só consideramos "já atualizado" quando o perfil atual está realmente completo.\n  return missingFields(customer).length === 0;\n}`,
  'verdade atual de cadastro completo',
);

replaceOnce(
  'server/routers/customerUpdate.ts',
`      await db.execute(sql\`\n        INSERT INTO customerProfileUpdateCompletions (customerId, phone, completedAt)`,
`      await ensureCustomerUpdateCompletionInfrastructure(db);\n      await db.execute(sql\`\n        INSERT INTO customerProfileUpdateCompletions (customerId, phone, completedAt)`,
  'garantia da tabela de conclusao',
);

console.log('Loop de /atualizarcadastro corrigido: concluido -> / e perfil legado nao ignora pendencias atuais.');
