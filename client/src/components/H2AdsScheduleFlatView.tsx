import { useEffect } from "react";

const STYLE_ID = "h2ads-schedule-flat-view-style";
const MODE_ATTR = "data-h2ads-flat-schedule";
const FILTER_ATTR = "data-h2ads-flat-filter";
const CARD_ATTR = "data-h2ads-flat-card";
const GROUP_ATTR = "data-h2ads-flat-group";
const ROOT_ATTR = "data-h2ads-flat-root";

type FlatMode = "all" | "confirmed" | "pending";

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h2ads-workspace[${MODE_ATTR}="1"] [${ROOT_ATTR}="1"] {
      display: grid !important;
      grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
      gap: 1rem !important;
      align-items: start !important;
    }

    @media (min-width: 768px) {
      .h2ads-workspace[${MODE_ATTR}="1"] [${ROOT_ATTR}="1"] {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }

    @media (min-width: 1280px) {
      .h2ads-workspace[${MODE_ATTR}="1"] [${ROOT_ATTR}="1"] {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }
    }

    /* No filtro de agenda o grupo deixa de existir visualmente. */
    .h2ads-workspace[${MODE_ATTR}="1"] [${GROUP_ATTR}="1"] {
      display: contents !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .h2ads-workspace[${MODE_ATTR}="1"] [${GROUP_ATTR}="1"] > header {
      display: none !important;
    }

    .h2ads-workspace[${MODE_ATTR}="1"] [${GROUP_ATTR}="1"] > div {
      display: contents !important;
    }

    .h2ads-workspace[${MODE_ATTR}="1"] [${CARD_ATTR}="hidden"] {
      display: none !important;
    }

    .h2ads-workspace[${MODE_ATTR}="1"] [${CARD_ATTR}="visible"] {
      display: block !important;
      margin: 0 !important;
      min-width: 0 !important;
    }
  `;
  document.head.appendChild(style);
}

function buttonMode(button: HTMLButtonElement): FlatMode | null {
  const text = normalizeText(button.textContent);
  if (text.includes("AGENDAMENTOS CONFIRMADOS")) return "confirmed";
  if (text.includes("AGUARDANDO AGENDAMENTO")) return "pending";
  if (/^TODOS\b/.test(text)) return "all";
  return null;
}

function findInstanceCards(workspace: HTMLElement) {
  return Array.from(workspace.querySelectorAll<HTMLElement>("article"))
    .filter((article) => article.querySelector("[data-h2ads-schedule-marker]"));
}

function findGroupSection(card: HTMLElement) {
  let node: HTMLElement | null = card.parentElement;
  while (node && !node.classList.contains("h2ads-workspace")) {
    if (node.tagName === "SECTION") {
      const directHeader = Array.from(node.children).find((child) => child.tagName === "HEADER");
      const containsInstanceGrid = Array.from(node.children).some((child) => child.contains(card));
      if (directHeader && containsInstanceGrid) return node;
    }
    node = node.parentElement;
  }
  return null;
}

function markStructure(workspace: HTMLElement) {
  const cards = findInstanceCards(workspace);
  if (!cards.length) return;

  const groupSections = new Set<HTMLElement>();
  for (const card of cards) {
    const group = findGroupSection(card);
    if (group) groupSections.add(group);
  }
  if (!groupSections.size) return;

  groupSections.forEach((section) => section.setAttribute(GROUP_ATTR, "1"));

  const parentCandidates = [...groupSections].map((section) => section.parentElement).filter(Boolean) as HTMLElement[];
  const root = parentCandidates.find((candidate) => [...groupSections].every((section) => section.parentElement === candidate));
  if (root) root.setAttribute(ROOT_ATTR, "1");
}

function applyFilterAndOrder(workspace: HTMLElement, mode: FlatMode) {
  const cards = findInstanceCards(workspace);

  if (mode === "all") {
    workspace.removeAttribute(MODE_ATTR);
    workspace.removeAttribute(FILTER_ATTR);
    cards.forEach((card) => {
      card.removeAttribute(CARD_ATTR);
      card.style.removeProperty("order");
    });
    return;
  }

  workspace.setAttribute(MODE_ATTR, "1");
  workspace.setAttribute(FILTER_ATTR, mode);

  const visible = cards
    .map((card, originalIndex) => {
      const marker = card.querySelector<HTMLElement>("[data-h2ads-schedule-marker]");
      const state = marker?.dataset.h2adsScheduleState || "none";
      const sort = marker?.dataset.h2adsScheduleSort || "9999-12-31T23:59";
      const show = state === mode;
      card.setAttribute(CARD_ATTR, show ? "visible" : "hidden");
      return { card, originalIndex, sort, show };
    })
    .filter((item) => item.show)
    .sort((a, b) => {
      /* Data primeiro, depois hora. O marker já entrega YYYY-MM-DDTHH:mm. */
      const chronological = a.sort.localeCompare(b.sort);
      if (chronological !== 0) return chronological;
      return a.originalIndex - b.originalIndex;
    });

  visible.forEach((item, index) => {
    item.card.style.order = String(index + 1);
  });
}

export default function H2AdsScheduleFlatView() {
  useEffect(() => {
    installStyle();
    let mode: FlatMode = "all";
    let timer = 0;

    const apply = () => {
      if (window.location.pathname !== "/h2ads") return;
      const workspace = document.querySelector<HTMLElement>(".h2ads-workspace");
      if (!workspace) return;
      markStructure(workspace);
      applyFilterAndOrder(workspace, mode);
    };

    const scheduleApply = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 30);
    };

    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button) return;
      const next = buttonMode(button);
      if (!next) return;
      mode = next;
      scheduleApply();
      window.setTimeout(apply, 120);
      window.setTimeout(apply, 350);
      window.setTimeout(apply, 800);
    };

    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-h2ads-schedule-state", "data-h2ads-schedule-sort"] });
    scheduleApply();

    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
      window.clearTimeout(timer);
      const workspace = document.querySelector<HTMLElement>(".h2ads-workspace");
      if (workspace) applyFilterAndOrder(workspace, "all");
    };
  }, []);

  return null;
}
