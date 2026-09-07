import { useEffect } from "react";

const STYLE_ID = "h2ads-schedule-flat-view-style";
const MODE_ATTR = "data-h2ads-flat-schedule";
const CARD_ATTR = "data-h2ads-flat-card";
const GROUP_ATTR = "data-h2ads-flat-group";
const ROOT_ATTR = "data-h2ads-flat-root";

type FlatMode = "all" | "confirmed" | "pending";

function normalizeText(value: string | null | undefined) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function installStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .h2ads-workspace[${MODE_ATTR}="1"] [${ROOT_ATTR}="1"] { display:grid!important; grid-template-columns:repeat(1,minmax(0,1fr))!important; gap:1rem!important; align-items:start!important; }
    @media (min-width:768px){.h2ads-workspace[${MODE_ATTR}="1"] [${ROOT_ATTR}="1"]{grid-template-columns:repeat(2,minmax(0,1fr))!important;}}
    @media (min-width:1280px){.h2ads-workspace[${MODE_ATTR}="1"] [${ROOT_ATTR}="1"]{grid-template-columns:repeat(4,minmax(0,1fr))!important;}}
    .h2ads-workspace[${MODE_ATTR}="1"] [${GROUP_ATTR}="1"] { display:contents!important; margin:0!important; padding:0!important; border:0!important; background:transparent!important; box-shadow:none!important; }
    .h2ads-workspace[${MODE_ATTR}="1"] [${GROUP_ATTR}="1"] > header { display:none!important; }
    .h2ads-workspace[${MODE_ATTR}="1"] [${GROUP_ATTR}="1"] > div { display:contents!important; }
    .h2ads-workspace[${MODE_ATTR}="1"] [${CARD_ATTR}="hidden"] { display:none!important; }
    .h2ads-workspace[${MODE_ATTR}="1"] [${CARD_ATTR}="visible"] { display:block!important; margin:0!important; min-width:0!important; }
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

function groupSections(workspace: HTMLElement) {
  return Array.from(workspace.querySelectorAll<HTMLElement>("section.mb-4"))
    .filter(section => section.querySelector(":scope > header") && section.querySelector("h4"));
}

function expandAllGroups(workspace: HTMLElement) {
  for (const section of groupSections(workspace)) {
    const hasGrid = Array.from(section.children).some(child => child.tagName === "DIV" && child.classList.contains("grid"));
    if (hasGrid) continue;
    const toggle = section.querySelector<HTMLButtonElement>(":scope > header button[title='Abrir grupo']");
    toggle?.click();
  }
}

function markAllGroups(workspace: HTMLElement) {
  const sections = groupSections(workspace);
  if (!sections.length) return;
  sections.forEach(section => section.setAttribute(GROUP_ATTR, "1"));
  const root = sections[0].parentElement;
  if (root && sections.every(section => section.parentElement === root)) root.setAttribute(ROOT_ATTR, "1");
}

function cards(workspace: HTMLElement) {
  return Array.from(workspace.querySelectorAll<HTMLElement>("article"))
    .filter(article => article.querySelector("[data-h2ads-schedule-marker]"));
}

function reset(workspace: HTMLElement) {
  workspace.removeAttribute(MODE_ATTR);
  cards(workspace).forEach(card => { card.removeAttribute(CARD_ATTR); card.style.removeProperty("order"); });
}

function applyFilterAndOrder(workspace: HTMLElement, mode: FlatMode) {
  if (mode === "all") { reset(workspace); return; }

  workspace.setAttribute(MODE_ATTR, "1");
  markAllGroups(workspace);

  const ordered = cards(workspace).map((card, index) => {
    const marker = card.querySelector<HTMLElement>("[data-h2ads-schedule-marker]");
    const state = marker?.dataset.h2adsScheduleState || "none";
    const sort = marker?.dataset.h2adsScheduleSort || "9999-12-31T23:59";
    const visible = state === mode;
    card.setAttribute(CARD_ATTR, visible ? "visible" : "hidden");
    if (!visible) card.style.removeProperty("order");
    return { card, index, sort, visible };
  }).filter(item => item.visible).sort((a, b) => a.sort.localeCompare(b.sort) || a.index - b.index);

  ordered.forEach((item, index) => { item.card.style.order = String(index + 1); });
}

export default function H2AdsScheduleFlatView() {
  useEffect(() => {
    installStyle();
    let mode: FlatMode = "all";
    let timer = 0;
    let expanding = false;

    const apply = () => {
      if (window.location.pathname !== "/h2ads") return;
      const workspace = document.querySelector<HTMLElement>(".h2ads-workspace");
      if (!workspace) return;

      if (mode !== "all" && !expanding) {
        expanding = true;
        expandAllGroups(workspace);
        window.setTimeout(() => { expanding = false; markAllGroups(workspace); applyFilterAndOrder(workspace, mode); }, 80);
      }
      markAllGroups(workspace);
      applyFilterAndOrder(workspace, mode);
    };

    const scheduleApply = () => { window.clearTimeout(timer); timer = window.setTimeout(apply, 35); };

    const onClick = (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("button");
      if (!button) return;
      const next = buttonMode(button);
      if (!next) return;
      mode = next;
      scheduleApply();
      window.setTimeout(apply, 150);
      window.setTimeout(apply, 450);
      window.setTimeout(apply, 900);
    };

    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:["data-h2ads-schedule-state","data-h2ads-schedule-sort"] });
    scheduleApply();

    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
      window.clearTimeout(timer);
      const workspace = document.querySelector<HTMLElement>(".h2ads-workspace");
      if (workspace) reset(workspace);
    };
  }, []);
  return null;
}
