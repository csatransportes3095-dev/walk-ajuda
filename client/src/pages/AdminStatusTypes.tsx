import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Plus, Pencil, Trash2, Save, X, Lock, Eye, EyeOff,
  Clock, Package, DollarSign, Zap, FileCheck, XCircle, Wrench, CheckCircle2, Star, AlertCircle, Info
} from "lucide-react";
import AdminHeader from "@/components/AdminHeader";

// Mapa de ícones disponíveis
const ICON_MAP: Record<string, React.ReactNode> = {
  Clock: <Clock className="w-4 h-4" />,
  Package: <Package className="w-4 h-4" />,
  DollarSign: <DollarSign className="w-4 h-4" />,
  Zap: <Zap className="w-4 h-4" />,
  FileCheck: <FileCheck className="w-4 h-4" />,
  XCircle: <XCircle className="w-4 h-4" />,
  Wrench: <Wrench className="w-4 h-4" />,
  CheckCircle2: <CheckCircle2 className="w-4 h-4" />,
  Star: <Star className="w-4 h-4" />,
  AlertCircle: <AlertCircle className="w-4 h-4" />,
  Info: <Info className="w-4 h-4" />,
};

const COLOR_OPTIONS = [
  { value: "text-blue-400",    label: "Azul",        preview: "bg-blue-400" },
  { value: "text-emerald-400", label: "Esmeralda",   preview: "bg-emerald-400" },
  { value: "text-yellow-400",  label: "Amarelo",     preview: "bg-yellow-400" },
  { value: "text-orange-400",  label: "Laranja",     preview: "bg-orange-400" },
  { value: "text-purple-400",  label: "Roxo",        preview: "bg-purple-400" },
  { value: "text-green-400",   label: "Verde",       preview: "bg-green-400" },
  { value: "text-lime-400",    label: "Verde-limão", preview: "bg-lime-400" },
  { value: "text-teal-400",    label: "Teal",        preview: "bg-teal-400" },
  { value: "text-red-400",     label: "Vermelho",    preview: "bg-red-400" },
  { value: "text-pink-400",    label: "Rosa",        preview: "bg-pink-400" },
  { value: "text-cyan-400",    label: "Ciano",       preview: "bg-cyan-400" },
  { value: "text-gray-400",    label: "Cinza",       preview: "bg-gray-400" },
];

const BG_MAP: Record<string, string> = {
  "text-blue-400":    "bg-blue-500/20 border-blue-500/40",
  "text-emerald-400": "bg-emerald-500/20 border-emerald-500/40",
  "text-yellow-400":  "bg-yellow-500/20 border-yellow-500/40",
  "text-orange-400":  "bg-orange-500/20 border-orange-500/40",
  "text-purple-400":  "bg-purple-500/20 border-purple-500/40",
  "text-green-400":   "bg-green-500/20 border-green-500/40",
  "text-lime-400":    "bg-lime-500/20 border-lime-500/40",
  "text-teal-400":    "bg-teal-500/20 border-teal-500/40",
  "text-red-400":     "bg-red-500/20 border-red-500/40",
  "text-pink-400":    "bg-pink-500/20 border-pink-500/40",
  "text-cyan-400":    "bg-cyan-500/20 border-cyan-500/40",
  "text-gray-400":    "bg-gray-500/20 border-gray-500/40",
};

type StatusType = {
  id: number;
  key: string;
  label: string;
  color: string;
  bgColor: string;
  icon: string;
  description: string | null;
  sortOrder: number;
  isSystem: number;
  isActive: number;
  pulseColor?: string | null;
  showInProgress?: number;
  progressOrder?: number;
};

type FormData = {
  key: string;
  label: string;
  color: string;
  icon: string;
  description: string;
  sortOrder: number;
  pulseColor: string;
};

const defaultForm: FormData = {
  key: "",
  label: "",
  color: "text-blue-400",
  icon: "Clock",
  description: "",
  sortOrder: 50,
  pulseColor: "#ffffff",
};

