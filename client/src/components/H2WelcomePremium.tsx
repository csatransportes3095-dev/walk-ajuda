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
  color?: string | null;
  textColor?: string | null;
  subColor?: string | null;
  font?: string | null;
  openInNewTab?: number | boolean | null;
  vipOnly?: number | null;
};

type Kind = "pedido" | "acompanhar" | "cadastro" | "gastos" | "emprestimo" | "sorteio" | "default";

const WELCOME_CHOICE_KEY = "walk_welcome_choice";
const ONLINE_SUPPORT_VISITOR_KEY = "walk_online_support_visitor_id";

const DEFAULT_COLORS: Record<Kind, string> = {
  pedido: "#8f19ef",
  acompanhar: "#08a76f",
  cadastro: "#1598e7",
  gastos: "#e98708",
  emprestimo: "#d8173a",
  sorteio: "#d51693",
  default: "#126ed2",
};

const CARD_LABELS: Record<Kind, string> = {
  pedido: "RÁPIDO • SEGURO • SEM BUROCRACIA",
  acompanhar: "TRANSPARÊNCIA • ATUALIZAÇÃO CONSTANTE",
  cadastro: "PRÁTICO • RÁPIDO • 100% ONLINE",
  gastos: "CONTROLE • RELATÓRIOS • MAIS LUCRO",
  emprestimo: "SIMPLES • RÁPIDO • SEGURO",
  sorteio: "PARTICIPE • É GRÁTIS • BOA SORTE",
  default: "H2 COLOMBIANO • SEMPRE COM VOCÊ",
};

