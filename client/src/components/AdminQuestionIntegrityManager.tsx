import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const AUDIT_PRODUCT = "UBER APP";
const AUDIT_OPTION = "NOME ALEATÓRIO";
const AUDIT_EXPECTED_COUNT = 14;

type OptionChoice = {
  productId: number;
  productName: string;
  optionId: number;
  optionLabel: string;
  questionCount: number;
};

function normalize(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function optionText(option: OptionChoice) {
  return `${option.productName} / ${option.optionLabel} (${option.questionCount} perguntas)`;
}

export default function AdminQuestionIntegrityManager() {
  const isAdminProducts = typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/admin/products";
  const { data: products = [] } = trpc.products.list.useQuery(undefined, { enabled: isAdminProducts });
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [destinationId, setDestinationId] = useState<number | null>(null);
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState("");

  const options = useMemo<OptionChoice[]>(() => {
    const result: OptionChoice[] = [];
    for (const product of (products || []) as any[]) {
      for (const option of product.options || []) {
        result.push({
          productId: Number(product.id),
          productName: String(product.name || ""),
          optionId: Number(option.id),
          optionLabel: String(option.label || ""),
          questionCount: Array.isArray(option.questions) ? option.questions.length : 0,
        });
      }
    }
    return result.sort((a, b) => optionText(a).localeCompare(optionText(b), "pt-BR"));
  }, [products]);

  const source = options.find((option) => option.optionId === sourceId) || null;
  const destination = options.find((option) => option.optionId === destinationId) || null;

  const historyQuery = trpc.system.questionHistoryAudit.useQuery({
    productName: AUDIT_PRODUCT,
    optionLabel: AUDIT_OPTION,
    expectedCount: AUDIT_EXPECTED_COUNT,
  }, {
    enabled: isAdminProducts && open && auditEnabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const copyMutation = trpc.system.questionCopySafe.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.products.list.invalidate(),
        utils.products.listActive.invalidate(),
      ]);
      toast.success(`Cópia segura concluída: ${result.count} perguntas, ${result.subs} sub e ${result.subSubs} sub-da-sub.`);
      setSourceId(null);
      setDestinationId(null);
    },
    onError: (error) => toast.error(error.message || "A cópia segura foi bloqueada pela auditoria."),
  });

  const restoreMutation = trpc.system.questionRestoreHistory.useMutation({
    onSuccess: async (result) => {
      await Promise.all([
        utils.products.list.invalidate(),
        utils.products.listActive.invalidate(),
        historyQuery.refetch(),
      ]);
      toast.success(`Recuperação concluída: ${result.count} perguntas restauradas do snapshot.`);
    },
    onError: (error) => toast.error(error.message || "A restauração histórica foi bloqueada."),
  });

  useEffect(() => {
    if (!isAdminProducts) return;
    const hideLegacyCopyButtons = () => {
      for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("button"))) {
        const text = normalize(button.textContent || "");
        if (text === "📋 COPIAR DE OUTRO PRODUTO" || text === "COPIAR DE OUTRO PRODUTO") {
          button.style.display = "none";
          button.dataset.h2LegacyCopyHidden = "1";
        }
      }
    };
    hideLegacyCopyButtons();
    const observer = new MutationObserver(hideLegacyCopyButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isAdminProducts]);

  if (!isAdminProducts) return null;

  const history = historyQuery.data;
  const snapshots = history?.snapshots || [];
  const exactMatches = snapshots.filter((snapshot: any) => snapshot.matchesExpectedCount === true && !snapshot.current);
  const snapshotToRestore = snapshots.find((snapshot: any) => snapshot.source === selectedSnapshot && !snapshot.current);

  const runCopy = () => {
    if (!source || !destination) {
      toast.error("Escolha a origem e o destino.");
      return;
    }
    if (source.optionId === destination.optionId) {
      toast.error("Origem e destino são a mesma opção.");
      return;
    }
    const ok = window.confirm(
      `SUBSTITUIR 100% das perguntas de:\n${destination.productName} / ${destination.optionLabel}\n\npelas perguntas de:\n${source.productName} / ${source.optionLabel}?\n\nA operação só será confirmada se a auditoria do servidor validar toda a árvore.`,
    );
    if (!ok) return;
    copyMutation.mutate({
      fromOptionId: source.optionId,
      toOptionId: destination.optionId,
      toProductId: destination.productId,
      confirmation: "SUBSTITUIR 100%",
    });
  };

  const restoreSnapshot = () => {
    if (!history || !snapshotToRestore) {
      toast.error("Selecione um snapshot histórico válido.");
      return;
    }
    if (snapshotToRestore.count !== AUDIT_EXPECTED_COUNT) {
      toast.error(`Esse snapshot possui ${snapshotToRestore.count}, não ${AUDIT_EXPECTED_COUNT} perguntas.`);
      return;
    }
    const ok = window.confirm(
      `RECUPERAR exatamente ${AUDIT_EXPECTED_COUNT} perguntas de ${history.target.productName} / ${history.target.optionLabel} usando ${snapshotToRestore.source}?\n\nO estado atual dessa opção será substituído. As demais opções, clientes e pedidos não serão alterados.`,
    );
    if (!ok) return;
    restoreMutation.mutate({
      tableName: snapshotToRestore.source,
      productId: history.target.productId,
      optionId: history.target.optionId,
      expectedCount: AUDIT_EXPECTED_COUNT,
      confirmation: "RESTAURAR PERGUNTAS",
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[170] rounded-full border border-cyan-400/50 bg-[#06111b] px-4 py-3 text-xs font-black text-cyan-300 shadow-[0_12px_40px_rgba(0,0,0,.55)] hover:bg-cyan-950"
      >
        🛡️ PERGUNTAS: CÓPIA SEGURA / AUDITORIA
      </button>

      {open && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-cyan-400/35 bg-[#070b12] p-5 text-white shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-black text-cyan-300">Integridade das Perguntas</p>
                <p className="mt-1 text-xs text-slate-400">As operações abaixo usam IDs reais no servidor. Não dependem do texto ou da posição dos cards.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20">Fechar</button>
            </div>

            <section className="rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-4">
              <p className="text-sm font-black text-cyan-200">Cópia 100% segura</p>
              <p className="mt-1 text-xs text-slate-400">O servidor valida a origem, cria pai antes dos filhos e desfaz tudo se qualquer pergunta ficar incompleta.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-300">
                  Origem
                  <select value={sourceId || ""} onChange={(event) => setSourceId(event.target.value ? Number(event.target.value) : null)} className="mt-1 w-full rounded-lg border border-white/15 bg-[#0c111b] p-2.5 text-xs text-white">
                    <option value="">Selecione a origem</option>
                    {options.map((option) => <option key={`src-${option.optionId}`} value={option.optionId}>{optionText(option)}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-300">
                  Destino — será substituído 100%
                  <select value={destinationId || ""} onChange={(event) => setDestinationId(event.target.value ? Number(event.target.value) : null)} className="mt-1 w-full rounded-lg border border-white/15 bg-[#0c111b] p-2.5 text-xs text-white">
                    <option value="">Selecione o destino</option>
                    {options.map((option) => <option key={`dst-${option.optionId}`} value={option.optionId}>{optionText(option)}</option>)}
                  </select>
                </label>
              </div>
              {source && destination && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
                  <p><span className="text-slate-500">ORIGEM:</span> {optionText(source)}</p>
                  <p className="mt-1"><span className="text-slate-500">DESTINO:</span> {optionText(destination)}</p>
                  <p className="mt-1 text-cyan-300">IDs: {source.optionId} → {destination.optionId}</p>
                </div>
              )}
              <button type="button" onClick={runCopy} disabled={!source || !destination || copyMutation.isPending} className="mt-4 w-full rounded-lg bg-cyan-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                {copyMutation.isPending ? "Auditando e copiando..." : "SUBSTITUIR DESTINO COM CÓPIA 100%"}
              </button>
            </section>

            <section className="mt-5 rounded-xl border border-amber-500/30 bg-amber-950/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-amber-200">Recuperação: UBER APP / NOME ALEATÓRIO — 14 perguntas</p>
                  <p className="mt-1 text-xs text-slate-400">Procura no banco atual e em todas as tabelas históricas productQuestions_backup_*.</p>
                </div>
                <button type="button" onClick={() => { setAuditEnabled(true); if (auditEnabled) void historyQuery.refetch(); }} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-black">
                  {historyQuery.isFetching ? "Auditando..." : "AUDITAR AGORA"}
                </button>
              </div>

              {auditEnabled && historyQuery.isError && (
                <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{historyQuery.error.message}</p>
              )}

              {history && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
                    <p><strong>Opção encontrada:</strong> {history.target.productName} / {history.target.optionLabel}</p>
                    <p className="mt-1 text-slate-400">optionId {history.target.optionId} · productId {history.target.productId}</p>
                    <p className="mt-1 font-bold text-amber-300">Snapshots exatos com 14 perguntas: {exactMatches.length}</p>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="bg-white/5 text-slate-400"><tr><th className="p-2">Fonte</th><th className="p-2">Perg.</th><th className="p-2">Raízes</th><th className="p-2">Sub</th><th className="p-2">Sub da sub</th><th className="p-2">Integridade</th></tr></thead>
                      <tbody>
                        {snapshots.map((snapshot: any) => (
                          <tr key={snapshot.source} className={`border-t border-white/5 ${snapshot.count === AUDIT_EXPECTED_COUNT ? "bg-amber-500/10" : ""}`}>
                            <td className="p-2 font-mono text-[11px]">{snapshot.source}{snapshot.current ? " (ATUAL)" : ""}</td>
                            <td className="p-2 font-black">{snapshot.count}</td>
                            <td className="p-2">{snapshot.audit.roots}</td>
                            <td className="p-2">{snapshot.audit.subs}</td>
                            <td className="p-2">{snapshot.audit.subSubs}</td>
                            <td className={`p-2 font-bold ${snapshot.audit.valid ? "text-emerald-400" : "text-red-400"}`}>{snapshot.audit.valid ? "OK" : "ERRO"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {exactMatches.length === 0 ? (
                    <p className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-300">Nenhuma tabela histórica encontrada com exatamente 14 perguntas. Nada será restaurado automaticamente.</p>
                  ) : (
                    <div className="rounded-lg border border-amber-400/30 bg-black/30 p-3">
                      <label className="text-xs font-bold text-amber-200">Snapshot de 14 perguntas
                        <select value={selectedSnapshot} onChange={(event) => setSelectedSnapshot(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-[#0c111b] p-2.5 text-xs text-white">
                          <option value="">Selecione para conferir/restaurar</option>
                          {exactMatches.map((snapshot: any) => <option key={snapshot.source} value={snapshot.source}>{snapshot.source} — {snapshot.count} perguntas — {snapshot.audit.valid ? "integridade OK" : "com erro"}</option>)}
                        </select>
                      </label>
                      {snapshotToRestore && (
                        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-3">
                          <p className="mb-2 text-[11px] font-black text-slate-400">PERGUNTAS DO SNAPSHOT</p>
                          {(snapshotToRestore.questions || []).map((question: any, index: number) => (
                            <p key={question.id} className="border-t border-white/5 py-1.5 text-xs"><span className="mr-2 text-slate-500">{index + 1}.</span>{question.question}<span className="ml-2 text-[10px] text-cyan-400">{question.parentQuestionId ? `↳ pai ${question.parentQuestionId}` : "raiz"}</span></p>
                          ))}
                        </div>
                      )}
                      <button type="button" onClick={restoreSnapshot} disabled={!snapshotToRestore || !snapshotToRestore.audit.valid || restoreMutation.isPending} className="mt-3 w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-black text-black disabled:opacity-40">
                        {restoreMutation.isPending ? "Restaurando e auditando..." : "RESTAURAR EXATAMENTE AS 14 PERGUNTAS"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
