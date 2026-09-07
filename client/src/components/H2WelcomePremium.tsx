import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { trpc } from "@/lib/trpc";
import { OnlineSupportWidget } from "@/components/OnlineSupportWidget";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Download,
  Gift,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Star,
  UserPlus,
  Users,
  WalletCards,
  Zap,
} from "lucide-react";
import "../h2-welcome-premium.css";

type HomeButton = {
  id: number;
  text: string;
  subtitle: string | null;
  url: string;
  waMsg?: string | null;
  icon?: string | null;
  color?: string | null;
  textColor?: string | null;
  subColor?: string | null;
  font?: string | null;
  hover?: string | null;
  openInNewTab?: number | boolean | null;
  vipOnly?: number | null;
};

type CanonicalKind = "pedido" | "acompanhar" | "cadastro" | "gastos" | "emprestimo" | "sorteio" | "default";

const WELCOME_CHOICE_KEY = "walk_welcome_choice";
const ONLINE_SUPPORT_VISITOR_KEY = "walk_online_support_visitor_id";

const DEFAULTS: Record<Exclude<CanonicalKind, "pedido" | "acompanhar" | "default">, HomeButton> = {
  cadastro: {
    id: -3,
    text: "FAZER MEU CADASTRO",
    subtitle: "Novos clientes - novo cadastro",
    url: "/pre-cadastro",
    color: "#1598e7",
    textColor: "#ffffff",
    subColor: "rgba(255,255,255,.84)",
  },
  gastos: {
    id: -4,
    text: "PLANILHA GASTOS",
    subtitle: "Acesso cliente VIP",
    url: "/gastos",
    color: "#e98708",
    textColor: "#ffffff",
    subColor: "rgba(255,255,255,.84)",
  },
  emprestimo: {
    id: -5,
    text: "EMPRÉSTIMO",
    subtitle: "Diário para clientes de confiança",
    url: "/emprestimo",
    color: "#d8173a",
    textColor: "#ffffff",
    subColor: "rgba(255,255,255,.84)",
  },
  sorteio: {
    id: -6,
    text: "SORTEIO GRÁTIS",
    subtitle: "Valendo 200,00",
    url: "/sorteio",
    color: "#d51693",
    textColor: "#ffffff",
    subColor: "rgba(255,255,255,.84)",
  },
};

const DEFAULT_COLORS: Record<CanonicalKind, string> = {
  pedido: "#8f19ef",
  acompanhar: "#08a76f",
  cadastro: "#1598e7",
  gastos: "#e98708",
  emprestimo: "#d8173a",
  sorteio: "#d51693",
  default: "#126ed2",
};

