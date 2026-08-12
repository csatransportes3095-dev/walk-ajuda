import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Zap, ClipboardList, Search, ShieldX, WifiOff, RefreshCw, Trophy, Star, Gift, Ticket, Bell, Sparkles, MessageCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { OnlineSupportWidget } from "@/components/OnlineSupportWidget";
import { HomeAccessManifest } from "@/components/HomeAccessManifest";

const EXTRA_BTN_ICONS: Record<string, React.ReactNode> = {
  // legados
  trophy: <Trophy className="w-8 h-8 text-white" />,
  star: <Star className="w-8 h-8 text-white" />,
  gift: <Gift className="w-8 h-8 text-white" />,
  ticket: <Ticket className="w-8 h-8 text-white" />,
  bell: <Bell className="w-8 h-8 text-white" />,
  sparkles: <Sparkles className="w-8 h-8 text-white" />,
  search: <Search className="w-8 h-8 text-white" />,
  clipboard: <ClipboardList className="w-8 h-8 text-white" />,
  // novos ícones Hub Central
  group:    <span className="text-3xl">👥</span>,
  key:      <span className="text-3xl">🔑</span>,
  chart:    <span className="text-3xl">📊</span>,
  video:    <span className="text-3xl">🎥</span>,
  globe:    <span className="text-3xl">🌐</span>,
  chat:     <span className="text-3xl">💬</span>,
  doc:      <span className="text-3xl">📄</span>,
  phone:    <span className="text-3xl">📱</span>,
  car:      <span className="text-3xl">🚗</span>,
  money:    <span className="text-3xl">💰</span>,
  info:     <span className="text-3xl">ℹ️</span>,
  alert:    <span className="text-3xl">⚠️</span>,
  check:    <span className="text-3xl">✅</span>,
  lock:     <span className="text-3xl">🔒</span>,
  telegram: <span className="text-3xl">✈️</span>,
  insta:    <span className="text-3xl">📸</span>,
};

const WELCOME_CHOICE_KEY = "walk_welcome_choice";
const VPN_CHECK_KEY = "walk_vpn_checked";
const PWA_DISMISSED_KEY = "walk_home_pwa_dismissed_v2";
const ONLINE_SUPPORT_VISITOR_KEY = "walk_online_support_visitor_id";
const HOME_ACCESS_GRANTED_KEY = "walk_home_access_granted";

function getOrCreateOnlineSupportVisitorId() {
  const stored = localStorage.getItem(ONLINE_SUPPORT_VISITOR_KEY);
  if (stored) return stored;
  const created = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(ONLINE_SUPPORT_VISITOR_KEY, created);
  return created;
}

// Card de instalação estilo Play Store
function PWAInstallCard({ onInstall, logoUrl }: { onInstall: () => Promise<void>; logoUrl?: string }) {
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    setProgress(0);
    // Animação de progresso enquanto aguarda o prompt
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 85) { clearInterval(interval); return 85; }
        return p + Math.random() * 18;
      });
    }, 120);
    await onInstall();
    clearInterval(interval);
    setProgress(100);
    setTimeout(() => setDone(true), 400);
  };

  if (done) return null;

  return (
    <div className="mt-6 w-full bg-[#1a1f35] border border-[#2a3050] rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Cabeçalho do card */}
      <div className="flex items-center gap-4 p-4">
        <img
          src="/manus-storage/pwa-icon-192_88c027b0.png"
          alt="Walk Ajuda"
          className="w-16 h-16 rounded-2xl shadow-lg flex-shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-base leading-tight">WALK AJUDA</p>
          <p className="text-[#0ea5e9] text-xs font-semibold mt-0.5">walkajuda.com</p>
          <p className="text-white/60 text-xs mt-1 leading-snug">Atendimento rápido para motoristas de app</p>
        </div>
      </div>

      {/* Barra de progresso (só durante instalação) */}
      {installing && (
        <div className="px-4 pb-2">
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#0ea5e9] to-[#2563eb] rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-white/50 text-xs mt-1.5 text-center">
            {progress < 100 ? 'Preparando instalação...' : 'Concluído!'}
          </p>
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-white/5 mx-4" />

      {/* Botões */}
      <div className="flex">
        <button
          onClick={() => { /* dismiss: esconde o card */ setDone(true); }}
          disabled={installing}
          className="flex-1 py-3.5 text-[#0ea5e9] text-sm font-semibold hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          Agora não
        </button>
        <div className="w-px bg-white/5" />
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex-1 py-3.5 text-white font-black text-sm bg-gradient-to-r from-[#0ea5e9] to-[#2563eb] hover:from-[#0284c7] hover:to-[#1d4ed8] transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {installing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Instalando...
            </>
          ) : 'Instalar'}
        </button>
      </div>
    </div>
  );
}

