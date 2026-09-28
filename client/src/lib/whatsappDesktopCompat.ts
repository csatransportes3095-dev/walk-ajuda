import { rewriteWhatsappPrefillUrl } from "@shared/whatsappUrl";

let installed = false;

function rewriteAnchor(anchor: HTMLAnchorElement) {
  const current = anchor.href;
  if (!current) return;
  const rewritten = rewriteWhatsappPrefillUrl(current);
  if (rewritten !== current) anchor.href = rewritten;
}

function rewriteTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
  if (anchor) rewriteAnchor(anchor);
}

export function installWhatsappDesktopCompat() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;

  const originalOpen = window.open.bind(window);
  (window as any).open = (url?: string | URL, target?: string, features?: string) => {
    const next = typeof url === "string" ? rewriteWhatsappPrefillUrl(url) : url;
    return originalOpen(next as any, target, features);
  };

  document.addEventListener("click", (event) => rewriteTarget(event.target), true);
  document.addEventListener("auxclick", (event) => rewriteTarget(event.target), true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof HTMLAnchorElement) {
        rewriteAnchor(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLAnchorElement) rewriteAnchor(node);
        node.querySelectorAll?.("a[href]").forEach((anchor) => rewriteAnchor(anchor as HTMLAnchorElement));
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href"],
  });
}
