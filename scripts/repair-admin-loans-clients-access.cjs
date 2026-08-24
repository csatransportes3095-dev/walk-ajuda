const fs = require('fs');

function rep(s, from, to, label) {
  if (!s.includes(from)) throw new Error(`Trecho não encontrado: ${label}`);
  return s.replace(from, to);
}

// ── Backend ─────────────────────────────────────────────────────────────────
const serverPath = 'server/routers/loans.ts';
let s = fs.readFileSync(serverPath, 'utf8');

s = rep(
  s,
  `import { findMainCustomerByIdentity, getRouteAccess } from "../customerAccess";`,
  `import { CUSTOMER_ROUTES, findMainCustomerByIdentity, getRouteAccess, setCustomerRoutePermissions } from "../customerAccess";`,
  'imports de acesso central'
);

const helperAnchor = `function isSameLoanIdentity(row: any, cpf?: string | null, phone?: string | null) {`;
const helper = `async function setMainCustomerLoanAccess(\n  db: any,\n  identity: { phone?: string | null; cpf?: string | null },\n  enabled: boolean,\n  grantedBy = 'ADM Empréstimos',\n): Promise<void> {\n  const customer = await findMainCustomerByIdentity(identity, db);\n  if (!customer) return;\n  const access = await getRouteAccess(customer.id, db);\n  if (!access.restricted && enabled) return;\n  const currentRoutes = access.restricted\n    ? access.routes\n    : CUSTOMER_ROUTES.filter((route) => route !== 'emprestimo');\n  const nextRoutes = enabled\n    ? [...new Set([...currentRoutes, 'emprestimo'])]\n    : currentRoutes.filter((route) => route !== 'emprestimo');\n  await setCustomerRoutePermissions(customer.id, nextRoutes, grantedBy, db);\n}\n\n${helperAnchor}`;
s = rep(s, helperAnchor, helper, 'helper de acesso central');

// Busca de cliente principal deve funcionar mesmo com telefone/CPF formatados.
s = rep(
  s,
  `WHERE (phone LIKE \${qNum} OR cpf LIKE \${qNum} OR name LIKE \${q})`,
  `WHERE (REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '') LIKE \${qNum} OR REGEXP_REPLACE(COALESCE(cpf,''), '[^0-9]', '') LIKE \${qNum} OR name LIKE \${q})`,
  'busca normalizada de cliente'
);

s = rep(s, `loanEnabled: z.number().default(0),`, `loanEnabled: z.number().optional(),`, 'loanEnabled opcional');
s = rep(s, `pixName: z.string().optional(),\n    spreadsheetToken:`, `pixName: z.string().optional(),\n    pixBank: z.string().optional(),\n    spreadsheetToken:`, 'pixBank schema');

const allowedBlock = `    let resolvedAllowedTypes = String(input.allowedPaymentTypes || '').trim();\n    if (!resolvedAllowedTypes && input.id) {\n      const existing = await qRows(db, drizzleSql\`SELECT allowedPaymentTypes FROM loanClients WHERE id=\${input.id} LIMIT 1\`);\n      resolvedAllowedTypes = String(existing[0]?.allowedPaymentTypes || '').trim();\n    }\n    if (!resolvedAllowedTypes) resolvedAllowedTypes = profile?.defaultPaymentTypes ?? "diario";`;
const allowedNew = `    let resolvedAllowedTypes = String(input.allowedPaymentTypes || '').trim();\n    let resolvedLoanEnabled = input.loanEnabled ?? 0;\n    if (input.id) {\n      const existing = await qRows(db, drizzleSql\`SELECT allowedPaymentTypes, loanEnabled FROM loanClients WHERE id=\${input.id} LIMIT 1\`);\n      if (!resolvedAllowedTypes) resolvedAllowedTypes = String(existing[0]?.allowedPaymentTypes || '').trim();\n      if (input.loanEnabled === undefined) resolvedLoanEnabled = Number(existing[0]?.loanEnabled || 0);\n    }\n    if (!resolvedAllowedTypes) resolvedAllowedTypes = profile?.defaultPaymentTypes ?? "diario";`;
s = rep(s, allowedBlock, allowedNew, 'preservar loanEnabled');