export default function AdminStatusTypes() {
  useAdminAuth();
  const utils = trpc.useUtils();

  const { data: statuses = [], isLoading } = trpc.statusTypes.list.useQuery();
  const createMutation = trpc.statusTypes.create.useMutation({
    onSuccess: () => { utils.statusTypes.list.invalidate(); utils.statusTypes.list.refetch(); toast.success("Status criado!"); setShowCreate(false); setForm(defaultForm); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.statusTypes.update.useMutation({
    onSuccess: () => { utils.statusTypes.list.invalidate(); utils.statusTypes.list.refetch(); toast.success("Status atualizado!"); setEditingId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.statusTypes.delete.useMutation({
    onSuccess: () => { utils.statusTypes.list.invalidate(); utils.statusTypes.list.refetch(); toast.success("Status removido!"); },
    onError: (e) => toast.error(e.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<FormData & { isActive: number }>>({});

  function startEdit(s: StatusType) {
    setEditingId(s.id);
    setEditForm({
      label: s.label,
      color: s.color,
      icon: s.icon,
      description: s.description ?? "",
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      pulseColor: s.pulseColor ?? "#ffffff",
      showInProgress: s.showInProgress ?? 0,
      progressOrder: s.progressOrder ?? 0,
    } as any);
  }

  // Gera slug a partir do label: minúsculas, sem acentos, espaços -> _, remove chars especiais
  function slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s_]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 64);
  }

  function handleCreate() {
    if (!form.label) { toast.error("Nome exibido é obrigatório"); return; }
    const key = form.key || slugify(form.label);
    if (!key) { toast.error("Não foi possível gerar a chave. Preencha o nome."); return; }
    createMutation.mutate({
      key,
      label: form.label,
      color: form.color,
      bgColor: BG_MAP[form.color] || "bg-gray-500/20 border-gray-500/40",
      icon: form.icon,
      description: form.description || undefined,
      sortOrder: form.sortOrder,
      isActive: 1,
      pulseColor: form.pulseColor || "#ffffff",
    });
  }

  function handleUpdate(id: number) {
    updateMutation.mutate({
      id,
      label: editForm.label,
      color: editForm.color,
      bgColor: editForm.color ? (BG_MAP[editForm.color] || "bg-gray-500/20 border-gray-500/40") : undefined,
      icon: editForm.icon,
      description: editForm.description ?? null,
      sortOrder: editForm.sortOrder,
      isActive: editForm.isActive,
      pulseColor: (editForm as any).pulseColor ?? null,
      showInProgress: (editForm as any).showInProgress ?? 0,
      progressOrder: (editForm as any).progressOrder ?? 0,
    });
  }

  const inputCls = "bg-[#0d0d1a] border border-white/10 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-white/30";

  return (
    <div className="min-h-screen bg-[#07071a] text-white">
      <AdminHeader title="Status de Pedido" rightContent={
        <Button onClick={() => { setShowCreate(v => !v); setForm(defaultForm); }} className="bg-primary hover:bg-primary/80 text-white text-xs gap-1 px-3 py-1.5 h-auto" size="sm">
          {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{showCreate ? "Cancelar" : "Novo Status"}</span>
        </Button>
      } />
      <div className="p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Formulário de criação */}
        {showCreate && (
          <div className="bg-[#12122a] rounded-2xl border border-white/10 p-5 space-y-4">
            <p className="text-sm font-semibold text-white/80">Novo Status</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-white/50">Nome exibido <span className="text-red-400">*</span></label>
                <Input
                  className={inputCls}
                  placeholder="ex: Aguardando Documentos"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Chave interna (opcional — gerada automaticamente)</label>
              <Input
                className={inputCls}
                placeholder={form.label ? slugify(form.label) || "gerada-automaticamente" : "ex: aguardando_docs"}
                value={form.key}
                onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
              />
              {!form.key && form.label && (
                <p className="text-[10px] text-white/30 mt-0.5">Será usada: <span className="text-white/50">{slugify(form.label) || "..."}</span></p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-white/50">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c.value}
                      title={c.label}
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${c.preview} ${form.color === c.value ? "border-white scale-125" : "border-transparent"}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-white/50">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(ICON_MAP).map(iconName => (
                    <button
                      key={iconName}
                      title={iconName}
                      onClick={() => setForm(f => ({ ...f, icon: iconName }))}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${form.icon === iconName ? "border-primary bg-primary/20 text-primary" : "border-white/10 text-white/40 hover:border-white/30"}`}
                    >
                      {ICON_MAP[iconName]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Descrição para o cliente (opcional)</label>
              <Textarea
                className={`${inputCls} resize-none whitespace-pre-wrap`}
                rows={4}
                placeholder="Texto explicativo exibido na tela de acompanhamento do cliente...\nUse Enter para quebras de linha."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1 w-24">
                <label className="text-xs text-white/50">Ordem</label>
                <Input
                  type="number"
                  className={inputCls}
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-white/50">Cor do Neon/Pulso</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.pulseColor}
                    onChange={e => setForm(f => ({ ...f, pulseColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                  />
                  <span className="text-xs text-white/40">{form.pulseColor}</span>
                </div>
              </div>
              {/* Preview */}
              <div className="flex-1">
                <label className="text-xs text-white/50 block mb-1">Preview</label>
                <div className="relative inline-flex items-center justify-center w-10 h-10">
                  <span className="absolute inline-flex w-full h-full rounded-full opacity-40 animate-ping" style={{ backgroundColor: form.pulseColor }} />
                  <div className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full border ${form.color} ${BG_MAP[form.color] || "bg-gray-500/20 border-gray-500/40"}`}>
                    {ICON_MAP[form.icon]}
                  </div>
                </div>
              </div>
            </div>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {createMutation.isPending ? "Criando..." : "Criar Status"}
            </Button>
          </div>
        )}

        {/* Lista de status */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {(statuses as StatusType[]).map(s => (
              <div
                key={s.id}
                className={`bg-[#12122a] rounded-2xl border p-4 transition-all ${s.isActive ? "border-white/10" : "border-white/5 opacity-60"}`}
              >
                {editingId === s.id ? (
                  // Modo edição
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Nome exibido</label>
                        <Input
                          className={inputCls}
                          value={editForm.label ?? ""}
                          onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Ordem</label>
                        <Input
                          type="number"
                          className={inputCls}
                          value={editForm.sortOrder ?? 0}
                          onChange={e => setEditForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Cor</label>
                        <div className="flex flex-wrap gap-2">
                          {COLOR_OPTIONS.map(c => (
                            <button
                              key={c.value}
                              title={c.label}
                              onClick={() => setEditForm(f => ({ ...f, color: c.value }))}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${c.preview} ${editForm.color === c.value ? "border-white scale-125" : "border-transparent"}`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-white/50">Ícone</label>
                        <div className="flex flex-wrap gap-2">
                          {Object.keys(ICON_MAP).map(iconName => (
                            <button
                              key={iconName}
                              title={iconName}
                              onClick={() => setEditForm(f => ({ ...f, icon: iconName }))}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${editForm.icon === iconName ? "border-primary bg-primary/20 text-primary" : "border-white/10 text-white/40 hover:border-white/30"}`}
                            >
                              {ICON_MAP[iconName]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-white/50">Descrição para o cliente</label>
                      <Textarea
                        className={`${inputCls} resize-none whitespace-pre-wrap`}
                        rows={4}
                        value={editForm.description ?? ""}
                        onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-white/50">Cor do Neon/Pulso</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={(editForm as any).pulseColor ?? "#ffffff"}
                          onChange={e => setEditForm(f => ({ ...f, pulseColor: e.target.value } as any))}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent"
                        />
                        <span className="text-xs text-white/40">{(editForm as any).pulseColor ?? "#ffffff"}</span>
                        {/* Preview animado */}
                        <div className="relative inline-flex items-center justify-center w-10 h-10">
                          <span className="absolute inline-flex w-full h-full rounded-full opacity-40 animate-ping" style={{ backgroundColor: (editForm as any).pulseColor ?? "#ffffff" }} />
                          <div className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full border ${editForm.color ?? "text-gray-400"} ${BG_MAP[editForm.color ?? ""] || "bg-gray-500/20 border-gray-500/40"}`}>
                            {ICON_MAP[editForm.icon ?? "Clock"] ?? null}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Configuração de Progresso do Cliente */}
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3 space-y-3">
                      <p className="text-xs font-semibold text-purple-400 flex items-center gap-1.5">📊 Progresso do Cliente</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setEditForm(f => ({ ...f, showInProgress: (f as any).showInProgress === 1 ? 0 : 1 } as any))}
                          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                            (editForm as any).showInProgress === 1 ? 'bg-purple-500' : 'bg-white/10'
                          }`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            (editForm as any).showInProgress === 1 ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                        <span className="text-xs text-white/60">Mostrar na barra de progresso do cliente</span>
                      </div>
                      {(editForm as any).showInProgress === 1 && (
                        <div className="space-y-1">
                          <label className="text-xs text-white/50">Posição na barra de progresso</label>
                          <Input
                            type="number"
                            className={inputCls}
                            value={(editForm as any).progressOrder ?? 0}
                            onChange={e => setEditForm(f => ({ ...f, progressOrder: parseInt(e.target.value) || 0 } as any))}
                          />
                          <p className="text-[10px] text-white/30">Menor número = aparece primeiro na barra</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(s.id)}
                        disabled={updateMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white gap-1"
                      >
                        <Save className="w-3.5 h-3.5" /> Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                        className="border-white/20 text-white/60 hover:text-white gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Modo visualização
                  <div className="flex items-start gap-3">
                    {/* Badge de preview com neon */}
                    <div className="relative flex-shrink-0 w-9 h-9 flex items-center justify-center">
                      {s.pulseColor && <span className="absolute inset-0 rounded-xl opacity-30 animate-pulse" style={{ backgroundColor: s.pulseColor }} />}
                      <div className={`relative w-9 h-9 rounded-xl border flex items-center justify-center ${s.color} ${s.bgColor}`}>
                        {ICON_MAP[s.icon] ?? <Clock className="w-4 h-4" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
                        {s.isActive === 0 && (
                          <span className="text-[10px] text-white/30 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">Inativo</span>
                        )}
                      </div>
                      {s.description && (
                        <p className="text-xs text-white/40 mt-1 line-clamp-1">{s.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-[10px] text-white/20">Ordem: {s.sortOrder}</p>
                        {s.showInProgress === 1 && (
                          <span className="text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                            📊 Progresso #{s.progressOrder ?? 0}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Ações */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Ativar/Desativar */}
                      <button
                        title={s.isActive ? "Desativar" : "Ativar"}
                        onClick={() => updateMutation.mutate({ id: s.id, isActive: s.isActive === 1 ? 0 : 1 })}
                        className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${s.isActive ? "border-white/10 text-white/40 hover:text-white/70" : "border-green-500/30 text-green-400/60 hover:text-green-400"}`}
                      >
                        {s.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      {/* Editar */}
                      <button
                        title="Editar"
                        onClick={() => startEdit(s)}
                        className="w-7 h-7 rounded-lg border border-white/10 text-white/40 hover:text-white/70 flex items-center justify-center transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {/* Excluir — todos os status podem ser excluídos */}
                      <button
                        title="Excluir"
                        onClick={() => {
                          if (confirm(`Excluir o status "${s.label}"?`)) {
                            deleteMutation.mutate({ id: s.id });
                          }
                        }}
                        className="w-7 h-7 rounded-lg border border-red-500/20 text-red-400/50 hover:text-red-400 flex items-center justify-center transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-white/20 text-center pb-4">
          Todos os status podem ser editados, desativados ou excluídos.
        </p>
      </div>
      </div>
    </div>
  );
}
