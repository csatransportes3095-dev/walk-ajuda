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

function getOrCreateVisitorId() {
  const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;

  const randomPart = Math.random().toString(36).slice(2, 10);
  const timestampPart = Date.now().toString(36);
  const visitorId = `v_${timestampPart}_${randomPart}`;
  localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
  return visitorId;
}

function getSavedVisitorName() {
  return localStorage.getItem(VISITOR_NAME_KEY) || "Visitante";
}

function saveVisitorName(name: string) {
  localStorage.setItem(VISITOR_NAME_KEY, name);
}

function getMessagePayload(payload: unknown): Record<string, any> | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, any>;
}

function renderMessageContent(message: any, handleAction: (actionType?: string, payload?: Record<string, any>) => void) {
  const payload = getMessagePayload(message.payload);

  return (
    <div className="space-y-2">
      {message.text && <p className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>}

      {payload?.media?.imageUrl && (
        <img src={payload.media.imageUrl} alt="Mídia" className="max-w-full rounded-lg border border-white/10" />
      )}

      {payload?.media?.videoUrl && (
        <video controls className="max-w-full rounded-lg border border-white/10">
          <source src={payload.media.videoUrl} />
        </video>
      )}

      {payload?.media?.audioUrl && (
        <audio controls className="w-full">
          <source src={payload.media.audioUrl} />
        </audio>
      )}

      {payload?.media?.documentUrl && (
        <a
          href={payload.media.documentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-xs px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-200 hover:bg-blue-600/30"
        >
          Abrir documento
        </a>
      )}

      {Array.isArray(payload?.buttons) && payload.buttons.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          {payload.buttons.map((btn: any, idx: number) => (
            <button
              key={`${btn.label || "btn"}-${idx}`}
              onClick={() => handleAction(btn.actionType, btn.actionPayload || {})}
              className="text-left text-xs font-bold px-3 py-2 rounded-lg bg-indigo-600/25 border border-indigo-500/40 text-indigo-100 hover:bg-indigo-600/35"
            >
              {btn.label || "Abrir"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OnlineSupportWidget({ isOpen, onClose, onMinimize, onBack, openMode = "modal" }: OnlineSupportWidgetProps) {
  const isMobile = useIsMobile();
  const [message, setMessage] = useState("");
  const [visitorName, setVisitorName] = useState(getSavedVisitorName());
  const [typing, setTyping] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [statusText, setStatusText] = useState<string>("Conectando...");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const visitorId = useMemo(() => getOrCreateVisitorId(), []);

  const publicStateQ = trpc.onlineSupport.publicState.useQuery(
    { pathname: window.location.pathname },
    { refetchInterval: 30000 },
  );

  const unreadQ = trpc.onlineSupport.unreadSummary.useQuery(
    { visitorId },
    { refetchInterval: 5000 },
  );

  const startConversationMut = trpc.onlineSupport.startConversation.useMutation({
    onSuccess: (res) => {
      setConversationId(res.id);
    },
  });

  const listMessagesQ = trpc.onlineSupport.listMessages.useQuery(
    { conversationId: conversationId || 0, visitorId, limit: 200 },
    {
      enabled: !!conversationId,
      refetchInterval: 2000,
    },
  );

  const sendVisitorMessageMut = trpc.onlineSupport.sendVisitorMessage.useMutation({
    onSuccess: async () => {
      setMessage("");
      await listMessagesQ.refetch();
      await unreadQ.refetch();
      setTyping(false);
    },
    onError: () => setTyping(false),
  });

  const markReadMut = trpc.onlineSupport.markVisitorRead.useMutation();

  const menuItems = publicStateQ.data?.menuItems || [];

  useEffect(() => {
    if (!publicStateQ.data) return;

    if (publicStateQ.data.onlineNow) {
      setStatusText("Online");
    } else {
      setStatusText("Fora do horario");
    }
  }, [publicStateQ.data]);

  useEffect(() => {
    if (isOpen && !conversationId) {
      startConversationMut.mutate({
        visitorId,
        visitorName,
        originPage: window.location.pathname,
        privacyConsent: true,
      });
    }
  }, [isOpen, conversationId, visitorId, visitorName]);

  useEffect(() => {
    if (isOpen && unreadQ.data?.openConversationId && !conversationId) {
      setConversationId(unreadQ.data.openConversationId);
    }
  }, [isOpen, unreadQ.data, conversationId]);

  useEffect(() => {
    if (!isOpen || !conversationId) return;
    markReadMut.mutate({ conversationId, visitorId });
  }, [isOpen, conversationId, visitorId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [listMessagesQ.data, typing]);

  const handleSend = () => {
    if (!message.trim() || !conversationId) return;

    if (visitorName.trim()) {
      saveVisitorName(visitorName.trim());
    }

    setTyping(true);
    sendVisitorMessageMut.mutate({
      visitorId,
      conversationId,
      visitorName: visitorName.trim() || "Visitante",
      originPage: window.location.pathname,
      text: message.trim(),
      dedupeKey: `${visitorId}:${Date.now()}:${message.trim().slice(0, 20)}`,
    });
  };

  const handleRestart = () => {
    setConversationId(null);
    setMessage("");
    unreadQ.refetch();
  };

  const handleMenuAction = (actionType?: string, actionPayload?: Record<string, any>) => {
    if (!actionType) return;

    if (actionType === "open_internal" && actionPayload?.path) {
      window.location.href = String(actionPayload.path);
      return;
    }

    if (actionType === "open_external" && actionPayload?.url) {
      window.open(String(actionPayload.url), "_blank");
      return;
    }

    if (actionType === "handoff_human") {
      setMessage("Quero falar com atendente humano");
      return;
    }

    if (actionType === "send_text") {
      const text = String(actionPayload?.text || "");
      if (text) {
        setMessage(text);
      }
      return;
    }
  };

  if (!isOpen) return null;

  const openModeResolved: OpenMode = isMobile ? "fullscreen" : openMode;

  const wrapperClass =
    openModeResolved === "fullscreen"
      ? "fixed inset-0 z-[120]"
      : openModeResolved === "sidebar"
        ? "fixed top-0 right-0 h-full w-full sm:w-[420px] z-[120]"
        : "fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4";

  const panelClass =
    openModeResolved === "fullscreen"
      ? "w-full h-full rounded-none"
      : openModeResolved === "sidebar"
        ? "w-full h-full rounded-none sm:rounded-l-2xl"
        : "w-full max-w-[560px] h-[86vh] max-h-[760px] rounded-2xl";

  return (
    <div className={wrapperClass}>
      {openModeResolved === "modal" && (
        <button
          aria-label="Fechar"
          onClick={onClose}
          className="absolute inset-0 bg-black/60"
        />
      )}

      <div className={`${panelClass} relative bg-[#0f172a] border border-white/10 shadow-2xl flex flex-col overflow-hidden`}>
        <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-blue-800 to-sky-700 text-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={onBack || onMinimize}
                className="p-1.5 rounded-lg hover:bg-white/15"
                title="Voltar"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <MessageCircle className="w-4 h-4" />
              <div className="min-w-0">
                <p className="font-black text-sm tracking-wide truncate">
                  {publicStateQ.data?.buttonLabel || "ATENDIMENTO ONLINE"}
                </p>
                <p className="text-[11px] text-blue-100/90 truncate">
                  {statusText} • {unreadQ.data?.unreadMessages || 0} nao lidas
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={handleRestart} className="p-1.5 rounded-lg hover:bg-white/15" title="Reiniciar atendimento">
                <RefreshCcw className="w-4 h-4" />
              </button>
              <button onClick={onMinimize} className="p-1.5 rounded-lg hover:bg-white/15" title="Minimizar">
                <Minimize2 className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15" title="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5">
          <label className="text-[11px] uppercase tracking-wider text-white/50">Seu nome (opcional)</label>
          <input
            value={visitorName}
            onChange={(e) => setVisitorName(e.target.value)}
            placeholder="Como podemos te chamar?"
            className="mt-1 w-full h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-blue-400/60"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!conversationId && (
            <p className="text-xs text-white/60">Iniciando conversa...</p>
          )}

          {listMessagesQ.data?.length === 0 && menuItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white/90">
                {publicStateQ.data?.welcomeMessage || "Ola! Seja bem-vindo a Walk Ajuda. Como podemos ajudar?"}
              </p>
              <div className="grid grid-cols-1 gap-2">
                {menuItems.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => handleMenuAction(item.actionType, item.actionPayload || {})}
                    className="text-left p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"
                  >
                    <p className="font-bold text-sm text-white">{item.title}</p>
                    {item.description && <p className="text-xs text-white/60 mt-1">{item.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(listMessagesQ.data || []).map((msg: any) => {
            const own = msg.senderType === "visitor";
            return (
              <div key={msg.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    own
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : "bg-white/10 text-white rounded-bl-sm border border-white/10"
                  }`}
                >
                  {renderMessageContent(msg, handleMenuAction)}
                  <p className="text-[10px] mt-1 opacity-70">
                    {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}

          {typing && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3 py-2 text-xs bg-white/10 text-white/80 border border-white/10">
                Assistente esta digitando...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 border-t border-white/10 bg-[#0b1222]">
          {publicStateQ.data?.maintenanceMode || publicStateQ.data?.chatEnabled === false ? (
            <p className="text-xs text-amber-300">{publicStateQ.data?.disabledMessage || "Atendimento indisponivel no momento."}</p>
          ) : (
            <div className="flex gap-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Digite sua mensagem"
                className="flex-1 h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-blue-400/70"
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || sendVisitorMessageMut.isPending}
                className="h-10 px-3 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50 hover:bg-blue-500"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
