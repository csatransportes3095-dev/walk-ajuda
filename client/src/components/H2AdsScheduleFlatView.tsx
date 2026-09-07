import { useEffect } from "react";

const STYLE_ID = "h2ads-schedule-flat-view-style";
const MODE_ATTR = "data-h2ads-flat-schedule";

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h2ads-workspace[${MODE_ATTR}="1"] [data-h2ads-flat-root] {
      display: grid !important;
      grid-template-columns: repeat(1, minmax(0, 1fr));
      gap: 1rem !important;
    }
    @media (min-width: 768px) {
      .h2ads-workspace[${MODE_ATTR}="1"] [data-h2ads-flat-root] {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (min-width: 1280px) {
      .h2ads-workspace[${MODE_ATTR}="1"] [data-h2ads-flat-root] {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
    .h2ads-workspace[${MODE_ATTR}="1"] [data-h2ads-flat-group] {
      display: contents !important;
    }
    .h2ads-workspace[${MODE_ATTR}="1"] [data-h2ads-flat-group] > header {
      display: none !important;
    }
    .h2ads-workspace[${MODE_ATTR}="1"] [data-h2ads-flat-group] > div {
      display: contents !important;
    }
  `;
  document.head.appendChild(style);
}

function buttonMode(button: HTMLButtonElement): "all" | "flat" | null {
  const text = (button.textContent || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (text.includes("AGENDAMENTOS CONFIRMADOS")) return "flat";
  if (text.includes("AGUARDANDO AGENDAMENTO")) return "flat";
  if (/^\s*TODOS\b/.test(text)) return "all";
  return null;
}

function markStructure(workspace: HTMLElement) {
  const cards = Array.from(workspace.querySelectorAll<HTMLElement>("article"))
    .filter(article => article.querySelector("[data-h2ads-schedule-marker]"));
  if (!cards.length) return;

  const groupSections = new Set<HTMLElement>();
  for (const card of cards) {
    const groupSection = card.closest<HTMLElement>("section.mb-4");
    if (groupSection) groupSections.add(groupSection);
  }
  if (!groupSections.size) return;

  for (const section of groupSections) section.setAttribute("data-h2ads-flat-group", "1");
  const first = [...groupSections][0];
  const root = first.parentElement;
  if (root) root.setAttribute("data-h2ads-flat-root", "1");
}

function sortCards(workspace: HTMLElement) {
  const cards = Array.from(workspace.querySelectorAll<HTMLElement>("article"))
    .filter(article => article.querySelector("[data-h2ads-schedule-marker]"));
  const ordered = cards
    .map((card, index) => {
      const marker = card.querySelector<HTMLElement>("[data-h2ads-schedule-marker]");
      const sort = marker?.dataset.h2adsScheduleSort || "9999-12-31T23:59";
      return { card, sort, index };
    })
    .sort((a, b) => a.sort.localeCompare(b.sort) || a.index - b.index);

  ordered.forEach((item, index) => {
    item.card.style.order = String(index + 1);
  });
}

function clearCardOrder(workspace: HTMLElement) {
  workspace.querySelectorAll<HTMLElement>("article").forEach(article => {
    if (article.querySelector("[data-h2ads-schedule-marker]")) article.style.removeProperty("order");
  });
}

export default function H2AdsScheduleFlatView() {
  useEffect(() => {
    installStyle();
    let mode: "all" | "flat" = "all";
    let timer = 0;

    const apply = () => {
      if (window.location.pathname !== "/h2ads") return;
      const workspace = document.querySelector<HTMLElement>(".h2ads-workspace");
      if (!workspace) return;
      markStructure(workspace);
      if (mode === "flat") {
        workspace.setAttribute(MODE_ATTR, "1");
        sortCards(workspace);
      } else {
        workspace.removeAttribute(MODE_ATTR);
        clearCardOrder(workspace);
      }
    };

    const scheduleApply = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 40);
    };

    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button) return;
      const next = buttonMode(button);
      if (!next) return;
      mode = next;
      scheduleApply();
      window.setTimeout(apply, 180);
      window.setTimeout(apply, 500);
    };

    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleApply();

    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
      window.clearTimeout(timer);
      const workspace = document.querySelector<HTMLElement>(".h2ads-workspace");
      workspace?.removeAttribute(MODE_ATTR);
    };
  }, []);

  return null;
}
