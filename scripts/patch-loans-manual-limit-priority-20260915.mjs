import fs from 'node:fs';

const serverPath = 'server/routers/loans.ts';
const clientPath = 'client/src/pages/AdminLoans.tsx';
const scorePath = 'server/loans/h2Score.ts';

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`[loans-manual-limit] Trecho não encontrado: ${label}`);
  return source.replace(from, to);
}

let server = fs.readFileSync(serverPath, 'utf8');

server = replaceOnce(
  server,
`    creditLimit: z.number(),
    interestRate: z.number(),`,
`    creditLimit: z.number(),
    creditLimitManual: z.boolean().optional(),
    interestRate: z.number(),`,
  'input saveClient creditLimitManual',
);

server = replaceOnce(
  server,
`    if (input.id) {
      const existing = await qRows(db, drizzleSql\`SELECT allowedPaymentTypes, loanEnabled FROM loanClients WHERE id=\${input.id} LIMIT 1\`);
      if (!resolvedAllowedTypes) resolvedAllowedTypes = String(existing[0]?.allowedPaymentTypes || '').trim();
      if (input.loanEnabled === undefined) resolvedLoanEnabled = Number(existing[0]?.loanEnabled || 0);
    }`,
`    let resolvedCreditLimitManual = input.creditLimitManual === true ? 1 : 0;
    if (input.id) {
      const existing = await qRows(db, drizzleSql\`SELECT allowedPaymentTypes, loanEnabled, creditLimit, creditLimitManual FROM loanClients WHERE id=\${input.id} LIMIT 1\`);
      if (!resolvedAllowedTypes) resolvedAllowedTypes = String(existing[0]?.allowedPaymentTypes || '').trim();
      if (input.loanEnabled === undefined) resolvedLoanEnabled = Number(existing[0]?.loanEnabled || 0);
      const existingLimit = Number(existing[0]?.creditLimit || 0);
      const changedByAdm = Math.abs(Number(input.creditLimit) - existingLimit) > 0.0001;
      resolvedCreditLimitManual = input.creditLimitManual === false ? 0 : (changedByAdm || Number(existing[0]?.creditLimitManual || 0) === 1 ? 1 : 0);
    } else {
      const profileLimit = Number(profile?.creditLimit || 0);
      resolvedCreditLimitManual = input.creditLimitManual === true || Math.abs(Number(input.creditLimit) - profileLimit) > 0.0001 ? 1 : 0;
    }`,
  'resolver prioridade manual',
);

server = replaceOnce(
  server,
`          creditLimit=\${input.creditLimit}, interestRate=\${input.interestRate},`,
`          creditLimit=\${input.creditLimit}, creditLimitManual=\${resolvedCreditLimitManual}, interestRate=\${input.interestRate},`,
  'salvar flag em edição',
);

server = replaceOnce(
  server,
`        INSERT INTO loanClients (name, cpf, phone, status, profileSlug, creditLimit, interestRate,
          loanEnabled, allowedPaymentTypes,`,
`        INSERT INTO loanClients (name, cpf, phone, status, profileSlug, creditLimit, creditLimitManual, interestRate,
          loanEnabled, allowedPaymentTypes,`,
  'insert coluna manual',
);

server = replaceOnce(
  server,
`          \${input.profileSlug}, \${input.creditLimit}, \${input.interestRate}, \${resolvedLoanEnabled},`,
`          \${input.profileSlug}, \${input.creditLimit}, \${resolvedCreditLimitManual}, \${input.interestRate}, \${resolvedLoanEnabled},`,
  'insert valor manual',
);

server = replaceOnce(
  server,
`      UPDATE loanClients
      SET creditLimit=\${p.creditLimit}, interestRate=\${p.interestRate}, maxDays=\${p.maxDays}, maxDaysSemanal=\${p.maxDaysSemanal || 60}, maxDaysQuinzenal=\${p.maxDaysQuinzenal || 60}, maxDaysMensal=\${p.maxDaysMensal || 90}, updatedAt=NOW()
      WHERE profileSlug=\${input.profileSlug}`, 
`      UPDATE loanClients
      SET creditLimit=CASE WHEN COALESCE(creditLimitManual,0)=1 THEN creditLimit ELSE \${p.creditLimit} END,
          interestRate=\${p.interestRate}, maxDays=\${p.maxDays}, maxDaysSemanal=\${p.maxDaysSemanal || 60}, maxDaysQuinzenal=\${p.maxDaysQuinzenal || 60}, maxDaysMensal=\${p.maxDaysMensal || 90}, updatedAt=NOW()
      WHERE profileSlug=\${input.profileSlug}`,
  'syncProfile preserva manual',
);

