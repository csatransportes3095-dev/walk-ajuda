import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Minimize2, RefreshCcw, Send, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";

type OpenMode = "modal" | "sidebar" | "fullscreen";

interface OnlineSupportWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onBack?: () => void;
  openMode?: OpenMode;
}

const VISITOR_STORAGE_KEY = "walk_online_support_visitor_id";
const VISITOR_NAME_KEY = "walk_online_support_visitor_name";
const VISITOR_PHONE_KEY = "walk_online_support_visitor_phone";

function getOrCreateVisitorId() {
  const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timestampPart = Date.now().toString(36);
  const visitorId = `v_${timestampPart}_${randomPart}`;
  localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
  return visitorId;
}
function getVisitorIdForPhone(phone: string): string {
  // Gera um visitorId estÃ¡vel baseado no nÃºmero de telefone
  // Assim o mesmo nÃºmero sempre tem o mesmo visitorId e a mesma conversa
  return `v_phone_${phone.replace(/\D/g, "")}`;
}

function getSavedVisitorName() { return localStorage.getItem(VISITOR_NAME_KEY) || ""; }
function getSavedVisitorPhone() { return localStorage.getItem(VISITOR_PHONE_KEY) || ""; }
function saveVisitorData(name: string, phone: string) {
  localStorage.setItem(VISITOR_NAME_KEY, name);
  localStorage.setItem(VISITOR_PHONE_KEY, phone);
}

function getMessagePayload(msg: any): Record<string, any> | null {
  // Tentar payload já deserializado primeiro
  if (msg.payload && typeof msg.payload === "object") return msg.payload as Record<string, any>;
  // Fallback: tentar deserializar payloadJson (string raw do banco)
  if (msg.payloadJson && typeof msg.payloadJson === "string") {
    try { return JSON.parse(msg.payloadJson); } catch { return null; }
  }
  return null;
}

function toRenderableUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  return null;
}

function getMediaField(payload: Record<string, any> | null, field: string): string | null {
  const candidates = [
    payload?.media?.[field],
    payload?.media?.url,
    payload?.media?.src,
    payload?.media?.fileUrl,
    payload?.[field],
    payload?.url,
    payload?.src,
    payload?.fileUrl,
  ];

  for (const candidate of candidates) {
    const url = toRenderableUrl(candidate);
    if (url) return url;
  }

  return null;
}

function MediaImage({ src }: { src: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    setFailed(false);

    const image = new window.Image();
    image.onload = () => {
      if (active) setReady(true);
    };
    image.onerror = () => {
      if (active) setFailed(true);
    };
    image.src = src;

    return () => {
      active = false;
    };
  }, [src]);

  if (failed) return null;
  if (!ready) return null;

  return <img src={src} alt="" aria-hidden className="max-w-full rounded-lg border border-white/10" />;
}

