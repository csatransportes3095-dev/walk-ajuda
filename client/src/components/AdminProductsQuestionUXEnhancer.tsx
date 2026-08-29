import { useEffect } from "react";

const STYLE_ID = "h2-admin-products-question-tree-style";

type AnchorState = {
  button: HTMLElement;
  label: string;
  level: "sub" | "subsub";
};

let activeAnchor: AnchorState | null = null;

const styles = `
.h2-question-builder {
  position: relative;
  border-color: rgba(168,85,247,.42) !important;
  background: radial-gradient(circle at top right, rgba(168,85,247,.08), transparent 34%), rgba(0,0,0,.46) !important;
}
.h2-q-root-branch{position:relative;margin-bottom:14px!important}
.h2-q-root-card,.h2-q-sub-card,.h2-q-subsub-card{position:relative;overflow:visible!important;min-height:54px;transition:.18s ease}
.h2-q-root-card{border:1px solid rgba(34,211,238,.22)!important;border-left:4px solid rgba(34,211,238,.78)!important;border-radius:14px!important;background:linear-gradient(90deg,rgba(8,47,73,.34),rgba(0,0,0,.38))!important;padding:12px 12px 12px 15px!important}
.h2-q-root-card::before{content:"PERGUNTA";position:absolute;left:13px;top:-8px;padding:1px 7px;border:1px solid rgba(34,211,238,.32);border-radius:999px;background:#07101d;color:rgb(103,232,249);font-size:8px;font-weight:900;letter-spacing:.11em}
.h2-q-sub-branch{position:relative;margin-left:28px!important;padding-left:20px;border-left:2px solid rgba(16,185,129,.28)}
.h2-q-sub-branch::before{content:"";position:absolute;left:-2px;top:25px;width:18px;border-top:2px solid rgba(16,185,129,.28)}
.h2-q-sub-card{border:1px solid rgba(16,185,129,.24)!important;border-left:4px solid rgba(16,185,129,.72)!important;border-radius:12px!important;background:linear-gradient(90deg,rgba(6,78,59,.24),rgba(0,0,0,.34))!important;padding:10px 12px!important}
.h2-q-sub-card::before{content:"SUB";position:absolute;right:9px;top:-8px;padding:1px 7px;border:1px solid rgba(16,185,129,.28);border-radius:999px;background:#07110f;color:rgb(110,231,183);font-size:8px;font-weight:900}
.h2-q-subsub-card{margin-left:34px!important;border:1px solid rgba(168,85,247,.28)!important;border-left:4px solid rgba(168,85,247,.8)!important;border-radius:12px!important;background:linear-gradient(90deg,rgba(88,28,135,.23),rgba(0,0,0,.3))!important;padding:10px 12px!important}
.h2-q-subsub-card::before{content:"SUB DA SUB";position:absolute;right:9px;top:-8px;padding:1px 7px;border:1px solid rgba(168,85,247,.3);border-radius:999px;background:#120a1d;color:rgb(216,180,254);font-size:8px;font-weight:900}
.h2-q-selected{box-shadow:0 0 0 2px rgba(217,70,239,.72),0 0 30px rgba(217,70,239,.16)!important}
.h2-question-builder button[class*="rounded-full"]{margin-top:5px;padding:4px 9px!important;font-weight:800}
.h2-q-new-form{margin-top:18px!important;border-top:1px dashed rgba(168,85,247,.25);padding-top:14px}
.h2-q-condition-chip{border-radius:10px!important;padding:7px 9px!important;background:rgba(8,145,178,.12)!important}
.h2-q-smart-summary{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 14px;padding:10px 12px;border:1px solid rgba(59,130,246,.28);border-radius:12px;background:linear-gradient(90deg,rgba(30,64,175,.16),rgba(88,28,135,.12));font-size:10px;color:#cbd5e1}
.h2-q-smart-summary strong{color:#fff}.h2-q-smart-ok{color:#86efac;font-weight:900}.h2-q-smart-note{color:#67e8f9}
.h2-q-inline-editor{z-index:80!important;border:1px solid rgba(217,70,239,.65)!important;border-radius:16px!important;background:linear-gradient(180deg,rgba(22,19,31,.995),rgba(9,10,17,.995))!important;box-shadow:0 22px 60px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.03) inset;padding:14px!important}
.h2-q-inline-editor::before{content:attr(data-h2-context);display:block;margin-bottom:10px;color:#f0abfc;font-size:10px;line-height:1.3;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
@media(min-width:900px){.h2-q-inline-editor{position:fixed!important;width:min(520px,calc(100vw - 36px));max-height:min(680px,calc(100vh - 30px));overflow-y:auto}}
@media(max-width:899px){.h2-q-inline-editor{position:fixed!important;left:10px!important;right:10px!important;bottom:10px!important;top:auto!important;width:auto!important;max-height:78vh;overflow-y:auto}}
.h2-q-anchor-active{box-shadow:0 0 0 2px rgba(34,211,238,.65),0 0 22px rgba(34,211,238,.15)!important}
@media(max-width:700px){.h2-q-sub-branch{margin-left:12px!important;padding-left:10px}.h2-q-subsub-card{margin-left:14px!important}.h2-q-root-card,.h2-q-sub-card,.h2-q-subsub-card{align-items:flex-start!important;flex-wrap:wrap}}
`;

function textOf(element: Element | null): string {
  return (element?.textContent || "").replace(/\s+/g, " ").trim();
}