s = s.replaceAll(`loanEnabled=\${input.loanEnabled}, allowedPaymentTypes=\${resolvedAllowedTypes},`, `loanEnabled=\${resolvedLoanEnabled}, allowedPaymentTypes=\${resolvedAllowedTypes},`);
s = rep(
  s,
  `client_pix_key=\${input.pixKey || null}, client_pix_name=\${input.pixName || null},\n          spreadsheetToken=`,
  `client_pix_key=\${input.pixKey || null}, client_pix_name=\${input.pixName || null}, client_pix_bank=\${input.pixBank || null},\n          spreadsheetToken=`,
  'salvar banco PIX edição'
);
s = rep(
  s,
  `loanEnabled, allowedPaymentTypes, pixKey, pixKeyType, pixName, client_pix_key, client_pix_name, spreadsheetToken, notes, userId)`,
  `loanEnabled, allowedPaymentTypes, pixKey, pixKeyType, pixName, client_pix_key, client_pix_name, client_pix_bank, spreadsheetToken, notes, userId)`,
  'coluna banco PIX criação'
);
s = rep(
  s,
  `\${input.profileSlug}, \${input.creditLimit}, \${input.interestRate}, \${input.loanEnabled},\n          \${resolvedAllowedTypes}, \${input.pixKey || null}, \${input.pixKeyType || null},\n          \${input.pixName || null}, \${input.pixKey || null}, \${input.pixName || null}, \${input.spreadsheetToken || null},`,
  `\${input.profileSlug}, \${input.creditLimit}, \${input.interestRate}, \${resolvedLoanEnabled},\n          \${resolvedAllowedTypes}, \${input.pixKey || null}, \${input.pixKeyType || null},\n          \${input.pixName || null}, \${input.pixKey || null}, \${input.pixName || null}, \${input.pixBank || null}, \${input.spreadsheetToken || null},`,
  'valor banco PIX e acesso criação'
);

const toggleOld = `  toggleLoanEnabled: adminProcedure.input(z.object({\n    clientId: z.number(),\n    enabled: z.number(),\n  })).mutation(async ({ input }) => {\n    const db = await getDb() as any;\n    await db.execute(drizzleSql\`UPDATE loanClients SET loanEnabled=\${input.enabled}, updatedAt=NOW() WHERE id=\${input.clientId}\`);\n    return { ok: true };\n  }),`;
const toggleNew = `  toggleLoanEnabled: adminProcedure.input(z.object({\n    clientId: z.number(),\n    enabled: z.number(),\n  })).mutation(async ({ input, ctx }) => {\n    const db = await getDb() as any;\n    const rows = await qRows(db, drizzleSql\`SELECT phone, cpf FROM loanClients WHERE id=\${input.clientId} LIMIT 1\`);\n    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' });\n    await db.execute(drizzleSql\`UPDATE loanClients SET loanEnabled=\${input.enabled}, updatedAt=NOW() WHERE id=\${input.clientId}\`);\n    await setMainCustomerLoanAccess(db, rows[0], input.enabled === 1, ctx.user?.name || 'ADM Empréstimos');\n    return { ok: true };\n  }),`;
s = rep(s, toggleOld, toggleNew, 'toggle cliente central');

const deleteOld = `  deleteClient: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {\n    const db = await getDb() as any;\n    await db.execute(drizzleSql\`DELETE FROM loanInstallments WHERE loanId IN (SELECT id FROM loans WHERE clientId=\${input.id})\`);\n    await db.execute(drizzleSql\`DELETE FROM loans WHERE clientId=\${input.id}\`);\n    await db.execute(drizzleSql\`DELETE FROM loanClients WHERE id=\${input.id}\`);\n    return { ok: true };\n  }),`;
const deleteNew = `  deleteClient: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {\n    const db = await getDb() as any;\n    const history = await qRows(db, drizzleSql\`SELECT COUNT(*) as cnt FROM loans WHERE clientId=\${input.id}\`);\n    if (Number(history[0]?.cnt || 0) > 0) {\n      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este cliente possui histórico de empréstimos. Por segurança, o histórico financeiro não pode ser apagado por esta tela.' });\n    }\n    await db.execute(drizzleSql\`DELETE FROM loanClients WHERE id=\${input.id}\`);\n    return { ok: true };\n  }),`;
s = rep(s, deleteOld, deleteNew, 'proteção contra exclusão financeira');

