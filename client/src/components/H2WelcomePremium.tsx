import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
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

const PALETTES: Record<string, Palette> = {
  pedido: { from: "#8b20e8", to: "#5d16c7", glow: "#c23cff", label: "RÁPIDO • SEGURO • SEM BUROCRACIA" },
  acompanhar: { from: "#05a36f", to: "#047b5d", glow: "#13f3a8", label: "TRANSPARÊNCIA • ATUALIZAÇÃO CONSTANTE" },
  cadastro: { from: "#0e95e9", to: "#1269cf", glow: "#20c9ff", label: "PRÁTICO • RÁPIDO • 100% ONLINE" },
  gastos: { from: "#e58500", to: "#a84a00", glow: "#ffc22e", label: "CONTROLE • RELATÓRIOS • MAIS LUCRO" },
  emprestimo: { from: "#dc1738", to: "#92102b", glow: "#ff345a", label: "SIMPLES • RÁPIDO • SEGURO" },
  sorteio: { from: "#dc168d", to: "#97105f", glow: "#ff3ec8", label: "PARTICIPE • É GRÁTIS • BOA SORTE" },
  default: { from: "#1267c8", to: "#0b3c8c", glow: "#25b8ff", label: "H2 COLOMBIANO • SEMPRE COM VOCÊ" },
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

  useEffect(() => {
    return () => {
      if (legacyRoot) legacyRoot.style.display = "";
    };
  }, [legacyRoot]);

  const buttons = useMemo(() => {
    const dynamic = (rawButtons as HomeButton[])
      .filter((button) => Number(button.vipOnly || 0) !== 1)
      .map((button) => ({
        ...button,
        subtitle: button.subtitle || "Acesso rápido H2 Colombiano",
      }));

    return [
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
      ...dynamic,
    ];
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
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>INÍCIO</button>
            <button onClick={() => go("/login")}>SISTEMA</button>
            <button onClick={() => document.getElementById("h2p-services")?.scrollIntoView({ behavior: "smooth" })}>SERVIÇOS</button>
            <button onClick={() => go("/ajuda")}>AJUDA</button>
          </div>
          <button className="h2p-enter" onClick={() => go("/login")}>ENTRAR</button>
        </nav>

        <section className="h2p-hero">
          <div className="h2p-electric h2p-electric-a" />
          <div className="h2p-electric h2p-electric-b" />
          <div className="h2p-hero-logo-wrap">
            <div className="h2p-logo-halo" />
            <img className="h2p-hero-logo" src={logo} alt="H2 Colombiano" />
          </div>
          <div className="h2p-hero-copy">
            <span className="h2p-community">MAIS QUE UM SISTEMA • UMA COMUNIDADE</span>
            <h1><b>H2</b><span>COLOMBIANO</span></h1>
            <p>SEMPRE COM VOCÊ</p>
          </div>
          <div className="h2p-car" aria-hidden="true">
            <div className="h2p-car-roof" />
            <div className="h2p-car-body" />
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
          <button onClick={() => go("/app")}><Download /> BAIXAR</button>
        </section>

        <section className="h2p-app-grid">
          <button onClick={() => go("/app")} className="h2p-app h2p-app-main">
            <Smartphone />
            <span><strong>Colombiano</strong><small>Sistema completo</small></span>
            <ArrowRight />
          </button>
          <button onClick={() => go("/app-pro")} className="h2p-app h2p-app-pro">
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

        <section className="h2p-trust">
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