// Hook para instalação PWA — só ativa quando o Chrome está pronto (beforeinstallprompt)
function useHomePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Já instalado como app standalone
    if (window.matchMedia("(display-mode: standalone)").matches) { setIsInstalled(true); return; }
    // Captura o evento nativo do Chrome/Android
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    // Se já instalado via appinstalled
    const installed = () => { setIsInstalled(true); setIsInstallable(false); };
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") { setIsInstalled(true); setIsInstallable(false); }
    setDeferredPrompt(null);
  };

  return { isInstallable, isInstalled, install };
}

export default function WelcomeScreen({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const [onlineSupportOpen, setOnlineSupportOpen] = useState(false);
  const [homeAccessGranted, setHomeAccessGranted] = useState(() => sessionStorage.getItem(HOME_ACCESS_GRANTED_KEY) === "1");
  const [choiceMade, setChoiceMade] = useState(false);
  // Marca que o usuário acabou de clicar no card "Cadastro" (fluxo na própria rota "/").
  // Persiste no contexto de memória da aba via window, sobrevive a navegações internas mas
  // é limpo ao voltar/recarregar a partir de outra tela.
  const justClickedCard = useRef(false);
  const [vpnBlocked, setVpnBlocked] = useState(false);
  const [vpnChecking, setVpnChecking] = useState(true);
  const [onlineSupportVisitorId] = useState(() => getOrCreateOnlineSupportVisitorId());
  const { data: settings } = trpc.settings.getAll.useQuery();
  const { data: extraButtons = [] } = trpc.homeButtons.listPublic.useQuery();
  const { data: onlineSupportState } = trpc.onlineSupport.publicState.useQuery({ pathname: location }, { refetchInterval: 20000 });
  const { data: onlineSupportUnread } = trpc.onlineSupport.unreadSummary.useQuery(
    { visitorId: onlineSupportVisitorId },
    { refetchInterval: 5000 },
  );
  const vpnCheckMutation = trpc.vpn.check.useMutation();
  const { isInstallable: pwaInstallable, isInstalled: pwaInstalled, install: pwaInstall } = useHomePWA();

  const loginTitle = settings?.login_title || "WALK AJUDA";
  const loginImageUrl = settings?.login_image_url || "";
  const loginShowImage = settings?.login_show_image !== "0";

  // Configurações dinâmicas dos botões
  const BTN1_TEXT = settings?.home_btn1_text || "FAZER PEDIDO";
  const BTN1_SUBTITLE = settings?.home_btn1_subtitle || "Abrir conta Uber, 99 ou InDrive";
  const BTN1_COLOR = settings?.home_btn1_color || "#7c3aed";
  const BTN1_TEXT_COLOR = settings?.home_btn1_text_color || "#ffffff";
  const BTN1_SUB_COLOR = settings?.home_btn1_sub_color || "rgba(255,255,255,0.7)";
  const BTN1_FONT = settings?.home_btn1_font || "";

  // Helper: resolve variantes Bold (ex: "Montserrat Bold" → fontFamily Montserrat + fontWeight 700)
  const getFontStyle = (font: string): React.CSSProperties => {
    if (!font) return {};
    if (font === "Montserrat Bold") return { fontFamily: "'Montserrat', sans-serif", fontWeight: 700 };
    if (font === "Poppins Bold") return { fontFamily: "'Poppins', sans-serif", fontWeight: 700 };
    return { fontFamily: `'${font}', sans-serif` };
  };
  const BTN2_TEXT = settings?.home_btn2_text || "ACOMPANHAR";
  const BTN2_SUBTITLE = settings?.home_btn2_subtitle || "Ver o status do seu pedido";
  const BTN2_COLOR = settings?.home_btn2_color || "#059669";
  const BTN2_TEXT_COLOR = settings?.home_btn2_text_color || "#ffffff";
  const BTN2_SUB_COLOR = settings?.home_btn2_sub_color || "rgba(255,255,255,0.7)";
  const BTN2_FONT = settings?.home_btn2_font || "";
  const HOME_FOOTER_TEXT = settings?.home_footer_text || "Motoristas de Uber, 99 e InDrive";
  const HOME_FONT = settings?.home_font || "Inter";

  // Botões extras agora vêm da tabela dinâmica (extraButtons)
  // Efeitos hover por botão
  const BTN1_HOVER = settings?.home_btn1_hover || "scale";
  const BTN2_HOVER = settings?.home_btn2_hover || "scale";

  // Estado de hover por botão (para efeitos que precisam de JS)
  const [hovered, setHovered] = useState<Record<string, boolean>>({});

  // Injetar CSS keyframes para efeitos hover animados
  useEffect(() => {
    const styleId = 'walk-hover-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes walk-shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px) rotate(-1deg); }
          30% { transform: translateX(6px) rotate(1deg); }
          45% { transform: translateX(-4px) rotate(-0.5deg); }
          60% { transform: translateX(4px) rotate(0.5deg); }
          75% { transform: translateX(-2px); }
        }
        @keyframes walk-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.04); opacity: 0.92; }
        }
        @keyframes walk-bounce {
          0%, 100% { transform: translateY(0); }
          30% { transform: translateY(-8px); }
          60% { transform: translateY(-4px); }
        }
        @keyframes walk-rotate {
          0% { transform: rotate(0deg); }
          25% { transform: rotate(2deg); }
          75% { transform: rotate(-2deg); }
          100% { transform: rotate(0deg); }
        }
        .walk-hover-shake:hover { animation: walk-shake 0.5s ease-in-out; }
        .walk-hover-pulse:hover { animation: walk-pulse 0.8s ease-in-out infinite; }
        .walk-hover-bounce:hover { animation: walk-bounce 0.5s ease-in-out; }
        .walk-hover-rotate:hover { animation: walk-rotate 0.4s ease-in-out; }
        .walk-hover-scale:hover { transform: scale(1.02); }
        .walk-hover-lift:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
        .walk-hover-darken:hover { filter: brightness(0.82); }
        .walk-hover-none:hover { transform: none; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Helper para obter classe de hover
  const getHoverClass = (effect: string): string => {
    const map: Record<string, string> = {
      scale: 'walk-hover-scale',
      lift: 'walk-hover-lift',
      shake: 'walk-hover-shake',
      pulse: 'walk-hover-pulse',
      bounce: 'walk-hover-bounce',
      rotate: 'walk-hover-rotate',
      darken: 'walk-hover-darken',
      brightness: 'walk-hover-brightness',
      none: 'walk-hover-none',
    };
    return map[effect] || 'walk-hover-scale';
  };

  // Helper para inline style de glow (precisa da cor do botão)
  const getHoverStyle = (effect: string, color: string, btnKey: string): React.CSSProperties => {
    if (effect === 'glow' && hovered[btnKey]) {
      return { boxShadow: `0 0 20px 6px ${color}99, 0 0 40px 12px ${color}44` };
    }
    if (effect === 'lift' && hovered[btnKey]) {
      return { transform: 'translateY(-4px)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' };
    }
    return {};
  };

  // Carregar fontes do Google Fonts dinamicamente (global + individuais dos botões)
  const loadGoogleFont = (fontName: string) => {
    if (!fontName) return;
    const linkId = `gfont-${fontName.replace(/\s+/g, '-')}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap`;
      document.head.appendChild(link);
    }
  };
  useEffect(() => {
    // Carregar fontes dos botões fixos e dinâmicos
    const fontsToLoad = [HOME_FONT, BTN1_FONT, BTN2_FONT, ...extraButtons.map(b => b.font)];
    fontsToLoad.forEach(f => f && loadGoogleFont(f));
  }, [HOME_FONT, BTN1_FONT, BTN2_FONT, extraButtons]);

  // Se já está em /acompanhar, /sorteio ou /foto, não mostra a tela de boas-vindas (case-insensitive)
  const lowerLocation = location.toLowerCase();
  const isTrackingPage = lowerLocation === "/acompanhar" || lowerLocation === "/sorteio" || lowerLocation === "/foto";

  // Verificar VPN ao carregar
  useEffect(() => {
    if (isTrackingPage) {
      setChoiceMade(true);
      setVpnChecking(false);
      return;
    }
    // Na rota raiz "/", a tela principal (4 cards) deve SEMPRE aparecer,
    // exceto quando o usuário acabou de clicar no card de cadastro (fluxo na própria rota).
    // Assim, ao voltar de qualquer subtela, o cliente sempre vê os 4 cards e pode escolher outra função.
    if (location === "/") {
      if (justClickedCard.current) {
        // Veio do clique no card "Cadastro": mantém o fluxo aberto
        setChoiceMade(true);
        setVpnChecking(false);
        return;
      }
      // Carregamento normal / voltar / recarregar: limpar escolha e mostrar os cards
      sessionStorage.removeItem(WELCOME_CHOICE_KEY);
      setChoiceMade(false);
    } else {
      // Para outras rotas (que não são tracking pages), verificar sessionStorage
      const choice = sessionStorage.getItem(WELCOME_CHOICE_KEY);
      if (choice) {
        setChoiceMade(true);
        setVpnChecking(false);
        return;
      }
    }
    // Verificar se já checou VPN nessa sessão
    const vpnChecked = sessionStorage.getItem(VPN_CHECK_KEY);
    if (vpnChecked === "ok") {
      setVpnChecking(false);
      return;
    }
    // Fazer verificação de VPN com timeout
    const checkVpn = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('VPN check timeout')), 5000)
        );
        const result = await Promise.race([
          vpnCheckMutation.mutateAsync({}),
          timeoutPromise
        ]);
        if (result && (result as any).isVpn) {
          setVpnBlocked(true);
        } else {
          sessionStorage.setItem(VPN_CHECK_KEY, "ok");
        }
      } catch (error) {
        // Em caso de erro ou timeout na verificação, permitir acesso
        console.error('VPN check error:', error);
        sessionStorage.setItem(VPN_CHECK_KEY, "ok");
      } finally {
        setVpnChecking(false);
      }
    };
    checkVpn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrackingPage, location]);

  const handleRetry = () => {
    sessionStorage.removeItem(VPN_CHECK_KEY);
    setVpnBlocked(false);
    setVpnChecking(true);
    vpnCheckMutation.mutateAsync({}).then((result) => {
      if (result.isVpn) {
        setVpnBlocked(true);
      } else {
        sessionStorage.setItem(VPN_CHECK_KEY, "ok");
      }
      setVpnChecking(false);
    }).catch(() => {
      setVpnChecking(false);
    });
  };

  const handleFazerPedido = () => {
    justClickedCard.current = true;
    sessionStorage.setItem(WELCOME_CHOICE_KEY, "pedido");
    setChoiceMade(true);
    const btn1Url = settings?.home_btn1_url?.trim();
    if (btn1Url) {
      if (btn1Url.startsWith("http")) {
        window.location.href = btn1Url;
      } else {
        navigate(btn1Url);
      }
    } else {
      navigate("/");
    }
  };

  const handleAcompanhar = () => {
    sessionStorage.setItem(WELCOME_CHOICE_KEY, "acompanhar");
    setChoiceMade(true);
    const btn2Url = settings?.home_btn2_url?.trim();
    if (btn2Url) {
      if (btn2Url.startsWith("http")) {
        window.location.href = btn2Url;
      } else {
        navigate(btn2Url);
      }
    } else {
      navigate("/acompanhar");
    }
  };

  const handleExtraBtn = (url: string, waMsg?: string, openInNewTab?: number) => {
    sessionStorage.setItem(WELCOME_CHOICE_KEY, "extra");
    setChoiceMade(true);
    if (url.startsWith("http")) {
      // Se for link wa.me e tiver mensagem configurada, adicionar texto
      let finalUrl = url;
      if (url.includes('wa.me') && waMsg && waMsg.trim() !== '') {
        const separator = url.includes('?') ? '&' : '?';
        finalUrl = `${url}${separator}text=${encodeURIComponent(waMsg.trim())}`;
      }
      if (openInNewTab === 1) {
        window.open(finalUrl, "_blank");
      } else {
        window.location.href = finalUrl;
      }
    } else {
      navigate(url);
    }
  };

  const supportUnreadCount = onlineSupportUnread?.unreadMessages || 0;
  const supportLabelBase = onlineSupportState?.buttonLabel || "ATENDIMENTO ONLINE";
  const supportLabel = supportUnreadCount > 0
    ? `${supportLabelBase} — ${supportUnreadCount} NOVA${supportUnreadCount > 1 ? "S" : ""} MENSAGEM${supportUnreadCount > 1 ? "S" : ""}`
    : supportLabelBase;
  const supportDescription = onlineSupportState?.buttonDescription || "Tire suas dúvidas, receba instruções e fale com nossa equipe.";
  const supportColor = onlineSupportState?.buttonColor || "#2563eb";
  const supportVisible =
    !!onlineSupportState?.chatEnabled &&
    !!onlineSupportState?.welcomeButtonEnabled &&
    !!onlineSupportState?.showOnPage;
  const supportSortOrder = Number(onlineSupportState?.buttonSortOrder || 3);
  const supportStatusText = (onlineSupportState as any)?.customStatusText || (onlineSupportState?.onlineNow ? "online" : "fora do horário");

  // Estilo elegante padrão para todos os botões (DM Sans, sem borda grossa)
  const elegantBtnStyle = (color: string, extraStyle: React.CSSProperties = {}): React.CSSProperties => ({
    background: `linear-gradient(135deg, ${color}f0 0%, ${color}b0 100%)`,
    border: `1px solid ${color}40`,
    boxShadow: `0 2px 16px ${color}28, 0 1px 4px rgba(0,0,0,0.3)`,
    padding: "16px 18px",
    borderRadius: 18,
    fontFamily: "'DM Sans', 'Inter', -apple-system, sans-serif",
    ...extraStyle,
  });

  const [robotPhraseIdx, setRobotPhraseIdx] = useState(0);
  const robotPhrases = [
    "Estou aqui 24h! 🤖",
    "Tire suas dúvidas agora",
    "Resposta imediata!",
    "Como posso ajudar?",
    "Fale comigo! 💬",
  ];
  useEffect(() => {
    const t = setInterval(() => setRobotPhraseIdx(i => (i + 1) % robotPhrases.length), 2800);
    return () => clearInterval(t);
  }, []);

  const renderSupportButton = () => {
    if (!supportVisible) return null;
    return (
      <button
        onClick={() => setOnlineSupportOpen(true)}
        style={{
          width: "100%", background: `linear-gradient(135deg, ${supportColor}f0 0%, ${supportColor}80 100%)`,
          border: `1px solid ${supportColor}50`, borderRadius: 22,
          boxShadow: `0 4px 24px ${supportColor}40, 0 1px 4px rgba(0,0,0,0.3)`,
          padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16,
          fontFamily: "'DM Sans','Inter',-apple-system,sans-serif", position: "relative", overflow: "hidden",
        }}
      >
        {/* Robô animado */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
          <style>{`
            @keyframes robotFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
            @keyframes robotEyeBlink { 0%,90%,100%{transform:scaleY(1)} 95%{transform:scaleY(0.1)} }
            @keyframes antennaPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.4)} }
            @keyframes phraseIn { 0%{opacity:0;transform:translateY(6px)} 20%,80%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-6px)} }
          `}</style>
          <div style={{ animation: "robotFloat 2.4s ease-in-out infinite", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Antena */}
            <div style={{ width: 2, height: 10, background: "rgba(255,255,255,0.7)", borderRadius: 2, marginBottom: 1 }} />
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", animation: "antennaPulse 1.2s ease-in-out infinite", marginBottom: 2, boxShadow: "0 0 8px #fff" }} />
            {/* Cabeça */}
            <div style={{ width: 44, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.22)", border: "2px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, position: "relative" }}>
              {/* Olhos */}
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", animation: "robotEyeBlink 3s ease-in-out infinite" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", animation: "robotEyeBlink 3s ease-in-out infinite 0.15s" }} />
            </div>
            {/* Corpo */}
            <div style={{ width: 40, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.4)", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 16, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.5)" }} />
            </div>
            {/* Braços */}
            <div style={{ display: "flex", gap: 36, marginTop: -20, position: "relative", zIndex: -1 }}>
              <div style={{ width: 8, height: 18, borderRadius: 4, background: "rgba(255,255,255,0.3)", transform: "rotate(-10deg)" }} />
              <div style={{ width: 8, height: 18, borderRadius: 4, background: "rgba(255,255,255,0.3)", transform: "rotate(10deg)" }} />
            </div>
          </div>
        </div>
        {/* Texto */}
        <div style={{ flex: 1, textAlign: "left" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: -0.2 }}>{supportLabelBase}</p>
          <p key={robotPhraseIdx} style={{ fontSize: 12.5, color: "rgba(255,255,255,0.9)", margin: 0, animation: "phraseIn 2.8s ease-in-out forwards", fontWeight: 500 }}>
            {robotPhrases[robotPhraseIdx]}
          </p>
          <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#4ade80", marginRight: 4, animation: "antennaPulse 1.5s ease-in-out infinite" }} />
            {supportStatusText}
            {supportUnreadCount > 0 && <span style={{ marginLeft: 8, background: "rgba(255,255,255,0.25)", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>{supportUnreadCount} nova{supportUnreadCount > 1 ? "s" : ""}</span>}
          </p>
        </div>
        <svg style={{ width: 14, height: 14, opacity: 0.4, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
      </button>
    );
  };

  // Rota /login é atalho direto — pula a tela de boas-vindas
  if (choiceMade || location === "/login" || location === "/pre-cadastro") {
    return <>{children}</>;
  }

  // Tela de carregamento da verificação VPN
  if (vpnChecking) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10" />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <p className="text-white/50 text-sm">Verificando conexão...</p>
        </div>
      </div>
    );
  }

  // Tela de bloqueio por VPN
  if (vpnBlocked) {
    return (
      <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute inset-0 bg-gradient-to-br from-red-900/15 via-transparent to-orange-900/10" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-700/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-700/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

        <div className="relative z-10 w-full max-w-sm mx-auto flex flex-col items-center text-center">
          {/* Ícone de bloqueio */}
          <div className="w-24 h-24 bg-red-500/20 border-2 border-red-500/40 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-red-900/30">
            <ShieldX className="w-12 h-12 text-red-400" />
          </div>

          <h1 className="text-2xl font-black text-white mb-2">VPN Detectada</h1>
          <p className="text-white/60 text-sm mb-2">
            Detectamos que você está usando uma <strong className="text-orange-400">VPN ou Proxy</strong>.
          </p>
          <p className="text-white/60 text-sm mb-8">
            Por segurança, o acesso ao site não é permitido com VPN ativa.
          </p>

          {/* Instruções */}
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 text-left space-y-3">
            <p className="text-white/80 text-sm font-bold flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-orange-400 flex-shrink-0" />
              Como resolver:
            </p>
            <ol className="space-y-2 text-white/60 text-sm list-none">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                Abra o aplicativo de VPN no seu celular ou computador
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                Desative ou desconecte a VPN
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                Clique em <strong className="text-white">"Tentar Novamente"</strong> abaixo
              </li>
            </ol>
          </div>

          <button
            onClick={handleRetry}
            disabled={vpnChecking}
            className="w-full flex items-center justify-center gap-3 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-lg rounded-2xl py-4 px-6 shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95"
          >
            <RefreshCw className={`w-5 h-5 ${vpnChecking ? 'animate-spin' : ''}`} />
            {vpnChecking ? 'Verificando...' : 'Tentar Novamente'}
          </button>

          <p className="mt-6 text-white/20 text-xs">
            Se o problema persistir, verifique se não há extensões de VPN ativas no navegador.
          </p>
        </div>
      </div>
    );
  }

  // O manifesto é exibido antes da tela principal. O Atendimento Online não participa desta etapa.
  if (location === "/" && !homeAccessGranted) {
    return <HomeAccessManifest onGranted={() => {
      sessionStorage.setItem(HOME_ACCESS_GRANTED_KEY, "1");
      setHomeAccessGranted(true);
    }} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-start sm:justify-center relative overflow-y-auto overflow-x-hidden px-6 py-8" style={{ fontFamily: `'${HOME_FONT}', sans-serif` }}>
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-transparent to-blue-900/10" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-700/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-700/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="relative z-10 w-full max-w-sm mx-auto flex flex-col items-center">
        {/* Logo */}
        <div className="mb-5 flex flex-col items-center">
          {loginShowImage && loginImageUrl ? (
            <img
              src={loginImageUrl}
              alt="Logo"
              className="w-28 h-28 object-cover rounded-2xl mb-4 shadow-lg shadow-purple-700/30"
            />
          ) : (
            <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-violet-700 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-purple-700/40">
              <Zap className="w-12 h-12 text-white" />
            </div>
          )}
          <h1 className="text-3xl font-black text-white tracking-wide">{loginTitle}</h1>
          <p className="text-white/50 text-sm mt-1">O que você deseja fazer?</p>
        </div>

        {/* Boneco Android — abaixo do logo, aparece no navegador, oculto no APK */}
        {typeof window !== 'undefined' && !window.matchMedia('(display-mode: standalone)').matches && (window.navigator as any).standalone !== true && (
          <div className="w-full mb-4 flex flex-col items-center">
            <style>{`
              @keyframes androidBounce3 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
            `}</style>
            <div style={{ animation: 'androidBounce3 2s ease-in-out infinite' }}>
              <svg width="44" height="52" viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="22" y1="10" x2="16" y2="2" stroke="#3ddc84" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="42" y1="10" x2="48" y2="2" stroke="#3ddc84" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M12 22 Q12 10 32 10 Q52 10 52 22 L52 28 Q52 32 48 32 L16 32 Q12 32 12 28 Z" fill="#3ddc84"/>
                <circle cx="24" cy="21" r="2.5" fill="white"/>
                <circle cx="40" cy="21" r="2.5" fill="white"/>
                <rect x="10" y="34" width="44" height="26" rx="6" fill="#3ddc84"/>
                <rect x="2" y="34" width="6" height="18" rx="3" fill="#3ddc84"/>
                <rect x="56" y="34" width="6" height="18" rx="3" fill="#3ddc84"/>
                <rect x="16" y="62" width="10" height="10" rx="3" fill="#3ddc84"/>
                <rect x="38" y="62" width="10" height="10" rx="3" fill="#3ddc84"/>
              </svg>
            </div>
            <p className="text-[11px] font-bold text-[#3ddc84] mt-1 mb-2">Baixe o app Android</p>
            <div className="flex gap-2 w-full">
              <a href="/app" className="flex-1 flex flex-col items-center gap-0.5 bg-[#3ddc84]/10 hover:bg-[#3ddc84]/20 border border-[#3ddc84]/30 rounded-xl px-2 py-2 text-[11px] font-bold text-[#3ddc84] transition-all active:scale-95">
                <span>📱</span>
                <span>Colombiano</span>
                <span className="text-[#3ddc84]/50 font-normal text-[9px]">Sistema completo</span>
              </a>
              <a href="/app-pro" className="flex-1 flex flex-col items-center gap-0.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl px-2 py-2 text-[11px] font-bold text-blue-400 transition-all active:scale-95">
                <span>⚡</span>
                <span>Driver Pro</span>
                <span className="text-blue-400/50 font-normal text-[9px]">Planilha + Empréstimo</span>
              </a>
            </div>
          </div>
        )}

        {/* Botões de escolha */}
        <div className="w-full space-y-3">
          {supportSortOrder <= 1 && renderSupportButton()}

          {/* Botão 1 (FAZER PEDIDO) */}
          <button
            onClick={handleFazerPedido}
            onMouseEnter={() => setHovered(h => ({ ...h, btn1: true }))}
            onMouseLeave={() => setHovered(h => ({ ...h, btn1: false }))}
            className={`w-full group relative overflow-hidden text-white rounded-[18px] transition-all duration-300 flex items-center gap-3 ${getHoverClass(BTN1_HOVER)}`}
            style={{ ...elegantBtnStyle(BTN1_COLOR, getFontStyle(BTN1_FONT)), ...getHoverStyle(BTN1_HOVER, BTN1_COLOR, 'btn1') }}
          >
            <div style={{ width: 40, height: 40, minWidth: 40, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.18)", flexShrink: 0 }}>
              <ClipboardList style={{ width: 20, height: 20, color: "#fff" }} />
            </div>
            <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.1px", color: BTN1_TEXT_COLOR, lineHeight: 1.3, margin: 0 }}>{BTN1_TEXT}</p>
              <p style={{ fontSize: 11.5, fontWeight: 400, color: BTN1_SUB_COLOR, marginTop: 2, lineHeight: 1.4 }}>{BTN1_SUBTITLE}</p>
            </div>
            <svg style={{ width: 14, height: 14, opacity: 0.45, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/8 to-transparent" />
          </button>

          {supportSortOrder > 1 && supportSortOrder <= 2 && renderSupportButton()}

          {/* Botão 2 (ACOMPANHAR) */}
          <button
            onClick={handleAcompanhar}
            onMouseEnter={() => setHovered(h => ({ ...h, btn2: true }))}
            onMouseLeave={() => setHovered(h => ({ ...h, btn2: false }))}
            className={`w-full group relative overflow-hidden text-white rounded-[18px] transition-all duration-300 flex items-center gap-3 ${getHoverClass(BTN2_HOVER)}`}
            style={{ ...elegantBtnStyle(BTN2_COLOR, getFontStyle(BTN2_FONT)), ...getHoverStyle(BTN2_HOVER, BTN2_COLOR, 'btn2') }}
          >
            <div style={{ width: 40, height: 40, minWidth: 40, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.18)", flexShrink: 0 }}>
              <Search style={{ width: 20, height: 20, color: "#fff" }} />
            </div>
            <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.1px", color: BTN2_TEXT_COLOR, lineHeight: 1.3, margin: 0 }}>{BTN2_TEXT}</p>
              <p style={{ fontSize: 11.5, fontWeight: 400, color: BTN2_SUB_COLOR, marginTop: 2, lineHeight: 1.4 }}>{BTN2_SUBTITLE}</p>
            </div>
            <svg style={{ width: 14, height: 14, opacity: 0.45, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/8 to-transparent" />
          </button>

          {supportSortOrder > 2 && renderSupportButton()}

          {/* Botões Extras Dinâmicos */}
          {extraButtons.filter(btn => (btn as any).vipOnly !== 1).map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleExtraBtn(btn.url, btn.waMsg || undefined, (btn as any).openInNewTab)}
              onMouseEnter={() => setHovered(h => ({ ...h, [`extra-${btn.id}`]: true }))}
              onMouseLeave={() => setHovered(h => ({ ...h, [`extra-${btn.id}`]: false }))}
              className={`w-full group relative overflow-hidden text-white rounded-[18px] transition-all duration-300 flex items-center gap-3 ${getHoverClass(btn.hover)}`}
              style={{ ...elegantBtnStyle(btn.color, getFontStyle(btn.font || HOME_FONT)), ...getHoverStyle(btn.hover, btn.color, `extra-${btn.id}`) }}
            >
              <div style={{ width: 40, height: 40, minWidth: 40, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.18)", flexShrink: 0, fontSize: 20 }}>
                {EXTRA_BTN_ICONS[btn.icon] || EXTRA_BTN_ICONS.gift}
              </div>
              <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.1px", color: btn.textColor, lineHeight: 1.3, margin: 0 }}>{btn.text}</p>
                <p style={{ fontSize: 11.5, fontWeight: 400, color: btn.subColor, marginTop: 2, lineHeight: 1.4 }}>{btn.subtitle}</p>
              </div>
              <svg style={{ width: 14, height: 14, opacity: 0.45, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/8 to-transparent" />
            </button>
          ))}
        </div>

        {/* Card PWA Walk Ajuda removido */}

        {/* Boneco Android removido do final — está abaixo do logo */}

        {/* Rodapé */}
        <p className="mt-8 text-white/30 text-xs text-center">
          {HOME_FOOTER_TEXT}
        </p>
      </div>

      <OnlineSupportWidget
        isOpen={onlineSupportOpen}
        onClose={() => setOnlineSupportOpen(false)}
        onMinimize={() => setOnlineSupportOpen(false)}
        onBack={() => setOnlineSupportOpen(false)}
        openMode="fullscreen"
      />
    </div>
  );
}