server = replaceOnce(
  server,
`  // Sincroniza todos os clientes de um perfil com os valores atuais do perfil
  syncProfile:`,
`  // Remove somente a prioridade manual do limite e volta a usar o limite padrão do perfil.
  useProfileCreditLimit: adminProcedure.input(z.object({ clientId: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb() as any;
    const rows = await qRows(db, drizzleSql\`
      SELECT lc.id, p.creditLimit AS profileCreditLimit
      FROM loanClients lc
      LEFT JOIN loanProfiles p ON p.slug=lc.profileSlug
      WHERE lc.id=\${input.clientId}
      LIMIT 1
    \`);
    if (!rows.length) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado.' });
    if (rows[0]?.profileCreditLimit == null) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Perfil do cliente não possui limite padrão.' });
    await db.execute(drizzleSql\`
      UPDATE loanClients
      SET creditLimit=\${Number(rows[0].profileCreditLimit)}, creditLimitManual=0, updatedAt=NOW()
      WHERE id=\${input.clientId}
    \`);
    return { ok: true, creditLimit: Number(rows[0].profileCreditLimit) };
  }),

  // Sincroniza todos os clientes de um perfil com os valores atuais do perfil
  syncProfile:`,
  'mutation voltar ao perfil',
);

fs.writeFileSync(serverPath, server);

let score = fs.readFileSync(scorePath, 'utf8');
score = replaceOnce(
  score,
`    UPDATE loanClients
    SET profileSlug=\${levelSlug}, creditLimit=\${profile.creditLimit}, interestRate=\${profile.interestRate},
        maxDays=\${profile.maxDays}, updatedAt=NOW()`,
`    UPDATE loanClients
    SET profileSlug=\${levelSlug},
        creditLimit=CASE WHEN COALESCE(creditLimitManual,0)=1 THEN creditLimit ELSE \${profile.creditLimit} END,
        interestRate=\${profile.interestRate}, maxDays=\${profile.maxDays}, updatedAt=NOW()`,
  'H2 Score preserva limite manual',
);
fs.writeFileSync(scorePath, score);

let client = fs.readFileSync(clientPath, 'utf8');
client = replaceOnce(
  client,
`                  <span>Limite: {fmt(c.creditLimit)}</span>`,
`                  <span className="flex items-center gap-1">Limite: {fmt(c.creditLimit)} {Number(c.creditLimitManual || 0) === 1 && <Badge variant="outline" className="ml-1 text-[10px] h-5 px-1.5 border-amber-500/40 text-amber-300 bg-amber-500/10">ADM</Badge>}</span>`,
  'badge ADM na lista',
);

client = replaceOnce(
  client,
`  const save = trpc.loans.saveClient.useMutation({
    onSuccess,
    onError: (e) => toast.error(e.message),
  });`,
`  const save = trpc.loans.saveClient.useMutation({
    onSuccess,
    onError: (e) => toast.error(e.message),
  });
  const useProfileLimit = trpc.loans.useProfileCreditLimit.useMutation({
    onSuccess: (res) => {
      setForm(prev => ({ ...prev, creditLimit: String(res.creditLimit) }));
      toast.success('Limite voltou a seguir o perfil do cliente.');
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });`,
  'mutation frontend voltar perfil',
);

client = replaceOnce(
  client,
`            <div className="space-y-1"><Label>Limite (R$)</Label><Input type="number" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} /></div>`,
`            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Limite (R$)</Label>
                {isEdit && Number(client?.creditLimitManual || 0) === 1 && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10">PRIORIDADE ADM</Badge>
                )}
              </div>
              <Input type="number" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
              {isEdit && Number(client?.creditLimitManual || 0) === 1 && (
                <Button type="button" size="sm" variant="outline" className="w-full h-7 text-[11px]" disabled={useProfileLimit.isPending} onClick={() => useProfileLimit.mutate({ clientId: Number(client.id) })}>
                  {useProfileLimit.isPending ? 'Aplicando...' : 'Usar limite do perfil'}
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground">Ao alterar manualmente, o limite do ADM tem prioridade sobre Perfil e H2 Score.</p>
            </div>`,
  'UI prioridade ADM',
);

fs.writeFileSync(clientPath, client);
console.log('[loans-manual-limit] OK: limite manual do ADM protegido contra Perfil e H2 Score.');
