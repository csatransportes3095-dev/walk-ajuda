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
    // Histórico global: recupera todos os e-mails já salvos nos pedidos.
    // O vínculo é sempre pelo loginEmail real do pedido; não há associação por aproximação.
    emailHistory: adminProcedure
      .query(async () => {
        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });

        const result = await (db as any).execute(sql.raw(\`
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
          ORDER BY old.updatedAt DESC, old.id DESC
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
          createdAt: string;
          kind: 'PEDIDO';
        }> = [];

        for (const row of rows) {
          const email = String(row.email || '').trim().toLowerCase();
          const registrationId = Number(row.registrationId);
          if (!email || !Number.isSafeInteger(registrationId) || registrationId <= 0) continue;
          const key = email + '|' + registrationId;
          if (seen.has(key)) continue;
          seen.add(key);
          const date = row.createdAt ? new Date(row.createdAt) : new Date();
          output.push({
            email,
            registrationId,
            customerName: String(row.customerName || 'Cliente'),
            customerNumber: row.customerNumber == null ? null : Number(row.customerNumber),
            orderNumber: row.orderNumber == null ? null : Number(row.orderNumber),
            createdAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
            kind: 'PEDIDO',
          });
        }

        return output;
      }),

    // Admin busca dados de login de um pedido`,
  'backend global emailHistory'
);

fs.writeFileSync(routerPath, router);

let generator = fs.readFileSync(generatorPath, 'utf8');

generator = replaceOnce(
  generator,
`  const [search, setSearch] = useState("");
  const [historyDomain, setHistoryDomain] = useState("all");`,
`  const [search, setSearch] = useState("");
  const [historyDomain, setHistoryDomain] = useState("all");

  const emailHistoryQuery = trpc.loginData.emailHistory.useQuery(undefined, {
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const ownersByEmail = useMemo(() => {
    const map = new Map<string, Array<{ kind: string; customerName: string; customerNumber: number | null; orderNumber: number | null; registrationId: number }>>();
    for (const owner of (emailHistoryQuery.data || [])) {
      const email = String(owner.email || '').trim().toLowerCase();
      if (!email) continue;
      const list = map.get(email) || [];
      list.push(owner);
      map.set(email, list);
    }
    return map;
  }, [emailHistoryQuery.data]);

  const allHistory = useMemo(() => {
    const merged = new Map<string, HistoryItem>();
    for (const owner of (emailHistoryQuery.data || [])) {
      const email = String(owner.email || '').trim().toLowerCase();
      if (!email || merged.has(email)) continue;
      merged.set(email, {
        id: 'system-' + owner.registrationId + '-' + email,
        email,
        domain: email.split('@')[1] || '',
        createdAt: owner.createdAt || new Date().toISOString(),
      });
    }
    for (const item of history) {
      const email = item.email.trim().toLowerCase();
      if (!email || merged.has(email)) continue;
      merged.set(email, item);
    }
    return Array.from(merged.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [emailHistoryQuery.data, history]);

  const historyDomains = useMemo(
    () => Array.from(new Set(allHistory.map(item => item.domain).filter(Boolean))).sort(),
    [allHistory],
  );`,
  'client global history query'
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
      // Quando há uma busca digitada, ela pesquisa em TODOS os domínios.
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
`    const used = new Set(history.map(item => item.email.toLowerCase()));`,
`    const used = new Set(allHistory.map(item => item.email.toLowerCase()));`,
  'prevent reuse against global history'
);

generator = replaceOnce(
  generator,
`  const exportHistory = () => {
    if (!history.length) {
      toast.info("O histórico está vazio.");
      return;
    }
    const lines = history
      .slice()
      .reverse()
      .map((item, index) => \`${'${index + 1}'}\\t${'${item.email}'}\\t${'${item.createdAt}'}\`)
      .join("\\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = \`historico_emails_h2_${'${new Date().toISOString().slice(0, 10)}'}.txt\`;
    anchor.click();
    URL.revokeObjectURL(url);
  };`,
`  const exportHistory = () => {
    if (!allHistory.length) {
      toast.info("O histórico está vazio.");
      return;
    }
    const lines = allHistory
      .slice()
      .reverse()
      .map((item, index) => {
        const owners = ownersByEmail.get(item.email.trim().toLowerCase()) || [];
        const ownerText = owners.length
          ? owners.map(owner => [owner.kind, owner.customerNumber ? '*' + owner.customerNumber : null, owner.customerName, owner.orderNumber ? '#' + owner.orderNumber : null].filter(Boolean).join(' | ')).join(' / ')
          : 'SEM VÍNCULO';
        return [index + 1, item.email, ownerText, item.createdAt].join('\\t');
      })
      .join("\\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = \`historico_emails_h2_${'${new Date().toISOString().slice(0, 10)}'}.txt\`;
    anchor.click();
    URL.revokeObjectURL(url);
  };`,
  'export global history'
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
      toast.info("Não há e-mails locais para limpar.");
      return;
    }
    if (!window.confirm("Apagar somente os e-mails gerados neste navegador? Os e-mails já vinculados a pedidos continuarão no histórico do sistema.")) return;
    setHistory([]);
    setCurrentEmail("");
    toast.success("Histórico local apagado. Os e-mails vinculados a pedidos foram preservados.");
  };`,
  'clear local only'
);

generator = replaceOnce(
  generator,
`  const deleteHistoryItem = (id: string) => {
    setHistory(current => current.filter(item => item.id !== id));
  };`,
`  const deleteHistoryItem = (id: string) => {
    if (id.startsWith('system-')) {
      toast.info("Esse e-mail está vinculado a um pedido e permanece no histórico do sistema.");
      return;
    }
    setHistory(current => current.filter(item => item.id !== id));
  };`,
  'protect system history rows'
);

generator = replaceOnce(generator, `{history.length}</p></div>`, `{allHistory.length}</p></div>`, 'global total counter');
generator = replaceOnce(generator, `{config.domains.length}</p></div>`, `{historyDomains.length}</p></div>`, 'global domain counter');
generator = replaceOnce(generator, `Salvo automaticamente neste navegador.`, `E-mails antigos dos pedidos + novos gerados neste navegador.`, 'history subtitle');
generator = replaceOnce(generator, `placeholder="Buscar e-mail..."`, `placeholder="Buscar e-mail, cliente, código ou pedido..."`, 'history search placeholder');
generator = replaceOnce(generator, `{config.domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}`, `{historyDomains.map(domain => <option key={domain} value={domain}>{domain}</option>)}`, 'history domain options');
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

generator = replaceOnce(
  generator,
`<p>Os domínios e o prefixo são salvos no sistema do ADM. O histórico dos endereços gerados permanece local neste navegador para evitar repetição sem transformar o banco de configurações em uma lista crescente de e-mails.</p>`,
`<p>O histórico combina os e-mails já usados nos pedidos com os endereços recém-gerados neste navegador. Quando um e-mail estiver salvo em um pedido, o painel mostra automaticamente a quem ele pertence.</p>`,
  'history explanation'
);

fs.writeFileSync(generatorPath, generator);
console.log('[email-history-owner] histórico global carregado do banco e unido ao histórico local.');
