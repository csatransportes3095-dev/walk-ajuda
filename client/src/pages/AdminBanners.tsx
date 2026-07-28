import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, EyeOff, GripVertical, Check, X } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";

const PRESET_BG_COLORS = [
  "#1e3a5f", "#0f2027", "#1a1a2e", "#16213e", "#0d1b2a",
  "#1b4332", "#14532d", "#052e16", "#365314", "#1c1917",
  "#3b0764", "#4a044e", "#500724", "#7f1d1d", "#431407",
  "#1e40af", "#1d4ed8", "#0369a1", "#0e7490", "#0f766e",
  "#b45309", "#92400e", "#78350f", "#6b21a8", "#86198f",
  "#dc2626", "#16a34a", "#2563eb", "#9333ea", "#db2777",
  "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899",
  "#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0", "#cbd5e1",
];

const PRESET_TEXT_COLORS = [
  "#ffffff", "#f8fafc", "#f1f5f9", "#e2e8f0",
  "#fbbf24", "#34d399", "#60a5fa", "#f472b6",
  "#000000", "#1e293b", "#334155", "#475569",
  "#fde68a", "#a7f3d0", "#bfdbfe", "#fce7f3",
];

const PAGE_OPTIONS = [
  { value: 'gastos', label: '📊 Gastos' },
  { value: 'acompanhar', label: '📦 Acompanhar' },
  { value: 'pedidos', label: '🛒 Pedidos' },
];

interface BannerForm {
  title: string;
  content: string;
  bgColor: string;
  textColor: string;
  sortOrder: number;
  isActive: number;
  targetPages: string[];
}

const defaultForm: BannerForm = {
  title: "",
  content: "",
  bgColor: "#1e3a5f",
  textColor: "#ffffff",
  sortOrder: 0,
  isActive: 1,
  targetPages: ['gastos'],
};

function BannerPreview({ title, content, bgColor, textColor }: { title: string; content: string; bgColor: string; textColor: string }) {
  return (
    <div
      className="rounded-2xl p-5 shadow-lg border border-white/10 min-h-[100px]"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      {title && <h3 className="text-base font-bold mb-2 leading-tight">{title}</h3>}
      {content && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap opacity-90">{content}</p>
      )}
      {!title && !content && (
        <p className="text-sm opacity-40 italic">Preview do banner aparece aqui...</p>
      )}
    </div>
  );
}

