"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Megaphone, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Loader2, Image, Video, Clock, RefreshCw, X, Check, AlertCircle, Eye
} from "lucide-react";
type Campaign = {
  id: number;
  name: string;
  isActive: number;
  type: "image" | "video";
  imageUrl: string | null;
  videoUrl: string | null;
  title: string | null;
  description: string | null;
  linkUrl: string | null;
  linkText: string | null;
  linkTarget: "_self" | "_blank";
  requiredSeconds: number;
  frequency: "once" | "every_access" | "every_reload" | "custom";
  frequencyMinutes: number | null;
  startsAt: string | null;
  endsAt: string | null;
  targetPages: string | null;
  enableAudio: number;
  createdAt: string;
  updatedAt: string;
};

const PAGE_OPTIONS = [
  { value: 'gastos', label: '📊 Gastos' },
  { value: 'acompanhar', label: '📦 Acompanhar' },
  { value: 'pedidos', label: '🛒 Pedidos' },
];

const FREQUENCY_LABELS: Record<string, string> = {
  once: "Apenas uma vez",
  every_access: "A cada acesso",
  every_reload: "A cada atualização",
  custom: "Período personalizado",
};

const defaultForm = {
  name: "",
  isActive: 1,
  type: "image" as "image" | "video",
  imageUrl: "",
  videoUrl: "",
  title: "",
  description: "",
  linkUrl: "",
  linkText: "Saiba Mais",
  linkTarget: "_blank" as "_self" | "_blank",
  requiredSeconds: 20,
  frequency: "every_access" as "once" | "every_access" | "every_reload" | "custom",
  frequencyMinutes: 60,
  startsAt: "",
  endsAt: "",
  targetPages: ["gastos"] as string[],
  enableAudio: 0,
};

