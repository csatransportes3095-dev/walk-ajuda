import { trpc } from "@/lib/trpc";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, ToggleLeft, ToggleRight, ChevronUp, ChevronDown, X, Upload, ExternalLink } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";

type CardForm = {
  title: string;
  description: string;
  logoUrl: string;
  buttonText: string;
  buttonLink: string;
  bgColor: string;
  buttonColor: string;
  titleColor: string;
  descColor: string;
  isActive: number;
  sortOrder: number;
  openInNewTab: number;
};

const defaultForm: CardForm = {
  title: "",
  description: "",
  logoUrl: "",
  buttonText: "ACESSAR",
  buttonLink: "",
  bgColor: "#6d28d9",
  buttonColor: "#7c3aed",
  titleColor: "#ffffff",
  descColor: "#e9d5ff",
  isActive: 1,
  sortOrder: 0,
  openInNewTab: 0,
};

export default function AdminFeatureCards() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CardForm>(defaultForm);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: cards = [], refetch } = trpc.featureCards.list.useQuery();
  const createMut = trpc.featureCards.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); setForm(defaultForm); toast.success("Card criado!"); } });
  const updateMut = trpc.featureCards.update.useMutation({ onSuccess: () => { refetch(); setEditingId(null); setShowForm(false); setForm(defaultForm); toast.success("Card atualizado!"); } });
  const deleteMut = trpc.featureCards.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Card removido!"); } });
  const uploadMut = trpc.media.upload.useMutation();

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setShowForm(true);
  }

  function openEdit(card: any) {
    setEditingId(card.id);
    setForm({
      title: card.title || "",
      description: card.description || "",
      logoUrl: card.logoUrl || "",
      buttonText: card.buttonText || "ACESSAR",
      buttonLink: card.buttonLink || "",
      bgColor: card.bgColor || "#6d28d9",
      buttonColor: card.buttonColor || "#7c3aed",
      titleColor: card.titleColor || "#ffffff",
      descColor: card.descColor || "#e9d5ff",
      isActive: card.isActive ?? 1,
      sortOrder: card.sortOrder ?? 0,
      openInNewTab: card.openInNewTab ?? 0,
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.title.trim()) { toast.error("Título obrigatório"); return; }
    if (editingId !== null) {
      updateMut.mutate({ id: editingId, ...form });
    } else {
      createMut.mutate(form);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande (máx 10MB)"); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string).split(",")[1];
        const res = await uploadMut.mutateAsync({ fileBase64: base64, mimeType: file.type, fileName: file.name });
        setForm(f => ({ ...f, logoUrl: res.url }));
        toast.success("Logo enviado!");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Erro ao enviar logo");
      setUploading(false);
    }
  }

  function moveCard(card: any, dir: "up" | "down") {
    const sorted = [...cards].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const idx = sorted.findIndex(c => c.id === card.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swapCard = sorted[swapIdx];
    // Usa os índices como valores de sortOrder para garantir que a troca sempre resulte em valores distintos
    updateMut.mutate({ id: card.id, sortOrder: swapIdx });
    updateMut.mutate({ id: swapCard.id, sortOrder: idx });
  }

  const sorted = [...cards].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/20 to-gray-950">
      <AdminHeader title="Cards de Destaque" backTo="/admin/codes" />
      <div className="container max-w-2xl py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-white">Cards de Destaque</h1>
            <p className="text-white/50 text-sm mt-1">Cards que aparecem na página inicial para os clientes</p>
          </div>
          <Button onClick={openCreate} className="bg-violet-600 hover:bg-violet-700 text-white font-bold gap-2">
            <Plus className="w-4 h-4" /> Novo Card
          </Button>
        </div>

        {/* Formulário de criação/edição */}
        {showForm && (
          <div className="bg-black/60 border border-violet-500/40 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg">{editingId ? "Editar Card" : "Novo Card"}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); setForm(defaultForm); }} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Logo */}
              <div>
                <label className="text-white/70 text-sm font-bold mb-1 block">Logo / Imagem do Card</label>
                <div className="flex items-center gap-3">
                  {form.logoUrl && (
                    <img src={form.logoUrl} alt="logo" className="w-16 h-16 rounded-xl object-cover border border-violet-500/30" />
                  )}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 bg-violet-700/40 hover:bg-violet-700/60 border border-violet-500/30 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      {uploading ? "Enviando..." : "Upload Imagem"}
                    </button>
                    <input
                      className="text-xs bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white/70 w-full"
                      placeholder="Ou cole uma URL de imagem"
                      value={form.logoUrl}
                      onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
                    />
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="text-white/70 text-sm font-bold mb-1 block">Título *</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold"
                  placeholder="Ex: GASTOS H2 COLOMBIANO"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-white/70 text-sm font-bold mb-1 block">Descrição</label>
                <textarea
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white/80 text-sm resize-none"
                  rows={2}
                  placeholder="Ex: Controle seus ganhos e gastos como motorista de aplicativo"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Botão */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/70 text-sm font-bold mb-1 block">Texto do Botão</label>
                  <input
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white font-bold"
                    placeholder="ACESSAR"
                    value={form.buttonText}
                    onChange={e => setForm(f => ({ ...f, buttonText: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm font-bold mb-1 block">Link do Botão</label>
                  <input
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white/80 text-sm"
                    placeholder="https://... ou /pagina"
                    value={form.buttonLink}
                    onChange={e => setForm(f => ({ ...f, buttonLink: e.target.value }))}
                  />
                </div>
              </div>

              {/* Cores */}
              <div>
                <label className="text-white/70 text-sm font-bold mb-2 block">Cores</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Fundo do Card", key: "bgColor" },
                    { label: "Cor do Botão", key: "buttonColor" },
                    { label: "Cor do Título", key: "titleColor" },
                    { label: "Cor da Descrição", key: "descColor" },
                  ].map(({ label, key }) => (
                    <div key={key} className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2">
                      <input
                        type="color"
                        value={(form as any)[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent"
                      />
                      <div>
                        <p className="text-white/50 text-xs">{label}</p>
                        <p className="text-white text-xs font-mono">{(form as any)[key]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="text-white/70 text-sm font-bold mb-2 block">Preview</label>
                <div className="rounded-2xl p-4 border border-white/10" style={{ backgroundColor: form.bgColor }}>
                  <div className="flex items-start gap-3 mb-3">
                    {form.logoUrl ? (
                      <img src={form.logoUrl} alt="logo" className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl">�x9</div>
                    )}
                    <div className="flex-1">
                      <p className="font-black text-sm" style={{ color: form.titleColor }}>{form.title || "TÍTULO DO CARD"}</p>
                      {form.description && <p className="text-xs mt-0.5" style={{ color: form.descColor }}>{form.description}</p>}
                    </div>
                  </div>
                  <button className="w-full py-2.5 rounded-xl font-black text-sm text-white" style={{ backgroundColor: form.buttonColor }}>
                    {form.buttonText || "ACESSAR"}
                  </button>
                </div>
              </div>

              {/* Opções */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.openInNewTab === 1} onChange={e => setForm(f => ({ ...f, openInNewTab: e.target.checked ? 1 : 0 }))} className="w-4 h-4 accent-violet-500" />
                  <span className="text-white/70 text-sm">Abrir link em nova aba</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive === 1} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked ? 1 : 0 }))} className="w-4 h-4 accent-violet-500" />
                  <span className="text-white/70 text-sm">Card ativo (visível)</span>
                </label>
              </div>

              <Button
                onClick={handleSave}
                disabled={createMut.isPending || updateMut.isPending}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black py-3"
              >
                {editingId ? "Salvar Alterações" : "Criar Card"}
              </Button>
            </div>
          </div>
        )}

        {/* Lista de cards */}
        {sorted.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">�x9</p>
            <p className="font-bold">Nenhum card criado ainda</p>
            <p className="text-sm mt-1">Clique em "Novo Card" para começar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((card, idx) => (
              <div key={card.id} className="bg-black/40 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                {/* Logo */}
                {card.logoUrl ? (
                  <img src={card.logoUrl} alt="logo" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-xl" style={{ backgroundColor: card.bgColor }}>�x9</div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-sm truncate">{card.title}</p>
                  {card.description && <p className="text-white/50 text-xs truncate">{card.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${card.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {card.isActive ? "Ativo" : "Oculto"}
                    </span>
                    {card.buttonLink && (
                      <a href={card.buttonLink} target="_blank" rel="noreferrer" className="text-violet-400 text-xs flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> {card.buttonText}
                      </a>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-col gap-1">
                  <button onClick={() => moveCard(card, "up")} disabled={idx === 0} className="text-white/30 hover:text-white disabled:opacity-20 p-1">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveCard(card, "down")} disabled={idx === sorted.length - 1} className="text-white/30 hover:text-white disabled:opacity-20 p-1">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateMut.mutate({ id: card.id, isActive: card.isActive ? 0 : 1 })} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all">
                    {card.isActive ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(card)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (confirm("Remover este card?")) deleteMut.mutate({ id: card.id }); }} className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
