import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Question = {
  id: number;
  question: string;
  parentQuestionId: number | null;
  sortOrder: number;
};

type OptionContext = {
  optionId: number;
  optionLabel: string;
  productName: string;
  questions: Question[];
};

type ResolvedContext = {
  builder: HTMLElement;
  option: OptionContext;
  roots: Question[];
  rootIndex: number;
  question: Question;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function sortQuestions<T extends Question>(questions: T[]): T[] {
  return [...questions].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
}

function rootQuestions(questions: Question[]): Question[] {
  return sortQuestions(questions.filter((question) => !question.parentQuestionId));
}

function rootCardText(card: HTMLElement): string {
  const preferred = card.querySelector<HTMLElement>("span.text-xs.block.truncate");
  if (preferred) return preferred.textContent?.trim() || "";

  const spans = Array.from(card.querySelectorAll<HTMLElement>("span"));
  const candidate = spans.find((span) => {
    const text = (span.textContent || "").trim();
    const low = text.toLocaleLowerCase("pt-BR");
    return text.length > 3 && !["select", "text", "audio", "textarea", "*"].includes(low);
  });
  return candidate?.textContent?.trim() || "";
}

function findOptionRoot(builder: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = builder;
  while (current && current !== document.body) {
    const directLabel = Array.from(current.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .flatMap((child) => Array.from(child.querySelectorAll<HTMLElement>("span.flex-1.text-sm.font-medium.truncate")))
      .find((span) => {
        const owner = span.closest<HTMLElement>("div.bg-black\/30.rounded-lg");
        return owner === current;
      });
    if (directLabel) return current;
    current = current.parentElement;
  }
  return null;
}

function optionLabelFromRoot(optionRoot: HTMLElement | null): string {
  if (!optionRoot) return "";
  const span = optionRoot.querySelector<HTMLElement>("span.flex-1.text-sm.font-medium.truncate");
  return span?.textContent?.trim() || "";
}

function productNameFromOptionRoot(optionRoot: HTMLElement | null): string {
  let current = optionRoot?.parentElement || null;
  while (current && current !== document.body) {
    const heading = current.querySelector<HTMLElement>("h3.font-bold.text-sm.truncate");
    if (heading) return heading.textContent?.trim() || "";
    current = current.parentElement;
  }
  return "";
}

function sameSequence(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function resolveOption(
  builder: HTMLElement,
  options: OptionContext[],
): OptionContext | null {
  const optionRoot = findOptionRoot(builder);
  const optionLabel = normalize(optionLabelFromRoot(optionRoot));
  const productName = normalize(productNameFromOptionRoot(optionRoot));
  const visibleRoots = Array.from(builder.querySelectorAll<HTMLElement>(".h2-q-root-card"))
    .map((card) => normalize(rootCardText(card)))
    .filter(Boolean);

  const scored = options.map((option) => {
    const roots = rootQuestions(option.questions).map((question) => normalize(question.question));
    let score = 0;
    if (optionLabel && normalize(option.optionLabel) === optionLabel) score += 30;
    if (productName && normalize(option.productName) === productName) score += 40;
    if (sameSequence(roots, visibleRoots)) score += 50;
    else if (roots.length === visibleRoots.length) score += 5;
    return { option, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    // Em caso de formulários copiados idênticos, só aceita empate se produto + opção
    // identificarem inequivocamente o contexto atual.
    const exact = scored.filter(({ option }) =>
      (!productName || normalize(option.productName) === productName) &&
      (!optionLabel || normalize(option.optionLabel) === optionLabel),
    );
    if (exact.length === 1) return exact[0].option;
    return null;
  }
  return scored[0].option;
}

function resolveContext(button: HTMLButtonElement, options: OptionContext[]): ResolvedContext | null {
  const builder = button.closest<HTMLElement>(".h2-question-builder");
  const rootCard = button.closest<HTMLElement>(".h2-q-root-card");
  if (!builder || !rootCard) return null;

  const option = resolveOption(builder, options);
  if (!option) return null;

  const cards = Array.from(builder.querySelectorAll<HTMLElement>(".h2-q-root-card"));
  const cardIndex = cards.indexOf(rootCard);
  const roots = rootQuestions(option.questions);
  if (cardIndex < 0 || roots.length === 0) return null;

  const cardQuestion = normalize(rootCardText(rootCard));
  let rootIndex = cardIndex;
  if (!roots[rootIndex] || normalize(roots[rootIndex].question) !== cardQuestion) {
    const matches = roots
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => normalize(question.question) === cardQuestion);
    if (matches.length !== 1) return null;
    rootIndex = matches[0].index;
  }

  const question = roots[rootIndex];
  if (!question) return null;
  return { builder, option, roots, rootIndex, question };
}

function flattenTree(questions: Question[], orderedRoots: Question[]): Question[] {
  const children = new Map<number, Question[]>();
  for (const question of questions) {
    if (!question.parentQuestionId) continue;
    const list = children.get(question.parentQuestionId) || [];
    list.push(question);
    children.set(question.parentQuestionId, list);
  }
  for (const [parentId, list] of children) children.set(parentId, sortQuestions(list));

  const result: Question[] = [];
  const visited = new Set<number>();
  const walk = (question: Question) => {
    if (visited.has(question.id)) return;
    visited.add(question.id);
    result.push(question);
    for (const child of children.get(question.id) || []) walk(child);
  };

  for (const root of orderedRoots) walk(root);
  for (const question of sortQuestions(questions)) {
    if (!visited.has(question.id)) walk(question);
  }
  return result;
}

export default function AdminQuestionTreeOrderEnhancer() {
  const isAdminProducts = typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/admin/products";
  const { data: products = [] } = trpc.products.list.useQuery(undefined, { enabled: isAdminProducts });
  const utils = trpc.useUtils();
  const busyRef = useRef(false);

  const options = useMemo<OptionContext[]>(() => {
    const result: OptionContext[] = [];
    for (const product of (products || []) as any[]) {
      for (const option of product.options || []) {
        result.push({
          optionId: Number(option.id),
          optionLabel: String(option.label || ""),
          productName: String(product.name || ""),
          questions: (option.questions || []).map((question: any) => ({
            id: Number(question.id),
            question: String(question.question || ""),
            parentQuestionId: question.parentQuestionId == null ? null : Number(question.parentQuestionId),
            sortOrder: Number(question.sortOrder || 0),
          })),
        });
      }
    }
    return result;
  }, [products]);

  const reorderMutation = trpc.productQuestions.reorder.useMutation({
    onSuccess: async () => {
      await utils.products.list.invalidate();
      toast.success("Ordem das perguntas atualizada.");
    },
    onError: (error) => {
      toast.error(error.message || "Não foi possível ordenar as perguntas.");
    },
    onSettled: () => {
      busyRef.current = false;
    },
  });

  useEffect(() => {
    if (!isAdminProducts || options.length === 0) return;

    let frame = 0;
    const syncButtons = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const builders = Array.from(document.querySelectorAll<HTMLElement>(".h2-question-builder"));
        for (const builder of builders) {
          const option = resolveOption(builder, options);
          if (!option) continue;
          const roots = rootQuestions(option.questions);
          const cards = Array.from(builder.querySelectorAll<HTMLElement>(".h2-q-root-card"));
          cards.forEach((card, index) => {
            const up = card.querySelector<HTMLButtonElement>('button[title="Mover para cima"]');
            const down = card.querySelector<HTMLButtonElement>('button[title="Mover para baixo"]');
            if (up) up.disabled = index <= 0;
            if (down) down.disabled = index >= roots.length - 1;
          });
        }
      });
    };

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!target) return;
      const title = target.getAttribute("title");
      if (title !== "Mover para cima" && title !== "Mover para baixo") return;
      if (!target.closest(".h2-question-builder")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (target.disabled || busyRef.current) return;
      const context = resolveContext(target, options);
      if (!context) {
        toast.error("Não foi possível identificar esta pergunta para ordenar.");
        return;
      }

      const direction = title === "Mover para cima" ? "up" : "down";
      const swapIndex = direction === "up" ? context.rootIndex - 1 : context.rootIndex + 1;
      if (swapIndex < 0 || swapIndex >= context.roots.length) return;

      const orderedRoots = [...context.roots];
      [orderedRoots[context.rootIndex], orderedRoots[swapIndex]] = [orderedRoots[swapIndex], orderedRoots[context.rootIndex]];

      const flattened = flattenTree(context.option.questions, orderedRoots);
      const items = flattened.map((question, index) => ({ id: question.id, sortOrder: index + 1 }));

      busyRef.current = true;
      reorderMutation.mutate({ items });
    };

    syncButtons();
    const observer = new MutationObserver(syncButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClickCapture, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClickCapture, true);
      cancelAnimationFrame(frame);
    };
  }, [isAdminProducts, options, reorderMutation]);

  return null;
}
