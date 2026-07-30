import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import { MessageCircle, Plus, Trash2, Edit2, Check, X, Send, RefreshCw, Settings, Bot, MessageSquare, Users } from "lucide-react";

// ─── TIPOS DE AÇÃO ────────────────────────────────────────────────────────────
const ACTION_TYPES = [
  { value: "open_internal", label: "📄 Abrir página do site", field: "path", placeholder: "/pre-cadastro", hint: "Ex: /pre-cadastro  /acompanhar  /planilha" },
  { value: "open_external", label: "🔗 Abrir link externo", field: "url", placeholder: "https://...", hint: "URL completa com https://" },
  { value: "open_video", label: "🎥 Abrir vídeo", field: "url", placeholder: "https://youtube.com/...", hint: "Link do YouTube ou outro vídeo" },
  { value: "open_whatsapp", label: "💬 Abrir WhatsApp", field: "phone", placeholder: "5511940239867", hint: "Número com código do país (55 + DDD + número)" },
  { value: "send_text", label: "✉️ Enviar mensagem automática", field: "text", placeholder: "Digite a mensagem que o bot vai enviar...", hint: "O bot envia este texto ao cliente" },
  { value: "handoff_human", label: "👤 Falar com atendente", field: null, placeholder: "", hint: "Encaminha para atendente (disponível das 18h às 23h)" },
];

function getActionInfo(type: string) {
  return ACTION_TYPES.find(a => a.value === type) || ACTION_TYPES[0];
}

function buildPayload(actionType: string, value: string): Record<string, unknown> {
  const info = getActionInfo(actionType);
  if (!info.field) return {};
  if (actionType === "open_internal") return { path: value.startsWith("/") ? value : "/" + value };
  if (actionType === "open_whatsapp") return { phone: value.replace(/\D/g, "") };
  return { [info.field]: value };
}

function extractValue(actionType: string, payload: Record<string, any> | null): string {
  if (!payload) return "";
  const info = getActionInfo(actionType);
  if (!info.field) return "";
  return String(payload[info.field] || "");
}

