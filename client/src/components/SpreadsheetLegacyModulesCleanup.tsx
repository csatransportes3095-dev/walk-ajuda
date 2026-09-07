import { useEffect } from "react";

const HIDDEN_ATTR = "data-h2-legacy-modules-hidden";

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isLegacyModulesControl(element: HTMLElement) {
  if (element.classList.contains("h2-modules-launcher")) return false;

  const text = normalize(element.textContent);
  if (!text.includes("MODULOS DA PLANILHA")) return false;

  // Identifica somente o seletor antigo mostrado abaixo do novo.
  return (
    text.includes("TOQUE PARA VER OS SERVICOS") ||
    text.includes("TOQUE PARA VER SERVICOS")
  );
}

function hideLegacyControls() {
  if (!window.location.pathname.toLowerCase().startsWith("/gastos")) return;

  const sheet = document.querySelector<HTMLElement>(".spreadsheet-premium") || document.body;
  const candidates = sheet.querySelectorAll<HTMLElement>(
    'button, summary, [role="button"], [data-state="closed"], [data-state="open"]',
  );

  candidates.forEach((element) => {
    if (!isLegacyModulesControl(element)) return;
    element.setAttribute(HIDDEN_ATTR, "true");
    element.setAttribute("aria-hidden", "true");
    element.style.setProperty("display", "none", "important");
  });
}

export default function SpreadsheetLegacyModulesCleanup() {
  useEffect(() => {
    hideLegacyControls();

    const observer = new MutationObserver(() => hideLegacyControls());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("popstate", hideLegacyControls);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", hideLegacyControls);
    };
  }, []);

  return (
    <style>{`
      [${HIDDEN_ATTR}="true"] {
        display: none !important;
      }
    `}</style>
  );
}
