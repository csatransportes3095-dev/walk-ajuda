import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Download,
  Gift,
  ShieldCheck,
  Smartphone,
  Star,
  Users,
  UserPlus,
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
  openInNewTab?: number | boolean | null;
  vipOnly?: number | null;
};

type Palette = {
  from: string;
  to: string;
  glow: string;
  label: string;
};

type CanonicalKind = "pedido" | "acompanhar" | "cadastro" | "gastos" | "emprestimo" | "sorteio";

const PALETTES: Record<string, Palette> = {
  pedido: { from: "#8f19ef", to: "#5a0fbf", glow: "#d13dff", label: "RÁPIDO • SEGURO • SEM BUROCRACIA" },
  acompanhar: { from: "#08a76f", to: "#027a55", glow: "#16f6ab", label: "TRANSPARÊNCIA • ATUALIZAÇÃO CONSTANTE" },
  cadastro: { from: "#149ee9", to: "#0f66cd", glow: "#23c8ff", label: "PRÁTICO • RÁPIDO • 100% ONLINE" },
  gastos: { from: "#ef8a00", to: "#a94b00", glow: "#ffc52d", label: "CONTROLE • RELATÓRIOS • MAIS LUCRO" },
  emprestimo: { from: "#df1738", to: "#8e0d29", glow: "#ff365d", label: "SIMPLES • RÁPIDO • SEGURO" },
  sorteio: { from: "#e01a95", to: "#910d61", glow: "#ff43cf", label: "PARTICIPE • É GRÁTIS • BOA SORTE" },
  default: { from: "#126ed2", to: "#0c438d", glow: "#27bcff", label: "H2 COLOMBIANO • SEMPRE COM VOCÊ" },
};

const CANONICAL: Record<Exclude<CanonicalKind, "pedido" | "acompanhar">, HomeButton> = {
  cadastro: {
    id: -3,
    text: "FAZER MEU CADASTRO",
    subtitle: "Novos clientes - novo cadastro",
    url: "/pre-cadastro",
  },
  gastos: {
    id: -4,
    text: "PLANILHA GASTOS",
    subtitle: "Acesso cliente VIP",
    url: "/gastos",
  },
  emprestimo: {
    id: -5,
    text: "EMPRÉSTIMO",
    subtitle: "Diário para clientes de confiança",
    url: "/emprestimo",
  },
  sorteio: {
    id: -6,
    text: "SORTEIO GRÁTIS",
    subtitle: "Valendo 200,00",
    url: "/sorteio",
  },
};

function keyFor(text: string) {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (value.includes("acompan")) return "acompanhar";
  if (value.includes("cadastro") || value.includes("cadastrar")) return "cadastro";
  if (value.includes("gasto") || value.includes("planilha")) return "gastos";
  if (value.includes("emprest")) return "emprestimo";
  if (value.includes("sorte")) return "sorteio";
  if (value.includes("pedido")) return "pedido";
  return "default";
}

function CardIcon({ kind }: { kind: string }) {
  const cls = "h-7 w-7";
  if (kind === "acompanhar") return <ClipboardCheck className={cls} />;
  if (kind === "cadastro") return <UserPlus className={cls} />;
  if (kind === "gastos") return <BarChart3 className={cls} />;
  if (kind === "emprestimo") return <WalletCards className={cls} />;
  if (kind === "sorteio") return <Gift className={cls} />;
  return <Zap className={cls} />;
}

function go(url: string, newTab = false) {
  if (!url) return;
  if (newTab || /^https?:\/\//i.test(url)) {
    window.open(url, newTab ? "_blank" : "_self", "noopener,noreferrer");
    return;
  }
  window.location.href = url.startsWith("/") ? url : `/${url}`;
}

