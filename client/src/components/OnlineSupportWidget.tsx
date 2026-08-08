import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, RefreshCcw, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Tipos ───────────────────────────────────────────────────────────────────
type OpenMode = "modal" | "sidebar" | "fullscreen";
interface OnlineSupportWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onBack?: () => void;
  openMode?: OpenMode;
}

// ─── Storage ─────────────────────────────────────────────────────────────────
const VISITOR_STORAGE_KEY = "walk_online_support_visitor_id";
const VISITOR_NAME_KEY = "walk_online_support_visitor_name";
const VISITOR_PHONE_KEY = "walk_online_support_visitor_phone";
const VISITOR_SESSION_KEY = "walk_online_support_session_ts";
const SESSION_TTL_MS = 30 * 60 * 1000;

function isSessionValid() {
  const ts = localStorage.getItem(VISITOR_SESSION_KEY);
  if (!ts) return false;
  return Date.now() - Number(ts) < SESSION_TTL_MS;
}
function touchSession() { localStorage.setItem(VISITOR_SESSION_KEY, String(Date.now())); }
function clearSession() {
  localStorage.removeItem(VISITOR_NAME_KEY);
  localStorage.removeItem(VISITOR_PHONE_KEY);
  localStorage.removeItem(VISITOR_SESSION_KEY);
}
function getOrCreateVisitorId() {
  const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;
  const id = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(VISITOR_STORAGE_KEY, id);
  return id;
}
function getVisitorIdForPhone(phone: string) { return `v_phone_${phone.replace(/\D/g, "")}`; }
function getSavedName() { return localStorage.getItem(VISITOR_NAME_KEY) || ""; }
function getSavedPhone() { return localStorage.getItem(VISITOR_PHONE_KEY) || ""; }
function saveVisitorData(name: string, phone: string) {
  localStorage.setItem(VISITOR_NAME_KEY, name);
  localStorage.setItem(VISITOR_PHONE_KEY, phone);
  touchSession();
}

// ─── Tipos de mensagem ────────────────────────────────────────────────────────
type Msg =
  | { type: "bot"; text: string; buttons?: { label: string; actionType?: string; actionPayload?: any }[] }
  | { type: "user"; text: string }
  | { type: "identify" }
  | { type: "typing" };

