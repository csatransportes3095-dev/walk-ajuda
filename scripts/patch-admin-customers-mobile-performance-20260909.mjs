import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), 'client/src/pages/AdminCustomers.tsx');
let source = fs.readFileSync(file, 'utf8');

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`[admin-customers-mobile] ${label}: trecho esperado não encontrado.`);
  }
  source = source.replace(before, after);
}

replaceRequired(
  'import { useEffect, useState } from "react";',
  'import { useEffect, useMemo, useState } from "react";',
  'import useMemo'
);

replaceRequired(
  '  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">("newest");',
  '  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">("newest");\n  // Mantém poucos cards montados no celular; busca e filtros continuam considerando todos os clientes.\n  const [visibleCustomerLimit, setVisibleCustomerLimit] = useState(24);',
  'estado de renderização incremental'
);

const loanLookupBefore = `  const normalizeLoanCardPhone = (value: unknown) => {
    let digits = String(value ?? '').replace(/\\D/g, '');
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
    return digits;
  };
  const hasLoanForCustomer = (customer: Customer) => {
    const phone = normalizeLoanCardPhone(customer.phone);
    const cpf = String(customer.cpf ?? '').replace(/\\D/g, '');
    return ((loanClientsForCardColorQuery.data || []) as any[]).some((loanClient: any) => {
      if (Number(loanClient.totalLoans || 0) <= 0) return false;
      const loanPhone = normalizeLoanCardPhone(loanClient.phone);
      const loanCpf = String(loanClient.cpf ?? '').replace(/\\D/g, '');
      return (!!phone && !!loanPhone && phone === loanPhone) || (!!cpf && !!loanCpf && cpf === loanCpf);
    });
  };`;

const loanLookupAfter = `  const normalizeLoanCardPhone = (value: unknown) => {
    let digits = String(value ?? '').replace(/\\D/g, '');
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
    return digits;
  };
  // Índice O(1): antes cada card percorria toda a lista de empréstimos várias vezes.
  const loanCardIndex = useMemo(() => {
    const phones = new Set<string>();
    const cpfs = new Set<string>();
    for (const loanClient of (loanClientsForCardColorQuery.data || []) as any[]) {
      if (Number(loanClient.totalLoans || 0) <= 0) continue;
      const loanPhone = normalizeLoanCardPhone(loanClient.phone);
      const loanCpf = String(loanClient.cpf ?? '').replace(/\\D/g, '');
      if (loanPhone) phones.add(loanPhone);
      if (loanCpf) cpfs.add(loanCpf);
    }
    return { phones, cpfs };
  }, [loanClientsForCardColorQuery.data]);
  const hasLoanForCustomer = (customer: Customer) => {
    const phone = normalizeLoanCardPhone(customer.phone);
    const cpf = String(customer.cpf ?? '').replace(/\\D/g, '');
    return (!!phone && loanCardIndex.phones.has(phone)) || (!!cpf && loanCardIndex.cpfs.has(cpf));
  };`;

replaceRequired(loanLookupBefore, loanLookupAfter, 'índice de empréstimos');

replaceRequired(
  `    if (showOnlyBlocked) return matchSearch && c.blocked === 1;
    return matchSearch;
  });

  const startEdit = (c: Customer) => {`,
  `    if (showOnlyBlocked) return matchSearch && c.blocked === 1;
    return matchSearch;
  });

  const visibleCustomers = filtered.slice(0, visibleCustomerLimit);

  useEffect(() => {
    // Ao mudar busca/filtro, volta ao primeiro lote para a tela responder imediatamente.
    setVisibleCustomerLimit(24);
  }, [searchTerm, sortOrder, showOnlyVip, showOnlyOrders, showOnlyBlocked]);

  const startEdit = (c: Customer) => {`,
  'lista visível incremental'
);

replaceRequired(
  '          {filtered.map((c) => (',
  '          {visibleCustomers.map((c) => (',
  'renderização dos cards visíveis'
);

replaceRequired(
  "className={`rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5 ${selectedIds.has(c.id) ? 'ring-2 ring-green-400' : editingId === c.id ? 'ring-2 ring-blue-400' : ''}`}",
  "className={`rounded-2xl overflow-hidden md:transition-[transform,box-shadow,border-color] md:hover:-translate-y-0.5 [content-visibility:auto] [contain-intrinsic-size:420px] ${selectedIds.has(c.id) ? 'ring-2 ring-green-400' : editingId === c.id ? 'ring-2 ring-blue-400' : ''}`}",
  'card sem animação pesada no toque'
);

replaceRequired(
  `                      <img
                        src={getProfilePhotoDisplayUrl(c.profilePhotoUrl)}`,
  `                      <img
                        loading="lazy"
                        decoding="async"
                        src={getProfilePhotoDisplayUrl(c.profilePhotoUrl)}`,
  'lazy-load da foto'
);