const FALLBACKS: Record<"cadastro" | "gastos" | "emprestimo" | "sorteio", HomeButton> = {
  cadastro: { id: -3, text: "FAZER MEU CADASTRO", subtitle: "Novos clientes - novo cadastro", url: "/pre-cadastro", color: DEFAULT_COLORS.cadastro },
  gastos: { id: -4, text: "PLANILHA GASTOS", subtitle: "Acesso cliente VIP", url: "/gastos", color: DEFAULT_COLORS.gastos },
  emprestimo: { id: -5, text: "EMPRÉSTIMO", subtitle: "Diário para clientes de confiança", url: "/emprestimo", color: DEFAULT_COLORS.emprestimo },
  sorteio: { id: -6, text: "SORTEIO GRÁTIS", subtitle: "Valendo 200,00", url: "/sorteio", color: DEFAULT_COLORS.sorteio },
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function kindFor(button: Pick<HomeButton, "id" | "text" | "url">): Kind {
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

function CardIcon({ kind }: { kind: Kind }) {
  const className = "h-7 w-7";
  if (kind === "acompanhar") return <ClipboardCheck className={className} />;
  if (kind === "cadastro") return <UserPlus className={className} />;
  if (kind === "gastos") return <BarChart3 className={className} />;
  if (kind === "emprestimo") return <WalletCards className={className} />;
  if (kind === "sorteio") return <Gift className={className} />;
  return <Zap className={className} />;
}

function markWelcomeChoice() {
  try { sessionStorage.setItem(WELCOME_CHOICE_KEY, "premium"); } catch { /* noop */ }
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

function getVisitorId() {
  if (typeof window === "undefined") return "";
  try {
    const stored = localStorage.getItem(ONLINE_SUPPORT_VISITOR_KEY);
    if (stored) return stored;
    const created = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ONLINE_SUPPORT_VISITOR_KEY, created);
    return created;
  } catch {
    return `v_${Date.now().toString(36)}`;
  }
}

export default function H2WelcomePremium() {
  const [active, setActive] = useState(false);
  const [legacyRoot, setLegacyRoot] = useState<HTMLElement | null>(null);
  const [onlineSupportOpen, setOnlineSupportOpen] = useState(false);
  const [visitorId] = useState(() => getVisitorId());
  const isHome = typeof window !== "undefined" && window.location.pathname === "/";

  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: isHome });
  const { data: rawButtons = [] } = trpc.homeButtons.listPublic.useQuery(undefined, { enabled: isHome });
  const { data: onlineSupportState } = trpc.onlineSupport.publicState.useQuery(
    { pathname: "/" },
    { enabled: isHome, refetchInterval: 20_000 },
  );
  const { data: unread } = trpc.onlineSupport.unreadSummary.useQuery(
    { visitorId },
    { enabled: isHome && Boolean(visitorId), refetchInterval: 5_000 },
  );

  useEffect(() => {
    if (!isHome) return;

    const locate = () => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("div.min-h-screen"));
      const target = candidates.find((node) =>
        Boolean(node.querySelector("div.w-full.space-y-3")) && node.classList.contains("bg-[#0a0a1a]"),
      ) || candidates.find((node) => node.textContent?.includes("O que você deseja fazer?"));

      if (target && target !== legacyRoot) {
        if (legacyRoot) legacyRoot.style.display = "";
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

    const resolve = (kind: "cadastro" | "gastos" | "emprestimo" | "sorteio") => {
      const matched = dynamic.find((button) => kindFor(button) === kind);
      if (!matched) return FALLBACKS[kind];
      used.add(matched.id);
      return { ...FALLBACKS[kind], ...matched, subtitle: matched.subtitle || FALLBACKS[kind].subtitle, url: matched.url || FALLBACKS[kind].url };
    };

    const essentials: HomeButton[] = [
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

    const remaining = dynamic.filter((button) => !used.has(button.id) && kindFor(button) === "default");
    return [...essentials, ...remaining];
  }, [rawButtons, settings]);

  if (!isHome || !active) return null;

  const brandTitle = settings?.login_title?.trim() || "H2 COLOMBIANO";
  const brandLogo = settings?.login_image_url?.trim() || "/h2-brand-180.png";
  const showBrandLogo = settings?.login_show_image !== "0";
  const homeFont = settings?.home_font || "Inter";
  const footerText = settings?.home_footer_text || "SEMPRE EVOLUINDO POR VOCÊ";
  const supportVisible = Boolean(onlineSupportState?.chatEnabled);
  const supportColor = onlineSupportState?.buttonColor || DEFAULT_COLORS.default;
  const supportAvatar = (onlineSupportState as any)?.botAvatar as string | undefined;
  const unreadCount = unread?.unreadMessages || 0;
  const supportLabel = `${onlineSupportState?.buttonLabel || "ATENDIMENTO ONLINE"}${unreadCount ? ` — ${unreadCount} NOVA${unreadCount > 1 ? "S" : ""}` : ""}`;

  const heroStyle: CSSProperties = {
    gridTemplateColumns: "minmax(96px, 170px) minmax(0, 1fr)",
    minHeight: 220,
    padding: "24px 26px",
  };

  const logoStyle: CSSProperties = {
    width: "min(150px, 28vw)",
    height: "min(150px, 28vw)",
    border: 0,
    padding: 0,
    background: "transparent",
    boxShadow: "none",
    filter: "drop-shadow(0 0 18px rgba(255,196,30,.28)) drop-shadow(0 0 18px rgba(27,130,255,.18))",
  };

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

        <section className="h2p-hero" style={heroStyle}>
          <div className="h2p-city" aria-hidden="true" />
          <div className="h2p-beams" aria-hidden="true" />
          <div className="h2p-hero-logo-wrap">
            {showBrandLogo ? <img className="h2p-hero-logo" style={logoStyle} src={brandLogo} alt={brandTitle} /> : <div className="h2p-logo-fallback">H2</div>}
          </div>
          <div className="h2p-hero-copy" style={{ textAlign: "left", paddingRight: 4 }}>
            <small style={{ letterSpacing: ".08em" }}>MAIS QUE UM SISTEMA • UMA COMUNIDADE</small>
            <h1 style={{ fontSize: "clamp(32px, 7vw, 64px)", lineHeight: .92 }}>{brandTitle}</h1>
            <p style={{ marginTop: 12, fontSize: "clamp(11px, 2.8vw, 17px)", letterSpacing: ".18em" }}>SEMPRE COM VOCÊ</p>
          </div>
        </section>

        <section className="h2p-download" style={{ margin: "0 24px", padding: "11px 16px", borderRadius: 22, gridTemplateColumns: "54px 1fr auto", gap: 13 }}>
          <div className="h2p-android" style={{ width: 48, height: 48, borderRadius: 14 }}><Smartphone /></div>
          <div className="h2p-download-copy">
            <strong style={{ fontSize: "clamp(17px, 4.2vw, 24px)" }}>Baixe o app Android</strong>
            <span style={{ fontSize: "clamp(11px, 2.8vw, 15px)" }}>Mais praticidade no seu dia a dia</span>
          </div>
          <button type="button" style={{ padding: "12px 20px", fontSize: "clamp(13px, 3vw, 17px)" }} onClick={() => go("/app")}><Download /> BAIXAR</button>
        </section>

        <section id="h2p-plans" className="h2p-app-grid">
          <button type="button" onClick={() => go("/app")} className="h2p-app h2p-app-main"><Smartphone /><span><strong>Colombiano</strong><small>Sistema completo</small></span><ArrowRight /></button>
          <button type="button" onClick={() => go("/app-pro")} className="h2p-app h2p-app-pro"><Zap /><span><strong>Driver Pro</strong><small>Planilha + Empréstimo</small></span><ArrowRight /></button>
        </section>

        <section id="h2p-services" className="h2p-services">
          {buttons.map((button, index) => {
            const kind = kindFor(button);
            const settingsAny = settings as any;
            const logoKey = button.id > 0 ? `home_extra_button_logo_${button.id}` : button.id === -2 ? "home_btn1_logo_url" : button.id === -1 ? "home_btn2_logo_url" : "";
            const cardLogo = logoKey ? String(settingsAny?.[logoKey] || "").trim() : "";
            const cardStyle = {
              "--card-color": button.color || DEFAULT_COLORS[kind],
              "--card-text": button.textColor || "#ffffff",
              "--card-sub": button.subColor || "rgba(255,255,255,.84)",
              fontFamily: button.font ? `'${button.font}', '${homeFont}', sans-serif` : undefined,
            } as CSSProperties;

            return (
              <button type="button" key={`${button.id}-${index}`} className={`h2p-service h2p-${kind}`} style={cardStyle} onClick={() => go(button.url, Boolean(button.openInNewTab), button.waMsg)}>
                <span className="h2p-service-media">{cardLogo ? <img src={cardLogo} alt="" /> : <CardIcon kind={kind} />}</span>
                <span className="h2p-service-copy"><strong>{button.text}</strong><span>{button.subtitle}</span><small>{CARD_LABELS[kind]}</small></span>
                <span className="h2p-service-watermark"><CardIcon kind={kind} /></span>
                <span className="h2p-service-arrow"><ArrowRight /></span>
              </button>
            );
          })}

          {supportVisible && (
            <button type="button" className="h2p-service h2p-default" style={{ "--card-color": supportColor, "--card-text": "#ffffff", "--card-sub": "rgba(255,255,255,.84)" } as CSSProperties} onClick={() => setOnlineSupportOpen(true)}>
              <span className="h2p-service-media">{supportAvatar ? <img src={supportAvatar} alt="" /> : <MessageCircle className="h-7 w-7" />}</span>
              <span className="h2p-service-copy"><strong>{supportLabel}</strong><span>{onlineSupportState?.buttonDescription || "Tire suas dúvidas e fale com nossa equipe."}</span><small>{onlineSupportState?.onlineNow ? "ATENDIMENTO ONLINE" : "FORA DO HORÁRIO"}</small></span>
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

        <footer className="h2p-footer"><strong>{brandTitle}</strong><i>•</i><span>{footerText}</span></footer>
      </main>

      <OnlineSupportWidget isOpen={onlineSupportOpen} onClose={() => setOnlineSupportOpen(false)} onMinimize={() => setOnlineSupportOpen(false)} onBack={() => setOnlineSupportOpen(false)} openMode="fullscreen" />
    </div>
  );
}