function renderMessageContent(message: any, handleAction: (actionType?: string, payload?: Record<string, any>) => void) {
  const payload = getMessagePayload(message);
  const imageUrl = getMediaField(payload, "imageUrl");
  const videoUrl = getMediaField(payload, "videoUrl");
  const audioUrl = getMediaField(payload, "audioUrl");
  const documentUrl = getMediaField(payload, "documentUrl");
  const linkUrl = getMediaField(payload, "linkUrl");
  return (
    <div className="space-y-2">
      {message.text && <p className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>}
      {imageUrl && <MediaImage src={imageUrl} />}
      {videoUrl && <video controls className="max-w-full rounded-lg border border-white/10"><source src={videoUrl} /></video>}
      {audioUrl && <audio controls className="w-full"><source src={audioUrl} /></audio>}
      {documentUrl && (
        <a href={documentUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-200 hover:bg-blue-600/30">Abrir documento</a>
      )}
      {!imageUrl && linkUrl && (
        <a href={linkUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-200 hover:bg-blue-600/30">Abrir mÃ­dia</a>
      )}
      {Array.isArray(payload?.buttons) && payload.buttons.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {payload.buttons.map((btn: any, idx: number) => (
            <button key={`${btn.label || "btn"}-${idx}`} onClick={() => handleAction(btn.actionType, { ...(btn.actionPayload || {}), label: btn.label })} className="text-left text-xs font-bold px-3 py-2 rounded-lg bg-indigo-600/25 border border-indigo-500/40 text-indigo-100 hover:bg-indigo-600/35">{btn.label || "Abrir"}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OnlineSupportWidget({ isOpen, onClose, onMinimize, onBack, openMode = "modal" }: OnlineSupportWidgetProps) {
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<"identify" | "chat">("identify");
  const [visitorName, setVisitorName] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [message, setMessage] = useState("");
  const [typing, setTyping] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [statusText, setStatusText] = useState<string>("Conectando...");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // visitorId baseado no telefone: mesmo nÃºmero = mesma conversa em qualquer dispositivo
  const [visitorId, setVisitorId] = useState<string>(() => {
    const savedPhone = getSavedVisitorPhone();
    if (savedPhone) return getVisitorIdForPhone(savedPhone);
    return getOrCreateVisitorId();
  });

  const publicStateQ = trpc.onlineSupport.publicState.useQuery({ pathname: window.location.pathname }, { refetchInterval: 30000 });
  const unreadQ = trpc.onlineSupport.unreadSummary.useQuery({ visitorId }, { refetchInterval: 5000 });
  const startConversationMut = trpc.onlineSupport.startConversation.useMutation({ onSuccess: (res) => setConversationId(res.id) });
  const listMessagesQ = trpc.onlineSupport.listMessages.useQuery(
    { conversationId: conversationId || 0, visitorId, limit: 200 },
    { enabled: !!conversationId, refetchInterval: 2000 }
  );
  const sendVisitorMessageMut = trpc.onlineSupport.sendVisitorMessage.useMutation({
    onSuccess: async () => { setMessage(""); await listMessagesQ.refetch(); await unreadQ.refetch(); setTyping(false); },
    onError: () => setTyping(false),
  });
  const markReadMut = trpc.onlineSupport.markVisitorRead.useMutation();
  const menuItems = publicStateQ.data?.menuItems || [];

  useEffect(() => {
    if (!publicStateQ.data) return;
    setStatusText(publicStateQ.data.onlineNow ? "Online" : "Fora do horÃ¡rio");
  }, [publicStateQ.data]);

  useEffect(() => {
    if (phase === "chat" && isOpen && !conversationId) {
      startConversationMut.mutate({ visitorId, visitorName, visitorPhone, originPage: window.location.pathname, privacyConsent: true });
    }
  }, [phase, isOpen, conversationId]);

  useEffect(() => {
    if (!isOpen) return;
    const status = (unreadQ.data as any)?.conversationStatus;
    // Se conversa foi finalizada pelo admin, limpar e voltar para identificaÃ§Ã£o
    if (status === "finalized" || status === "blocked") {
      if (conversationId) {
        setConversationId(null);
        setPhase("identify");
      }
      return;
    }
    if (unreadQ.data?.openConversationId && !conversationId) setConversationId(unreadQ.data.openConversationId);
  }, [isOpen, unreadQ.data, conversationId]);

  useEffect(() => {
    if (!isOpen || !conversationId) return;
    markReadMut.mutate({ conversationId, visitorId });
  }, [isOpen, conversationId, visitorId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [listMessagesQ.data, typing]);

  const handleIdentifySubmit = () => {
    let hasError = false;
    if (!visitorName.trim()) { setNameError("Nome Ã© obrigatÃ³rio"); hasError = true; } else setNameError("");
    const phoneClean = visitorPhone.replace(/\D/g, "");
    if (!phoneClean || phoneClean.length < 10) { setPhoneError("Telefone invÃ¡lido (mÃ­nimo 10 dÃ­gitos)"); hasError = true; } else setPhoneError("");
    if (hasError) return;
    saveVisitorData(visitorName.trim(), phoneClean);
    setVisitorPhone(phoneClean);
    // Gerar visitorId baseado no telefone â€” garante que mesmo nÃºmero = mesma conversa
    const newVisitorId = getVisitorIdForPhone(phoneClean);
    setVisitorId(newVisitorId);
    setConversationId(null); // Limpar conversa anterior para buscar a do novo nÃºmero
    setPhase("chat");
  };

  const handleSend = () => {
    if (!message.trim() || !conversationId) return;
    setTyping(true);
    sendVisitorMessageMut.mutate({ conversationId, visitorId, text: message.trim() });
  };

  // Clique num botÃ£o do menu principal (com responseText e subButtons da Ã¡rvore)
  const handleMenuItemClick = (item: any) => {
    if (!conversationId) return;
    const label = item.title || item.label || "";
    // Enviar o texto do botÃ£o como mensagem do visitante
    sendVisitorMessageMut.mutate({ conversationId, visitorId, text: label });
    // Se o item tem responseText ou subButtons, enviar como resposta do bot
    if (item.responseText || (item.subButtons && item.subButtons.length > 0)) {
      setTimeout(() => {
        // Criar mensagem bot com responseText + subButtons
        const payload: Record<string, any> = {};
        if (item.subButtons && item.subButtons.length > 0) {
          payload.buttons = item.subButtons.map((b: any) => ({
            label: b.label,
            actionType: b.actionType,
            actionPayload: b.actionPayload || {},
          }));
        }
        // Enviar via sendVisitorMessage com texto especial que o bot vai interceptar
        // Na verdade, vamos usar handleMenuAction para aÃ§Ãµes diretas
      }, 300);
    }
  };

  const handleMenuAction = (actionType?: string, actionPayload?: Record<string, any>) => {
    if (!actionType) return;
    // NÃ³ do fluxo de botÃµes (Ã¡rvore recursiva)
    if (actionType === "flow_node" && actionPayload?.nodeId && conversationId) {
      const nodeActionType = String(actionPayload.nodeActionType || "show_children");
      const nodeActionPayload = (actionPayload.nodeActionPayload || {}) as Record<string, any>;
      // AÃ§Ãµes diretas: executar imediatamente
      if (nodeActionType === "open_internal" && nodeActionPayload?.path) { window.location.href = String(nodeActionPayload.path); return; }
      if (nodeActionType === "open_external" && nodeActionPayload?.url) { window.open(String(nodeActionPayload.url), "_blank"); return; }
      if (nodeActionType === "open_video" && nodeActionPayload?.url) { window.open(String(nodeActionPayload.url), "_blank"); return; }
      if (nodeActionType === "open_whatsapp" && nodeActionPayload?.phone) { const txt = nodeActionPayload.text ? "?text=" + encodeURIComponent(String(nodeActionPayload.text)) : ""; window.open("https://wa.me/" + String(nodeActionPayload.phone) + txt, "_blank"); return; }
      if (nodeActionType === "handoff_human") { sendVisitorMessageMut.mutate({ conversationId, visitorId, text: "Quero falar com um atendente humano." }); return; }
      // show_children ou send_text: enviar label como mensagem para o bot processar
      const label = String(actionPayload.label || "");
      if (label) sendVisitorMessageMut.mutate({ conversationId, visitorId, text: label });
      return;
    }
    if (actionType === "open_internal" && actionPayload?.path) { window.location.href = String(actionPayload.path); return; }
    if (actionType === "open_external" && actionPayload?.url) { window.open(String(actionPayload.url), "_blank"); return; }
    if (actionType === "open_video" && actionPayload?.url) { window.open(String(actionPayload.url), "_blank"); return; }
    if (actionType === "open_whatsapp" && actionPayload?.phone) { const txt = actionPayload.text ? "?text=" + encodeURIComponent(String(actionPayload.text)) : ""; window.open("https://wa.me/" + String(actionPayload.phone) + txt, "_blank"); return; }
    if (actionType === "handoff_human" && conversationId) { sendVisitorMessageMut.mutate({ conversationId, visitorId, text: "Quero falar com um atendente humano." }); return; }
    if (actionType === "send_text" && actionPayload?.text && conversationId) { sendVisitorMessageMut.mutate({ conversationId, visitorId, text: String(actionPayload.text) }); return; }
  };

  const handleRestart = () => {
    setConversationId(null);
    setPhase("identify");
    setVisitorName("");
    setVisitorPhone("");
    localStorage.removeItem(VISITOR_NAME_KEY);
    localStorage.removeItem(VISITOR_PHONE_KEY);
  };

  const handleBack = () => {
    if (phase === "chat") { setPhase("identify"); }
    else { if (onBack) onBack(); else onMinimize(); }
  };

  if (!isOpen) return null;

  const openModeResolved: OpenMode = isMobile ? "fullscreen" : openMode;
  const panelClass = openModeResolved === "fullscreen" ? "fixed inset-0 z-[9999] flex flex-col"
    : openModeResolved === "sidebar" ? "fixed top-0 right-0 h-full w-[380px] z-[9999] flex flex-col"
    : "w-full max-w-[420px] h-[580px] rounded-2xl flex flex-col";

  return (
    <div
      className={openModeResolved === "modal" ? "fixed inset-0 z-[9998] flex items-end justify-center sm:items-center p-4 bg-black/40 backdrop-blur-sm" : "fixed inset-0 z-[9998] pointer-events-none"}
      onClick={openModeResolved === "modal" ? (e) => { if (e.target === e.currentTarget) onMinimize(); } : undefined}
    >
      <div className={`${panelClass} relative bg-[#0f172a] border border-white/10 shadow-2xl overflow-hidden pointer-events-auto`}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-blue-800 to-sky-700 text-white flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors" title={phase === "chat" ? "Voltar ao menu" : "Fechar"}>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <MessageCircle className="w-4 h-4 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-black text-sm tracking-wide truncate">{publicStateQ.data?.buttonLabel || "ATENDIMENTO ONLINE"}</p>
                <p className="text-[11px] text-blue-100/90 truncate">{statusText} â€¢ {unreadQ.data?.unreadMessages || 0} nÃ£o lidas</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {phase === "chat" && (
                <button onClick={handleRestart} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors" title="Novo atendimento"><RefreshCcw className="w-4 h-4" /></button>
              )}
              <button onClick={onMinimize} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors" title="Minimizar"><Minimize2 className="w-4 h-4" /></button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors" title="Fechar"><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* FASE 1: IdentificaÃ§Ã£o */}
        {phase === "identify" && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
            <div>
              <p className="text-base font-bold text-white">{(() => { const h = new Date().getHours(); const g = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite"; return g + "! ðŸ‘‹ " + (publicStateQ.data?.welcomeMessage || "Bem-vindo ao atendimento H2 COLOMBIANO."); })()}</p>
              <p className="text-xs text-white/60 mt-1">Para iniciar, preencha seus dados abaixo.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-white/70 block mb-1">Seu nome completo <span className="text-red-400">*</span></label>
                <input value={visitorName} onChange={(e) => { setVisitorName(e.target.value); setNameError(""); }} onKeyDown={(e) => e.key === "Enter" && handleIdentifySubmit()} placeholder="Ex: JoÃ£o da Silva" className={`w-full h-10 rounded-lg bg-white/5 border px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 ${nameError ? "border-red-400" : "border-white/10"}`} />
                {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-white/70 block mb-1">Seu telefone (WhatsApp) <span className="text-red-400">*</span></label>
                <input value={visitorPhone} onChange={(e) => { setVisitorPhone(e.target.value.replace(/\D/g, "")); setPhoneError(""); }} onKeyDown={(e) => e.key === "Enter" && handleIdentifySubmit()} placeholder="Ex: 11940239867" maxLength={15} className={`w-full h-10 rounded-lg bg-white/5 border px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 ${phoneError ? "border-red-400" : "border-white/10"}`} />
                {phoneError && <p className="text-xs text-red-400 mt-1">{phoneError}</p>}
              </div>
            </div>
            <button onClick={handleIdentifySubmit} className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-colors mt-auto">Iniciar atendimento â†’</button>
          </div>
        )}

        {/* FASE 2: Chat */}
        {phase === "chat" && (
          <>
            <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex-shrink-0">
              <p className="text-xs text-white/50">Atendendo: <span className="text-white/80 font-semibold">{visitorName}</span>{visitorPhone && <span className="ml-2 text-white/40">â€¢ {visitorPhone}</span>}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!conversationId && <p className="text-xs text-white/60 text-center">Iniciando conversa...</p>}

              {(listMessagesQ.data || []).map((msg: any) => {
                const own = msg.senderType === "visitor";
                return (
                  <div key={msg.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${own ? "bg-blue-600 text-white rounded-br-sm" : "bg-white/10 text-white rounded-bl-sm border border-white/10"}`}>
                      {renderMessageContent(msg, handleMenuAction)}
                      <p className="text-[10px] mt-1 opacity-70">{new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                );
              })}
              {typing && <div className="flex justify-start"><div className="rounded-2xl px-3 py-2 text-xs bg-white/10 text-white/80 border border-white/10">Assistente estÃ¡ digitando...</div></div>}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t border-white/10 bg-[#0b1222] flex-shrink-0">
              {publicStateQ.data?.maintenanceMode || publicStateQ.data?.chatEnabled === false ? (
                <p className="text-xs text-amber-300">{publicStateQ.data?.disabledMessage || "Atendimento indisponÃ­vel no momento."}</p>
              ) : (
                <div className="flex gap-2">
                  <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Digite sua mensagem" className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-blue-400/70" />
                  <button onClick={handleSend} disabled={!message.trim() || sendVisitorMessageMut.isPending} className="h-10 px-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50 hover:bg-blue-500 transition-colors"><Send className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
