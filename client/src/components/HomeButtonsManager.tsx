import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const LINK_TYPES = [
  { value: "whatsapp",  label: "💬 WhatsApp",          placeholder: "5511999999999" },
  { value: "group",     label: "👥 Grupo WhatsApp",     placeholder: "https://chat.whatsapp.com/..." },
  { value: "telegram",  label: "✈️ Telegram",           placeholder: "https://t.me/..." },
  { value: "instagram", label: "📸 Instagram",          placeholder: "https://instagram.com/..." },
  { value: "facebook",  label: "📘 Facebook",           placeholder: "https://facebook.com/..." },
  { value: "youtube",   label: "🎥 YouTube",            placeholder: "https://youtube.com/..." },
  { value: "pdf",       label: "📄 Arquivo PDF",        placeholder: "https://..." },
  { value: "site",      label: "🌐 Site",               placeholder: "https://..." },
  { value: "internal",  label: "📱 Página Interna",     placeholder: "/gastos" },
  { value: "custom",    label: "🔗 Link Personalizado", placeholder: "https://..." },
];

const ICON_OPTIONS = [
  { value: "group",    label: "👥 Grupo VIP" },
  { value: "key",      label: "🔑 Senha" },
  { value: "chart",    label: "📊 Gastos" },
  { value: "video",    label: "🎥 Vídeos" },
  { value: "globe",    label: "🌐 Site" },
  { value: "chat",     label: "💬 Suporte" },
  { value: "doc",      label: "📄 Termos" },
  { value: "gift",     label: "🎁 Sorteios" },
  { value: "phone",    label: "📱 Celular" },
  { value: "star",     label: "⭐ VIP" },
  { value: "car",      label: "🚗 Carro" },
  { value: "money",    label: "💰 Dinheiro" },
  { value: "info",     label: "ℹ️ Info" },
  { value: "alert",    label: "⚠️ Alerta" },
  { value: "check",    label: "✅ Check" },
  { value: "lock",     label: "🔒 Cadeado" },
  { value: "telegram", label: "✈️ Telegram" },
  { value: "insta",    label: "📸 Instagram" },
];

const ICON_EMOJIS: Record<string, string> = {
  group: "👥", key: "🔑", chart: "📊", video: "🎥", globe: "🌐",
  chat: "💬", doc: "📄", gift: "🎁", phone: "📱", star: "⭐",
  car: "🚗", money: "💰", info: "ℹ️", alert: "⚠️", check: "✅",
  lock: "🔒", telegram: "✈️", insta: "📸",
};

const HOVER_OPTIONS = [
  { value: "scale",      label: "Escala" },
  { value: "brightness", label: "Brilho" },
  { value: "lift",       label: "Elevar" },
  { value: "none",       label: "Nenhum" },
];

const FONT_OPTIONS = [
  { value: "",           label: "Padrão" },
  { value: "Rajdhani",   label: "Rajdhani" },
  { value: "Orbitron",   label: "Orbitron" },
  { value: "Exo 2",      label: "Exo 2" },
  { value: "Bebas Neue", label: "Bebas Neue" },
];

type HomeButton = {
  id: number;
  text: string;
  subtitle: string;
  url: string;
  waMsg?: string | null;
  icon: string;
  color: string;
  textColor: string;
  subColor: string;
  font: string;
  hover: string;
  linkType: string;
  openInNewTab: number;
  vipOnly: number;
  isActive: number;
  sortOrder: number;
};

const DEFAULT_FORM: Partial<HomeButton> = {
  text: "", subtitle: "", url: "", waMsg: "",
  icon: "gift", color: "#0ea5e9", textColor: "#ffffff",
  subColor: "rgba(255,255,255,0.7)", font: "", hover: "scale",
  linkType: "custom", openInNewTab: 0, vipOnly: 0, isActive: 1,
};

function buildUrl(linkType: string, url: string): string {
  if (linkType === "whatsapp") {
    const num = url.replace(/\D/g, "");
    return `https://wa.me/${num}`;
  }
  return url;
}

