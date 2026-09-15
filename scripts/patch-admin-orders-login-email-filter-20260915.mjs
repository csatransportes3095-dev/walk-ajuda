import fs from 'node:fs';

const serverPath = 'server/routers.ts';
const clientPath = 'client/src/pages/AdminOrders.tsx';

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    throw new Error(`[login-email-filter] Trecho nao encontrado: ${label}`);
  }
  return source.replace(from, to);
}

let server = fs.readFileSync(serverPath, 'utf8');

server = replaceOnce(
  server,
`      const hiddenRows = (hiddenResult as any)[0] as Array<{ registrationId: number; subOrderIndex: number }>;
      const hiddenSet = new Set(hiddenRows.map((h: any) => \`${'${h.registrationId}_${h.subOrderIndex}'}\`));

      // Agrupar histórico por registrationId`,
`      const hiddenRows = (hiddenResult as any)[0] as Array<{ registrationId: number; subOrderIndex: number }>;
      const hiddenSet = new Set(hiddenRows.map((h: any) => \`${'${h.registrationId}_${h.subOrderIndex}'}\`));

      // E-mail/login criado para o pedido (diferente do e-mail cadastral do cliente).
      // Usado apenas para consulta/filtro no ADM de pedidos.
      const loginEmailByRegId = new Map<number, string | null>();
      try {
        const loginEmailResult = await db.execute(
          sql.raw(\`SELECT registrationId, loginEmail FROM orderLoginData WHERE registrationId IN (${'${idsList}'})\`)
        );
        const loginEmailRows = (loginEmailResult as any)[0] as Array<{ registrationId: number; loginEmail: string | null }>;
        for (const loginRow of (loginEmailRows || [])) {
          const rawLoginEmail = loginRow.loginEmail;
          const cleanLoginEmail = rawLoginEmail === null || rawLoginEmail === undefined || rawLoginEmail === 'NULL' || rawLoginEmail === 'null'
            ? null
            : String(rawLoginEmail).trim();
          loginEmailByRegId.set(Number(loginRow.registrationId), cleanLoginEmail || null);
        }
      } catch (e) {
        console.error('[listOrders] Erro ao buscar e-mail de login dos pedidos:', e);
      }

      // Agrupar histórico por registrationId`,
  'backend map loginEmail'
);

server = replaceOnce(
  server,
`        return {
          ...o,
          hasNewDocResponse: answeredDocReqIds.has(Number(o.id)),`,
`        return {
          ...o,
          loginEmail: loginEmailByRegId.get(Number(o.id)) ?? null,
          hasNewDocResponse: answeredDocReqIds.has(Number(o.id)),`,
  'backend expose loginEmail'
);

fs.writeFileSync(serverPath, server);

let client = fs.readFileSync(clientPath, 'utf8');

client = replaceOnce(
  client,
`  customerEmail: string | null;
  customerName: string | null;`,
`  customerEmail: string | null;
  loginEmail: string | null;
  customerName: string | null;`,
  'Order type loginEmail'
);

client = replaceOnce(
  client,
`  const [deliveredSortKey, setDeliveredSortKey] = useState<DeliveredSortKey>("notified");
  const [deliveredSortDir, setDeliveredSortDir] = useState<FolderSortDir>("desc");
  const [deliveredPhoneFilter, setDeliveredPhoneFilter] = useState("");`,
`  const [deliveredSortKey, setDeliveredSortKey] = useState<DeliveredSortKey>("notified");
  const [deliveredSortDir, setDeliveredSortDir] = useState<FolderSortDir>("desc");
  const [activeLoginEmailFilter, setActiveLoginEmailFilter] = useState("");
  const [deliveredPhoneFilter, setDeliveredPhoneFilter] = useState("");
  const [deliveredLoginEmailFilter, setDeliveredLoginEmailFilter] = useState("");`,
  'filter states'
);

client = replaceOnce(
  client,
`    const email = (o.customerEmail || "").toLowerCase();
    const numericPrefix = (o.customerName || o.codeClientName || "").trim().match(/^(\\d+)/)?.[1] || "";`,
`    const email = (o.customerEmail || "").toLowerCase();
    const loginEmail = (o.loginEmail || "").toLowerCase();
    const loginEmailTerm = activeLoginEmailFilter.trim().toLowerCase();
    const matchLoginEmail = !loginEmailTerm || loginEmail.includes(loginEmailTerm);
    const numericPrefix = (o.customerName || o.codeClientName || "").trim().match(/^(\\d+)/)?.[1] || "";`,
  'active login filter variables'
);