// ─── Componente principal ─────────────────────────────────────────────────────
export function OnlineSupportWidget({ isOpen, onClose, onMinimize, onBack, openMode = "modal" }: OnlineSupportWidgetProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<"identify" | "chat">(() =>
    isSessionValid() && getSavedName() && getSavedPhone() ? "chat" : "identify"
  );
  const [visitorName, setVisitorName] = useState(() => isSessionValid() ? getSavedName() : "");
  const [visitorPhone, setVisitorPhone] = useState(() => isSessionValid() ? getSavedPhone() : "");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [visitorId, setVisitorId] = useState<string>(() => {
    const savedPhone = getSavedPhone();
    if (savedPhone) return getVisitorIdForPhone(savedPhone);
    return getOrCreateVisitorId();
  });
  const [inputText, setInputText] = useState("");
  const [showInput, setShowInput] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  const publicStateQ = trpc.onlineSupport.publicState.useQuery(
    { pathname: window.location.pathname },
    { refetchInterval: 30000 }
  );
  const unreadQ = trpc.onlineSupport.unreadSummary.useQuery(
    { visitorId },
    { refetchInterval: 5000, enabled: !!conversationId }
  );
  const listMessagesQ = trpc.onlineSupport.listMessages.useQuery(
    { conversationId: conversationId || 0, visitorId, limit: 200 },
    { enabled: !!conversationId, refetchInterval: 2000 }
  );
  const startConversationMut = trpc.onlineSupport.startConversation.useMutation({
    onSuccess: (res) => {
      setConversationId(res.id);
      // Enviar "olá" para disparar boas-vindas do bot
      setTimeout(() => {
        sendMut.mutate({ conversationId: res.id, visitorId, visitorName, visitorPhone, text: "olá" });
      }, 400);
    }
  });
  const sendMut = trpc.onlineSupport.sendVisitorMessage.useMutation({
    onSuccess: async () => { await listMessagesQ.refetch(); }
  });
  const markReadMut = trpc.onlineSupport.markVisitorRead.useMutation();

  // Sincronizar mensagens do backend para o estado local
  useEffect(() => {
    if (!listMessagesQ.data || !conversationId) return;
    const msgs: Msg[] = (listMessagesQ.data as any[]).map((m: any) => {
      if (m.senderType === "visitor") return { type: "user" as const, text: m.text || "" };
      // Mensagem do bot — extrair texto e botões
      let payload: any = null;
      if (m.payload && typeof m.payload === "object") payload = m.payload;
      else if (m.payloadJson) { try { payload = JSON.parse(m.payloadJson); } catch {} }
      const buttons = Array.isArray(payload?.buttons) ? payload.buttons : [];
      return { type: "bot" as const, text: m.text || "", buttons };
    });
    setMessages(msgs);
  }, [listMessagesQ.data, conversationId]);

  // Scroll automático
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Iniciar conversa quando entra no chat
  useEffect(() => {
    if (phase !== "chat" || !isOpen || conversationId || initialized.current) return;
    initialized.current = true;
    startConversationMut.mutate({
      visitorId, visitorName, visitorPhone,
      originPage: window.location.pathname,
      privacyConsent: true
    });
  }, [phase, isOpen]);

  // Marcar como lido
  useEffect(() => {
    if (!isOpen || !conversationId) return;
    markReadMut.mutate({ conversationId, visitorId });
  }, [isOpen, conversationId]);

  // Detectar conversa existente
  useEffect(() => {
    if (!isOpen) return;
    const status = (unreadQ.data as any)?.conversationStatus;
    if (status === "finalized" || status === "blocked") {
      setConversationId(null);
      setPhase("identify");
      initialized.current = false;
      return;
    }
    if (unreadQ.data?.openConversationId && !conversationId) {
      setConversationId(unreadQ.data.openConversationId);
    }
  }, [isOpen, unreadQ.data, conversationId]);

  const handleIdentifySubmit = () => {
    let hasError = false;
    if (!visitorName.trim()) { setNameError("Nome é obrigatório"); hasError = true; } else setNameError("");
    const phoneClean = visitorPhone.replace(/\D/g, "");
    if (!phoneClean || phoneClean.length < 10) { setPhoneError("Telefone inválido"); hasError = true; } else setPhoneError("");
    if (hasError) return;
    saveVisitorData(visitorName.trim(), phoneClean);
    setVisitorPhone(phoneClean);
    const newId = getVisitorIdForPhone(phoneClean);
    setVisitorId(newId);
    setConversationId(null);
    initialized.current = false;
    setPhase("chat");
  };

  const handleButtonClick = (btn: { label: string; actionType?: string; actionPayload?: any }) => {
    if (!conversationId) return;
    const { actionType, actionPayload, label } = btn;
    // Ações diretas — não enviam mensagem ao bot
    if (actionType === "open_internal" && actionPayload?.path) { window.location.href = String(actionPayload.path); return; }
    if (actionType === "open_external" && actionPayload?.url) { window.open(String(actionPayload.url), "_blank"); return; }
    if (actionType === "open_video" && actionPayload?.url) { window.open(String(actionPayload.url), "_blank"); return; }
    if (actionType === "open_whatsapp" && actionPayload?.phone) {
      const txt = actionPayload.text ? "?text=" + encodeURIComponent(String(actionPayload.text)) : "";
      window.open("https://wa.me/" + String(actionPayload.phone) + txt, "_blank");
      return;
    }
    // menu_item com ID — enviar como __menuitem__:ID para o bot processar diretamente
    if (actionType === "menu_item" && actionPayload?.menuItemId) {
      touchSession();
      sendMut.mutate({ conversationId, visitorId, text: `__menuitem__:${actionPayload.menuItemId}:${label}` });
      return;
    }
    // Enviar label como mensagem para o bot processar
    touchSession();
    sendMut.mutate({ conversationId, visitorId, text: label });
  };

  const handleSendText = () => {
    if (!inputText.trim() || !conversationId) return;
    touchSession();
    sendMut.mutate({ conversationId, visitorId, text: inputText.trim() });
    setInputText("");
    setShowInput(false);
  };

  const handleRestart = () => {
    setConversationId(null);
    setMessages([]);
    setPhase("identify");
    setVisitorName("");
    setVisitorPhone("");
    initialized.current = false;
    clearSession();
  };

  if (!isOpen) return null;

  const isMobile = window.innerWidth < 640;
  const isFullscreen = isMobile || openMode === "fullscreen";
  const panelStyle: React.CSSProperties = isFullscreen
    ? { position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", height: "100dvh" }
    : { position: "fixed", bottom: 80, right: 16, width: 380, height: 580, zIndex: 9999, borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden" };

  const botName = publicStateQ.data?.buttonLabel || "Atendimento Online";
  const botAvatar = (publicStateQ.data as any)?.botAvatar || null;
  const isTyping = sendMut.isPending || startConversationMut.isPending;

  return (
    <div
      style={isFullscreen ? {} : { position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16 }}
      onClick={!isFullscreen ? (e) => { if (e.target === e.currentTarget) onMinimize(); } : undefined}
    >
      <div style={{ ...panelStyle, background: "#09090b", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg,#1e1b4b,#0f172a)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={phase === "chat" ? () => setPhase("identify") : (onBack || onMinimize)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: 4, borderRadius: 8 }}>
            <ArrowLeft size={18} />
          </button>
          {botAvatar ? (
            <img src={botAvatar} alt={botName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bot size={18} color="#fff" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#fff", letterSpacing: 0.3 }}>{botName}</div>
            <div style={{ fontSize: 11, color: "#4ade80", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              Online agora
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {phase === "chat" && (
              <button onClick={handleRestart} title="Recomeçar" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 4, borderRadius: 8 }}>
                <RefreshCcw size={16} />
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 4, borderRadius: 8 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* FASE 1: Identificação */}
        {phase === "identify" && (
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", background: "linear-gradient(160deg,#09090b,#1e1b4b 50%,#09090b)" }}>
            {/* Avatar e boas-vindas */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 24px 20px", textAlign: "center" }}>
              {botAvatar ? (
                <img src={botAvatar} alt={botName} style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", marginBottom: 12, border: "3px solid rgba(124,58,237,0.5)" }} />
              ) : (
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                  <Bot size={36} color="#fff" />
                </div>
              )}
              <h2 style={{ fontWeight: 900, fontSize: 20, color: "#fff", margin: "0 0 6px", letterSpacing: -0.5 }}>{botName}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#4ade80" }}>Online agora — atendimento 24h</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5, maxWidth: 280 }}>
                {publicStateQ.data?.welcomeMessage || "Olá! Como posso te ajudar hoje?"}
              </p>
            </div>

            {/* Formulário */}
            <div style={{ padding: "0 20px 32px", marginTop: "auto" }}>
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: "#fff", margin: 0 }}>Para começar, informe seus dados:</p>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>Nome completo <span style={{ color: "#f87171" }}>*</span></label>
                  <input
                    value={visitorName}
                    onChange={e => { setVisitorName(e.target.value); setNameError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleIdentifySubmit()}
                    placeholder="Ex: João da Silva"
                    style={{ width: "100%", height: 44, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: `1px solid ${nameError ? "#f87171" : "rgba(255,255,255,0.1)"}`, padding: "0 12px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  />
                  {nameError && <p style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>{nameError}</p>}
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>Telefone (WhatsApp) <span style={{ color: "#f87171" }}>*</span></label>
                  <input
                    value={visitorPhone}
                    onChange={e => { setVisitorPhone(e.target.value.replace(/\D/g, "")); setPhoneError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleIdentifySubmit()}
                    placeholder="Ex: 11940239867"
                    maxLength={15}
                    style={{ width: "100%", height: 44, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: `1px solid ${phoneError ? "#f87171" : "rgba(255,255,255,0.1)"}`, padding: "0 12px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  />
                  {phoneError && <p style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>{phoneError}</p>}
                </div>
                <button
                  onClick={handleIdentifySubmit}
                  style={{ width: "100%", height: 48, borderRadius: 14, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", border: "none", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 20px rgba(124,58,237,0.4)" }}
                >
                  Iniciar atendimento →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FASE 2: Chat com botões */}
        {phase === "chat" && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {!conversationId && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  <div style={{ width: 24, height: 24, border: "2px solid #7c3aed", borderTopColor: "transparent", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
                  Iniciando atendimento...
                </div>
              )}

              {messages.map((msg, idx) => {
                if (msg.type === "user") {
                  return (
                    <div key={idx} style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{ background: "linear-gradient(135deg,#7c3aed,#3b82f6)", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", maxWidth: "80%", fontSize: 14, color: "#fff", fontWeight: 500 }}>
                        {msg.text}
                      </div>
                    </div>
                  );
                }
                if (msg.type === "bot") {
                  // Mostrar botões sempre que a mensagem tiver botões
                  return (
                    <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Avatar + texto */}
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        {botAvatar ? (
                          <img src={botAvatar} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0, marginTop: 2 }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                            <Bot size={14} color="#fff" />
                          </div>
                        )}
                        {msg.text && (
                          <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", maxWidth: "85%", fontSize: 14, color: "#fff", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                            {msg.text}
                          </div>
                        )}
                      </div>
                      {/* Botões — mostrar sempre que a mensagem tiver botões */}
                      {msg.buttons && msg.buttons.length > 0 && (
                        <div style={{ marginLeft: 36, display: "flex", flexDirection: "column", gap: 8 }}>
                          {msg.buttons.map((btn, bi) => (
                            <button
                              key={bi}
                              onClick={() => handleButtonClick(btn)}
                              disabled={sendMut.isPending}
                              style={{
                                background: "rgba(124,58,237,0.15)",
                                border: "1px solid rgba(124,58,237,0.4)",
                                borderRadius: 14,
                                padding: "12px 16px",
                                color: "#c4b5fd",
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.3)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(124,58,237,0.7)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,58,237,0.15)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(124,58,237,0.4)"; }}
                            >
                              <span>{btn.label}</span>
                              <span style={{ fontSize: 12, opacity: 0.5 }}>›</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })}

              {isTyping && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Bot size={14} color="#fff" />
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                    digitando...
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Rodapé */}
            <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0b0b0f", flexShrink: 0 }}>
              {showInput ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    autoFocus
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSendText()}
                    placeholder="Digite sua mensagem..."
                    style={{ flex: 1, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", padding: "0 12px", color: "#fff", fontSize: 14, outline: "none" }}
                  />
                  <button onClick={handleSendText} disabled={!inputText.trim()} style={{ height: 40, padding: "0 16px", borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#3b82f6)", border: "none", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Enviar
                  </button>
                  <button onClick={() => setShowInput(false)} style={{ height: 40, width: 40, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button
                    onClick={() => setShowInput(true)}
                    style={{ flex: 1, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer" }}
                  >
                    ✏️ Digitar mensagem
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
