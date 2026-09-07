import { useEffect } from "react";

const HIDDEN_ATTR = "data-h2-tracking-pin-retired";

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function stripLegacyTrackingPin(message: string) {
  const lines = String(message || "").split(/\r?\n/);
  return lines
    .filter((line) => {
      const clean = normalizeText(line);
      if (/SENHA (?:DE )?(?:ACESSO|ACOMPANHAMENTO)/.test(clean) && /\b\d{4}\b/.test(clean)) return false;
      if (clean.includes("NAO COMPARTILHE ESTA SENHA") && /BLOQUEIO|ACESSO/.test(clean)) return false;
      return true;
    })
    .join("\n")
    .replace(/\{senha\}/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeWhatsappUrl(raw: string | URL) {
  const parsed = new URL(String(raw), window.location.origin);
  const isWhatsapp = parsed.hostname === "wa.me" || parsed.hostname.endsWith("whatsapp.com");
  if (!isWhatsapp) return raw;
  const text = parsed.searchParams.get("text");
  if (!text) return raw;
  const cleaned = stripLegacyTrackingPin(text);
  if (cleaned !== text) parsed.searchParams.set("text", cleaned);
  return parsed.toString();
}

function hideLegacyTrackingPinCards() {
  if (!window.location.pathname.toLowerCase().startsWith("/admin/orders")) return;

  const headings = Array.from(document.querySelectorAll<HTMLElement>("p,div,span,strong"));
  headings.forEach((heading) => {
    if (normalizeText(heading.textContent) !== "SENHA DE ACOMPANHAMENTO DO PEDIDO") return;

    let card: HTMLElement | null = heading.parentElement;
    for (let depth = 0; card && depth < 5; depth += 1, card = card.parentElement) {
      const text = normalizeText(card.textContent);
      const hasLegacyControls = text.includes("SALVAR") && text.includes("GERAR");
      if (!hasLegacyControls) continue;
      card.setAttribute(HIDDEN_ATTR, "true");
      card.setAttribute("aria-hidden", "true");
      card.style.setProperty("display", "none", "important");
      break;
    }
  });

  document.querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"], a[href*="whatsapp.com"]').forEach((anchor) => {
    try {
      const cleaned = sanitizeWhatsappUrl(anchor.href);
      if (typeof cleaned === "string" && cleaned !== anchor.href) anchor.href = cleaned;
    } catch {
      // Mantém o link original se não for uma URL válida.
    }
  });
}

export default function AdminOrderTrackingPinRetirement() {
  useEffect(() => {
    if (!window.location.pathname.toLowerCase().startsWith("/admin/orders")) return;

    const originalOpen = window.open.bind(window);
    const safeOpen: typeof window.open = ((url?: string | URL, target?: string, features?: string) => {
      try {
        if (url) return originalOpen(sanitizeWhatsappUrl(url) as string | URL, target, features);
      } catch {
        // Se houver qualquer falha, preserva o comportamento original.
      }
      return originalOpen(url as string | URL | undefined, target, features);
    }) as typeof window.open;
    window.open = safeOpen;

    hideLegacyTrackingPinCards();
    const observer = new MutationObserver(hideLegacyTrackingPinCards);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.open = originalOpen as typeof window.open;
    };
  }, []);

  return (
    <style>{`
      [${HIDDEN_ATTR}="true"] { display: none !important; }
    `}</style>
  );
}