client = replaceOnce(
  client,
`    if (rawTerm) return matchSearch && !isDelivered;
    return matchSearch && matchStatus && matchUrgent && matchIndicador && matchDate && !isDelivered;`,
`    if (rawTerm) return matchSearch && matchLoginEmail && !isDelivered;
    return matchSearch && matchLoginEmail && matchStatus && matchUrgent && matchIndicador && matchDate && !isDelivered;`,
  'active filter application'
);

client = replaceOnce(
  client,
`  const deliveredPhoneClean = deliveredPhoneFilter.replace(/\\D/g, '');
  const deliveredOrders = sortDeliveredOrders(
    orders.filter(o => {
      if (!isDeliveredStatus(o.latestStatus)) return false;
      if (!deliveredPhoneClean) return true;
      const orderPhone = (o.phone || '').replace(/\\D/g, '');
      return orderPhone.includes(deliveredPhoneClean);
    }),`,
`  const deliveredPhoneClean = deliveredPhoneFilter.replace(/\\D/g, '');
  const deliveredLoginEmailClean = deliveredLoginEmailFilter.trim().toLowerCase();
  const deliveredOrders = sortDeliveredOrders(
    orders.filter(o => {
      if (!isDeliveredStatus(o.latestStatus)) return false;
      const orderPhone = (o.phone || '').replace(/\\D/g, '');
      const loginEmail = (o.loginEmail || '').toLowerCase();
      const matchPhone = !deliveredPhoneClean || orderPhone.includes(deliveredPhoneClean);
      const matchLoginEmail = !deliveredLoginEmailClean || loginEmail.includes(deliveredLoginEmailClean);
      return matchPhone && matchLoginEmail;
    }),`,
  'delivered filter application'
);

client = replaceOnce(
  client,
`          </div>

          {/* Filtros colápsáveis */}`,
`          </div>

          {/* Filtro independente pelo e-mail/login criado e entregue ao cliente */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
              <input
                type="text"
                value={activeLoginEmailFilter}
                onChange={e => setActiveLoginEmailFilter(e.target.value)}
                placeholder="Pesquisar pedido em andamento por e-mail/login criado..."
                className="w-full pl-9 pr-4 py-2 bg-card border border-cyan-500/30 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            {activeLoginEmailFilter && (
              <button
                type="button"
                onClick={() => setActiveLoginEmailFilter('')}
                className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/20"
                title="Limpar filtro de login"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtros colápsáveis */}`,
  'active login email input'
);

client = replaceOnce(
  client,
`                  {/* Filtro por telefone */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={deliveredPhoneFilter}
                      onChange={e => setDeliveredPhoneFilter(e.target.value)}
                      placeholder="Filtrar por telefone..."
                      className="flex-1 h-8 px-3 rounded-lg bg-black/30 border border-teal-500/30 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-teal-400/60"
                    />
                    {deliveredPhoneFilter && (
                      <button onClick={() => setDeliveredPhoneFilter('')} className="h-8 px-2 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs hover:bg-teal-500/30">✕ Limpar</button>
                    )}
                  </div>`,
`                  {/* Filtros independentes por telefone e pelo e-mail/login criado */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={deliveredPhoneFilter}
                        onChange={e => setDeliveredPhoneFilter(e.target.value)}
                        placeholder="Filtrar por telefone..."
                        className="flex-1 h-8 px-3 rounded-lg bg-black/30 border border-teal-500/30 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-teal-400/60"
                      />
                      {deliveredPhoneFilter && (
                        <button onClick={() => setDeliveredPhoneFilter('')} className="h-8 px-2 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs hover:bg-teal-500/30" title="Limpar telefone">✕</button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={deliveredLoginEmailFilter}
                        onChange={e => setDeliveredLoginEmailFilter(e.target.value)}
                        placeholder="Filtrar por e-mail/login criado..."
                        className="flex-1 h-8 px-3 rounded-lg bg-black/30 border border-cyan-500/30 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400/60"
                      />
                      {deliveredLoginEmailFilter && (
                        <button onClick={() => setDeliveredLoginEmailFilter('')} className="h-8 px-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs hover:bg-cyan-500/30" title="Limpar login">✕</button>
                      )}
                    </div>
                  </div>`,
  'delivered login email input'
);

fs.writeFileSync(clientPath, client);
console.log('[login-email-filter] Filtros por e-mail/login aplicados ao painel de pedidos.');