// ─── EDITOR DE BOTÃO ─────────────────────────────────────────────────────────
function BotaoEditor({
  title, setTitle,
  actionType, setActionType,
  value, setValue,
  responseText, setResponseText,
  responseImageUrl, setResponseImageUrl,
  keywords, setKeywords,
  subButtons, setSubButtons,
  onSave, onCancel,
  saveLabel = "Salvar",
}: {
  title: string; setTitle: (v: string) => void;
  actionType: string; setActionType: (v: string) => void;
  value: string; setValue: (v: string) => void;
  responseText?: string; setResponseText?: (v: string) => void;
  responseImageUrl?: string; setResponseImageUrl?: (v: string) => void;
  keywords?: string[]; setKeywords?: (v: string[]) => void;
  subButtons?: Array<{label: string; actionType: string; value: string}>;
  setSubButtons?: (v: Array<{label: string; actionType: string; value: string}>) => void;
  onSave: () => void; onCancel?: () => void;
  saveLabel?: string;
}) {
  const info = getActionInfo(actionType);
  const subs = subButtons || [];
  const setSubs = setSubButtons || (() => {});
  return (
    <div className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/10">
      <div>
        <label className="text-xs font-bold text-white/60 block mb-1">NOME DO BOTÃO *</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ex: Fazer Pedido, Ver Vídeo, Falar no WhatsApp..."
          className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400"
        />
      </div>
      <div>
        <label className="text-xs font-bold text-white/60 block mb-1">O QUE ESTE BOTÃO FAZ?</label>
        <select
          value={actionType}
          onChange={e => { setActionType(e.target.value); setValue(""); }}
          className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-blue-400"
        >
          {ACTION_TYPES.map(a => (
            <option key={a.value} value={a.value} className="bg-gray-900">{a.label}</option>
          ))}
        </select>
        <p className="text-[11px] text-white/35 mt-1">{info.hint}</p>
      </div>
      {info.field && (
        <div>
          <label className="text-xs font-bold text-white/60 block mb-1">
            {actionType === "open_internal" ? "CAMINHO DA PÁGINA" :
             actionType === "open_whatsapp" ? "NÚMERO DO WHATSAPP" :
             actionType === "send_text" ? "MENSAGEM DO BOT" :
             "URL / LINK"}
          </label>
          {actionType === "send_text" ? (
            <textarea
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={info.placeholder}
              rows={3}
              className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400 resize-none"
            />
          ) : (
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={info.placeholder}
              className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400"
            />
          )}
        </div>
      )}

      {/* Resposta do bot quando o cliente clica neste botão */}
      {setResponseText && (
        <div className="border-t border-white/10 pt-3 space-y-3">
          <div>
            <label className="text-xs font-bold text-white/60 block mb-1">RESPOSTA DO BOT (opcional)</label>
            <p className="text-[11px] text-white/35 mb-2">Texto que o bot envia quando o cliente clica neste botão</p>
            <textarea
              value={responseText || ""}
              onChange={e => setResponseText(e.target.value)}
              placeholder="Ex: Olá! Para fazer seu pedido, siga os passos abaixo..."
              rows={3}
              className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
          {setResponseImageUrl && (
            <div>
              <label className="text-xs font-bold text-white/60 block mb-1">FOTO / IMAGEM NA RESPOSTA (opcional)</label>
              <input
                value={responseImageUrl || ""}
                onChange={e => setResponseImageUrl(e.target.value)}
                placeholder="https://... (URL da imagem)"
                className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400"
              />
              {responseImageUrl && (
                <img src={responseImageUrl} alt="Preview" className="mt-2 max-h-32 rounded-lg border border-white/10 object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Palavras-chave do botão */}
      {setKeywords && (
        <div className="border-t border-white/10 pt-3">
          <label className="text-xs font-bold text-white/60 block mb-1">PALAVRAS-CHAVE (opcional)</label>
          <p className="text-[11px] text-white/35 mb-2">Separe por vírgula ou uma por linha. Ex: fazer pedido, quero abrir conta, pedido</p>
          <textarea
            value={(keywords || []).join("\n")}
            onChange={e => {
              const raw = e.target.value;
              const parsed = raw.split(/[,\n]/).map(k => k.trim()).filter(Boolean);
              setKeywords(parsed.length > 0 || raw.trim() === "" ? (raw.endsWith(",") || raw.endsWith("\n") ? parsed : raw.split(/[,\n]/).map(k => k.trim())) : []);
            }}
            placeholder={"fazer pedido\nquero abrir conta\npedido, cadastro"}
            rows={4}
            className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400 resize-none"
          />
          {(keywords || []).filter(k => k.trim()).length > 0 && (
            <p className="text-[11px] text-green-400/70 mt-1">{(keywords || []).filter(k => k.trim()).length} palavra(s)-chave configurada(s)</p>
          )}
        </div>
      )}

      {/* Sub-botões (árvore) */}
      {setSubButtons && (
        <div className="border-t border-white/10 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <label className="text-xs font-bold text-white/60 block">SUB-BOTÕES (opcional)</label>
              <p className="text-[11px] text-white/35">Botões que aparecem junto com a resposta acima</p>
            </div>
            <button
              onClick={() => setSubs([...subs, { label: "", actionType: "open_internal", value: "" }])}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 font-bold transition-colors"
            >+ Adicionar</button>
          </div>
          {subs.map((sub, i) => (
            <div key={i} className="flex gap-2 mb-2 items-start">
              <div className="flex-1 space-y-1.5">
                <input
                  value={sub.label}
                  onChange={e => { const n = [...subs]; n[i] = {...n[i], label: e.target.value}; setSubs(n); }}
                  placeholder="Nome do sub-botão"
                  className="w-full h-8 rounded-lg bg-black/30 border border-white/15 px-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400"
                />
                <div className="flex gap-1.5">
                  <select
                    value={sub.actionType}
                    onChange={e => { const n = [...subs]; n[i] = {...n[i], actionType: e.target.value, value: ""}; setSubs(n); }}
                    className="flex-1 h-8 rounded-lg bg-black/30 border border-white/15 px-2 text-xs text-white focus:outline-none focus:border-blue-400"
                  >
                    {ACTION_TYPES.map(a => <option key={a.value} value={a.value} className="bg-gray-900">{a.label}</option>)}
                  </select>
                  {getActionInfo(sub.actionType).field && (
                    <input
                      value={sub.value}
                      onChange={e => { const n = [...subs]; n[i] = {...n[i], value: e.target.value}; setSubs(n); }}
                      placeholder={getActionInfo(sub.actionType).placeholder}
                      className="flex-1 h-8 rounded-lg bg-black/30 border border-white/15 px-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400"
                    />
                  )}
                </div>
              </div>
              <button onClick={() => setSubs(subs.filter((_, j) => j !== i))} className="p-1.5 mt-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors">
          {saveLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-bold transition-colors">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── BADGE DE TIPO ────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  open_internal: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  open_external: "bg-green-500/20 text-green-300 border-green-500/30",
  open_video: "bg-red-500/20 text-red-300 border-red-500/30",
  open_whatsapp: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  send_text: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  handoff_human: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  send_buttons: "bg-pink-500/20 text-pink-300 border-pink-500/30",
};

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
type Tab = "botoes" | "respostas" | "conversas" | "config";

export default function AdminOnlineSupport() {
  const [tab, setTab] = useState<Tab>("botoes");

  // ── Queries ──
  const menuQ = trpc.onlineSupport.adminMenuList.useQuery();
  const autoRepliesQ = trpc.onlineSupport.adminAutoRepliesList.useQuery();
  const conversationsQ = trpc.onlineSupport.adminConversationsList.useQuery(undefined, { refetchInterval: 5000 });
  const configQ = trpc.onlineSupport.adminConfigGet.useQuery();

  // ── Menu (Botões) ──
  const saveMenuMut = trpc.onlineSupport.adminMenuSave.useMutation({ onSuccess: () => { menuQ.refetch(); toast.success("Botão salvo!"); } });
  const deleteMenuMut = trpc.onlineSupport.adminMenuDelete.useMutation({ onSuccess: () => { menuQ.refetch(); toast.success("Botão removido"); } });

  const [newTitle, setNewTitle] = useState("");
  const [newActionType, setNewActionType] = useState("open_internal");
  const [newValue, setNewValue] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editActionType, setEditActionType] = useState("open_internal");
  const [editValue, setEditValue] = useState("");
  const [editResponseText, setEditResponseText] = useState("");
  const [editResponseImageUrl, setEditResponseImageUrl] = useState("");
  const [editKeywords, setEditKeywords] = useState<string[]>([]);
  const [editSubButtons, setEditSubButtons] = useState<Array<{label: string; actionType: string; value: string}>>([]);

  const [newResponseText, setNewResponseText] = useState("");
  const [newResponseImageUrl, setNewResponseImageUrl] = useState("");
  const [newKeywords, setNewKeywords] = useState<string[]>([]);
  const [newSubButtons, setNewSubButtons] = useState<Array<{label: string; actionType: string; value: string}>>([]);

  const handleSaveNew = () => {
    if (!newTitle.trim()) { toast.error("Nome do botão é obrigatório"); return; }
    saveMenuMut.mutate({
      title: newTitle.trim(),
      description: "",
      actionType: newActionType,
      actionPayload: buildPayload(newActionType, newValue),
      responseText: newResponseText.trim() || undefined,
      responseImageUrl: newResponseImageUrl.trim() || undefined,
      keywords: newKeywords.filter(k => k.trim()),
      subButtons: newSubButtons.filter(b => b.label.trim()).map(b => ({
        label: b.label.trim(),
        actionType: b.actionType,
        actionPayload: buildPayload(b.actionType, b.value),
      })),
      isActive: true,
      sortOrder: 99,
    });
    setNewTitle(""); setNewActionType("open_internal"); setNewValue(""); setNewResponseText(""); setNewResponseImageUrl(""); setNewKeywords([]); setNewSubButtons([]); setShowNewForm(false);
  };

  const handleSaveEdit = () => {
    if (!editId || !editTitle.trim()) return;
    saveMenuMut.mutate({
      id: editId,
      title: editTitle.trim(),
      description: "",
      actionType: editActionType,
      actionPayload: buildPayload(editActionType, editValue),
      responseText: editResponseText.trim() || undefined,
      responseImageUrl: editResponseImageUrl.trim() || undefined,
      keywords: editKeywords.filter(k => k.trim()),
      subButtons: editSubButtons.filter(b => b.label.trim()).map(b => ({
        label: b.label.trim(),
        actionType: b.actionType,
        actionPayload: buildPayload(b.actionType, b.value),
      })),
      isActive: true,
      sortOrder: 0,
    });
    setEditId(null);
  };

  const startEdit = (item: any) => {
    setEditId(item.id);
    setEditTitle(item.title || "");
    setEditActionType(item.actionType || "open_internal");
    setEditValue(extractValue(item.actionType, item.actionPayload));
    setEditResponseText(item.responseText || "");
    setEditResponseImageUrl(item.responseImageUrl || "");
    setEditKeywords(item.keywords || []);
    setEditSubButtons((item.subButtons || []).map((b: any) => ({
      label: b.label || "",
      actionType: b.actionType || "open_internal",
      value: extractValue(b.actionType, b.actionPayload || {}),
    })));
  };

  // ── Respostas Automáticas ──
  const saveReplyMut = trpc.onlineSupport.adminAutoRepliesSave.useMutation({ onSuccess: () => { autoRepliesQ.refetch(); toast.success("Resposta salva!"); } });
  const deleteReplyMut = trpc.onlineSupport.adminAutoRepliesDelete.useMutation({ onSuccess: () => { autoRepliesQ.refetch(); toast.success("Resposta removida"); } });

  const [showNewReply, setShowNewReply] = useState(false);
  const [newReplyKeywords, setNewReplyKeywords] = useState("");
  const [newReplyText, setNewReplyText] = useState("");
  const [editReplyId, setEditReplyId] = useState<number | null>(null);
  const [editReplyKeywords, setEditReplyKeywords] = useState("");
  const [editReplyText, setEditReplyText] = useState("");

  const handleSaveNewReply = () => {
    if (!newReplyKeywords.trim() || !newReplyText.trim()) { toast.error("Preencha as palavras-chave e a resposta"); return; }
    saveReplyMut.mutate({
      internalName: newReplyKeywords.split("\n")[0].trim().toLowerCase().replace(/\s+/g, "_"),
      title: newReplyKeywords.split("\n")[0].trim(),
      keywords: newReplyKeywords.split("\n").map(k => k.trim()).filter(Boolean),
      relatedQuestions: [],
      responseText: newReplyText.trim(),
      buttons: [],
      isActive: true,
    });
    setNewReplyKeywords(""); setNewReplyText(""); setShowNewReply(false);
  };

  const handleSaveEditReply = () => {
    if (!editReplyId) return;
    const item = (autoRepliesQ.data || []).find((r: any) => r.id === editReplyId);
    saveReplyMut.mutate({
      id: editReplyId,
      internalName: item?.internalName || "reply",
      title: editReplyKeywords.split("\n")[0].trim(),
      keywords: editReplyKeywords.split("\n").map(k => k.trim()).filter(Boolean),
      relatedQuestions: item?.relatedQuestions || [],
      responseText: editReplyText.trim(),
      buttons: item?.buttons || [],
      isActive: true,
    });
    setEditReplyId(null);
  };

  // ── Conversas ──
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const messagesQ = trpc.onlineSupport.adminConversationMessages.useQuery(
    { conversationId: selectedConvId || 0, limit: 200 },
    { enabled: !!selectedConvId, refetchInterval: 3000 }
  );
  const sendMut = trpc.onlineSupport.adminSendMessage.useMutation({
    onSuccess: () => { setReply(""); messagesQ.refetch(); conversationsQ.refetch(); }
  });
  const updateConvMut = trpc.onlineSupport.adminConversationUpdate.useMutation({
    onSuccess: () => conversationsQ.refetch()
  });
  const [reply, setReply] = useState("");
  const msgEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messagesQ.data]);

  // ── Config ──
  const configMut = trpc.onlineSupport.adminConfigUpdate.useMutation({
    onSuccess: () => { configQ.refetch(); toast.success("Configurações salvas!"); }
  });
  const cfg = configQ.data || {};
  const [cfgLabel, setCfgLabel] = useState("");
  const [cfgWelcome, setCfgWelcome] = useState("");
  const [cfgColor, setCfgColor] = useState("#2563eb");
  const [cfgEnabled, setCfgEnabled] = useState(true);
  const [cfgStatusText, setCfgStatusText] = useState("");
  const [cfgSortOrder, setCfgSortOrder] = useState(3);
  useEffect(() => {
    if (configQ.data) {
      setCfgLabel(configQ.data.buttonLabel || "Atendimento Online");
      setCfgWelcome(configQ.data.welcomeMessage || "");
      setCfgColor(configQ.data.buttonColor || "#2563eb");
      setCfgEnabled(configQ.data.chatEnabled === 1);
      setCfgStatusText((configQ.data as any).customStatusText || "");
      setCfgSortOrder(Number(configQ.data.buttonSortOrder) || 3);
    }
  }, [configQ.data]);

  const TABS: { id: Tab; label: string; icon: any; desc: string }[] = [
    { id: "botoes", label: "Botões do Menu", icon: MessageCircle, desc: "Configure os botões que aparecem no chat" },
    { id: "respostas", label: "Respostas Automáticas", icon: Bot, desc: "O bot responde quando o cliente escreve estas palavras" },
    { id: "conversas", label: "Conversas", icon: MessageSquare, desc: "Veja e responda as conversas dos clientes" },
    { id: "config", label: "Configurações", icon: Settings, desc: "Aparência e comportamento do chat" },
  ];

  return (
    <div className="min-h-screen bg-[#0b1222] text-white">
      <AdminHeader />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Atendimento Online</h1>
          <p className="text-sm text-white/50 mt-1">Configure o chat de atendimento do site</p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`p-3 rounded-xl border text-left transition-all ${tab === t.id ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"}`}
            >
              <t.icon className="w-4 h-4 mb-1" />
              <p className="text-xs font-bold">{t.label}</p>
            </button>
          ))}
        </div>

        {/* ═══ ABA: BOTÕES DO MENU ════════════════════════════════════════════ */}
        {tab === "botoes" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Botões do Menu</h2>
                <p className="text-xs text-white/50">Estes botões aparecem no chat quando o cliente faz uma pergunta. Configure o que cada botão faz.</p>
              </div>
              <button
                onClick={() => setShowNewForm(!showNewForm)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
              >
                <Plus className="w-4 h-4" />
                Novo Botão
              </button>
            </div>

            {showNewForm && (
              <BotaoEditor
                title={newTitle} setTitle={setNewTitle}
                actionType={newActionType} setActionType={setNewActionType}
                value={newValue} setValue={setNewValue}
                responseText={newResponseText} setResponseText={setNewResponseText}
                responseImageUrl={newResponseImageUrl} setResponseImageUrl={setNewResponseImageUrl}
                keywords={newKeywords} setKeywords={setNewKeywords}
                subButtons={newSubButtons} setSubButtons={setNewSubButtons}
                onSave={handleSaveNew}
                onCancel={() => { setShowNewForm(false); setNewTitle(""); setNewValue(""); setNewResponseText(""); setNewResponseImageUrl(""); setNewKeywords([]); setNewSubButtons([]); }}
                saveLabel="Criar Botão"
              />
            )}

            {menuQ.isLoading && <p className="text-white/40 text-sm">Carregando...</p>}
            {(menuQ.data || []).length === 0 && !menuQ.isLoading && (
              <div className="text-center py-10 text-white/30">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum botão criado ainda</p>
                <p className="text-xs mt-1">Clique em "Novo Botão" para criar o primeiro</p>
              </div>
            )}

            <div className="space-y-2">
              {(menuQ.data || []).map((item: any) => {
                const info = getActionInfo(item.actionType);
                const colorClass = TYPE_COLORS[item.actionType] || "bg-white/10 text-white/60 border-white/20";
                const descValue = extractValue(item.actionType, item.actionPayload);
                return (
                  <div key={item.id} className={`rounded-xl border p-4 transition-all ${item.isActive ? "bg-white/5 border-white/10" : "bg-black/20 border-white/5 opacity-50"}`}>
                    {editId === item.id ? (
                      <BotaoEditor
                        title={editTitle} setTitle={setEditTitle}
                        actionType={editActionType} setActionType={setEditActionType}
                        value={editValue} setValue={setEditValue}
                        responseText={editResponseText} setResponseText={setEditResponseText}
                        responseImageUrl={editResponseImageUrl} setResponseImageUrl={setEditResponseImageUrl}
                        keywords={editKeywords} setKeywords={setEditKeywords}
                        subButtons={editSubButtons} setSubButtons={setEditSubButtons}
                        onSave={handleSaveEdit}
                        onCancel={() => setEditId(null)}
                        saveLabel="Salvar Alterações"
                      />
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-sm">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorClass}`}>
                              {info.label}
                            </span>
                            {descValue && (
                              <span className="text-[11px] text-white/40 truncate max-w-[200px]">{descValue}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => startEdit(item)} className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors" title="Editar">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteMenuMut.mutate({ id: item.id })} className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors" title="Excluir">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ ABA: RESPOSTAS AUTOMÁTICAS ═════════════════════════════════════ */}
        {tab === "respostas" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Respostas Automáticas</h2>
                <p className="text-xs text-white/50">Quando o cliente escreve uma dessas palavras, o bot responde automaticamente com o texto configurado.</p>
              </div>
              <button
                onClick={() => setShowNewReply(!showNewReply)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nova Resposta
              </button>
            </div>

            {showNewReply && (
              <div className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/10">
                <div>
                  <label className="text-xs font-bold text-white/60 block mb-1">PALAVRAS-CHAVE (uma por linha) *</label>
                  <textarea
                    value={newReplyKeywords}
                    onChange={e => setNewReplyKeywords(e.target.value)}
                    placeholder={"pedido\ncomo fazer pedido\nquero fazer pedido"}
                    rows={3}
                    className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400 resize-none"
                  />
                  <p className="text-[11px] text-white/35 mt-1">Quando o cliente escrever qualquer uma dessas palavras, esta resposta será enviada</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-white/60 block mb-1">RESPOSTA DO BOT *</label>
                  <textarea
                    value={newReplyText}
                    onChange={e => setNewReplyText(e.target.value)}
                    placeholder="Digite o que o bot vai responder quando o cliente usar estas palavras..."
                    rows={4}
                    className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSaveNewReply} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors">Criar Resposta</button>
                  <button onClick={() => { setShowNewReply(false); setNewReplyKeywords(""); setNewReplyText(""); }} className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-bold transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {autoRepliesQ.isLoading && <p className="text-white/40 text-sm">Carregando...</p>}
            {(autoRepliesQ.data || []).length === 0 && !autoRepliesQ.isLoading && (
              <div className="text-center py-10 text-white/30">
                <Bot className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma resposta automática criada</p>
              </div>
            )}

            <div className="space-y-2">
              {(autoRepliesQ.data || []).map((item: any) => (
                <div key={item.id} className={`rounded-xl border p-4 ${item.isActive ? "bg-white/5 border-white/10" : "bg-black/20 border-white/5 opacity-50"}`}>
                  {editReplyId === item.id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-white/60 block mb-1">PALAVRAS-CHAVE (uma por linha)</label>
                        <textarea value={editReplyKeywords} onChange={e => setEditReplyKeywords(e.target.value)} rows={3} className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400 resize-none" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-white/60 block mb-1">RESPOSTA DO BOT</label>
                        <textarea value={editReplyText} onChange={e => setEditReplyText(e.target.value)} rows={4} className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400 resize-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleSaveEditReply} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold">Salvar</button>
                        <button onClick={() => setEditReplyId(null)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-bold">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(item.keywords || []).map((kw: string, i: number) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-300">{kw}</span>
                          ))}
                        </div>
                        <p className="text-sm text-white/80 line-clamp-2">{item.responseText}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setEditReplyId(item.id); setEditReplyKeywords((item.keywords || []).join("\n")); setEditReplyText(item.responseText || ""); }} className="p-2 rounded-lg bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteReplyMut.mutate({ id: item.id })} className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ABA: CONVERSAS ══════════════════════════════════════════════════ */}
        {tab === "conversas" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[600px]">
            {/* Lista de conversas */}
            <div className="md:col-span-1 overflow-y-auto space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-white">Conversas</h2>
                <button onClick={() => conversationsQ.refetch()} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {(conversationsQ.data || []).length === 0 && (
                <p className="text-white/30 text-xs text-center py-6">Nenhuma conversa ainda</p>
              )}
              {(conversationsQ.data || []).map((conv: any) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${selectedConvId === conv.id ? "bg-blue-600/20 border-blue-500/40" : "bg-white/5 border-white/10 hover:bg-white/10"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm text-white truncate">{conv.visitorName || "Visitante"}</p>
                    {conv.unreadForAdmin > 0 && (
                      <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{conv.unreadForAdmin}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50 truncate mt-0.5">{conv.previewText || "Sem mensagens"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      conv.status === "in_service" ? "bg-green-500/20 text-green-300" :
                      conv.status === "waiting_agent" ? "bg-orange-500/20 text-orange-300" :
                      conv.status === "new" ? "bg-blue-500/20 text-blue-300" :
                      "bg-white/10 text-white/40"
                    }`}>{conv.status}</span>
                    {conv.visitorPhone && <span className="text-[10px] text-white/30">{conv.visitorPhone}</span>}
                  </div>
                </button>
              ))}
            </div>

            {/* Chat da conversa selecionada */}
            <div className="md:col-span-2 flex flex-col bg-white/[0.02] rounded-xl border border-white/10 overflow-hidden">
              {!selectedConvId ? (
                <div className="flex-1 flex items-center justify-center text-white/30">
                  <div className="text-center">
                    <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Selecione uma conversa</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                    {(() => {
                      const conv = (conversationsQ.data || []).find((c: any) => c.id === selectedConvId);
                      return (
                        <div>
                          <p className="font-bold text-sm text-white">{conv?.visitorName || "Visitante"}</p>
                          <p className="text-[11px] text-white/40">{conv?.visitorPhone} • #{selectedConvId}</p>
                        </div>
                      );
                    })()}
                    <div className="flex gap-2">
                      <button onClick={() => updateConvMut.mutate({ conversationId: selectedConvId, status: "in_service" })} className="text-[11px] px-2 py-1 rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors">Em atendimento</button>
                      <button onClick={() => updateConvMut.mutate({ conversationId: selectedConvId, status: "finalized" })} className="text-[11px] px-2 py-1 rounded-lg bg-white/10 text-white/50 hover:bg-white/15 transition-colors">Finalizar</button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {(messagesQ.data || []).map((msg: any) => {
                      const own = msg.senderType === "agent";
                      const isBot = msg.senderType === "bot" || msg.senderType === "system";
                      return (
                        <div key={msg.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${own ? "bg-blue-600 text-white rounded-br-sm" : isBot ? "bg-indigo-900/40 text-white/80 rounded-bl-sm border border-indigo-500/20" : "bg-white/10 text-white rounded-bl-sm border border-white/10"}`}>
                            {!own && <p className="text-[10px] font-bold mb-1 opacity-60">{msg.senderName || msg.senderType}</p>}
                            <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                            <p className="text-[10px] mt-1 opacity-50">{new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={msgEndRef} />
                  </div>
                  <div className="p-3 border-t border-white/10 flex-shrink-0 flex gap-2">
                    <input
                      value={reply}
                      onChange={e => setReply(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && reply.trim() && sendMut.mutate({ conversationId: selectedConvId, text: reply.trim() })}
                      placeholder="Responder como atendente..."
                      className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400"
                    />
                    <button
                      onClick={() => reply.trim() && sendMut.mutate({ conversationId: selectedConvId, text: reply.trim() })}
                      disabled={!reply.trim()}
                      className="h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ ABA: CONFIGURAÇÕES ══════════════════════════════════════════════ */}
        {tab === "config" && (
          <div className="max-w-lg space-y-5">
            <h2 className="text-lg font-bold text-white">Configurações do Chat</h2>
            <div className="space-y-4 p-4 bg-white/5 rounded-xl border border-white/10">
              <div>
                <label className="text-xs font-bold text-white/60 block mb-1">NOME DO BOTÃO (aparece no site)</label>
                <input value={cfgLabel} onChange={e => setCfgLabel(e.target.value)} className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-white/60 block mb-1">STATUS DO BOTÃO (texto abaixo do nome)</label>
                <input value={cfgStatusText} onChange={e => setCfgStatusText(e.target.value)} placeholder="Ex: Resposta automática 24h | Tire suas dúvidas" className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-400" />
                <p className="text-[11px] text-white/35 mt-1">Se vazio, mostra "online" ou "fora do horário" automaticamente</p>
              </div>
              <div>
                <label className="text-xs font-bold text-white/60 block mb-1">MENSAGEM DE BOAS-VINDAS</label>
                <textarea value={cfgWelcome} onChange={e => setCfgWelcome(e.target.value)} rows={2} className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-white/60 block mb-1">POSIÇÃO NA TELA INICIAL (ordem)</label>
                <select value={cfgSortOrder} onChange={e => setCfgSortOrder(Number(e.target.value))} className="w-full h-10 rounded-lg bg-black/30 border border-white/15 px-3 text-sm text-white focus:outline-none focus:border-blue-400">
                  <option value={1} className="bg-gray-900">1º lugar (primeiro botão)</option>
                  <option value={2} className="bg-gray-900">2º lugar (entre FAZER PEDIDO e ACOMPANHAR)</option>
                  <option value={3} className="bg-gray-900">3º lugar (depois de ACOMPANHAR)</option>
                  <option value={99} className="bg-gray-900">No final da lista</option>
                </select>
                <p className="text-[11px] text-white/35 mt-1">Define onde o botão azul aparece na tela inicial</p>
              </div>
              <div>
                <label className="text-xs font-bold text-white/60 block mb-1">COR DO BOTÃO</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={cfgColor} onChange={e => setCfgColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                  <span className="text-sm text-white/60">{cfgColor}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">Chat ativado</p>
                  <p className="text-xs text-white/40">Desativar oculta o botão do site</p>
                </div>
                <button
                  onClick={() => setCfgEnabled(!cfgEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${cfgEnabled ? "bg-blue-600" : "bg-white/20"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${cfgEnabled ? "left-7" : "left-1"}`} />
                </button>
              </div>
              <button
                onClick={() => configMut.mutate({ buttonLabel: cfgLabel, welcomeMessage: cfgWelcome, buttonColor: cfgColor, chatEnabled: cfgEnabled, customStatusText: cfgStatusText, buttonSortOrder: cfgSortOrder } as any)}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