export default function H2WelcomePremium() {
  const [active, setActive] = useState(false);
  const [legacyRoot, setLegacyRoot] = useState<HTMLElement | null>(null);
  const isHome = typeof window !== "undefined" && window.location.pathname === "/";

  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: isHome });
  const { data: rawButtons = [] } = trpc.homeButtons.listPublic.useQuery(undefined, { enabled: isHome });

  useEffect(() => {
    if (!isHome) return;

    const locate = () => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("div.min-h-screen"));
      const target = candidates.find((node) =>
        node.textContent?.includes("O que você deseja fazer?") &&
        node.textContent?.includes("Baixe o app Android"),
      );

      if (target && target !== legacyRoot) {
        if (legacyRoot) legacyRoot.style.display = "";
        target.style.display = "none";
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
    if (legacyRoot) legacyRoot.style.display = "";
  }, [legacyRoot]);

  const buttons = useMemo(() => {
    const dynamic = (rawButtons as HomeButton[])
      .filter((button) => Number(button.vipOnly || 0) !== 1)
      .map((button) => ({ ...button, subtitle: button.subtitle || "Acesso rápido H2 Colombiano" }));

    const used = new Set<number>();

    const canonicalFromDynamic = (
      kind: Exclude<CanonicalKind, "pedido" | "acompanhar">,
    ): HomeButton => {
      const matched = dynamic.find((button) => keyFor(button.text || "") === kind);
      const fallback = CANONICAL[kind];
      if (!matched) return fallback;
      used.add(matched.id);
      return {
        ...matched,
        text: fallback.text,
        subtitle: fallback.subtitle,
        url: matched.url || fallback.url,
      };
    };

    const essential: HomeButton[] = [
      {
        id: -2,
        text: settings?.home_btn1_text || "FAZER PEDIDO",
        subtitle: settings?.home_btn1_subtitle || "Abrir conta Uber, 99 ou InDrive",
        url: "/login",
        color: settings?.home_btn1_color || "#7c3aed",
      },
      {
        id: -1,
        text: settings?.home_btn2_text || "ACOMPANHAR PEDIDO",
        subtitle: settings?.home_btn2_subtitle || "Acompanhar seu pedido em tempo real",
        url: "/acompanhar",
        color: settings?.home_btn2_color || "#059669",
      },
      canonicalFromDynamic("cadastro"),
      canonicalFromDynamic("gastos"),
      canonicalFromDynamic("emprestimo"),
      canonicalFromDynamic("sorteio"),
    ];

    const remaining = dynamic.filter((button) => !used.has(button.id));
    return [...essential, ...remaining];
  }, [rawButtons, settings]);

  if (!isHome || !active) return null;

  const logo = settings?.login_image_url?.trim() || "/h2-brand-180.png";

  return (
    <div className="h2p-shell">
      <div className="h2p-noise" />
      <main className="h2p-page">
        <nav className="h2p-nav" aria-label="Navegação H2 Colombiano">
          <div className="h2p-nav-brand">H2 <span>COLOMBIANO</span></div>
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
          <div className="h2p-city" />
          <div className="h2p-lights" />
          <div className="h2p-electric h2p-electric-a" />
          <div className="h2p-electric h2p-electric-b" />

          <div className="h2p-side-copy h2p-side-left">PESSOAS<br />VIAGENS<br />CONQUISTAS<br />SEMPRE JUNTOS</div>
          <div className="h2p-side-copy h2p-side-right">MAIS<br />QUE UM<br />SISTEMA<br />UMA<br />COMUNIDADE</div>

          <div className="h2p-hero-logo-wrap">
            <div className="h2p-logo-halo" />
            <img className="h2p-hero-logo" src={logo} alt="H2 Colombiano" />
          </div>

          <div className="h2p-hero-copy">
            <span className="h2p-community">H2 COLOMBIANO</span>
            <h1><b>H2</b><span>COLOMBIANO</span></h1>
            <p>SEMPRE COM VOCÊ</p>
          </div>

          <div className="h2p-car" aria-hidden="true">
            <div className="h2p-car-roof" />
            <div className="h2p-car-body" />
            <div className="h2p-car-window" />
            <div className="h2p-headlight" />
            <div className="h2p-wheel h2p-wheel-a" />
            <div className="h2p-wheel h2p-wheel-b" />
          </div>
        </section>

        <section className="h2p-download">
          <div className="h2p-android"><Smartphone /><span className="h2p-android-dot" /></div>
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
            const kind = keyFor(button.text || "");
            const palette = PALETTES[kind];
            const logoKey = button.id > 0 ? `home_extra_button_logo_${button.id}` : button.id === -2 ? "home_btn1_logo_url" : "home_btn2_logo_url";
            const cardLogo = (settings as Record<string, string> | undefined)?.[logoKey]?.trim();
            return (
              <button
                type="button"
                key={`${button.id}-${index}`}
                className={`h2p-service h2p-${kind}`}
                style={{
                  "--card-from": palette.from,
                  "--card-to": palette.to,
                  "--card-glow": palette.glow,
                } as React.CSSProperties}
                onClick={() => go(button.url, Boolean(button.openInNewTab))}
              >
                <span className="h2p-service-media">
                  {cardLogo ? <img src={cardLogo} alt="" /> : <CardIcon kind={kind} />}
                </span>
                <span className="h2p-service-copy">
                  <strong>{button.text}</strong>
                  <span>{button.subtitle}</span>
                  <small>{palette.label}</small>
                </span>
                <span className="h2p-service-watermark"><CardIcon kind={kind} /></span>
                <span className="h2p-service-arrow"><ArrowRight /></span>
              </button>
            );
          })}
        </section>

        <section id="h2p-about" className="h2p-trust">
          <div><ShieldCheck /><span>SEGURANÇA<br />EM PRIMEIRO LUGAR</span></div>
          <div><Users /><span>MILHARES<br />DE CLIENTES</span></div>
          <div><Star /><span>QUALIDADE<br />E COMPROMISSO</span></div>
        </section>

        <footer className="h2p-footer">
          <span className="h2p-stripes" />
          <strong>H2 COLOMBIANO</strong>
          <i>•</i>
          <span>SEMPRE EVOLUINDO POR VOCÊ</span>
          <span className="h2p-stripes h2p-stripes-right" />
        </footer>
      </main>
    </div>
  );
}
