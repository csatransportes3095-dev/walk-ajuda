import { useEffect } from "react";

const HIDDEN_ATTR = "data-h2-legacy-modules-hidden";
const FORCED_OPEN_ATTR = "data-h2-legacy-modules-forced-open";

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

  return (
    text.includes("TOQUE PARA VER OS SERVICOS") ||
    text.includes("TOQUE PARA VER SERVICOS")
  );
}

function forceLegacyContentOpen(control: HTMLElement) {
  const button = control instanceof HTMLButtonElement
    ? control
    : control.querySelector<HTMLButtonElement>("button") || control;

  const expanded = button.getAttribute("aria-expanded");
  const state = button.getAttribute("data-state");

  // O seletor antigo também controla o container onde os cards reais vivem.
  // Antes de ocultá-lo, mantemos esse container aberto para que o novo botão
  // consiga controlar visualmente a mesma grade de cards.
  if ((expanded === "false" || state === "closed") && button.getAttribute(FORCED_OPEN_ATTR) !== "pending") {
    button.setAttribute(FORCED_OPEN_ATTR, "pending");
    button.click();

    window.setTimeout(() => {
      button.removeAttribute(FORCED_OPEN_ATTR);
    }, 120);
  }

  const controlledId = button.getAttribute("aria-controls");
  if (controlledId) {
    const content = document.getElementById(controlledId);
    if (content) {
      content.removeAttribute("hidden");
      content.setAttribute(FORCED_OPEN_ATTR, "true");
    }
  }
}

function preserveCardsAndHideLegacyControl() {
  if (!window.location.pathname.toLowerCase().startsWith("/gastos")) return;

  const sheet = document.querySelector<HTMLElement>(".spreadsheet-premium") || document.body;
  const candidates = sheet.querySelectorAll<HTMLElement>(
    'button, summary, [role="button"], [data-state="closed"], [data-state="open"]',
  );

  candidates.forEach((element) => {
    if (!isLegacyModulesControl(element)) return;

    forceLegacyContentOpen(element);

    // Esconde SOMENTE o acionador antigo. Os cards e o conteúdo controlado
    // permanecem montados e acessíveis ao novo seletor.
    element.setAttribute(HIDDEN_ATTR, "true");
    element.setAttribute("aria-hidden", "true");
    element.style.setProperty("display", "none", "important");
  });

  // Segurança adicional: se o wrapper legado continuar marcado como fechado,
  // mas contiver a grade real, não permitimos que ele corte os cards.
  const strip = document.querySelector<HTMLElement>("#planilha-modulos .spreadsheet-module-strip");
  if (strip) {
    let parent = strip.parentElement;
    const root = document.getElementById("planilha-modulos");

    while (parent && parent !== root) {
      if (parent.getAttribute("data-state") === "closed") {
        parent.setAttribute(FORCED_OPEN_ATTR, "true");
        parent.style.setProperty("display", "block", "important");
        parent.style.setProperty("overflow", "visible", "important");
        parent.style.setProperty("height", "auto", "important");
        parent.style.setProperty("max-height", "none", "important");
      }
      if (parent.hasAttribute("hidden")) {
        parent.removeAttribute("hidden");
        parent.setAttribute(FORCED_OPEN_ATTR, "true");
      }
      parent = parent.parentElement;
    }
  }
}

export default function SpreadsheetLegacyModulesCleanup() {
  useEffect(() => {
    preserveCardsAndHideLegacyControl();

    const observer = new MutationObserver(() => preserveCardsAndHideLegacyControl());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "data-state", "hidden"],
    });

    window.addEventListener("popstate", preserveCardsAndHideLegacyControl);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", preserveCardsAndHideLegacyControl);
    };
  }, []);

  return (
    <style>{`
      [${HIDDEN_ATTR}="true"] {
        display: none !important;
      }

      [${FORCED_OPEN_ATTR}="true"] {
        visibility: visible !important;
      }
    `}</style>
  );
}
