import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { OnlineSupportWidget } from "@/components/OnlineSupportWidget";
import "../h2-welcome-premium.css";

type HomeButton = {
  id: number;
  text: string;
  subtitle: string | null;
  url: string;
  waMsg?: string | null;
  openInNewTab?: number | boolean | null;
  vipOnly?: number | null;
};

type CanonicalKind = "cadastro" | "gastos" | "emprestimo" | "sorteio";

const WELCOME_CHOICE_KEY = "walk_welcome_choice";
const ONLINE_SUPPORT_VISITOR_KEY = "walk_online_support_visitor_id";
const ART_PARTS = [
  "/h2ref/home-ref-1.txt",
  "/h2ref/home-ref-2.txt",
  "/h2ref/home-ref-3.txt",
  "/h2ref/home-ref-4.txt",
];

const FALLBACKS: Record<CanonicalKind, HomeButton> = {
  cadastro: { id: -3, text: "FAZER MEU CADASTRO", subtitle: "Novos clientes - novo cadastro", url: "/pre-cadastro" },
  gastos: { id: -4, text: "PLANILHA GASTOS", subtitle: "Acesso cliente VIP", url: "/gastos" },
  emprestimo: { id: -5, text: "EMPRÉSTIMO", subtitle: "Diário para clientes de confiança", url: "/emprestimo" },
  sorteio: { id: -6, text: "SORTEIO GRÁTIS", subtitle: "Valendo 200,00", url: "/sorteio" },
};

function keyFor(text: string): CanonicalKind | null {
  const value = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (value.includes("cadastro") || value.includes("cadastrar")) return "cadastro";
  if (value.includes("gasto") || value.includes("planilha")) return "gastos";
  if (value.includes("emprest")) return "emprestimo";
  if (value.includes("sorte")) return "sorteio";
  return null;
}

function markWelcomeChoice() {
  try {
    sessionStorage.setItem(WELCOME_CHOICE_KEY, "premium");
  } catch {
    // Navegação continua mesmo se o storage estiver indisponível.
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
  const [artSrc, setArtSrc] = useState("");
  const [onlineSupportOpen, setOnlineSupportOpen] = useState(false);
  const [onlineSupportVisitorId] = useState(() => getOrCreateOnlineSupportVisitorId());
  const isHome = typeof window !== "undefined" && window.location.pathname === "/";

  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: isHome });
  const { data: rawButtons = [] } = trpc.homeButtons.listPublic.useQuery(undefined, { enabled: isHome });
  const { data: onlineSupportState } = trpc.onlineSupport.publicState.useQuery(
    { pathname: "/" },
    { enabled: isHome, refetchInterval: 20_000 },
  );
  trpc.onlineSupport.unreadSummary.useQuery(
    { visitorId: onlineSupportVisitorId },
    { enabled: isHome && Boolean(onlineSupportVisitorId), refetchInterval: 5_000 },
  );

  useEffect(() => {
    if (!isHome) return;
    let cancelled = false;

    Promise.all(
      ART_PARTS.map((url) => fetch(url, { cache: "force-cache" }).then((response) => {
        if (!response.ok) throw new Error(`Falha ao carregar arte: ${url}`);
        return response.text();
      })),
    )
      .then((parts) => {
        if (!cancelled) setArtSrc(`data:image/webp;base64,${parts.join("")}`);
      })
      .catch((error) => console.error("[H2 Premium] Arte não carregou", error));

    return () => {
      cancelled = true;
    };
  }, [isHome]);

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

  const canonical = useMemo(() => {
    const dynamic = (rawButtons as HomeButton[]).filter((button) => Number(button.vipOnly || 0) !== 1);

    const resolve = (kind: CanonicalKind): HomeButton => {
      const matched = dynamic.find((button) => keyFor(button.text || "") === kind);
      return matched ? { ...matched, url: matched.url || FALLBACKS[kind].url } : FALLBACKS[kind];
    };

    return {
      pedido: {
        id: -2,
        text: settings?.home_btn1_text || "FAZER PEDIDO",
        subtitle: settings?.home_btn1_subtitle || "Abrir conta Uber, 99 ou InDrive",
        url: settings?.home_btn1_url?.trim() || "/login",
      } as HomeButton,
      acompanhar: {
        id: -1,
        text: settings?.home_btn2_text || "ACOMPANHAR PEDIDO",
        subtitle: settings?.home_btn2_subtitle || "Acompanhar seu pedido em tempo real",
        url: settings?.home_btn2_url?.trim() || "/acompanhar",
      } as HomeButton,
      cadastro: resolve("cadastro"),
      gastos: resolve("gastos"),
      emprestimo: resolve("emprestimo"),
      sorteio: resolve("sorteio"),
    };
  }, [rawButtons, settings]);

  if (!isHome || !active) return null;

  return (
    <div className="h2ref-shell">
      <main className="h2ref-frame" aria-label="H2 Colombiano">
        {artSrc ? (
          <img className="h2ref-art" src={artSrc} alt="H2 Colombiano - Sempre com você" draggable={false} />
        ) : (
          <div className="h2ref-loading">Carregando...</div>
        )}

        <button className="h2ref-hit h2ref-download" type="button" aria-label="Baixar app Android" onClick={() => go("/app")} />
        <button className="h2ref-hit h2ref-colombiano" type="button" aria-label="Baixar Colombiano" onClick={() => go("/app")} />
        <button className="h2ref-hit h2ref-driver" type="button" aria-label="Baixar Driver Pro" onClick={() => go("/app-pro")} />
        <button className="h2ref-hit h2ref-pedido" type="button" aria-label="Fazer pedido" onClick={() => go(canonical.pedido.url, Boolean(canonical.pedido.openInNewTab), canonical.pedido.waMsg)} />
        <button className="h2ref-hit h2ref-acompanhar" type="button" aria-label="Acompanhar pedido" onClick={() => go(canonical.acompanhar.url, Boolean(canonical.acompanhar.openInNewTab), canonical.acompanhar.waMsg)} />
        <button className="h2ref-hit h2ref-cadastro" type="button" aria-label="Fazer meu cadastro" onClick={() => go(canonical.cadastro.url, Boolean(canonical.cadastro.openInNewTab), canonical.cadastro.waMsg)} />
        <button className="h2ref-hit h2ref-gastos" type="button" aria-label="Planilha gastos" onClick={() => go(canonical.gastos.url, Boolean(canonical.gastos.openInNewTab), canonical.gastos.waMsg)} />
        <button className="h2ref-hit h2ref-emprestimo" type="button" aria-label="Empréstimo" onClick={() => go(canonical.emprestimo.url, Boolean(canonical.emprestimo.openInNewTab), canonical.emprestimo.waMsg)} />
        <button className="h2ref-hit h2ref-sorteio" type="button" aria-label="Sorteio grátis" onClick={() => go(canonical.sorteio.url, Boolean(canonical.sorteio.openInNewTab), canonical.sorteio.waMsg)} />

        {onlineSupportState?.chatEnabled && (
          <button
            className="h2ref-support-hit"
            type="button"
            aria-label={onlineSupportState.buttonLabel || "Atendimento online"}
            onClick={() => setOnlineSupportOpen(true)}
          />
        )}
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
