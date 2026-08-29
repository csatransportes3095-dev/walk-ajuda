import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const MANIFEST_RULES_KEY = "question_blocking_manifest_rules_v1";

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

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function findOptionRoot(builder: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = builder;
  while (current && current !== document.body) {
    const label = current.querySelector<HTMLElement>("span.flex-1.text-sm.font-medium.truncate");
    if (label) return current;
    current = current.parentElement;
  }
  return null;
}

function optionLabelFromRoot(optionRoot: HTMLElement | null): string {
  return optionRoot?.querySelector<HTMLElement>("span.flex-1.text-sm.font-medium.truncate")?.textContent?.trim() || "";
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

function resolveOption(builder: HTMLElement, options: OptionContext[]): OptionContext | null {
  const optionRoot = findOptionRoot(builder);
  const optionLabel = normalize(optionLabelFromRoot(optionRoot));
  const productName = normalize(productNameFromOptionRoot(optionRoot));

  const exact = options.filter((option) =>
    normalize(option.optionLabel) === optionLabel && normalize(option.productName) === productName,
  );
  if (exact.length === 1) return exact[0];

  const byOption = options.filter((option) => normalize(option.optionLabel) === optionLabel);
  return byOption.length === 1 ? byOption[0] : null;
}

function cardLevel(card: HTMLElement): "root" | "sub" | "subsub" {
  if (card.classList.contains("h2-q-subsub-card")) return "subsub";
  if (card.classList.contains("h2-q-sub-card")) return "sub";
  return "root";
}

function resolveQuestionFromDeleteButton(button: HTMLButtonElement, options: OptionContext[]): { option: OptionContext; question: Question } | null {
  const builder = button.closest<HTMLElement>(".h2-question-builder");
  const card = button.closest<HTMLElement>(".h2-q-root-card,.h2-q-sub-card,.h2-q-subsub-card");
  if (!builder || !card) return null;

  const option = resolveOption(builder, options);
  if (!option) return null;

  const level = cardLevel(card);
  const cardText = normalize(card.textContent || "");
  const candidates = option.questions.filter((question) => {
    const questionLevel = !question.parentQuestionId
      ? "root"
      : option.questions.some((candidate) => candidate.id === question.parentQuestionId && candidate.parentQuestionId)
        ? "subsub"
        : "sub";
    return questionLevel === level && cardText.includes(normalize(question.question));
  });

  if (candidates.length === 1) return { option, question: candidates[0] };

  // Fallback: usa o texto mais longo para evitar confundir perguntas curtas contidas em outras.
  const ordered = candidates.sort((a, b) => b.question.length - a.question.length);
  if (ordered.length > 0 && normalize(ordered[0].question) !== normalize(ordered[1]?.question || "")) {
    return { option, question: ordered[0] };
  }
  return null;
}

function descendantsOf(questionId: number, questions: Question[]): Question[] {
  const children = new Map<number, Question[]>();
  for (const question of questions) {
    if (!question.parentQuestionId) continue;
    const list = children.get(question.parentQuestionId) || [];
    list.push(question);
    children.set(question.parentQuestionId, list);
  }

  const result: Question[] = [];
  const visited = new Set<number>();
  const walk = (id: number, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const child of children.get(id) || []) {
      walk(child.id, depth + 1);
      result.push(child);
    }
  };
  walk(questionId, 0);
  return result;
}

function findOrphans(questions: Question[]): Question[] {
  if (questions.length === 0) return [];
  const children = new Map<number, Question[]>();
  const roots = questions.filter((question) => !question.parentQuestionId);

  for (const question of questions) {
    if (!question.parentQuestionId) continue;
    const list = children.get(question.parentQuestionId) || [];
    list.push(question);
    children.set(question.parentQuestionId, list);
  }

  const reachable = new Set<number>();
  const walk = (question: Question) => {
    if (reachable.has(question.id)) return;
    reachable.add(question.id);
    for (const child of children.get(question.id) || []) walk(child);
  };
  for (const root of roots) walk(root);

  return questions.filter((question) => !reachable.has(question.id));
}

function depthInsideSet(question: Question, byId: Map<number, Question>, ids: Set<number>): number {
  let depth = 0;
  let current: Question | undefined = question;
  const seen = new Set<number>();
  while (current?.parentQuestionId && ids.has(current.parentQuestionId)) {
    if (seen.has(current.id)) return 10_000;
    seen.add(current.id);
    current = byId.get(current.parentQuestionId);
    depth += 1;
  }
  return depth;
}

