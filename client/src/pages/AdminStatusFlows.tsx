import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAdminAuth } from "@/hooks/useAdminAuth";

type Flow = {
  id: number;
  name: string;
  description: string | null;
  isDefault: number;
  isActive: number;
  statusKeys: string[];
  productIds: number[];
  productNames: string[];
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
  const initialKey = activeStatuses[0]?.key ?? "recebido";

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [statusKeys, setStatusKeys] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<number[]>([]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setStatusKeys([]);
    setProductIds([]);
  };

  const startNew = () => {
    setEditingId("new");
    setName("");
    setDescription("");
    setStatusKeys([initialKey]);
    setProductIds([]);
  };

  const startEdit = (flow: Flow) => {
    setEditingId(flow.id);
    setName(flow.name);
    setDescription(flow.description ?? "");
    setStatusKeys(flow.statusKeys.length ? flow.statusKeys : [initialKey]);
    setProductIds(flow.productIds ?? []);
  };

  const toggleStatus = (key: string) => {
    if (key === initialKey) return;
    setStatusKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
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
      reset();
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    if (!name.trim()) return toast.error("Informe o nome da sequência.");
    const orderedKeys = activeStatuses
      .map((s: any) => s.key)
      .filter((key: string) => key === initialKey || statusKeys.includes(key));

    if (editingId === "new") {
      createMut.mutate({
        name: name.trim(),
        description: description.trim() || null,
        statusKeys: orderedKeys,
        productIds,
      });
    } else if (typeof editingId === "number") {
      updateMut.mutate({
        id: editingId,
        name: name.trim(),
        description: description.trim() || null,
        statusKeys: orderedKeys,
        productIds,
      });
    }
  };

  const busy = createMut.isPending || updateMut.isPending;
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
          A sequência <strong>Padrão H2</strong> continua usando exatamente os status atuais. Só produtos marcados em uma sequência personalizada passam a ter opções diferentes.
        </div>

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
                O primeiro status é universal e fica sempre marcado. A ordem segue a ordem configurada na tela principal de Status.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {activeStatuses.map((s: any) => {
                  const checked = s.key === initialKey || statusKeys.includes(s.key);
                  return (
                    <button
                      type="button"
                      key={s.key}
                      disabled={s.key === initialKey}
                      onClick={() => toggleStatus(s.key)}
                      className={`text-left rounded-lg border px-3 py-2 text-sm transition ${checked ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-black/10 text-white/50"} ${s.key === initialKey ? "opacity-80 cursor-not-allowed" : ""}`}
                    >
                      <span className="mr-2">{checked ? "✓" : "○"}</span>{s.label}
                      {s.key === initialKey && <span className="ml-2 text-[10px] text-white/35">INICIAL</span>}
                    </button>
                  );
                })}
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
                      const st: any = activeStatuses.find((s: any) => s.key === key);
                      return <span key={key} className="rounded-md border border-white/10 bg-black/15 px-2 py-1 text-[11px] text-white/65">{st?.label ?? key}</span>;
                    })}
                  </div>
                  <p className="mt-3 text-xs text-white/40">
                    {flow.isDefault === 1
                      ? "Usada por todos os produtos sem sequência personalizada."
                      : flow.productNames.length
                        ? `Produtos: ${flow.productNames.join(", ")}`
                        : "Nenhum produto vinculado ainda."}
                  </p>
                </div>
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