export function HomeButtonsManager() {
  const { data: buttons = [], isLoading, refetch } = trpc.homeButtons.list.useQuery();
  const createMut = trpc.homeButtons.create.useMutation({ onSuccess: () => { refetch(); toast.success("Botão criado!"); resetForm(); setShowForm(false); } });
  const updateMut = trpc.homeButtons.update.useMutation({ onSuccess: () => { refetch(); toast.success("Botão atualizado!"); resetForm(); setShowForm(false); setEditingId(null); } });
  const deleteMut = trpc.homeButtons.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Botão excluído!"); } });
  const toggleMut = trpc.homeButtons.toggle.useMutation({ onSuccess: () => refetch() });
  const reorderMut = trpc.homeButtons.reorder.useMutation({ onSuccess: () => refetch() });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<HomeButton>>(DEFAULT_FORM);

  function resetForm() { setForm(DEFAULT_FORM); }

  function startEdit(btn: HomeButton) {
    setForm({ ...btn });
    setEditingId(btn.id);
    setShowForm(true);
  }

  function handleSave() {
    if (!form.text?.trim()) { toast.error("Nome do botão é obrigatório"); return; }
    if (!form.url?.trim()) { toast.error("URL é obrigatória"); return; }
    const finalUrl = buildUrl(form.linkType || "custom", form.url || "");
    if (editingId) {
      updateMut.mutate({ id: editingId, data: { ...form, url: finalUrl } });
    } else {
      createMut.mutate({ ...form as any, url: finalUrl });
    }
  }

  function moveUp(idx: number) {
    if (idx === 0) return;
    const ids = buttons.map(b => b.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    reorderMut.mutate({ ids });
  }
  function moveDown(idx: number) {
    if (idx === buttons.length - 1) return;
    const ids = buttons.map(b => b.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    reorderMut.mutate({ ids });
  }

  const linkTypePlaceholder = LINK_TYPES.find(l => l.value === form.linkType)?.placeholder || "https://...";
  const linkTypeLabel = LINK_TYPES.find(l => l.value === form.linkType)?.label || "Link";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-base">📌 Botões Rápidos</h3>
          <p className="text-gray-400 text-xs mt-0.5">Botões exibidos no Hub Central de Acesso</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingId(null); setShowForm(true); }}
          className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-lg text-blue-300 text-sm font-semibold"
        >
          + Novo Botão
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : buttons.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl">
          Nenhum botão criado ainda.<br />Clique em "+ Novo Botão" para começar.
        </div>
      ) : (
        <div className="space-y-2">
          {buttons.map((btn, idx) => (
            <div
              key={btn.id}
              className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${btn.isActive ? "border-gray-700 bg-gray-800/40" : "border-gray-800 bg-gray-900/40 opacity-50"}`}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
                style={{ backgroundColor: btn.color }}
              >
                {ICON_EMOJIS[btn.icon] || "🔗"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{btn.text}</p>
                <p className="text-gray-400 text-xs truncate">{btn.url}</p>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {(btn as any).vipOnly === 1 && <span className="text-xs bg-yellow-600/20 text-yellow-400 px-1.5 py-0.5 rounded-full">⭐ VIP</span>}
                  {(btn as any).openInNewTab === 1 && <span className="text-xs bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded-full">↗ Nova aba</span>}
                  <span className="text-xs bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full">{LINK_TYPES.find(l => l.value === (btn as any).linkType)?.label || "🔗 Link"}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => moveUp(idx)} className="p-1 text-gray-400 hover:text-white text-xs" title="Mover para cima">▲</button>
                <button onClick={() => moveDown(idx)} className="p-1 text-gray-400 hover:text-white text-xs" title="Mover para baixo">▼</button>
                <button
                  onClick={() => toggleMut.mutate({ id: btn.id, isActive: btn.isActive === 0 })}
                  className={`px-2 py-1 rounded text-xs font-semibold ${btn.isActive ? "bg-green-600/20 text-green-400" : "bg-gray-700/40 text-gray-500"}`}
                >
                  {btn.isActive ? "ON" : "OFF"}
                </button>
                <button onClick={() => startEdit(btn as HomeButton)} className="p-1.5 text-blue-400 hover:text-blue-300 text-xs">✏️</button>
                <button
                  onClick={() => { if (confirm("Excluir este botão?")) deleteMut.mutate({ id: btn.id }); }}
                  className="p-1.5 text-red-400 hover:text-red-300 text-xs"
                >🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="border border-blue-500/30 rounded-xl p-4 space-y-3 bg-gray-900/60">
          <h4 className="text-white font-bold text-sm">{editingId ? "✏️ Editar Botão" : "➕ Novo Botão"}</h4>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Nome do botão *</label>
              <input
                type="text"
                value={form.text || ""}
                onChange={e => setForm({ ...form, text: e.target.value })}
                placeholder="Ex: Entrar no Grupo VIP"
                style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Subtexto (opcional)</label>
              <input
                type="text"
                value={form.subtitle || ""}
                onChange={e => setForm({ ...form, subtitle: e.target.value })}
                placeholder="Ex: Acesso exclusivo"
                style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Tipo de link</label>
            <select
              value={form.linkType || "custom"}
              onChange={e => setForm({ ...form, linkType: e.target.value })}
              style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
            >
              {LINK_TYPES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              {form.linkType === "whatsapp" ? "Número WhatsApp (só dígitos)" : `Endereço (${linkTypeLabel})`}
            </label>
            <input
              type="text"
              value={form.url || ""}
              onChange={e => setForm({ ...form, url: e.target.value })}
              placeholder={linkTypePlaceholder}
              style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
            />
            {form.linkType === "whatsapp" && (
              <p className="text-xs text-gray-500 mt-1">Ex: 5511999999999 (código do país + DDD + número)</p>
            )}
          </div>

          {(form.linkType === "whatsapp" || form.linkType === "group") && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Mensagem automática (opcional)</label>
              <input
                type="text"
                value={form.waMsg || ""}
                onChange={e => setForm({ ...form, waMsg: e.target.value })}
                placeholder="Ex: Olá! Quero entrar no grupo VIP"
                style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Ícone</label>
              <select
                value={form.icon || "gift"}
                onChange={e => setForm({ ...form, icon: e.target.value })}
                style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
              >
                {ICON_OPTIONS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Efeito hover</label>
              <select
                value={form.hover || "scale"}
                onChange={e => setForm({ ...form, hover: e.target.value })}
                style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
              >
                {HOVER_OPTIONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Cor Fundo", key: "color", def: "#0ea5e9" },
              { label: "Cor Texto", key: "textColor", def: "#ffffff" },
              { label: "Cor Subtexto", key: "subColor", def: "rgba(255,255,255,0.7)" },
            ].map(({ label, key, def }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 block mb-1">{label}</label>
                <div className="flex gap-1">
                  <input
                    type="color"
                    value={(form as any)[key] || def}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 flex-shrink-0"
                  />
                  <input
                    type="text"
                    value={(form as any)[key] || def}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="flex-1 text-xs min-w-0"
                    style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.25rem', outline: 'none' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Fonte</label>
            <select
              value={form.font || ""}
              onChange={e => setForm({ ...form, font: e.target.value })}
              style={{ backgroundColor: '#1a1a3e', color: '#fff', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', outline: 'none' }}
            >
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-gray-700 hover:border-blue-500/50">
              <input
                type="checkbox"
                checked={form.openInNewTab === 1}
                onChange={e => setForm({ ...form, openInNewTab: e.target.checked ? 1 : 0 })}
                className="w-4 h-4 accent-blue-500"
              />
              <div>
                <p className="text-white text-xs font-semibold">↗ Abrir em nova aba</p>
                <p className="text-gray-500 text-xs">Link abre em nova janela</p>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-gray-700 hover:border-yellow-500/50">
              <input
                type="checkbox"
                checked={form.vipOnly === 1}
                onChange={e => setForm({ ...form, vipOnly: e.target.checked ? 1 : 0 })}
                className="w-4 h-4 accent-yellow-500"
              />
              <div>
                <p className="text-white text-xs font-semibold">⭐ Somente VIP</p>
                <p className="text-gray-500 text-xs">Exibir só para VIPs</p>
              </div>
            </label>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Pré-visualização</label>
            <div className="flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg" style={{ background: form.color || "#0ea5e9" }}>
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                {ICON_EMOJIS[form.icon || "gift"] || "🔗"}
              </div>
              <div className="flex-1">
                <p className="font-black text-base leading-snug" style={{ color: form.textColor || "#fff" }}>
                  {form.text || "Nome do Botão"}
                </p>
                {form.subtitle && (
                  <p className="text-xs mt-0.5" style={{ color: form.subColor || "rgba(255,255,255,0.7)" }}>
                    {form.subtitle}
                  </p>
                )}
              </div>
              <span className="text-white/60 text-lg">›</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
              className="flex-1 py-2 px-4 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 rounded-lg text-green-300 font-semibold text-sm disabled:opacity-50"
            >
              {editingId ? "💾 Atualizar" : "✅ Criar Botão"}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); resetForm(); }}
              className="flex-1 py-2 px-4 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/30 rounded-lg text-gray-300 font-semibold text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
