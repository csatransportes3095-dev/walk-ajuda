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
    // Histórico global do Gerador H2 + vínculos reais já salvos nos pedidos.
    emailHistory: adminProcedure.query(async () => {
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });

      const result = await (db as any).execute(sql.raw(\`
        SELECT
          LOWER(TRIM(h.emailAddress)) AS email,
          NULL AS registrationId,
          h.createdAt,
          NULL AS customerName,
          NULL AS customerNumber,
          NULL AS orderNumber
        FROM emailGeneratorHistory h

        UNION ALL

        SELECT
          LOWER(TRIM(old.loginEmail)) AS email,
          old.registrationId,
          old.createdAt,
          COALESCE(NULLIF(TRIM(c.name), ''), 'Cliente') AS customerName,
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

        ORDER BY createdAt DESC
        LIMIT 10000
      \`));

      const rows = Array.isArray((result as any)?.[0]) ? (result as any)[0] : [];
      return rows.map((row: any) => {
        const date = row.createdAt ? new Date(row.createdAt) : new Date();
        return {
          email: String(row.email || '').trim().toLowerCase(),
          registrationId: row.registrationId == null ? null : Number(row.registrationId),
          customerName: row.customerName == null ? null : String(row.customerName),
          customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
          orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
          createdAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
          kind: row.registrationId == null ? null : 'PEDIDO' as const,
        };
      }).filter((row: any) => row.email);
    }),

    syncEmailHistory: adminProcedure
      .input(z.object({
        items: z.array(z.object({
          email: z.string().min(3).max(320),
          createdAt: z.string().optional(),
        })).max(1000),
      }))
      .mutation(async ({ input }) => {
        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });

        let saved = 0;
        for (const item of input.items) {
          const email = String(item.email || '').trim().toLowerCase();
          const at = email.lastIndexOf('@');
          if (at <= 0 || at >= email.length - 1) continue;
          const domain = email.slice(at + 1);
          const parsed = item.createdAt ? new Date(item.createdAt) : new Date();
          const createdAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
          await (db as any).execute(sql\`
            INSERT INTO emailGeneratorHistory (emailAddress, domain, createdAt, updatedAt)
            VALUES (${email}, ${domain}, ${createdAt}, NOW())
            ON DUPLICATE KEY UPDATE
              domain=VALUES(domain),
              createdAt=LEAST(createdAt, VALUES(createdAt)),
              updatedAt=NOW()
          \`);
          saved += 1;
        }
        return { success: true, saved } as const;
      }),

    // Admin busca dados de login de um pedido`,
  'backend global history and sync'
);

fs.writeFileSync(routerPath, router);

let generator = fs.readFileSync(generatorPath, 'utf8');

generator = replaceOnce(
  generator,
`  const [search, setSearch] = useState("");
  const [historyDomain, setHistoryDomain] = useState("all");`,
`  const [search, setSearch] = useState("");
  const [historyDomain, setHistoryDomain] = useState("all");
  const localHistoryMigrated = useRef(false);

  const emailHistoryQuery = trpc.loginData.emailHistory.useQuery(undefined, {
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const syncEmailHistoryMutation = trpc.loginData.syncEmailHistory.useMutation();

  useEffect(() => {
    if (localHistoryMigrated.current || emailHistoryQuery.isLoading) return;
    localHistoryMigrated.current = true;
    const items = history
      .map(item => ({ email: item.email.trim().toLowerCase(), createdAt: item.createdAt }))
      .filter(item => item.email);
    if (!items.length) return;
    syncEmailHistoryMutation.mutate({ items }, {
      onSuccess: async () => { await emailHistoryQuery.refetch(); },
      onError: () => { localHistoryMigrated.current = false; },
    });
  }, [emailHistoryQuery.isLoading]);

  const ownersByEmail = useMemo(() => {
    const map = new Map<string, Array<{ kind: string; customerName: string; customerNumber: number | null; orderNumber: number | null; registrationId: number }>>();
    for (const owner of (emailHistoryQuery.data || [])) {
      if (!owner.registrationId || !owner.kind) continue;
      const email = String(owner.email || '').trim().toLowerCase();
      if (!email) continue;
      const list = map.get(email) || [];
      if (!list.some(item => item.registrationId === owner.registrationId)) {
        list.push({
          kind: owner.kind,
          customerName: owner.customerName || 'Cliente',
          customerNumber: owner.customerNumber,
          orderNumber: owner.orderNumber,
          registrationId: owner.registrationId,
        });
      }
      map.set(email, list);
    }
    return map;
  }, [emailHistoryQuery.data]);

  const allHistory = useMemo(() => {
    const merged = new Map<string, HistoryItem>();
    for (const row of (emailHistoryQuery.data || [])) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!email) continue;
      const current = merged.get(email);
      const createdAt = row.createdAt || new Date().toISOString();
      if (!current || new Date(createdAt).getTime() < new Date(current.createdAt).getTime()) {
        merged.set(email, {
          id: 'global-' + email,
          email,
          domain: email.split('@')[1] || '',
          createdAt,
        });
      }
    }
    return Array.from(merged.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [emailHistoryQuery.data]);

  const historyDomains = useMemo(
    () => Array.from(new Set(allHistory.map(item => item.domain).filter(Boolean))).sort(),
    [allHistory],
  );`,
  'client single global source'
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
    return allHistory.filter(item => {
      if (!term && historyDomain !== "all" && item.domain !== historyDomain) return false;
      if (!term) return true;
      const owners = ownersByEmail.get(item.email.trim().toLowerCase()) || [];
      const ownerText = owners
        .map(owner => [owner.kind, owner.customerName, owner.customerNumber ? '*' + owner.customerNumber : '', owner.orderNumber ? '#' + owner.orderNumber : ''].filter(Boolean).join(' '))
        .join(' ')
        .toLowerCase();
      return item.email.toLowerCase().includes(term) || ownerText.includes(term);
    });
  }, [allHistory, historyDomain, search, ownersByEmail]);`,
  'client global filter'
);

generator = replaceOnce(
  generator,
`  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return history.filter(item => new Date(item.createdAt).toDateString() === today).length;
  }, [history]);`,
`  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return allHistory.filter(item => new Date(item.createdAt).toDateString() === today).length;
  }, [allHistory]);`,
  'global today count'
);

generator = replaceOnce(
  generator,
`  const generate = () => {
    const count = Math.min(50, Math.max(1, Math.trunc(batchSize || 1)));
    const used = new Set(history.map(item => item.email.toLowerCase()));`,
`  const generate = () => {
    const count = Math.min(50, Math.max(1, Math.trunc(batchSize || 1)));
    const used = new Set([...allHistory.map(item => item.email.toLowerCase()), ...history.map(item => item.email.toLowerCase())]);`,
  'prevent reuse against global history'
);

generator = replaceOnce(
  generator,
`    setBatchSize(count);
    setCurrentEmail(generated[0].email);
    setHistory(current => [...generated, ...current]);
    toast.success(count === 1 ? "Novo e-mail gerado." : \`${'${count}'} e-mails gerados.\`);`,
`    setBatchSize(count);
    setCurrentEmail(generated[0].email);
    setHistory(current => [...generated, ...current]);
    syncEmailHistoryMutation.mutate({
      items: generated.map(item => ({ email: item.email, createdAt: item.createdAt })),
    }, {
      onSuccess: async () => {
        await emailHistoryQuery.refetch();
        toast.success(count === 1 ? "Novo e-mail gerado e salvo no histórico global." : \`${'${count}'} e-mails gerados e salvos no histórico global.\`);
      },
      onError: () => toast.error("E-mail gerado, mas não foi possível sincronizar o histórico global agora."),
    });`,
  'save generated globally'
);

generator = replaceOnce(
  generator,
`  const exportHistory = () => {
    if (!history.length) {`,
`  const exportHistory = () => {
    if (!allHistory.length) {`,
  'export global empty check'
);
generator = replaceOnce(generator, `    const lines = history\n      .slice()`, `    const lines = allHistory\n      .slice()`, 'export global rows');

generator = replaceOnce(
  generator,
`      .map((item, index) => \`${'${index + 1}'}\\t${'${item.email}'}\\t${'${item.createdAt}'}\`)`,
`      .map((item, index) => {
        const owners = ownersByEmail.get(item.email.trim().toLowerCase()) || [];
        const ownerText = owners.length
          ? owners.map(owner => [owner.kind, owner.customerNumber ? '*' + owner.customerNumber : null, owner.customerName, owner.orderNumber ? '#' + owner.orderNumber : null].filter(Boolean).join(' | ')).join(' / ')
          : 'SEM VÍNCULO';
        return [index + 1, item.email, ownerText, item.createdAt].join('\\t');
      })`,
  'export owner info'
);

generator = replaceOnce(
  generator,
`  const clearHistory = () => {
    if (!history.length) return;
    if (!window.confirm("Apagar todo o histórico deste navegador?")) return;
    setHistory([]);
    setCurrentEmail("");
    toast.success("Histórico apagado.");
  };`,
`  const clearHistory = () => {
    if (!history.length) {
      toast.info("Não há histórico local pendente neste aparelho.");
      return;
    }
    if (!window.confirm("Limpar apenas a cópia local deste aparelho? O histórico global será preservado.")) return;
    setHistory([]);
    setCurrentEmail("");
    toast.success("Cópia local limpa. O histórico global foi preservado.");
  };`,
  'clear local only'
);

generator = replaceOnce(
  generator,
`  const deleteHistoryItem = (id: string) => {
    setHistory(current => current.filter(item => item.id !== id));
  };`,
`  const deleteHistoryItem = (id: string) => {
    if (id.startsWith('global-')) {
      toast.info("Esse e-mail pertence ao histórico global e não é apagado por aparelho.");
      return;
    }
    setHistory(current => current.filter(item => item.id !== id));
  };`,
  'protect global rows'
);

generator = replaceOnce(generator, `{history.length}</p></div>`, `{allHistory.length}</p></div>`, 'global total counter');
generator = replaceOnce(generator, `{config.domains.length}</p></div>`, `{historyDomains.length}</p></div>`, 'global domain counter');
generator = replaceOnce(generator, `Salvo automaticamente neste navegador.`, `Histórico global sincronizado entre computador e celular.`, 'history subtitle');
generator = replaceOnce(generator, `placeholder="Buscar e-mail..."`, `placeholder="Buscar e-mail, cliente, código ou pedido..."`, 'history search placeholder');
generator = replaceOnce(generator, `#{history.length - history.indexOf(item)}`, `#{allHistory.length - allHistory.indexOf(item)}`, 'global history numbering');

generator = replaceOnce(
  generator,
`                    <button type="button" onClick={() => copyEmail(item.email)} className="min-w-0 text-left">
                      <span className="block break-all text-sm font-bold text-slate-100 hover:text-[#FFD400]">{item.email}</span>
                      <span className="mt-1 block text-[10px] font-medium text-slate-600 sm:hidden">{formatDate(item.createdAt)}</span>`,
`                    <button type="button" onClick={() => copyEmail(item.email)} className="min-w-0 text-left">
                      <span className="block break-all text-sm font-bold text-slate-100 hover:text-[#FFD400]">{item.email}</span>
                      {(() => {
                        const owners = ownersByEmail.get(item.email.trim().toLowerCase()) || [];
                        if (!owners.length) return <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">SEM VÍNCULO</span>;
                        return <span className="mt-1 block space-y-0.5">{owners.map(owner => (
                          <span key={item.id + '-' + owner.registrationId} className="block text-[10px] font-bold text-emerald-300">
                            {owner.kind} | {owner.customerNumber ? '*' + owner.customerNumber + ' | ' : ''}{owner.customerName}{owner.orderNumber ? ' | #' + owner.orderNumber : ''}
                          </span>
                        ))}</span>;
                      })()}
                      <span className="mt-1 block text-[10px] font-medium text-slate-600 sm:hidden">{formatDate(item.createdAt)}</span>`,
  'history ownership display'
);

generator = replaceOnce(
  generator,
`<p>Os domínios e o prefixo são salvos no sistema do ADM. O histórico dos endereços gerados permanece local neste navegador para evitar repetição sem transformar o banco de configurações em uma lista crescente de e-mails.</p>`,
`<p>O histórico agora é global: computador e celular usam a mesma lista. E-mails antigos vinculados a pedidos também aparecem com o proprietário identificado.</p>`,
  'history explanation'
);

fs.writeFileSync(generatorPath, generator);
console.log('[email-history-owner] histórico único global entre dispositivos aplicado.');
