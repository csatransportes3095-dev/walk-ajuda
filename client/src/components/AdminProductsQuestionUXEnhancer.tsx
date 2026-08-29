import { useEffect } from "react";

const STYLE_ID = "h2-admin-products-question-tree-style";

const styles = `
@media (min-width: 1024px) {
  .h2-question-builder {
    position: relative;
  }

  .h2-question-builder.h2-has-open-editor {
    padding-right: 430px !important;
    min-height: 620px;
  }
}

.h2-question-builder {
  border-color: rgba(168, 85, 247, .42) !important;
  background:
    radial-gradient(circle at top right, rgba(168, 85, 247, .08), transparent 34%),
    rgba(0, 0, 0, .46) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
}

.h2-q-root-branch {
  position: relative;
  margin-bottom: 14px !important;
}

.h2-q-root-card,
.h2-q-sub-card,
.h2-q-subsub-card {
  position: relative;
  overflow: visible !important;
  min-height: 54px;
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, background .18s ease;
}

.h2-q-root-card {
  border: 1px solid rgba(34, 211, 238, .22) !important;
  border-left: 4px solid rgba(34, 211, 238, .78) !important;
  border-radius: 14px !important;
  background: linear-gradient(90deg, rgba(8, 47, 73, .34), rgba(0, 0, 0, .38)) !important;
  padding: 12px 12px 12px 15px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .16);
}

.h2-q-root-card::before {
  content: "PERGUNTA";
  position: absolute;
  left: 13px;
  top: -8px;
  padding: 1px 7px;
  border: 1px solid rgba(34, 211, 238, .32);
  border-radius: 999px;
  background: #07101d;
  color: rgb(103, 232, 249);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .11em;
}

.h2-q-sub-branch {
  position: relative;
  margin-left: 28px !important;
  padding-left: 20px;
  border-left: 2px solid rgba(16, 185, 129, .28);
}

.h2-q-sub-branch::before {
  content: "";
  position: absolute;
  left: -2px;
  top: 25px;
  width: 18px;
  border-top: 2px solid rgba(16, 185, 129, .28);
}

.h2-q-sub-card {
  border: 1px solid rgba(16, 185, 129, .24) !important;
  border-left: 4px solid rgba(16, 185, 129, .72) !important;
  border-radius: 12px !important;
  background: linear-gradient(90deg, rgba(6, 78, 59, .24), rgba(0, 0, 0, .34)) !important;
  padding: 10px 12px !important;
}

.h2-q-sub-card::before {
  content: "SUB";
  position: absolute;
  right: 9px;
  top: -8px;
  padding: 1px 7px;
  border: 1px solid rgba(16, 185, 129, .28);
  border-radius: 999px;
  background: #07110f;
  color: rgb(110, 231, 183);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .08em;
}

.h2-q-subsub-card {
  margin-left: 34px !important;
  border: 1px solid rgba(168, 85, 247, .28) !important;
  border-left: 4px solid rgba(168, 85, 247, .8) !important;
  border-radius: 12px !important;
  background: linear-gradient(90deg, rgba(88, 28, 135, .23), rgba(0, 0, 0, .3)) !important;
  padding: 10px 12px !important;
}

.h2-q-subsub-card::before {
  content: "SUB DA SUB";
  position: absolute;
  right: 9px;
  top: -8px;
  padding: 1px 7px;
  border: 1px solid rgba(168, 85, 247, .3);
  border-radius: 999px;
  background: #120a1d;
  color: rgb(216, 180, 254);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: .08em;
}

.h2-q-root-card:hover,
.h2-q-sub-card:hover,
.h2-q-subsub-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 28px rgba(0,0,0,.24), 0 0 0 1px rgba(255,255,255,.025);
}

.h2-q-selected {
  box-shadow: 0 0 0 2px rgba(217, 70, 239, .72), 0 0 30px rgba(217, 70, 239, .16) !important;
}

.h2-question-builder button[class*="rounded-full"] {
  margin-top: 5px;
  padding: 4px 9px !important;
  font-weight: 800;
}

.h2-q-editor,
.h2-q-new-editor-active {
  z-index: 45;
  border: 1px solid rgba(217, 70, 239, .58) !important;
  border-radius: 18px !important;
  background: linear-gradient(180deg, rgba(22, 19, 31, .985), rgba(9, 10, 17, .99)) !important;
  box-shadow: 0 22px 60px rgba(0, 0, 0, .55), 0 0 0 1px rgba(255,255,255,.025) inset;
}

.h2-q-editor::before,
.h2-q-new-editor-active::before {
  display: block;
  margin-bottom: 10px;
  color: rgb(240, 171, 252);
  font-size: 10px;
  line-height: 1.2;
  font-weight: 900;
  letter-spacing: .14em;
}

.h2-q-editor::before { content: "EDITANDO ITEM DA ÁRVORE"; }
.h2-q-new-editor-active::before { content: "NOVA PERGUNTA CONDICIONAL"; }

@media (min-width: 1024px) {
  .h2-q-editor,
  .h2-q-new-editor-active {
    position: fixed !important;
    top: 78px;
    right: 18px;
    width: min(410px, calc(100vw - 36px));
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 16px !important;
  }
}

@media (max-width: 1023px) {
  .h2-q-editor,
  .h2-q-new-editor-active {
    position: fixed !important;
    left: 10px;
    right: 10px;
    bottom: 10px;
    width: auto;
    max-height: 78vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 14px !important;
  }
}

.h2-q-editor::-webkit-scrollbar,
.h2-q-new-editor-active::-webkit-scrollbar { width: 8px; }
.h2-q-editor::-webkit-scrollbar-thumb,
.h2-q-new-editor-active::-webkit-scrollbar-thumb {
  background: rgba(217, 70, 239, .38);
  border-radius: 99px;
}

.h2-q-condition-chip {
  border-radius: 10px !important;
  padding: 7px 9px !important;
  background: rgba(8, 145, 178, .12) !important;
}

.h2-q-new-form {
  margin-top: 18px !important;
  border-top: 1px dashed rgba(168, 85, 247, .25);
  padding-top: 14px;
}

@media (max-width: 700px) {
  .h2-q-sub-branch {
    margin-left: 12px !important;
    padding-left: 10px;
  }
  .h2-q-subsub-card {
    margin-left: 14px !important;
  }
  .h2-q-root-card,
  .h2-q-sub-card,
  .h2-q-subsub-card {
    align-items: flex-start !important;
    flex-wrap: wrap;
  }
}
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

function findEditor(builder: HTMLElement): HTMLElement | null {
  const inputs = Array.from(builder.querySelectorAll<HTMLInputElement>("input"));
  for (const input of inputs) {
    const parent = input.closest<HTMLElement>('div[class*="border-purple-500/40"]');
    if (!parent) continue;
    const hasSave = Array.from(parent.querySelectorAll("button")).some((button) => /^Salvar|Salvando/.test(textOf(button)));
    const hasQuestionLabel = Array.from(parent.querySelectorAll("label")).some((label) => textOf(label) === "Pergunta");
    if (hasSave && hasQuestionLabel) return parent;
  }
  return null;
}

function enhanceBuilder(builder: HTMLElement) {
  builder.classList.add("h2-question-builder");

  const all = Array.from(builder.querySelectorAll<HTMLElement>("div"));

  for (const element of all) {
    const className = element.className || "";
    const content = textOf(element);

    if (className.includes("bg-black/30") && className.includes("px-3") && className.includes("py-2") && element.parentElement?.className.includes("space-y-1")) {
      element.classList.add("h2-q-root-card");
      element.parentElement?.classList.add("h2-q-root-branch");
    }

    if (className.includes("bg-cyan-500/5") && className.includes("border-l-2")) {
      element.classList.add("h2-q-sub-card");
      const branch = element.parentElement;
      if (branch?.className.includes("ml-6")) branch.classList.add("h2-q-sub-branch");
    }

    if (className.includes("bg-purple-500/5") && className.includes("border-l-2")) {
      element.classList.add("h2-q-subsub-card");
    }

    if (content.includes("Sub-pergunta quando resposta =") && className.includes("border-cyan-500/30")) {
      element.classList.add("h2-q-condition-chip");
    }
  }

  const editor = findEditor(builder);
  builder.classList.toggle("h2-has-open-editor", !!editor);

  builder.querySelectorAll(".h2-q-selected").forEach((element) => element.classList.remove("h2-q-selected"));
  builder.querySelectorAll(".h2-q-editor").forEach((element) => element.classList.remove("h2-q-editor"));
  builder.querySelectorAll(".h2-q-new-editor-active").forEach((element) => element.classList.remove("h2-q-new-editor-active"));

  if (editor) {
    editor.classList.add("h2-q-editor");
    const questionInput = Array.from(editor.querySelectorAll<HTMLInputElement>("input")).find((input) => {
      const label = input.closest("div")?.querySelector("label");
      return textOf(label) === "Pergunta";
    });
    const selectedQuestion = questionInput?.value.trim();
    if (selectedQuestion) {
      const cards = Array.from(builder.querySelectorAll<HTMLElement>(".h2-q-root-card, .h2-q-sub-card, .h2-q-subsub-card"));
      const selected = cards.find((card) => textOf(card).includes(selectedQuestion));
      selected?.classList.add("h2-q-selected");
    }
  }

  const newForms = all.filter((element) => {
    const labels = Array.from(element.querySelectorAll(":scope > div label"));
    const hasQuestion = labels.some((label) => textOf(label) === "Pergunta");
    const hasResponse = labels.some((label) => textOf(label) === "Resposta");
    return element.className.includes("space-y-2") && hasQuestion && hasResponse && !element.className.includes("border-purple-500/40");
  });

  for (const form of newForms) {
    form.classList.add("h2-q-new-form");
    const conditional = textOf(form).includes("Sub-pergunta quando resposta =") || textOf(form).includes("Sub-sub-pergunta quando resposta =");
    if (conditional && !editor) {
      form.classList.add("h2-q-new-editor-active");
      builder.classList.add("h2-has-open-editor");
    }
  }
}

export default function AdminProductsQuestionUXEnhancer() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID) === null) {
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

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", run);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", run);
      cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