replaceRequired(
  `                  <button
                    onClick={() => toggleSelect(c.id)}
                    className={\`mt-1 flex-shrink-0 transition-colors \${selectedIds.has(c.id) ? 'text-green-400' : 'text-muted-foreground hover:text-foreground'}\`}`,
  `                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(c.id); }}
                    className={\`mt-0 flex h-10 w-10 flex-shrink-0 touch-manipulation items-center justify-center rounded-lg transition-colors active:scale-95 \${selectedIds.has(c.id) ? 'text-green-400 bg-green-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}\`}`,
  'checkbox com área de toque segura'
);

const actionsBefore = `                    {/* Ações */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      <button onClick={() => setReferralModal(c)} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors" title="Links de Indicação">
                        <Link2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setFilesModal(c)} className="p-1.5 text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-colors" title="Ver Documentos de Pedidos">
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button onClick={() => setCustomerDocumentsModal(c)} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors" title="Documentos do Cliente">
                        <FileText className="w-4 h-4" />
                      </button>
                      <button onClick={() => setLocation(\`/admin/codes?phone=\${encodeURIComponent(c.phone)}\`)} className="p-1.5 text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors" title="Gerenciar Senha de Acesso">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(c.name).then(() => toast.success('Nome copiado!')).catch(() => toast.error('Erro ao copiar')); }} className="p-1.5 text-violet-300 hover:bg-violet-400/10 rounded-lg transition-colors" title="Copiar nome">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => startEdit(c)} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {c.blocked ? (
                        <button onClick={() => unblockMut.mutate({ id: c.id })} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors" title="Desbloquear cadastro">
                          <Unlock className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => { setBlockModal(c); setBlockReasonInput(""); }} className="p-1.5 text-orange-400 hover:bg-orange-400/10 rounded-lg transition-colors" title="Bloquear cadastro">
                          <Lock className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(c.id, c.name)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>`;

const actionsAfter = `                    {/* Ações */}
                    <div
                      className="flex gap-1.5 mt-2 flex-wrap"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button type="button" onClick={() => setReferralModal(c)} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-green-400 transition-colors hover:bg-green-400/10 active:scale-95" title="Links de Indicação">
                        <Link2 className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setFilesModal(c)} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-cyan-400 transition-colors hover:bg-cyan-400/10 active:scale-95" title="Ver Documentos de Pedidos">
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setCustomerDocumentsModal(c)} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-green-400 transition-colors hover:bg-green-400/10 active:scale-95" title="Documentos do Cliente">
                        <FileText className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setLocation(\`/admin/codes?phone=\${encodeURIComponent(c.phone)}\`)} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-yellow-400 transition-colors hover:bg-yellow-400/10 active:scale-95" title="Gerenciar Senha de Acesso">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => { navigator.clipboard.writeText(c.name).then(() => toast.success('Nome copiado!')).catch(() => toast.error('Erro ao copiar')); }} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-violet-300 transition-colors hover:bg-violet-400/10 active:scale-95" title="Copiar nome">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => startEdit(c)} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-blue-400 transition-colors hover:bg-blue-400/10 active:scale-95" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      {c.blocked ? (
                        <button type="button" onClick={() => unblockMut.mutate({ id: c.id })} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-green-400 transition-colors hover:bg-green-400/10 active:scale-95" title="Desbloquear cadastro">
                          <Unlock className="w-4 h-4" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => { setBlockModal(c); setBlockReasonInput(""); }} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-orange-400 transition-colors hover:bg-orange-400/10 active:scale-95" title="Bloquear cadastro">
                          <Lock className="w-4 h-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => handleDelete(c.id, c.name)} className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-400/10 active:scale-95" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>`;

replaceRequired(actionsBefore, actionsAfter, 'botões de ação isolados');

replaceRequired(
  `                  <button type="button" onClick={() => toggleCustomerDetails(c.id)} className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[10px] font-bold text-cyan-100 transition hover:bg-cyan-500/10">`,
  `                  <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggleCustomerDetails(c.id); }} className="mt-2 w-full touch-manipulation rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2.5 text-[11px] font-bold text-cyan-100 transition-colors hover:bg-cyan-500/10 active:bg-cyan-500/20">`,
  'botão de detalhes com toque isolado'
);

replaceRequired(
  `          ))}
        </div>

        {filtered.length === 0 && (`,
  `          ))}
        </div>

        {visibleCustomers.length < filtered.length && (
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setVisibleCustomerLimit((current) => Math.min(current + 24, filtered.length))}
              className="touch-manipulation rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-xs font-bold text-cyan-200 transition-colors hover:bg-cyan-500/20 active:bg-cyan-500/30"
            >
              Mostrar mais {Math.min(24, filtered.length - visibleCustomers.length)} clientes
            </button>
            <span className="text-[10px] text-muted-foreground">Mostrando {visibleCustomers.length} de {filtered.length}</span>
          </div>
        )}

        {filtered.length === 0 && (`,
  'botão mostrar mais'
);

fs.writeFileSync(file, source);
console.log('[admin-customers-mobile] OK: cards em lotes, empréstimos indexados, fotos lazy e toques isolados.');