// Controle de acesso por telefone também grava na fonte central de rotas.
const togglePhoneStart = s.indexOf('  toggleLoanByPhone: adminProcedure.input');
const togglePhoneEnd = s.indexOf('\n\n  // â', togglePhoneStart);
if (togglePhoneStart < 0 || togglePhoneEnd < 0) throw new Error('toggleLoanByPhone não localizado');
let togglePhone = s.slice(togglePhoneStart, togglePhoneEnd);
togglePhone = rep(
  togglePhone,
  `  })).mutation(async ({ input }) => {\n    const db = await getDb() as any;\n    const existing = await qRows(db, drizzleSql\`SELECT id FROM loanClients WHERE phone=\${input.phone}\`);`,
  `  })).mutation(async ({ input, ctx }) => {\n    const db = await getDb() as any;\n    const phone = onlyDigits(input.phone);\n    const existing = await qRows(db, drizzleSql\`SELECT id, phone, cpf FROM loanClients WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', ''), 9)=RIGHT(\${phone}, 9) LIMIT 1\`);`,
  'toggle por telefone normalizado'
);
togglePhone = togglePhone.replaceAll(`WHERE phone=\${input.phone}`, `WHERE id=\${existing[0].id}`);
togglePhone = togglePhone.replaceAll(`WHERE phone=\${input.phone} LIMIT 1`, `WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', ''), 9)=RIGHT(\${phone}, 9) LIMIT 1`);
togglePhone = rep(
  togglePhone,
  `    try { await syncUnifiedCustomerRegistry(); } catch (error: any) {`,
  `    const centralIdentity = existing[0] || { phone };\n    await setMainCustomerLoanAccess(db, centralIdentity, input.enabled === 1, ctx.user?.name || 'ADM Empréstimos');\n    try { await syncUnifiedCustomerRegistry(); } catch (error: any) {`,
  'sincronizar acesso central por telefone'
);
s = s.slice(0, togglePhoneStart) + togglePhone + s.slice(togglePhoneEnd);

fs.writeFileSync(serverPath, s);

// ── Frontend ────────────────────────────────────────────────────────────────
const clientPath = 'client/src/pages/AdminLoans.tsx';
let a = fs.readFileSync(clientPath, 'utf8');

const formStart = a.indexOf('function ClientFormModal(');
const formEnd = a.indexOf('// ─── Perfis', formStart);
if (formStart < 0 || formEnd < 0) throw new Error('ClientFormModal não localizado');
let f = a.slice(formStart, formEnd);

