import { useState } from "react";
import { ArrowLeft, Bot, ClipboardList, KeyRound, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { OnlineEntryPanel } from "@/components/OnlineEntryPanel";
import { OnlineRegistrationPanel } from "@/components/OnlineRegistrationPanel";
import { OnlinePhoneEntryPanel } from "@/components/OnlinePhoneEntryPanel";

type OpenMode = "modal" | "sidebar" | "fullscreen";
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
  const [phase, setPhase] = useState<"phone" | "home" | "entry" | "register">("phone");
  const [entryPhone, setEntryPhone] = useState("");
  const [referralPhone, setReferralPhone] = useState("");
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
  const botName = publicStateQ.data?.buttonLabel || "Atendimento Online";
  const botAvatar = (publicStateQ.data as any)?.botAvatar || null;
  const goPhone = () => setPhase("phone");
  const goHome = () => setPhase("home");
  const handleExistingCustomer = (phone: string) => { setEntryPhone(phone); setReferralPhone(""); setPhase("home"); };
  const handleNewCustomerWithReferral = (phone: string, referrer: string) => { setEntryPhone(phone); setReferralPhone(referrer); setPhase("home"); };

  return <div
    style={isFullscreen ? {} : { position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 16 }}
    onClick={!isFullscreen ? (event) => { if (event.target === event.currentTarget) onMinimize(); } : undefined}
  >
    <div style={{ ...panelStyle, background: "#09090b", border: "1px solid rgba(255,255,255,.08)", boxShadow: "0 25px 60px rgba(0,0,0,.6)" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.08)", background: "linear-gradient(135deg,#1e1b4b,#0f172a)", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={phase === "phone" ? (onBack || onMinimize) : phase === "home" ? goPhone : goHome} style={iconButton}><ArrowLeft size={18} /></button>
        {botAvatar ? <img src={botAvatar} alt={botName} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} /> : <div style={avatarStyle}><Bot size={18} color="#fff" /></div>}
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>{botName}</div><div style={{ fontSize: 11, color: "#4ade80" }}>● Atendimento seguro</div></div>
        <button onClick={onClose} style={iconButton}><X size={18} /></button>
      </header>

      {phase === "phone" && <main style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", alignItems: "center" }}><OnlinePhoneEntryPanel onBack={onBack || onMinimize} onExistingCustomer={handleExistingCustomer} onNewCustomerWithReferral={handleNewCustomerWithReferral} /></main>}

      {phase === "home" && <main style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}>
        <div style={{ textAlign: "center", padding: "8px 8px 6px" }}>
          <div style={{ ...avatarStyle, width: 66, height: 66, margin: "0 auto 12px" }}><Bot size={31} color="#fff" /></div>
          <h2 style={{ color: "#fff", fontSize: 20, margin: "0 0 8px" }}>Boas-vindas</h2>
          <p style={{ color: "rgba(255,255,255,.62)", fontSize: 13, lineHeight: 1.55, margin: 0 }}>{referralPhone ? "Indicação validada. Complete seu cadastro para acessar o sistema." : "Seu cadastro foi localizado. Entre com sua senha para acessar somente os seus dados."}</p>
        </div>
        {referralPhone ? <button onClick={() => setPhase("register")} style={primaryButton}><ClipboardList size={19} /> Fazer cadastro</button> : <button onClick={() => setPhase("entry")} style={secondaryButton}><KeyRound size={19} /> Entrar com senha</button>}
        <p style={{ color: "rgba(255,255,255,.38)", fontSize: 11, lineHeight: 1.45, textAlign: "center", margin: "4px 10px 0" }}>Cadastro, pedidos, empréstimos, parcelas, comprovantes, Gastos e permissões de rota em um único acesso.</p>
      </main>}

      {phase === "entry" && <main style={{ flex: 1, overflowY: "auto", padding: 16 }}><OnlineEntryPanel initialPhone={entryPhone} onBack={goHome} onOpenCadastro={goPhone} /></main>}
      {phase === "register" && <main style={{ flex: 1, overflowY: "auto", padding: 16 }}><OnlineRegistrationPanel conversationId={registrationDraftId} visitorId={visitorId} initialPhone={entryPhone} referredByPhone={referralPhone} onBack={goHome} onDone={() => setPhase("entry")} /></main>}
    </div>
  </div>;
}

const iconButton: React.CSSProperties = { background: "none", border: "none", color: "rgba(255,255,255,.55)", cursor: "pointer", padding: 4, borderRadius: 8, display: "flex", alignItems: "center" };
const avatarStyle: React.CSSProperties = { width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center" };
const primaryButton: React.CSSProperties = { width: "100%", minHeight: 52, borderRadius: 14, border: "1px solid rgba(124,58,237,.7)", background: "linear-gradient(135deg,#7c3aed,#2563eb)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 };
const secondaryButton: React.CSSProperties = { width: "100%", minHeight: 52, borderRadius: 14, border: "1px solid rgba(96,165,250,.5)", background: "rgba(59,130,246,.12)", color: "#bfdbfe", fontWeight: 800, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 };
