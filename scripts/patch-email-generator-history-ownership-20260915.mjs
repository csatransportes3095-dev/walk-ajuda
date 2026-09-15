import fs from 'node:fs';

const routerPath = 'server/routers.ts';
const generatorPath = 'client/src/components/AdminEmailGenerator.tsx';

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`[email-history-owner] Trecho não encontrado: ${label}`);
  return source.replace(from, to);
}

let router = fs.readFileSync(routerPath, 'utf8');

router = replaceOnce(
  router,
`  loginData: router({
    // Admin busca dados de login de um pedido`,
`  loginData: router({
    // Retorna vínculos EXATOS entre e-mails do histórico do gerador e pedidos já salvos.
    // Não tenta adivinhar por nome/prefixo: só considera igualdade de loginEmail.
    emailOwners: adminProcedure
      .input(z.object({ emails: z.array(z.string().min(3).max(320)).max(1000) }))
      .query(async ({ input }) => {
        const requested = new Set(input.emails.map(email => String(email || '').trim().toLowerCase()).filter(Boolean));
        if (!requested.size) return [];

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });

        const result = await (db as any).execute(sql.raw(\`
          SELECT
            LOWER(TRIM(old.loginEmail)) AS email,
            old.registrationId,
            COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(acp.clientName), ''), 'Cliente') AS customerName,
            c.customerNumber,
            (
              SELECT osh.orderNumber
              FROM orderStatusHistory osh
              WHERE osh.registrationId = old.registrationId
                AND osh.orderNumber IS NOT NULL
              ORDER BY osh.createdAt ASC, osh.id ASC
              LIMIT 1
            ) AS orderNumber
          FROM orderLoginData old
          LEFT JOIN accessCodePhones acp ON acp.id = old.registrationId
          LEFT JOIN customers c
            ON RIGHT(REGEXP_REPLACE(COALESCE(c.phone, ''), '[^0-9]', ''), 11)
             = RIGHT(REGEXP_REPLACE(COALESCE(old.customerPhone, acp.phone, ''), '[^0-9]', ''), 11)
          WHERE old.loginEmail IS NOT NULL
            AND TRIM(old.loginEmail) <> ''
          ORDER BY old.id DESC
          LIMIT 5000
        \`));

        const rows = Array.isArray((result as any)?.[0]) ? (result as any)[0] : [];
        const seen = new Set<string>();
        const output: Array<{
          email: string;
          registrationId: number;
          customerName: string;
          customerNumber: number | null;
          orderNumber: number | null;
          kind: 'PEDIDO';
        }> = [];

        for (const row of rows) {
          const email = String(row.email || '').trim().toLowerCase();
          if (!email || !requested.has(email)) continue;
          const registrationId = Number(row.registrationId);
          if (!Number.isSafeInteger(registrationId) || registrationId <= 0) continue;
          const key = email + '|' + registrationId;
          if (seen.has(key)) continue;
          seen.add(key);
          output.push({
            email,
            registrationId,
            customerName: String(row.customerName || 'Cliente'),
            customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
            orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
            kind: 'PEDIDO',
          });
        }

        return output;
      }),

    // Admin busca dados de login de um pedido`,
  'backend emailOwners'
);

fs.writeFileSync(routerPath, router);

let generator = fs.readFileSync(generatorPath, 'utf8');

generator = replaceOnce(
  generator,
`  const [search, setSearch] = useState("");
  const [historyDomain, setHistoryDomain] = useState("all");`,
`  const [search, setSearch] = useState("");
  const [historyDomain, setHistoryDomain] = useState("all");

  const historyEmails = useMemo(
    () => Array.from(new Set(history.map(item => item.email.trim().toLowerCase()).filter(Boolean))).slice(0, 1000),
    [history],
  );
  const emailOwnersQuery = trpc.loginData.emailOwners.useQuery(
    { emails: historyEmails },
    { enabled: historyEmails.length > 0, staleTime: 15_000, refetchOnWindowFocus: true },
  );
  const ownersByEmail = useMemo(() => {
    const map = new Map<string, Array<{ kind: string; customerName: string; customerNumber: number | null; orderNumber: number | null; registrationId: number }>>();
    for (const owner of (emailOwnersQuery.data || [])) {
      const email = String(owner.email || '').trim().toLowerCase();
      const list = map.get(email) || [];
      list.push(owner);
      map.set(email, list);
    }
    return map;
  }, [emailOwnersQuery.data]);`,
  'client ownership query'
);

generator = replaceOnce(
  generator,
`  const filteredHistory = useMemo(() => {
    const term = search.trim().toLowerCase();
    return history.filter(item => {
      if (historyDomain !== "all" && item.domain !== historyDomain) return false;
      if (term && !item.email.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [history, historyDomain, search]);`,
`  const filteredHistory = useMemo(() => {
    const term = search.trim().toLowerCase();
    return history.filter(item => {
      if (historyDomain !== "all" && item.domain !== historyDomain) return false;
      if (!term) return true;
      const owners = ownersByEmail.get(item.email.trim().toLowerCase()) || [];
      const ownerText = owners.map(owner => [owner.kind, owner.customerName, owner.customerNumber ? '*' + owner.customerNumber : '', owner.orderNumber ? '#' + owner.orderNumber : ''].filter(Boolean).join(' ')).join(' ').toLowerCase();
      return item.email.toLowerCase().includes(term) || ownerText.includes(term);
    });
  }, [history, historyDomain, search, ownersByEmail]);`,
  'client filter by owner'
);

generator = replaceOnce(
  generator,
`    const lines = history
      .slice()
      .reverse()
      .map((item, index) => \`${'${index + 1}'}\\t${'${item.email}'}\\t${'${item.createdAt}'}\`)
      .join("\\n");`,
`    const lines = history
      .slice()
      .reverse()
      .map((item, index) => {
        const owners = ownersByEmail.get(item.email.trim().toLowerCase()) || [];
        const ownerText = owners.length
          ? owners.map(owner => [owner.kind, owner.customerNumber ? '*' + owner.customerNumber : null, owner.customerName, owner.orderNumber ? '#' + owner.orderNumber : null].filter(Boolean).join(' | ')).join(' / ')
          : 'SEM VÍNCULO';
        return \`${'${index + 1}'}\\t${'${item.email}'}\\t${'${ownerText}'}\\t${'${item.createdAt}'}\`;
      })
      .join("\\n");`,
  'export owner info'
);

generator = replaceOnce(
  generator,
`                    <button type="button" onClick={() => copyEmail(item.email)} className="min-w-0 text-left">
                      <span className="block break-all text-sm font-bold text-slate-100 hover:text-[#FFD400]">{item.email}</span>
                      <span className="mt-1 block text-[10px] font-medium text-slate-600 sm:hidden">{formatDate(item.createdAt)}</span>`,
`                    <button type="button" onClick={() => copyEmail(item.email)} className="min-w-0 text-left">
                      <span className="block break-all text-sm font-bold text-slate-100 hover:text-[#FFD400]">{item.email}</span>
                      {(() => {
                        const owners = ownersByEmail.get(item.email.trim().toLowerCase()) || [];
                        if (!owners.length) {
                          return <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">SEM VÍNCULO</span>;
                        }
                        return (
                          <span className="mt-1 block space-y-0.5">
                            {owners.map(owner => (
                              <span key={item.id + '-' + owner.registrationId} className="block text-[10px] font-bold text-emerald-300">
                                {owner.kind} | {owner.customerNumber ? '*' + owner.customerNumber + ' | ' : ''}{owner.customerName}{owner.orderNumber ? ' | #' + owner.orderNumber : ''}
                              </span>
                            ))}
                          </span>
                        );
                      })()}
                      <span className="mt-1 block text-[10px] font-medium text-slate-600 sm:hidden">{formatDate(item.createdAt)}</span>`,
  'history ownership display'
);

fs.writeFileSync(generatorPath, generator);
console.log('[email-history-owner] histórico do Gerador H2 agora identifica vínculos exatos com pedidos.');