f = rep(
  f,
  `  const [form, setForm] = useState({\n    name: client?.name || "",`,
  `  const initialProfile = profiles.find((p) => p.slug === (client?.profileSlug || 'bronze')) || profiles[0];\n  const [form, setForm] = useState({\n    name: client?.name || "",`,
  'perfil inicial do cliente'
);
f = f.replace(`creditLimit: client?.creditLimit || "",`, `creditLimit: client?.creditLimit ?? initialProfile?.creditLimit ?? "",`);
f = f.replace(`interestRate: client?.interestRate || "",`, `interestRate: client?.interestRate ?? initialProfile?.interestRate ?? "",`);
f = f.replace(`pixName: client?.pixName || client?.client_pix_name || "",`, `pixName: client?.pixName || client?.client_pix_name || "",\n    pixBank: client?.client_pix_bank || "",`);
f = f.replace(`className="grid grid-cols-4 gap-2">\n              {(["diario", "semanal", "mensal", "parcelado"] as const).map`, `className="grid grid-cols-2 sm:grid-cols-5 gap-2">\n              {(["diario", "semanal", "quinzenal", "mensal", "parcelado"] as const).map`);
f = f.replace(`{m === "diario" ? "Diário" : m === "semanal" ? "Semanal" : m === "parcelado" ? "Parcelado" : "Mensal"}`, `{m === "diario" ? "Diário" : m === "semanal" ? "Semanal" : m === "quinzenal" ? "Quinzenal" : m === "parcelado" ? "Parcelado" : "Mensal"}`);
f = f.replace(`<SelectItem value="cpf">CPF</SelectItem>`, `<SelectItem value="cpf">CPF</SelectItem>\n                    <SelectItem value="cnpj">CNPJ</SelectItem>`);
f = f.replace(`<div className="col-span-2 space-y-1"><Label>Nome do titular PIX</Label><Input value={form.pixName} onChange={(e) => set("pixName", e.target.value)} /></div>`, `<div className="col-span-2 space-y-1"><Label>Nome do titular PIX</Label><Input value={form.pixName} onChange={(e) => set("pixName", e.target.value)} /></div>\n              <div className="col-span-2 space-y-1"><Label>Banco do PIX</Label><Input value={form.pixBank} onChange={(e) => set("pixBank", e.target.value)} placeholder="Ex: Nubank, Itaú..." /></div>`);
f = f.replace(`disabled={!form.name || save.isPending}`, `disabled={!form.name || !Number.isFinite(parseFloat(String(form.creditLimit))) || !Number.isFinite(parseFloat(String(form.interestRate))) || save.isPending}`);
a = a.slice(0, formStart) + f + a.slice(formEnd);

// Exibir erro do toggle de acesso, em vez de falhar silenciosamente.
a = a.replace(
  `const toggle = trpc.loans.toggleLoanByPhone.useMutation({ onSuccess: () => refetch() });`,
  `const toggle = trpc.loans.toggleLoanByPhone.useMutation({ onSuccess: () => refetch(), onError: (e) => toast.error(e.message) });`
);

// LateFee: não chamar setState durante render.
const lateInit = `  if (!form && cfg) {\n    setForm({\n      enabled: !!cfg.enabled,\n      fee_after_18h: parseFloat(String(cfg.fee_after_18h)) || 10,\n      fee_after_20h: parseFloat(String(cfg.fee_after_20h)) || 10,\n      fee_after_midnight_pct: parseFloat(String(cfg.fee_after_midnight_pct)) || 100,\n      rules_text: cfg.rules_text || "Regras de pagamento:\\n- Pague sua parcela diária até as 18h para evitar taxas adicionais.\\n- Após 18h: taxa adicional de R$ 10,00.\\n- Após 20h: taxa adicional de mais R$ 10,00 (acumulada: R$ 20,00).\\n- Após 23:59: a parcela do dia é cobrada integralmente (100%).",\n    });\n  }`;
const lateEffect = `  useEffect(() => {\n    if (!cfg) return;\n    setForm({\n      enabled: !!cfg.enabled,\n      fee_after_18h: parseFloat(String(cfg.fee_after_18h)) || 10,\n      fee_after_20h: parseFloat(String(cfg.fee_after_20h)) || 10,\n      fee_after_midnight_pct: parseFloat(String(cfg.fee_after_midnight_pct)) || 100,\n      rules_text: cfg.rules_text || "Regras de pagamento:\\n- Pague sua parcela diária até as 18h para evitar taxas adicionais.\\n- Após 18h: taxa adicional de R$ 10,00.\\n- Após 20h: taxa adicional de mais R$ 10,00 (acumulada: R$ 20,00).\\n- Após 23:59: a parcela do dia é cobrada integralmente (100%).",\n    });\n  }, [cfg]);`;
a = rep(a, lateInit, lateEffect, 'inicialização da taxa sem setState no render');

fs.writeFileSync(clientPath, a);
console.log('Clientes e controle de acesso corrigidos.');