export default function AdminAdCampaigns() {
  const [toastMsg, setToastMsg] = useState<{text: string; variant?: string} | null>(null);
  const toast = (opts: {title: string; description?: string; variant?: string}) => {
    setToastMsg({text: opts.title + (opts.description ? `: ${opts.description}` : ''), variant: opts.variant});
    setTimeout(() => setToastMsg(null), 3500);
  };
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);

  const { data: campaigns = [], refetch, isLoading } = trpc.adCampaigns.list.useQuery();
  const createMutation = trpc.adCampaigns.create.useMutation();
  const updateMutation = trpc.adCampaigns.update.useMutation();
  const deleteMutation = trpc.adCampaigns.delete.useMutation();
  const toggleMutation = trpc.adCampaigns.toggle.useMutation();

  function openCreate() {
    setEditId(null);
    setForm({ ...defaultForm });
    setShowForm(true);
  }

  function openEdit(c: Campaign) {
    setEditId(c.id);
    setForm({
      name: c.name,
      isActive: c.isActive,
      type: c.type,
      imageUrl: c.imageUrl || "",
      videoUrl: c.videoUrl || "",
      title: c.title || "",
      description: c.description || "",
      linkUrl: c.linkUrl || "",
      linkText: c.linkText || "Saiba Mais",
      linkTarget: c.linkTarget,
      requiredSeconds: c.requiredSeconds,
      frequency: c.frequency,
      frequencyMinutes: c.frequencyMinutes || 60,
      startsAt: c.startsAt ? (typeof c.startsAt === 'string' ? c.startsAt : new Date(c.startsAt as any).toISOString()).slice(0, 16) : "",
      endsAt: c.endsAt ? (typeof c.endsAt === 'string' ? c.endsAt : new Date(c.endsAt as any).toISOString()).slice(0, 16) : "",
      targetPages: c.targetPages ? c.targetPages.split(',').map(p => p.trim()) : ['gastos'],
      enableAudio: (c as any).enableAudio ?? 0,
    } as any);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if ((form as any).targetPages?.length === 0) { toast({ title: "Selecione pelo menos uma página", variant: "destructive" }); return; }
    if (form.type === "image" && !form.imageUrl.trim()) { toast({ title: "URL da imagem obrigatória", variant: "destructive" }); return; }
    if (form.type === "video" && !form.videoUrl.trim()) { toast({ title: "URL do vídeo obrigatória", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        imageUrl: form.imageUrl || null,
        videoUrl: form.videoUrl || null,
        title: form.title || null,
        description: form.description || null,
        linkUrl: form.linkUrl || null,
        frequencyMinutes: form.frequency === "custom" ? form.frequencyMinutes : null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        targetPages: ((form as any).targetPages as string[]).join(',') || 'gastos',
      };
      if (editId !== null) {
        await updateMutation.mutateAsync({ id: editId, ...payload });
        toast({ title: "Campanha atualizada!" });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Campanha criada!" });
      }
      setShowForm(false);
      refetch();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Deletar esta campanha?")) return;
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync({ id });
      toast({ title: "Campanha deletada" });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro ao deletar", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(c: Campaign) {
    try {
      await toggleMutation.mutateAsync({ id: c.id, isActive: c.isActive === 1 ? 0 : 1 });
      refetch();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  function formatFrequency(c: Campaign) {
    if (c.frequency === "custom" && c.frequencyMinutes) {
      const m = c.frequencyMinutes;
      if (m < 60) return `A cada ${m} min`;
      if (m < 1440) return `A cada ${Math.round(m / 60)}h`;
      return `A cada ${Math.round(m / 1440)} dia(s)`;
    }
    return FREQUENCY_LABELS[c.frequency] || c.frequency;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Toast */}
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toastMsg.variant === 'destructive' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>{toastMsg.text}</div>
      )}
      {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Propagandas</h1>
              <p className="text-sm text-gray-400">Gerencie campanhas da Planilha de Gastos</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="border-white/10 text-gray-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Plus className="w-4 h-4" /> Nova Campanha
            </Button>
          </div>
        </div>

        {/* Lista de campanhas */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma campanha cadastrada</p>
            <Button onClick={openCreate} className="mt-4 bg-blue-600 hover:bg-blue-700">Criar primeira campanha</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {(campaigns as Campaign[]).map((c) => (
              <Card key={c.id} className={`bg-[#111128] border p-4 transition-all ${c.isActive ? "border-blue-500/30" : "border-white/10 opacity-60"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`mt-1 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${c.type === "video" ? "bg-purple-500/20 border border-purple-500/30" : "bg-blue-500/20 border border-blue-500/30"}`}>
                      {c.type === "video" ? <Video className="w-4 h-4 text-purple-400" /> : <Image className="w-4 h-4 text-blue-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white truncate">{c.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.isActive ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-gray-500/20 text-gray-400 border border-gray-500/30"}`}>
                          {c.isActive ? "Ativa" : "Inativa"}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
                          {c.type === "video" ? "Vídeo" : "Banner"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.requiredSeconds}s obrigatório</span>
                        <span>{formatFrequency(c)}</span>
                        {c.title && <span className="text-gray-300">"{c.title}"</span>}
                      </div>
                      {c.startsAt && <p className="text-xs text-gray-500 mt-1">Início: {new Date(c.startsAt).toLocaleString("pt-BR")}</p>}
                      {c.endsAt && <p className="text-xs text-gray-500">Fim: {new Date(c.endsAt).toLocaleString("pt-BR")}</p>}
                      {c.targetPages && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {c.targetPages.split(',').map(p => p.trim()).filter(Boolean).map(p => {
                            const opt = PAGE_OPTIONS.find(o => o.value === p);
                            return (
                              <span key={p} className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {opt?.label || p}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewCampaign(c)} className="text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 w-8 h-8 p-0">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggle(c)} className={`w-8 h-8 p-0 ${c.isActive ? "text-green-400 hover:text-red-400 hover:bg-red-500/10" : "text-gray-500 hover:text-green-400 hover:bg-green-500/10"}`}>
                      {c.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} className="text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 w-8 h-8 p-0">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} className="text-gray-400 hover:text-red-400 hover:bg-red-500/10 w-8 h-8 p-0">
                      {deletingId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal de formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111128] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">{editId ? "Editar Campanha" : "Nova Campanha"}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white w-8 h-8 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-6 space-y-5">
              {/* Nome e status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Nome interno da campanha *</label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promoção Julho 2026" className="bg-white/5 border-white/10 text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Status</label>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, isActive: 1 }))} className={`flex-1 ${form.isActive === 1 ? "bg-green-500/20 border-green-500/50 text-green-400" : "border-white/10 text-gray-400"}`}>
                      <Check className="w-3 h-3 mr-1" /> Ativa
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, isActive: 0 }))} className={`flex-1 ${form.isActive === 0 ? "bg-red-500/20 border-red-500/50 text-red-400" : "border-white/10 text-gray-400"}`}>
                      <X className="w-3 h-3 mr-1" /> Inativa
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tipo */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Tipo de propaganda</label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, type: "image" }))} className={`flex-1 gap-2 ${form.type === "image" ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "border-white/10 text-gray-400"}`}>
                    <Image className="w-4 h-4" /> Banner / Imagem
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, type: "video" }))} className={`flex-1 gap-2 ${form.type === "video" ? "bg-purple-500/20 border-purple-500/50 text-purple-400" : "border-white/10 text-gray-400"}`}>
                    <Video className="w-4 h-4" /> Vídeo
                  </Button>
                </div>
              </div>

              {/* Conteúdo */}
              {form.type === "image" ? (
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">URL da imagem *</label>
                  <Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." className="bg-white/5 border-white/10 text-white" />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">URL do vídeo *</label>
                  <Input value={form.videoUrl} onChange={e => setForm(f => ({ ...f, videoUrl: e.target.value }))} placeholder="https://..." className="bg-white/5 border-white/10 text-white" />
                  <p className="text-xs text-gray-500 mt-1">Suporta MP4 direto, YouTube embed, etc.</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Título (opcional)</label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Título da propaganda" className="bg-white/5 border-white/10 text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Descrição (opcional)</label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Breve descrição" className="bg-white/5 border-white/10 text-white" />
                </div>
              </div>

              {/* Redirecionamento */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Link de destino (opcional)</label>
                  <Input value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))} placeholder="https://..." className="bg-white/5 border-white/10 text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Texto do botão de ação</label>
                  <Input value={form.linkText} onChange={e => setForm(f => ({ ...f, linkText: e.target.value }))} placeholder="Saiba Mais" className="bg-white/5 border-white/10 text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Abrir link em</label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, linkTarget: "_blank" }))} className={`flex-1 ${form.linkTarget === "_blank" ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "border-white/10 text-gray-400"}`}>Nova aba</Button>
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, linkTarget: "_self" }))} className={`flex-1 ${form.linkTarget === "_self" ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "border-white/10 text-gray-400"}`}>Mesma aba</Button>
                </div>
              </div>

              {/* Controle de tempo */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Tempo obrigatório de visualização (segundos)</label>
                <div className="flex items-center gap-3">
                  <Input type="number" min={1} max={300} value={form.requiredSeconds} onChange={e => setForm(f => ({ ...f, requiredSeconds: parseInt(e.target.value) || 20 }))} className="bg-white/5 border-white/10 text-white w-28" />
                  <span className="text-gray-400 text-sm">segundos (padrão: 20s)</span>
                </div>
              </div>

              {/* Frequência */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Frequência de exibição</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["once", "every_access", "every_reload", "custom"] as const).map(f => (
                    <Button key={f} variant="outline" size="sm" onClick={() => setForm(prev => ({ ...prev, frequency: f }))} className={`text-xs ${form.frequency === f ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "border-white/10 text-gray-400"}`}>
                      {FREQUENCY_LABELS[f]}
                    </Button>
                  ))}
                </div>
                {form.frequency === "custom" && (
                  <div className="mt-3 flex items-center gap-3">
                    <Input type="number" min={1} value={form.frequencyMinutes} onChange={e => setForm(f => ({ ...f, frequencyMinutes: parseInt(e.target.value) || 60 }))} className="bg-white/5 border-white/10 text-white w-28" />
                    <div className="text-sm text-gray-400">
                      minutos
                      <span className="text-gray-500 ml-2">({form.frequencyMinutes < 60 ? `${form.frequencyMinutes}min` : form.frequencyMinutes < 1440 ? `${(form.frequencyMinutes / 60).toFixed(1)}h` : `${(form.frequencyMinutes / 1440).toFixed(1)} dias`})</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Páginas de destino */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block font-semibold">Páginas de destino *</label>
                <div className="flex flex-wrap gap-2">
                  {PAGE_OPTIONS.map(opt => {
                    const selected = ((form as any).targetPages as string[]).includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const current = (form as any).targetPages as string[];
                          const next = selected ? current.filter(p => p !== opt.value) : [...current, opt.value];
                          setForm(f => ({ ...f, targetPages: next } as any));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          selected
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                        }`}
                      >
                        {selected ? '✓ ' : ''}{opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-1.5">Escolha em quais páginas esta propaganda será exibida.</p>
              </div>

              {/* Áudio do vídeo (só para vídeos) */}
              {form.type === "video" && (
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, enableAudio: (f as any).enableAudio ? 0 : 1 } as any))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                      (form as any).enableAudio ? 'bg-green-500' : 'bg-white/20'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      (form as any).enableAudio ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                  <div>
                    <p className="text-sm text-white font-medium">🔊 Habilitar áudio no vídeo</p>
                    <p className="text-xs text-gray-500">Quando ativado, o vídeo toca com áudio. Requer que o usuário tenha interagido com a página antes.</p>
                  </div>
                </div>
              )}

              {/* Período de vigência */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Data de início (opcional)</label>
                  <Input type="datetime-local" value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Data de término (opcional)</label>
                  <Input type="datetime-local" value={form.endsAt} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} className="bg-white/5 border-white/10 text-white" />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)} className="border-white/10 text-gray-400 hover:text-white">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editId ? "Salvar alterações" : "Criar campanha"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de preview */}
      {previewCampaign && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111128] border border-blue-500/30 rounded-2xl w-full max-w-lg shadow-2xl shadow-blue-500/10">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <span className="text-sm font-medium text-gray-300">Preview: {previewCampaign.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setPreviewCampaign(null)} className="text-gray-400 hover:text-white w-8 h-8 p-0"><X className="w-4 h-4" /></Button>
            </div>
            <div className="p-4">
              <AdPreview campaign={previewCampaign} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdPreview({ campaign }: { campaign: Campaign }) {
  const [progress] = useState(65);
  return (
    <div className="rounded-xl overflow-hidden border border-blue-500/30 bg-[#0d0d22] shadow-lg shadow-blue-500/10">
      <div className="relative">
        {campaign.type === "image" && campaign.imageUrl ? (
          <img src={campaign.imageUrl} alt={campaign.title || "Propaganda"} className="w-full h-48 object-cover" />
        ) : campaign.type === "video" && campaign.videoUrl ? (
          <div className="w-full h-48 bg-black flex items-center justify-center">
            <Video className="w-12 h-12 text-gray-600" />
            <span className="ml-2 text-gray-500 text-sm">Vídeo: {campaign.videoUrl.slice(0, 40)}...</span>
          </div>
        ) : (
          <div className="w-full h-48 bg-gradient-to-br from-blue-900/40 to-purple-900/40 flex items-center justify-center">
            <Megaphone className="w-12 h-12 text-blue-400/50" />
          </div>
        )}
        <div className="absolute top-2 right-2 bg-black/60 text-gray-400 text-xs px-2 py-1 rounded-full border border-white/10">
          Exibição obrigatória
        </div>
      </div>
      {(campaign.title || campaign.description) && (
        <div className="p-3">
          {campaign.title && <p className="text-white font-semibold text-sm">{campaign.title}</p>}
          {campaign.description && <p className="text-gray-400 text-xs mt-1">{campaign.description}</p>}
        </div>
      )}
      <div className="px-4 pb-4 pt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">Progresso</span>
          <span className="text-xs text-blue-400">⏳ Encerrando em {Math.round(campaign.requiredSeconds * (1 - progress / 100))}s</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        {campaign.linkUrl && (
          <div className="mt-3">
            <Button size="sm" className="w-full bg-blue-600/80 hover:bg-blue-600 text-white text-xs">{campaign.linkText || "Saiba Mais"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