const CARD_LABELS: Record<CanonicalKind, string> = {
  pedido: "RÁPIDO • SEGURO • SEM BUROCRACIA",
  acompanhar: "TRANSPARÊNCIA • ATUALIZAÇÃO CONSTANTE",
  cadastro: "PRÁTICO • RÁPIDO • 100% ONLINE",
  gastos: "CONTROLE • RELATÓRIOS • MAIS LUCRO",
  emprestimo: "SIMPLES • RÁPIDO • SEGURO",
  sorteio: "PARTICIPE • É GRÁTIS • BOA SORTE",
  default: "H2 COLOMBIANO • SEMPRE COM VOCÊ",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function keyForButton(button: Pick<HomeButton, "id" | "text" | "url">): CanonicalKind {
  if (button.id === -2) return "pedido";
  if (button.id === -1) return "acompanhar";
  if (button.id === -3) return "cadastro";
  if (button.id === -4) return "gastos";
  if (button.id === -5) return "emprestimo";
  if (button.id === -6) return "sorteio";

  const text = normalize(button.text || "");
  const url = normalize(button.url || "");

  if (url.includes("acompanhar") || text.includes("acompan")) return "acompanhar";
  if (url.includes("pre-cadastro") || text.includes("cadastro") || text.includes("cadastr")) return "cadastro";
  if (url.includes("/gastos") || text.includes("gasto") || text.includes("planilha")) return "gastos";
  if (url.includes("emprestimo") || text.includes("emprest")) return "emprestimo";
  if (url.includes("sorteio") || text.includes("sorte")) return "sorteio";
  if (text.includes("pedido")) return "pedido";
  return "default";
}

function CardIcon({ kind }: { kind: CanonicalKind }) {
  const className = "h-7 w-7";
  if (kind === "acompanhar") return <ClipboardCheck className={className} />;
  if (kind === "cadastro") return <UserPlus className={className} />;
  if (kind === "gastos") return <BarChart3 className={className} />;
  if (kind === "emprestimo") return <WalletCards className={className} />;
  if (kind === "sorteio") return <Gift className={className} />;
  return <Zap className={className} />;
}

function PremiumExecutiveCar() {
  return (
    <svg
      viewBox="0 0 420 190"
      role="img"
      aria-label="Carro executivo azul"
      style={{ width: "100%", height: "100%", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="h2-car-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4bc5ff" />
          <stop offset="0.24" stopColor="#147bf0" />
          <stop offset="0.58" stopColor="#0646a5" />
          <stop offset="1" stopColor="#03142f" />
        </linearGradient>
        <linearGradient id="h2-car-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#74d8ff" stopOpacity=".72" />
          <stop offset=".42" stopColor="#09234d" stopOpacity=".96" />
          <stop offset="1" stopColor="#020914" />
        </linearGradient>
        <linearGradient id="h2-car-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".38" stopColor="#9fc6e7" />
          <stop offset="1" stopColor="#264968" />
        </linearGradient>
        <radialGradient id="h2-car-wheel" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#b8d8f5" />
          <stop offset=".18" stopColor="#26394b" />
          <stop offset=".48" stopColor="#111923" />
          <stop offset=".72" stopColor="#768ca4" />
          <stop offset=".79" stopColor="#080b10" />
          <stop offset="1" stopColor="#010205" />
        </radialGradient>
        <filter id="h2-car-glow" x="-30%" y="-40%" width="170%" height="200%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="220" cy="163" rx="182" ry="16" fill="#009cff" opacity=".18" filter="url(#h2-car-glow)" />
      <path
        d="M40 120 C66 112 83 101 99 85 C117 64 141 53 184 49 L272 47 C307 47 331 58 353 79 L382 105 C399 110 407 120 407 134 L407 143 C407 151 398 157 387 157 L47 157 C31 157 21 149 22 138 C23 130 29 124 40 120Z"
        fill="url(#h2-car-body)"
        stroke="#43bfff"
        strokeWidth="2.5"
        filter="url(#h2-car-glow)"
      />
      <path d="M117 84 C135 65 157 58 188 56 L268 55 C296 55 315 64 336 84 L349 96 L101 96Z" fill="url(#h2-car-glass)" stroke="#4bbdff" strokeWidth="1.3" />
      <path d="M209 56 L209 96" stroke="#8ddcff" strokeOpacity=".55" strokeWidth="2" />
      <path d="M105 99 C161 104 300 103 363 97" stroke="#87dcff" strokeOpacity=".52" strokeWidth="2" fill="none" />
      <path d="M55 121 C128 112 310 111 385 118" stroke="#63ceff" strokeOpacity=".46" strokeWidth="2" fill="none" />
      <path d="M75 142 C159 149 312 149 380 140" stroke="#00152c" strokeWidth="5" fill="none" opacity=".75" />
      <path d="M357 108 L397 116 L390 127 L347 123Z" fill="#c8fbff" filter="url(#h2-car-glow)" />
      <path d="M30 130 L58 125 L61 136 L33 140Z" fill="#ff3c54" opacity=".82" />
      <path d="M308 129 C330 127 351 129 371 135" stroke="url(#h2-car-chrome)" strokeWidth="3" fill="none" />
      <path d="M272 48 C300 52 322 63 343 83" stroke="#b8ecff" strokeOpacity=".6" strokeWidth="2" fill="none" />
      <circle cx="111" cy="151" r="31" fill="#060a10" stroke="#1a2b3b" strokeWidth="3" />
      <circle cx="111" cy="151" r="22" fill="url(#h2-car-wheel)" />
      <circle cx="111" cy="151" r="7" fill="#9eb9d2" />
      <circle cx="326" cy="151" r="31" fill="#060a10" stroke="#1a2b3b" strokeWidth="3" />
      <circle cx="326" cy="151" r="22" fill="url(#h2-car-wheel)" />
      <circle cx="326" cy="151" r="7" fill="#9eb9d2" />
      <path d="M151 112 H184" stroke="#b6eaff" strokeOpacity=".55" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M229 112 H261" stroke="#b6eaff" strokeOpacity=".55" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function markWelcomeChoice() {
  try {
    sessionStorage.setItem(WELCOME_CHOICE_KEY, "premium");
  } catch {
    // Mantém a navegação funcionando mesmo quando o storage estiver indisponível.
  }
}

function withWhatsappMessage(url: string, waMsg?: string | null) {
  if (!url.includes("wa.me") || !waMsg?.trim()) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}text=${encodeURIComponent(waMsg.trim())}`;
}

function go(url: string, newTab = false, waMsg?: string | null) {
  const cleanUrl = url?.trim();
  if (!cleanUrl) return;

  markWelcomeChoice();

  if (/^https?:\/\//i.test(cleanUrl)) {
    const finalUrl = withWhatsappMessage(cleanUrl, waMsg);
    if (newTab) window.open(finalUrl, "_blank", "noopener,noreferrer");
    else window.location.href = finalUrl;
    return;
  }

  const internalUrl = cleanUrl.startsWith("/") ? cleanUrl : `/${cleanUrl}`;
  if (newTab) window.open(internalUrl, "_blank", "noopener,noreferrer");
  else window.location.href = internalUrl;
}

function getOrCreateOnlineSupportVisitorId() {
  if (typeof window === "undefined") return "";
  try {
    const stored = localStorage.getItem(ONLINE_SUPPORT_VISITOR_KEY);
    if (stored) return stored;
    const created = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ONLINE_SUPPORT_VISITOR_KEY, created);
    return created;
  } catch {
    return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function H2WelcomePremium() {
  const [active, setActive] = useState(false);
  const [legacyRoot, setLegacyRoot] = useState<HTMLElement | null>(null);
  const [onlineSupportOpen, setOnlineSupportOpen] = useState(false);
  const [onlineSupportVisitorId] = useState(() => getOrCreateOnlineSupportVisitorId());
  const isHome = typeof window !== "undefined" && window.location.pathname === "/";

  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: isHome });
  const { data: rawButtons = [] } = trpc.homeButtons.listPublic.useQuery(undefined, { enabled: isHome });
  const { data: onlineSupportState } = trpc.onlineSupport.publicState.useQuery(
    { pathname: "/" },
    { enabled: isHome, refetchInterval: 20_000 },
  );
  const { data: onlineSupportUnread } = trpc.onlineSupport.unreadSummary.useQuery(
    { visitorId: onlineSupportVisitorId },
    { enabled: isHome && Boolean(onlineSupportVisitorId), refetchInterval: 5_000 },
  );

  useEffect(() => {
    if (!isHome) {
      if (legacyRoot) {
        legacyRoot.style.display = "";
        legacyRoot.removeAttribute("aria-hidden");
      }
      setLegacyRoot(null);
      setActive(false);
      setOnlineSupportOpen(false);
      return;
    }

    const locate = () => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("div.min-h-screen"));
      const target = candidates.find((node) => {
        const hasChoiceStack = Boolean(node.querySelector("div.w-full.space-y-3"));
        const hasWelcomeBackground = node.classList.contains("bg-[#0a0a1a]");
        return hasChoiceStack && hasWelcomeBackground;
      }) || candidates.find((node) =>
        node.textContent?.includes("O que você deseja fazer?") &&
        node.textContent?.includes("Baixe o app Android"),
      );

      if (target && target !== legacyRoot) {
        if (legacyRoot) {
          legacyRoot.style.display = "";
          legacyRoot.removeAttribute("aria-hidden");
        }
        target.style.display = "none";
        target.setAttribute("aria-hidden", "true");
        setLegacyRoot(target);
        setActive(true);
      }
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isHome, legacyRoot]);

  useEffect(() => () => {
    if (legacyRoot) {
      legacyRoot.style.display = "";
      legacyRoot.removeAttribute("aria-hidden");
    }
  }, [legacyRoot]);

  const buttons = useMemo(() => {
    const dynamic = (rawButtons as HomeButton[]).filter((button) => Number(button.vipOnly || 0) !== 1);
    const used = new Set<number>();

    const resolve = (kind: Exclude<CanonicalKind, "pedido" | "acompanhar" | "default">): HomeButton => {
      const matched = dynamic.find((button) => keyForButton(button) === kind);
      if (!matched) return DEFAULTS[kind];
      used.add(matched.id);
      return {
        ...matched,
        subtitle: matched.subtitle || DEFAULTS[kind].subtitle,
        url: matched.url || DEFAULTS[kind].url,
        color: matched.color || DEFAULTS[kind].color,
        textColor: matched.textColor || DEFAULTS[kind].textColor,
        subColor: matched.subColor || DEFAULTS[kind].subColor,
      };
    };

    const essential: HomeButton[] = [
      {
        id: -2,
        text: settings?.home_btn1_text || "FAZER PEDIDO",
        subtitle: settings?.home_btn1_subtitle || "Abrir conta Uber, 99 ou InDrive",
        url: settings?.home_btn1_url?.trim() || "/login",
        color: settings?.home_btn1_color || DEFAULT_COLORS.pedido,
        textColor: settings?.home_btn1_text_color || "#ffffff",
        subColor: settings?.home_btn1_sub_color || "rgba(255,255,255,.84)",
        font: settings?.home_btn1_font || settings?.home_font || null,
      },
      {
        id: -1,
        text: settings?.home_btn2_text || "ACOMPANHAR PEDIDO",
        subtitle: settings?.home_btn2_subtitle || "Acompanhar seu pedido em tempo real",
        url: settings?.home_btn2_url?.trim() || "/acompanhar",
        color: settings?.home_btn2_color || DEFAULT_COLORS.acompanhar,
        textColor: settings?.home_btn2_text_color || "#ffffff",
        subColor: settings?.home_btn2_sub_color || "rgba(255,255,255,.84)",
        font: settings?.home_btn2_font || settings?.home_font || null,
      },
      resolve("cadastro"),
      resolve("gastos"),
      resolve("emprestimo"),
      resolve("sorteio"),
    ];

    const remaining = dynamic.filter((button) => !used.has(button.id) && keyForButton(button) === "default");
    return [...essential, ...remaining];
  }, [rawButtons, settings]);

  if (!isHome || !active) return null;

  const brandTitle = settings?.login_title?.trim() || "H2 COLOMBIANO";
  const brandLogo = settings?.login_image_url?.trim() || "/h2-brand-180.png";
  const showBrandLogo = settings?.login_show_image !== "0";
  const homeFont = settings?.home_font || "Inter";
  const footerText = settings?.home_footer_text || "SEMPRE EVOLUINDO POR VOCÊ";
  const supportVisible = Boolean(onlineSupportState?.chatEnabled);
  const supportUnreadCount = onlineSupportUnread?.unreadMessages || 0;
  const supportLabelBase = onlineSupportState?.buttonLabel || "ATENDIMENTO ONLINE";
  const supportLabel = supportUnreadCount > 0
    ? `${supportLabelBase} — ${supportUnreadCount} NOVA${supportUnreadCount > 1 ? "S" : ""} MENSAGEM${supportUnreadCount > 1 ? "S" : ""}`
    : supportLabelBase;
  const supportDescription = onlineSupportState?.buttonDescription || "Tire suas dúvidas e fale com nossa equipe.";
  const supportColor = onlineSupportState?.buttonColor || DEFAULT_COLORS.default;
  const supportAvatar = (onlineSupportState as any)?.botAvatar as string | undefined;

  return (
    <div className="h2p-shell" style={{ "--home-font": `'${homeFont}', Inter, system-ui, sans-serif` } as CSSProperties}>
      <div className="h2p-ambient" aria-hidden="true" />
      <main className="h2p-page">
        <nav className="h2p-nav" aria-label="Navegação H2 Colombiano">
          <div className="h2p-nav-brand">{brandTitle}</div>
          <div className="h2p-nav-links">
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>INÍCIO</button>
            <button type="button" onClick={() => go("/login")}>SISTEMA</button>
            <button type="button" onClick={() => document.getElementById("h2p-services")?.scrollIntoView({ behavior: "smooth" })}>SERVIÇOS</button>
            <button type="button" onClick={() => document.getElementById("h2p-plans")?.scrollIntoView({ behavior: "smooth" })}>PLANOS</button>
            <button type="button" onClick={() => document.getElementById("h2p-about")?.scrollIntoView({ behavior: "smooth" })}>SOBRE</button>
            <button type="button" onClick={() => go("/ajuda")}>CONTATO</button>
          </div>
          <button type="button" className="h2p-enter" onClick={() => go("/login")}>ENTRAR</button>
        </nav>

        <section className="h2p-hero">
          <div className="h2p-city" aria-hidden="true" />
          <div className="h2p-beams" aria-hidden="true" />
          <div className="h2p-hero-logo-wrap">
            {showBrandLogo ? (
              <img className="h2p-hero-logo" src={brandLogo} alt={brandTitle} />
            ) : (
              <div className="h2p-logo-fallback">H2</div>
            )}
          </div>

          <div className="h2p-hero-copy">
            <small>MAIS QUE UM SISTEMA • UMA COMUNIDADE</small>
            <h1>{brandTitle}</h1>
            <p>SEMPRE COM VOCÊ</p>
          </div>

          <div className="h2p-car" aria-hidden="true" style={{ transform: "translateY(4px) scale(1.06)", filter: "drop-shadow(0 0 26px rgba(25,134,255,.65))" }}>
            <PremiumExecutiveCar />
          </div>
        </section>

        <section className="h2p-download">
          <div className="h2p-android"><Smartphone /></div>
          <div className="h2p-download-copy">
            <strong>Baixe o app Android</strong>
            <span>Mais praticidade no seu dia a dia</span>
          </div>
          <button type="button" onClick={() => go("/app")}><Download /> BAIXAR</button>
        </section>

        <section id="h2p-plans" className="h2p-app-grid">
          <button type="button" onClick={() => go("/app")} className="h2p-app h2p-app-main">
            <Smartphone />
            <span><strong>Colombiano</strong><small>Sistema completo</small></span>
            <ArrowRight />
          </button>
          <button type="button" onClick={() => go("/app-pro")} className="h2p-app h2p-app-pro">
            <Zap />
            <span><strong>Driver Pro</strong><small>Planilha + Empréstimo</small></span>
            <ArrowRight />
          </button>
        </section>

        <section id="h2p-services" className="h2p-services">
          {buttons.map((button, index) => {
            const kind = keyForButton(button);
            const logoKey = button.id > 0
              ? `home_extra_button_logo_${button.id}`
              : button.id === -2
                ? "home_btn1_logo_url"
                : button.id === -1
                  ? "home_btn2_logo_url"
                  : "";
            const cardLogo = logoKey
              ? (settings as Record<string, string> | undefined)?.[logoKey]?.trim()
              : "";
            const cardColor = button.color || DEFAULT_COLORS[kind];
            const textColor = button.textColor || "#ffffff";
            const subColor = button.subColor || "rgba(255,255,255,.84)";
            const cardStyle = {
              "--card-color": cardColor,
              "--card-text": textColor,
              "--card-sub": subColor,
              fontFamily: button.font ? `'${button.font}', '${homeFont}', sans-serif` : undefined,
            } as CSSProperties;

            return (
              <button
                type="button"
                key={`${button.id}-${index}`}
                className={`h2p-service h2p-${kind}`}
                style={cardStyle}
                onClick={() => go(button.url, Boolean(button.openInNewTab), button.waMsg)}
              >
                <span className="h2p-service-media">
                  {cardLogo ? <img src={cardLogo} alt="" /> : <CardIcon kind={kind} />}
                </span>
                <span className="h2p-service-copy">
                  <strong>{button.text}</strong>
                  <span>{button.subtitle}</span>
                  <small>{CARD_LABELS[kind]}</small>
                </span>
                <span className="h2p-service-watermark"><CardIcon kind={kind} /></span>
                <span className="h2p-service-arrow"><ArrowRight /></span>
              </button>
            );
          })}

          {supportVisible && (
            <button
              type="button"
              className="h2p-service h2p-default"
              style={{
                "--card-color": supportColor,
                "--card-text": "#ffffff",
                "--card-sub": "rgba(255,255,255,.84)",
              } as CSSProperties}
              onClick={() => setOnlineSupportOpen(true)}
            >
              <span className="h2p-service-media">
                {supportAvatar ? <img src={supportAvatar} alt="" /> : <MessageCircle className="h-7 w-7" />}
              </span>
              <span className="h2p-service-copy">
                <strong>{supportLabel}</strong>
                <span>{supportDescription}</span>
                <small>{onlineSupportState?.onlineNow ? "ATENDIMENTO ONLINE" : "FORA DO HORÁRIO"}</small>
              </span>
              <span className="h2p-service-watermark"><MessageCircle className="h-7 w-7" /></span>
              <span className="h2p-service-arrow"><ArrowRight /></span>
            </button>
          )}
        </section>

        <section id="h2p-about" className="h2p-trust">
          <div><ShieldCheck /><span>SEGURANÇA<br />EM PRIMEIRO LUGAR</span></div>
          <div><Users /><span>MILHARES<br />DE CLIENTES</span></div>
          <div><Star /><span>QUALIDADE<br />E COMPROMISSO</span></div>
        </section>

        <footer className="h2p-footer">
          <strong>{brandTitle}</strong>
          <i>•</i>
          <span>{footerText}</span>
        </footer>
      </main>

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