function directChildren(element: Element): HTMLElement[] {
  return Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function findQuestionBuilder(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("div"));
  for (const candidate of candidates) {
    const ownChildren = directChildren(candidate);
    const hasHeader = ownChildren.some((child) => textOf(child).includes("Perguntas do Formulário"));
    if (hasHeader && textOf(candidate).includes("Copiar de outro produto")) return candidate;
  }
  return null;
}

function classifyTree(builder: HTMLElement) {
  const all = Array.from(builder.querySelectorAll<HTMLElement>("div"));
  for (const element of all) {
    const cls = element.className || "";
    const content = textOf(element);
    if (cls.includes("bg-black/30") && cls.includes("px-3") && cls.includes("py-2") && element.parentElement?.className.includes("space-y-1")) {
      element.classList.add("h2-q-root-card");
      element.parentElement?.classList.add("h2-q-root-branch");
    }
    if (cls.includes("bg-cyan-500/5") && cls.includes("border-l-2")) {
      element.classList.add("h2-q-sub-card");
      if (element.parentElement?.className.includes("ml-6")) element.parentElement.classList.add("h2-q-sub-branch");
    }
    if (cls.includes("bg-purple-500/5") && cls.includes("border-l-2")) element.classList.add("h2-q-subsub-card");
    if (content.includes("Sub-pergunta quando resposta =") && cls.includes("border-cyan-500/30")) element.classList.add("h2-q-condition-chip");
  }
}

function findNewQuestionForm(builder: HTMLElement): HTMLElement | null {
  const candidates = Array.from(builder.querySelectorAll<HTMLElement>("div.space-y-2"));
  for (const element of candidates) {
    const labels = Array.from(element.querySelectorAll("label")).map(textOf);
    if (!labels.includes("Pergunta") || !labels.includes("Resposta")) continue;
    if (element.className.includes("border-purple-500/40")) continue;
    const input = element.querySelector<HTMLInputElement>('input[placeholder*="Qual cidade"]');
    if (input) return element;
  }
  return null;
}

function addSummary(builder: HTMLElement) {
  let summary = builder.querySelector<HTMLElement>(".h2-q-smart-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.className = "h2-q-smart-summary";
    const header = directChildren(builder).find((child) => textOf(child).includes("Perguntas do Formulário"));
    header?.insertAdjacentElement("afterend", summary);
  }
  if (!summary) return;
  const roots = builder.querySelectorAll(".h2-q-root-card").length;
  const subs = builder.querySelectorAll(".h2-q-sub-card").length;
  const subsubs = builder.querySelectorAll(".h2-q-subsub-card").length;
  summary.innerHTML = `<span class="h2-q-smart-ok">✓ ÁRVORE ATIVA</span><span><strong>${roots}</strong> principais</span><span><strong>${subs}</strong> sub</span><span><strong>${subsubs}</strong> sub da sub</span><span class="h2-q-smart-note">Vínculo e condição são preenchidos automaticamente pelo ramo clicado.</span>`;
}

function positionInlineEditor(form: HTMLElement) {
  if (!activeAnchor || !document.body.contains(activeAnchor.button)) return;
  const rect = activeAnchor.button.getBoundingClientRect();
  const width = Math.min(520, window.innerWidth - 36);
  const left = Math.min(Math.max(18, rect.left), Math.max(18, window.innerWidth - width - 18));
  const estimatedHeight = Math.min(680, window.innerHeight - 30);
  let top = rect.bottom + 8;
  if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, rect.top - Math.min(estimatedHeight, 560));
  form.style.left = `${left}px`;
  form.style.top = `${top}px`;
  form.dataset.h2Context = `${activeAnchor.level === "subsub" ? "Nova sub da sub" : "Nova sub-pergunta"} · ${activeAnchor.label}`;
  form.classList.add("h2-q-inline-editor");
  activeAnchor.button.classList.add("h2-q-anchor-active");
}

function enhanceBuilder(builder: HTMLElement) {
  builder.classList.add("h2-question-builder");
  classifyTree(builder);
  addSummary(builder);
  const form = findNewQuestionForm(builder);
  if (form) {
    form.classList.add("h2-q-new-form");
    const isConditional = textOf(form).includes("Sub-pergunta de:") || textOf(form).includes("Sub-pergunta quando resposta =") || textOf(form).includes("Sub-sub-pergunta");
    if (isConditional && activeAnchor) positionInlineEditor(form);
    else {
      form.classList.remove("h2-q-inline-editor");
      form.removeAttribute("data-h2-context");
      form.style.left = ""; form.style.top = "";
    }
  }
}

export default function AdminProductsQuestionUXEnhancer() {
  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = styles;
      document.head.appendChild(style);
    }

    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.location.pathname.toLowerCase() !== "/admin/products") return;
        const builder = findQuestionBuilder();
        if (builder) enhanceBuilder(builder);
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null;
      if (!target) return;
      const label = textOf(target);
      if (label.startsWith("+ sub-pergunta se") || label.startsWith("+ sub-sub se")) {
        document.querySelectorAll(".h2-q-anchor-active").forEach((el) => el.classList.remove("h2-q-anchor-active"));
        activeAnchor = { button: target, label: label.replace(/^\+\s*/, ""), level: label.startsWith("+ sub-sub") ? "subsub" : "sub" };
        setTimeout(run, 0);
      }
      if (label.includes("Cancelar") || label.includes("Pergunta criada")) {
        activeAnchor = null;
        document.querySelectorAll(".h2-q-anchor-active").forEach((el) => el.classList.remove("h2-q-anchor-active"));
      }
    };

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
    document.addEventListener("click", onClick, true);
    window.addEventListener("resize", run);
    window.addEventListener("scroll", run, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", run);
      window.removeEventListener("scroll", run, true);
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
