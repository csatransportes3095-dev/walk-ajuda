import { globalActiveStatuses, unavailableFlowKeys } from "@shared/orderStatusScope";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type AlternativeRule = {
  primaryKey: string;
  alternativeKey: string;
};

type Flow = {
  id: number;
  name: string;
  description: string | null;
  isDefault: number;
  isActive: number;
  statusKeys: string[];
  productIds: number[];
  productNames: string[];
  alternativeRules?: AlternativeRule[];
};

export default function AdminStatusFlows() {
  useAdminAuth();
  const utils = trpc.useUtils();
  const flowsQuery = trpc.statusFlows.list.useQuery();
  const statusesQuery = trpc.statusTypes.list.useQuery();
  const productsQuery = trpc.products.list.useQuery();

  const activeStatuses = useMemo(
    () => (statusesQuery.data ?? []).filter((s: any) => s.isActive === 1).sort((a: any, b: any) => a.sortOrder - b.sortOrder),
    [statusesQuery.data]
  );
  const initialKey = globalActiveStatuses(activeStatuses)[0]?.key ?? "recebido";
  const recoveryQuery = trpc.statusTypes.scopeReport.useQuery();

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [statusKeys, setStatusKeys] = useState<string[]>([]);
  const [alternativeRules, setAlternativeRules] = useState<AlternativeRule[]>([]);
  const [productIds, setProductIds] = useState<number[]>([]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setStatusKeys([]);
    setAlternativeRules([]);
    setProductIds([]);
  };

  const startNew = () => {
    setEditingId("new");
    setName("");
    setDescription("");
    setStatusKeys([initialKey]);
    setAlternativeRules([]);
    setProductIds([]);
  };

  const startEdit = (flow: Flow) => {
    setEditingId(flow.id);
    setName(flow.name);
    setDescription(flow.description ?? "");
    setStatusKeys(flow.statusKeys.length ? flow.statusKeys : [initialKey]);
    setAlternativeRules(flow.alternativeRules ?? []);
    setProductIds(flow.productIds ?? []);
  };

  const addStatus = (key: string) => {
    setStatusKeys((prev) => prev.includes(key) ? prev : [...prev, key]);
  };

  const removeStatus = (key: string) => {
    if (key === initialKey) return;
    setStatusKeys((prev) => prev.filter((k) => k !== key));
    setAlternativeRules((prev) => prev.filter((rule) => rule.primaryKey !== key && rule.alternativeKey !== key));
  };

  const setAlternativeForStatus = (alternativeKey: string, primaryKey: string) => {
    setAlternativeRules((prev) => {
      const withoutCurrent = prev.filter((rule) => rule.alternativeKey !== alternativeKey);
      if (!primaryKey) return withoutCurrent;
      return [...withoutCurrent, { primaryKey, alternativeKey }];
    });
  };

  const moveStatus = (index: number, direction: -1 | 1) => {
    setStatusKeys((prev) => {
      const next = [...prev];
      const target = index + direction;
      // A etapa universal fica sempre na primeira posição.
      if (index <= 0 || target <= 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleProduct = (id: number) => {
    setProductIds((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  const createMut = trpc.statusFlows.create.useMutation({
    onSuccess: async () => {
      toast.success("Sequência criada!");
      await utils.statusFlows.list.invalidate();
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.statusFlows.update.useMutation({
    onSuccess: async () => {
      toast.success("Sequência atualizada!");
      await utils.statusFlows.list.invalidate();
      await utils.statusFlows.orderMap.invalidate();
      await utils.statusFlows.forOrder.invalidate();
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    if (!name.trim()) return toast.error("Informe o nome da sequência.");
    // A ordem pertence a ESTA sequência. Não reordenar pela tela global de Status.
    const orderedKeys = Array.from(new Set([initialKey, ...statusKeys]));
    const unavailable = unavailableFlowKeys(orderedKeys, activeStatuses);
    if (unavailable.length) return toast.error(`Revise as etapas ausentes ou inativas: ${unavailable.join(', ')}. Nada foi removido.`);

    if (editingId === "new") {
      createMut.mutate({
        name: name.trim(),
        description: description.trim() || null,
        statusKeys: orderedKeys,
        productIds,
        alternativeRules,
      });
    } else if (typeof editingId === "number") {
      updateMut.mutate({
        id: editingId,
        name: name.trim(),
        description: description.trim() || null,
        statusKeys: orderedKeys,
        productIds,
        alternativeRules,
      });
    }
  };

  const busy = createMut.isPending || updateMut.isPending || statusesQuery.isLoading;
  const flows = (flowsQuery.data ?? []) as Flow[];

  return (
    <div className="min-h-screen bg-[#07071a] text-white">
      <AdminHeader title="Sequências de Status" rightContent={
        <div className="flex gap-2">
          <Link href="/admin/status-types">
            <Button variant="outline" size="sm" className="border-white/15 text-white/70 gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Status
            </Button>
          </Link>
          <Button size="sm" onClick={startNew} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Nova Sequência
          </Button>
        </div>
      } />

      <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100/80">
          O <strong>Global / Padrao H2</strong> usa somente os status marcados como globais. Etapas personalizadas permanecem nos produtos vinculados. Remover desta sequencia nao apaga o cadastro nem altera outras sequencias.
        </div>

        {!!recoveryQuery.data?.recovered?.some(item => item.source === 'recovered-reference-review-style') && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-500/5 p-4 text-sm text-amber-100">
            Etapas recuperadas pelas chaves ainda vinculadas: {recoveryQuery.data.recovered.filter(item => item.source === 'recovered-reference-review-style').map(item => item.key).join(', ')}.
            As chaves e posicoes foram preservadas; revise cores e descricoes, que nao estavam disponiveis na referencia.
          </div>
        )}
        {editingId !== null && (
          <section className="rounded-2xl border border-white/10 bg-[#12122a] p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{editingId === "new" ? "Nova sequência" : "Editar sequência"}</h2>
              <button onClick={reset} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-white/50">Nome</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Edição de Veículo" className="bg-[#0d0d1a] border-white/10" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-white/50">Descrição</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="bg-[#0d0d1a] border-white/10" />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Etapas desta sequência</p>
              <p className="text-xs text-white/40 mb-3">
                Esta sequência tem ordem própria. Use as setas para definir exatamente a ordem que o ADM e o cliente devem seguir.
                O primeiro status é universal e fica travado na posição 1. Para desvios como APROVADO / REPROVADO, marque o status de exceção como alternativa de uma etapa anterior.
              </p>

              <div className="space-y-2">
                {statusKeys.map((key, index) => {
                  const existing: any = (statusesQuery.data ?? []).find((s: any) => s.key === key);
                  const unavailable = !existing || existing.isActive !== 1;
                  const status: any = existing ?? { label: key };
                  const locked = key === initialKey || index === 0;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-black/20 text-xs font-bold text-cyan-100">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-cyan-50">{status.label}</p>
                        {unavailable && <p className="text-xs text-amber-300">{existing ? "Cadastro inativo - reative pelo catalogo." : "Cadastro ausente - vinculo preservado."}</p>}
                        {locked && <p className="text-[10px] uppercase tracking-wide text-cyan-200/45">Inicial universal</p>}
                        {!locked && (
                          <div className="mt-2">
                            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/35">
                              Comportamento no cliente
                            </label>
                            <select
                              value={alternativeRules.find((rule) => rule.alternativeKey === key)?.primaryKey ?? ""}
                              onChange={(e) => setAlternativeForStatus(key, e.target.value)}
                              className="w-full rounded-lg border border-white/10 bg-[#0b0b18] px-2 py-1.5 text-xs text-white/75 outline-none focus:border-cyan-400/40"
                            >
                              <option value="">Etapa normal</option>
                              {statusKeys
                                .slice(1, index)
                                .filter((candidate) => candidate !== key)
                                .map((candidate) => {
                                  const candidateStatus: any = (statusesQuery.data ?? []).find((s: any) => s.key === candidate);
                                  return (
                                    <option key={candidate} value={candidate}>
                                      Alternativa de: {candidateStatus?.label ?? candidate}
                                    </option>
                                  );
                                })}
                            </select>
                            {alternativeRules.some((rule) => rule.alternativeKey === key) && (
                              <p className="mt-1 text-[10px] text-amber-200/70">
                                Só aparece ao cliente se este status for selecionado pelo ADM.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Subir ${status.label}`}
                        disabled={locked || index <= 1}
                        onClick={() => moveStatus(index, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Descer ${status.label}`}
                        disabled={locked || index >= statusKeys.length - 1}
                        onClick={() => moveStatus(index, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      {!existing && typeof editingId === 'number' && (
                        <Link href={`/admin/status-types?flowId=${editingId}&restoreKey=${encodeURIComponent(key)}`} className="text-xs text-amber-200 underline">Restaurar cadastro</Link>
                      )}
                      {!locked && (
                        <button
                          type="button"
                          aria-label={`Remover desta sequencia: ${status.label}`} title="Remove somente o vinculo nesta sequencia"
                          onClick={() => removeStatus(key)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-400/20 text-red-300/70 hover:bg-red-500/10 hover:text-red-200"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">Adicionar status existente</p>
                {typeof editingId === 'number' ? (
                  <Link href={`/admin/status-types?flowId=${editingId}`} className="mb-3 inline-block rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">+ Criar status exclusivo desta sequencia</Link>
                ) : <p className="mb-3 text-xs text-white/40">Salve a sequencia para criar suas etapas exclusivas.</p>}
                <div className="flex flex-wrap gap-2">
                  {activeStatuses
                    .filter((s: any) => !statusKeys.includes(s.key))
                    .map((s: any) => (
                      <button
                        type="button"
                        key={s.key}
                        onClick={() => addStatus(s.key)}
                        className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-white/60 transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100"
                      >
                        + {s.label}
                      </button>
                    ))}
                  {activeStatuses.every((s: any) => statusKeys.includes(s.key)) && (
                    <span className="text-xs text-white/30">Todos os status ativos já estão nesta sequência.</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Aplicar aos produtos</p>
              <p className="text-xs text-white/40 mb-3">Produto sem seleção continua automaticamente no Padrão H2.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-auto pr-1">
                {(productsQuery.data ?? []).map((p: any) => {
                  const checked = productIds.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => toggleProduct(p.id)}
                      className={`text-left rounded-lg border px-3 py-2 text-sm transition ${checked ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-black/10 text-white/50"}`}
                    >
                      <span className="mr-2">{checked ? "✓" : "○"}</span>{p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={save} disabled={busy} className="w-full bg-green-600 hover:bg-green-700 gap-2">
              <Save className="w-4 h-4" /> {busy ? "Salvando..." : "Salvar Sequência"}
            </Button>
          </section>
        )}

        <section className="space-y-3">
          {flowsQuery.isLoading && <p className="text-white/40 text-sm">Carregando...</p>}
          {flows.map((flow) => (
            <div key={flow.id} className="rounded-2xl border border-white/10 bg-[#12122a] p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold">{flow.name}</h3>
                    {flow.isDefault === 1 && <span className="rounded bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 text-[10px] text-purple-300">PADRÃO ATUAL</span>}
                    {flow.isActive === 0 && <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-white/35">INATIVA</span>}
                  </div>
                  {flow.description && <p className="mt-1 text-xs text-white/45">{flow.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {flow.statusKeys.map((key) => {
                      const st: any = (statusesQuery.data ?? []).find((s: any) => s.key === key);
                      return <span key={key} className="rounded-md border border-white/10 bg-black/15 px-2 py-1 text-[11px] text-white/65">{st?.label ?? key}{!st ? " - CADASTRO AUSENTE" : st.isActive !== 1 ? " - INATIVO" : ""}</span>;
                    })}
                  </div>
                  {!!flow.alternativeRules?.length && (
                    <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/80">
                      <span className="font-semibold">Desvios do cliente:</span>{" "}
                      {flow.alternativeRules.map((rule) => {
                        const primary: any = (statusesQuery.data ?? []).find((s: any) => s.key === rule.primaryKey);
                        const alternative: any = (statusesQuery.data ?? []).find((s: any) => s.key === rule.alternativeKey);
                        return `${alternative?.label ?? rule.alternativeKey} → alternativa de ${primary?.label ?? rule.primaryKey}`;
                      }).join(" • ")}
                    </div>
                  )}
                  <p className="mt-3 text-xs text-white/40">
                    {flow.isDefault === 1
                      ? "Usada por todos os produtos sem sequência personalizada."
                      : flow.productNames.length
                        ? `Produtos: ${flow.productNames.join(", ")}`
                        : "Nenhum produto vinculado ainda."}
                  </p>
                </div>
                {flow.isDefault === 1 && <Link href="/admin/status-types" className="text-xs text-cyan-200 underline">Gerenciar globais</Link>}
                {flow.isDefault !== 1 && (
                  <button onClick={() => startEdit(flow)} className="w-9 h-9 rounded-lg border border-white/10 text-white/50 hover:text-white flex items-center justify-center">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
