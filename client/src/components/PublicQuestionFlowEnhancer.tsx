import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";

type Q = {
  id: number;
  question: string;
  parentQuestionId: number | null;
  triggerOption: string | null;
};

type Candidate = {
  question: Q;
  byId: Map<number, Q>;
};

const STYLE_ID = "h2-public-question-flow-style";

const styles = `
.h2-public-question-flow-card{position:relative!important;border-color:rgba(34,211,238,.35)!important;box-shadow:0 12px 36px rgba(0,0,0,.22)}
.h2-public-question-flow-card[data-h2-level="1"]{border-color:rgba(16,185,129,.42)!important;background-image:linear-gradient(180deg,rgba(6,78,59,.08),transparent)!important}
.h2-public-question-flow-card[data-h2-level="2"]{border-color:rgba(168,85,247,.48)!important;background-image:linear-gradient(180deg,rgba(88,28,135,.1),transparent)!important}
.h2-public-question-flow-card::before{content:attr(data-h2-flow-label);display:inline-flex;margin:0 0 9px;padding:3px 8px;border-radius:999px;border:1px solid rgba(34,211,238,.28);background:rgba(8,47,73,.35);color:#67e8f9;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.h2-public-question-flow-card[data-h2-level="1"]::before{border-color:rgba(16,185,129,.35);background:rgba(6,78,59,.28);color:#6ee7b7}
.h2-public-question-flow-card[data-h2-level="2"]::before{border-color:rgba(168,85,247,.38);background:rgba(88,28,135,.28);color:#d8b4fe}
.h2-public-question-path{margin:0 0 10px;padding:8px 10px;border-left:3px solid rgba(34,211,238,.5);border-radius:0 9px 9px 0;background:rgba(2,6,23,.42);color:#cbd5e1;font-size:10px;line-height:1.45}
.h2-public-question-path strong{color:#fff}.h2-public-question-path .h2-trigger{color:#fde68a;font-weight:800}
.h2-public-question-flow-card[data-h2-level="1"] .h2-public-question-path{border-left-color:rgba(16,185,129,.65)}
.h2-public-question-flow-card[data-h2-level="2"] .h2-public-question-path{border-left-color:rgba(168,85,247,.7)}
`;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

function visible(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function findSmallestQuestionElement(question: string): HTMLElement | null {
  const wanted = normalize(question);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,label,span,div"))
    .filter(visible)
    .filter((el) => normalize(el.textContent || "") === wanted)
    .sort((a, b) => a.childElementCount - b.childElementCount);
  return candidates[0] || null;
}

function findQuestionCard(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element;
  for (let i = 0; i < 7 && current; i += 1, current = current.parentElement) {
    const cls = current.className || "";
    if (typeof cls === "string" && cls.includes("rounded") && (cls.includes("border") || cls.includes("bg-"))) return current;
  }
  return element.parentElement || element;
}

function chainFor(question: Q, byId: Map<number, Q>): Q[] {
  const chain: Q[] = [question];
  const seen = new Set<number>([question.id]);
  let current = question;
  while (current.parentQuestionId) {
    const parent = byId.get(current.parentQuestionId);
    if (!parent || seen.has(parent.id)) break;
    chain.unshift(parent);
    seen.add(parent.id);
    current = parent;
  }
  return chain;
}

function decorate(candidate: Candidate) {
  const target = findSmallestQuestionElement(candidate.question.question);
  if (!target) return false;
  const card = findQuestionCard(target);
  const chain = chainFor(candidate.question, candidate.byId);
  const level = Math.max(0, chain.length - 1);
  const label = level === 0 ? "Pergunta principal" : level === 1 ? "Continuação da resposta" : "Sub da sub · continuação";

  document.querySelectorAll(".h2-public-question-flow-card").forEach((el) => {
    if (el !== card) {
      el.classList.remove("h2-public-question-flow-card");
      el.removeAttribute("data-h2-level");
      el.removeAttribute("data-h2-flow-label");
      el.querySelector(".h2-public-question-path")?.remove();
    }
  });

  card.classList.add("h2-public-question-flow-card");
  card.dataset.h2Level = String(Math.min(level, 2));
  card.dataset.h2FlowLabel = label;

  let path = card.querySelector<HTMLElement>(".h2-public-question-path");
  if (level === 0) {
    path?.remove();
    return true;
  }

  if (!path) {
    path = document.createElement("div");
    path.className = "h2-public-question-path";
    const first = card.firstElementChild;
    if (first) card.insertBefore(path, first);
    else card.prepend(path);
  }

  const parent = chain[chain.length - 2];
  const trigger = candidate.question.triggerOption;
  const breadcrumb = chain.slice(0, -1).map((q) => q.question).join(" → ");
  path.innerHTML = `<strong>Continuação de:</strong> ${breadcrumb}${trigger ? `<br><span class="h2-trigger">Ativada pela resposta: ${trigger}</span>` : ""}${parent ? "" : ""}`;
  return true;
}

export default function PublicQuestionFlowEnhancer() {
  const { data: rawProducts } = trpc.products.listActive.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const candidates = useMemo<Candidate[]>(() => {
    const result: Candidate[] = [];
    const products = (rawProducts || []) as any[];
    for (const product of products) {
      for (const option of product.options || []) {
        const questions = (option.questions || []) as Q[];
        const byId = new Map<number, Q>(questions.map((q) => [q.id, q]));
        for (const question of questions) result.push({ question, byId });
      }
    }
    return result;
  }, [rawProducts]);

  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = styles;
      document.head.appendChild(style);
    }
    if (candidates.length === 0) return;

    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.location.pathname.toLowerCase().startsWith("/admin")) return;
        for (const candidate of candidates) {
          if (decorate(candidate)) break;
        }
      });
    };

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("popstate", run);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", run);
      cancelAnimationFrame(frame);
    };
  }, [candidates]);

  return null;
}
