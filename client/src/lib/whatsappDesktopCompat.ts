import { rewriteWhatsappPrefillUrl } from "@shared/whatsappUrl";

let installed = false;

function rewrite(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return rewriteWhatsappPrefillUrl(value);
}

export function installWhatsappDesktopCompat() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;

  const originalOpen = window.open.bind(window);
  (window as any).open = (url?: string | URL, target?: string, features?: string) => {
    const next = typeof url === "string" ? rewriteWhatsappPrefillUrl(url) : url;
    return originalOpen(next as any, target, features);
  };

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const rewritten = rewriteWhatsappPrefillUrl(anchor.href);
    if (rewritten !== anchor.href) anchor.href = rewritten;
  }, true);
}