function parseRules(raw: unknown): any[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AdminQuestionDeleteIntegrityEnhancer() {
  const isAdminProducts = typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/admin/products";
  const { data: products = [] } = trpc.products.list.useQuery(undefined, { enabled: isAdminProducts });
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: isAdminProducts });
  const utils = trpc.useUtils();
  const busyRef = useRef(false);
  const orphanFingerprintRef = useRef("");
  const manifestFingerprintRef = useRef("");

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

  const deleteMutation = trpc.productQuestions.delete.useMutation();
  const settingsMutation = trpc.settings.update.useMutation();

  // Corrige automaticamente resíduos deixados pelo comportamento antigo de exclusão.
  useEffect(() => {
    if (!isAdminProducts || busyRef.current || options.length === 0) return;

    const orphanRows: Question[] = [];
    for (const option of options) orphanRows.push(...findOrphans(option.questions));
    if (orphanRows.length === 0) return;

    const orphanIds = Array.from(new Set(orphanRows.map((question) => question.id))).sort((a, b) => a - b);
    const fingerprint = orphanIds.join(",");
    if (orphanFingerprintRef.current === fingerprint) return;
    orphanFingerprintRef.current = fingerprint;

    const allQuestions = options.flatMap((option) => option.questions);
    const byId = new Map(allQuestions.map((question) => [question.id, question]));
    const idSet = new Set(orphanIds);
    const ordered = orphanRows
      .sort((a, b) => depthInsideSet(b, byId, idSet) - depthInsideSet(a, byId, idSet));

    busyRef.current = true;
    void (async () => {
      try {
        for (const question of ordered) await deleteMutation.mutateAsync({ id: question.id });
        await utils.products.list.invalidate();
        toast.success(`${orphanIds.length} pergunta(s) órfã(s) removida(s).`);
      } catch (error: any) {
        console.error("[question-delete-integrity:orphans]", error);
        toast.error(error?.message || "Não foi possível limpar perguntas órfãs.");
      } finally {
        busyRef.current = false;
      }
    })();
  }, [deleteMutation, isAdminProducts, options, utils.products.list]);

  // Remove manifestos que apontam para perguntas que já não existem.
  useEffect(() => {
    if (!isAdminProducts || !settings) return;
    const raw = (settings as Record<string, string>)[MANIFEST_RULES_KEY];
    const rules = parseRules(raw);
    if (rules.length === 0) return;

    const existingIds = new Set(options.flatMap((option) => option.questions.map((question) => question.id)));
    const filtered = rules.filter((rule: any) => existingIds.has(Number(rule?.questionId)));
    if (filtered.length === rules.length) return;

    const payload = JSON.stringify(filtered);
    if (manifestFingerprintRef.current === payload) return;
    manifestFingerprintRef.current = payload;

    void settingsMutation.mutateAsync({ settings: { [MANIFEST_RULES_KEY]: payload } })
      .then(() => utils.settings.getAll.invalidate())
      .catch((error) => console.error("[question-delete-integrity:manifest]", error));
  }, [isAdminProducts, options, settings, settingsMutation, utils.settings.getAll]);

  useEffect(() => {
    if (!isAdminProducts || options.length === 0) return;

    const onClickCapture = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[title="Excluir"]') : null;
      if (!button || !button.closest(".h2-question-builder")) return;

      const resolved = resolveQuestionFromDeleteButton(button, options);
      if (!resolved) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toast.error("Não foi possível identificar esta pergunta para excluir com segurança.");
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (busyRef.current) return;

      const descendants = descendantsOf(resolved.question.id, resolved.option.questions);
      const branch = [...descendants, resolved.question];
      const extra = descendants.length > 0
        ? `\n\nTambém serão excluídas ${descendants.length} sub-pergunta(s) ligada(s) a ela.`
        : "";
      if (!window.confirm(`Excluir esta pergunta?${extra}`)) return;

      busyRef.current = true;
      void (async () => {
        try {
          // Filhos primeiro; o pai é sempre o último item.
          for (const question of branch) await deleteMutation.mutateAsync({ id: question.id });

          const deletedIds = new Set(branch.map((question) => question.id));
          const rawRules = parseRules((settings as Record<string, string> | undefined)?.[MANIFEST_RULES_KEY]);
          if (rawRules.length > 0) {
            const keptRules = rawRules.filter((rule: any) => !deletedIds.has(Number(rule?.questionId)));
            if (keptRules.length !== rawRules.length) {
              await settingsMutation.mutateAsync({
                settings: { [MANIFEST_RULES_KEY]: JSON.stringify(keptRules) },
              });
            }
          }

          await Promise.all([
            utils.products.list.invalidate(),
            utils.settings.getAll.invalidate(),
          ]);
          toast.success(branch.length > 1
            ? `Ramo excluído: ${branch.length} perguntas removidas.`
            : "Pergunta excluída.");
        } catch (error: any) {
          console.error("[question-delete-integrity:branch]", error);
          toast.error(error?.message || "Não foi possível excluir o ramo completo.");
        } finally {
          busyRef.current = false;
        }
      })();
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [deleteMutation, isAdminProducts, options, settings, settingsMutation, utils.products.list, utils.settings.getAll]);

  return null;
}