export default function AdminBanners() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<BannerForm>(defaultForm);

  const { data: banners = [], refetch } = trpc.banners.list.useQuery();
  const createMut = trpc.banners.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); setForm(defaultForm); toast.success("Banner criado!"); } });
  const updateMut = trpc.banners.update.useMutation({ onSuccess: () => { refetch(); setEditingId(null); toast.success("Banner atualizado!"); } });
  const deleteMut = trpc.banners.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Banner excluído!"); } });
  const toggleMut = trpc.banners.update.useMutation({ onSuccess: () => refetch() });

  function startEdit(b: typeof banners[0]) {
    setEditingId(b.id);
    const pages = b.targetPages ? b.targetPages.split(',').map(p => p.trim()).filter(Boolean) : ['gastos'];
    setForm({ title: b.title, content: b.content, bgColor: b.bgColor, textColor: b.textColor, sortOrder: b.sortOrder, isActive: b.isActive, targetPages: pages });
    setShowForm(false);
  }

  function handleSave() {
    if (!form.title.trim()) { toast.error("Título obrigatório"); return; }
    if (!form.content.trim()) { toast.error("Conteúdo obrigatório"); return; }
    if (form.targetPages.length === 0) { toast.error("Selecione pelo menos uma página"); return; }
    const payload = { ...form, targetPages: form.targetPages.join(',') };
    if (editingId !== null) {
      updateMut.mutate({ id: editingId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  }

  function handleDelete(id: number, title: string) {
    if (!confirm(`Excluir banner "${title}"?`)) return;
    deleteMut.mutate({ id });
  }

  const isEditing = editingId !== null || showForm;

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Banners" rightContent={
        !isEditing ? (
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm(defaultForm); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="w-3.5 h-3.5" /><span className="hidden sm:inline">Novo</span>
          </button>
        ) : undefined
      } />
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      {/* Botão Novo Banner movido para AdminHeader */}
      <div className="flex items-center justify-between hidden">
        {!isEditing && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm(defaultForm); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow"
          >
            <Plus className="w-4 h-4" /> Novo Banner
          </button>
        )}
      </div>

      {/* Formulário de criação/edição */}
      {isEditing && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-5 shadow-md">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">{editingId ? "Editar Banner" : "Novo Banner"}</h2>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Campos */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Título</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: 📢 Novidade importante!"
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Conteúdo</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Escreva o texto do banner aqui..."
                  rows={5}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Ordem</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Status</label>
                  <select
                    value={form.isActive}
                    onChange={e => setForm(f => ({ ...f, isActive: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value={1}>Ativo</option>
                    <option value={0}>Inativo</option>
                  </select>
                </div>
              </div>

              {/* Páginas alvo */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Exibir nas páginas</label>
                <div className="flex flex-wrap gap-3">
                  {PAGE_OPTIONS.map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.targetPages.includes(opt.value)}
                        onChange={e => setForm(f => ({
                          ...f,
                          targetPages: e.target.checked
                            ? [...f.targetPages, opt.value]
                            : f.targetPages.filter(p => p !== opt.value)
                        }))}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className="text-sm text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
                {form.targetPages.length === 0 && (
                  <p className="text-xs text-red-400 mt-1">Selecione pelo menos uma página</p>
                )}
              </div>

              {/* Cor de fundo */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Cor de Fundo</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {PRESET_BG_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, bgColor: c }))}
                      className="w-7 h-7 rounded-lg border-2 transition-all hover:scale-110"
                      style={{ backgroundColor: c, borderColor: form.bgColor === c ? '#fff' : 'transparent', boxShadow: form.bgColor === c ? '0 0 0 2px #6366f1' : 'none' }}
                      title={c}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.bgColor}
                    onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-background"
                  />
                  <input
                    type="text"
                    value={form.bgColor}
                    onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                    placeholder="#1e3a5f"
                  />
                </div>
              </div>

              {/* Cor do texto */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Cor do Texto</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {PRESET_TEXT_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, textColor: c }))}
                      className="w-7 h-7 rounded-lg border-2 transition-all hover:scale-110"
                      style={{ backgroundColor: c, borderColor: form.textColor === c ? '#6366f1' : '#374151', boxShadow: form.textColor === c ? '0 0 0 2px #6366f1' : 'none' }}
                      title={c}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.textColor}
                    onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-background"
                  />
                  <input
                    type="text"
                    value={form.textColor}
                    onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                    placeholder="#ffffff"
                  />
                </div>
              </div>
            </div>

            {/* Preview ao vivo */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Preview em Tempo Real</label>
              <BannerPreview title={form.title} content={form.content} bgColor={form.bgColor} textColor={form.textColor} />
              <p className="text-xs text-muted-foreground mt-2">Assim o banner aparecerá para o cliente</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-border">
            <button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors"
            >
              <Check className="w-4 h-4" />
              {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar Banner"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              className="px-5 py-2.5 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-semibold text-sm transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de banners */}
      {banners.length === 0 && !isEditing ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-lg font-medium">Nenhum banner criado ainda</p>
          <p className="text-sm mt-1">Clique em "Novo Banner" para criar o primeiro</p>
        </div>
      ) : (
        <div className="space-y-4">
          {banners.map(b => (
            <div key={b.id} className={`bg-card border rounded-2xl overflow-hidden shadow-sm transition-all ${editingId === b.id ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border'}`}>
              <div className="flex items-start gap-4 p-4">
                <div className="flex-shrink-0 mt-1 text-muted-foreground/40 cursor-grab">
                  <GripVertical className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <BannerPreview title={b.title} content={b.content} bgColor={b.bgColor} textColor={b.textColor} />
                  <div className="flex items-center flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                    <span>Ordem: {b.sortOrder}</span>
                    <span>•</span>
                    <span className={b.isActive ? "text-green-400" : "text-red-400"}>{b.isActive ? "Ativo" : "Inativo"}</span>
                    <span>•</span>
                    <span className="text-blue-400">
                      {(b.targetPages || 'gastos').split(',').map(p => PAGE_OPTIONS.find(o => o.value === p.trim())?.label || p.trim()).join(', ')}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggleMut.mutate({ id: b.id, isActive: b.isActive === 1 ? 0 : 1 })}
                    className={`p-2 rounded-lg transition-colors ${b.isActive ? "text-green-400 hover:bg-green-400/10" : "text-muted-foreground hover:bg-muted"}`}
                    title={b.isActive ? "Desativar" : "Ativar"}
                  >
                    {b.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => startEdit(b)}
                    className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(b.id, b.title)}
                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
