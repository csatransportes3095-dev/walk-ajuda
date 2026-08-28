import { useState } from "react";
import { ArrowLeft, BarChart3, Bot, ClipboardList, WalletCards, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { OnlineEntryPanel } from "@/components/OnlineEntryPanel";
import { OnlineRegistrationPanel } from "@/components/OnlineRegistrationPanel";

type OpenMode = "modal" | "sidebar" | "fullscreen";
type ProtectedRoute = "gastos" | "emprestimo";

interface OnlineSupportWidgetProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onBack?: () => void;
  openMode?: OpenMode;
}

const VISITOR_ID_KEY = "walk_online_entry_visitor_id";
function getEntryVisitorId() {
  const existing = localStorage.getItem(VISITOR_ID_KEY);
  if (existing) return existing;
  const visitorId = `entry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  localStorage.setItem(VISITOR_ID_KEY, visitorId);
  return visitorId;
}

export function OnlineSupportWidget({ isOpen, onClose, onMinimize, onBack, openMode = "modal" }: OnlineSupportWidgetProps) {
  const [phase, setPhase] = useState<"home" | "entry" | "register">("home");
  const [intendedRoute, setIntendedRoute] = useState<ProtectedRoute | null>(null);
  const [visitorId] = useState(getEntryVisitorId);
  // Identificador técnico apenas do rascunho do novo cadastro: não cria conversa antiga.
  const [registrationDraftId] = useState(() => Math.floor(Date.now() / 1000));
  const publicStateQ = trpc.onlineSupport.publicState.useQuery({ pathname: window.location.pathname }, { refetchInterval: 30000 });

  if (!isOpen) return null;
  const isMobile = window.innerWidth < 640;
  const isFullscreen = isMobile || openMode === "fullscreen";
  const panelStyle: React.CSSProperties = isFullscreen
    ? { position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", height: "100dvh" }
    : { position: "fixed", bottom: 80, right: 16, width: 380, maxWidth: "calc(100vw - 32px)", height: 580, zIndex: 9999, borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden" };
  const botName = publicStateQ.data?.buttonLabel || "Assistente H2";
  const botAvatar = (publicStateQ.data as any)?.botAvatar || null;
  const goHome = () => { setIntendedRoute(null); setPhase("home"); };
  const openRegistration = () => { setIntendedRoute(null); setPhase("register"); };
  const openProtectedRoute = (route: ProtectedRoute) => { setIntendedRoute(route); setPhase("entry"); };

  return <div
    style={isFullscreen ? {} : { position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16 }}
    onClick={!isFullscreen ? (event) => { if (event.target === event.currentTarget) onMinimize(); } : undefined}
  >
    <div style={{ ...panelStyle, background: "#09090b", border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 25px 60px rgba(0,0,0,.6)" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "linear-gradient(135deg,#1e1b4b,#0f172a)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={phase === "home" ? (onBack || onMinimize) : goHome} style={iconButton}><ArrowLeft size={18} /></button>
        {botAvatar ? <img src={botAvatar} alt={botName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} /> : <div style={avatarStyle}><Bot size={18} color="#fff" /></div>}
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>{botName}</div><div style={{ fontSize: 11, color: "#4ade80" }}>● Cadastro e acesso seguro</div></div>
        <button onClick={onClose} style={iconButton}><X size={18} /></button>
      </header>

      {phase === "home" && <main style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
        <div style={{ textAlign: "center", padding: "8px 8px 10px" }}>
          {botAvatar ? <img src={botAvatar} alt={botName} style={{ width: 66, height: 66, borderRadius: "50%", objectFit: "cover", display: "block", margin: "0 auto 12px", border: "1px solid rgba(255,255,255,.18)" }} /> : <div style={{ ...avatarStyle, width: 66, height: 66, margin: "0 auto 12px" }}><Bot size={31} color="#fff" /></div>}
          <h2 style={{ color: "#fff", fontSize: 20, margin: "0 0 8px" }}>Como posso ajudar?</h2>
          <p style={{ color: "rgba(255,255,255,.62)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>Escolha uma opção. Gastos e Empréstimos exigem cadastro e acesso válido.</p>
        </div>

        <button onClick={openRegistration} style={primaryButton}>
          <ClipboardList size={20} />
          <span style={buttonTextWrap}><strong>FAZER CADASTRO</strong><small>Cadastro guiado passo a passo</small></span>
        </button>

        <button onClick={() => openProtectedRoute("gastos")} style={gastosButton}>
          <BarChart3 size={20} />
          <span style={buttonTextWrap}><strong>CONTROLE DE GASTOS</strong><small>Corridas, ganhos, despesas e lucro</small></span>
        </button>

        <button onClick={() => openProtectedRoute("emprestimo")} style={loanButton}>
          <WalletCards size={20} />
          <span style={buttonTextWrap}><strong>EMPRÉSTIMOS</strong><small>Acessar ou consultar seus empréstimos</small></span>
        </button>

        <p style={{ color: "rgba(255,255,255,.38)", fontSize: 11, lineHeight: 1.45, textAlign: "center", margin: "5px 10px 0" }}>Se o cadastro não for localizado, o assistente direciona automaticamente para o cadastro.</p>
      </main>}

      {phase === "entry" && <main style={{ flex: 1, overflowY: "auto", padding: 16 }}><OnlineEntryPanel intendedRoute={intendedRoute} onBack={goHome} onOpenCadastro={() => setPhase("register")} /></main>}
      {phase === "register" && <main style={{ flex: 1, overflowY: "auto", padding: 16 }}><OnlineRegistrationPanel conversationId={registrationDraftId} visitorId={visitorId} initialRoute={intendedRoute} onBack={goHome} onDone={() => setPhase(intendedRoute ? "entry" : "home")} /></main>}
    </div>
  </div>;
}

const iconButton: React.CSSProperties = { background: "none", border: "none", color: "rgba(255,255,255,.55)", cursor: "pointer", padding: 4, borderRadius: 8, display: "flex", alignItems: "center" };
const avatarStyle: React.CSSProperties = { width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center" };
const buttonBase: React.CSSProperties = { width: "100%", minHeight: 62, borderRadius: 14, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12, padding: "10px 14px", textAlign: "left" };
const primaryButton: React.CSSProperties = { ...buttonBase, border: "1px solid rgba(124,58,237,.7)", background: "linear-gradient(135deg,#7c3aed,#2563eb)" };
const gastosButton: React.CSSProperties = { ...buttonBase, border: "1px solid rgba(34,197,94,.55)", background: "linear-gradient(135deg,rgba(22,163,74,.88),rgba(21,128,61,.72))" };
const loanButton: React.CSSProperties = { ...buttonBase, border: "1px solid rgba(245,158,11,.55)", background: "linear-gradient(135deg,rgba(217,119,6,.88),rgba(180,83,9,.72))" };
const buttonTextWrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };
