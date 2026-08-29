import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const RULES_KEY = "question_blocking_manifest_rules_v1";

type Question = {
  id: number;
  question: string;
  fieldType: string;
  options: string | null;
  isRequired: number;
  sortOrder: number;
  parentQuestionId: number | null;
  triggerOption: string | null;
  helpText?: string | null;
  audioMinDurationSeconds?: number | null;
  audioMaxDurationSeconds?: number | null;
  allowAudioRerecord?: number | null;
  allowAudioFileUpload?: number | null;
  questionPresentation?: string | null;
  showQuestionTextWithAudio?: number | null;
  questionAudioUrl?: string | null;
};

type OptionContext = {
  productId: number;
  productName: string;
  optionId: number;
  optionLabel: string;
  questions: Question[];
};

type ManifestRule = {
  id: string;
  questionId: number;
  answer: string;
  title: string;
  message: string;
  buttonLabel: string;
  enabled: boolean;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toQuestion(raw: any): Question {
  return {
    id: asNumber(raw.id),
    question: String(raw.question || ""),
    fieldType: String(raw.fieldType || "text"),
    options: raw.options == null ? null : String(raw.options),
    isRequired: asNumber(raw.isRequired),
    sortOrder: asNumber(raw.sortOrder),
    parentQuestionId: raw.parentQuestionId == null ? null : asNumber(raw.parentQuestionId),
    triggerOption: raw.triggerOption == null ? null : String(raw.triggerOption),
    helpText: raw.helpText == null ? null : String(raw.helpText),
    audioMinDurationSeconds: raw.audioMinDurationSeconds == null ? null : asNumber(raw.audioMinDurationSeconds),
    audioMaxDurationSeconds: raw.audioMaxDurationSeconds == null ? null : asNumber(raw.audioMaxDurationSeconds),
    allowAudioRerecord: raw.allowAudioRerecord == null ? null : asNumber(raw.allowAudioRerecord),
    allowAudioFileUpload: raw.allowAudioFileUpload == null ? null : asNumber(raw.allowAudioFileUpload),
    questionPresentation: raw.questionPresentation == null ? null : String(raw.questionPresentation),
    showQuestionTextWithAudio: raw.showQuestionTextWithAudio == null ? null : asNumber(raw.showQuestionTextWithAudio),
    questionAudioUrl: raw.questionAudioUrl == null ? null : String(raw.questionAudioUrl),
  };
}

function fingerprint(question: Question): string {
  return JSON.stringify({
    question: question.question.trim(),
    fieldType: question.fieldType,
    options: question.options || "",
    isRequired: question.isRequired,
    sortOrder: question.sortOrder,
    triggerOption: question.triggerOption || "",
    helpText: question.helpText || "",
    audioMinDurationSeconds: question.audioMinDurationSeconds ?? null,
    audioMaxDurationSeconds: question.audioMaxDurationSeconds ?? null,
    allowAudioRerecord: question.allowAudioRerecord ?? null,
    allowAudioFileUpload: question.allowAudioFileUpload ?? null,
    questionPresentation: question.questionPresentation || "text",
    showQuestionTextWithAudio: question.showQuestionTextWithAudio ?? 0,
  });
}

function validateSourceTree(questions: Question[]) {
  const ids = new Set(questions.map((question) => question.id));
  for (const question of questions) {
    if (question.parentQuestionId && !ids.has(question.parentQuestionId)) {
      throw new Error(`A pergunta "${question.question}" possui uma pergunta-pai inexistente na origem.`);
    }
  }

  const byId = new Map(questions.map((question) => [question.id, question]));
  for (const question of questions) {
    const visited = new Set<number>();
    let current: Question | undefined = question;
    while (current?.parentQuestionId) {
      if (visited.has(current.id)) throw new Error("A árvore de origem possui uma condição circular.");
      visited.add(current.id);
      current = byId.get(current.parentQuestionId);
    }
  }
}

function buildIdMap(source: Question[], destination: Question[]): Map<number, number> {
  if (source.length !== destination.length) {
    throw new Error(`Cópia incompleta: origem tem ${source.length} perguntas e destino recebeu ${destination.length}.`);
  }

  const sourceBuckets = new Map<string, Question[]>();
  const destinationBuckets = new Map<string, Question[]>();

  for (const question of source) {
    const key = fingerprint(question);
    sourceBuckets.set(key, [...(sourceBuckets.get(key) || []), question]);
  }
  for (const question of destination) {
    const key = fingerprint(question);
    destinationBuckets.set(key, [...(destinationBuckets.get(key) || []), question]);
  }

  if (sourceBuckets.size !== destinationBuckets.size) {
    throw new Error("Cópia incompleta: os campos das perguntas do destino não correspondem à origem.");
  }

  const idMap = new Map<number, number>();
  for (const [key, sourceItems] of sourceBuckets) {
    const destinationItems = destinationBuckets.get(key);
    if (!destinationItems || destinationItems.length !== sourceItems.length) {
      throw new Error("Cópia incompleta: uma ou mais perguntas/opções não foram copiadas integralmente.");
    }

    const orderedSource = [...sourceItems].sort((a, b) => a.id - b.id);
    const orderedDestination = [...destinationItems].sort((a, b) => a.id - b.id);
    orderedSource.forEach((question, index) => idMap.set(question.id, orderedDestination[index].id));
  }

  if (idMap.size !== source.length) throw new Error("Não foi possível mapear 100% das perguntas copiadas.");
  return idMap;
}

function parseManifestRules(raw: unknown): ManifestRule[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((rule: any) => ({
      id: String(rule.id || `${rule.questionId}:${rule.answer}`),
      questionId: asNumber(rule.questionId),
      answer: String(rule.answer || ""),
      title: String(rule.title || "Antes de continuar"),
      message: String(rule.message || "Esta resposta não permite continuar com o pedido."),
      buttonLabel: String(rule.buttonLabel || "Voltar e alterar resposta"),
      enabled: rule.enabled !== false,
    })).filter((rule) => rule.questionId > 0 && rule.answer.trim());
  } catch {
    return [];
  }
}

function copyManifestRules(
  rules: ManifestRule[],
  sourceIds: Set<number>,
  oldDestinationIds: Set<number>,
  newDestinationIds: Set<number>,
  idMap: Map<number, number>,
): { rules: ManifestRule[]; copied: number } {
  const sourceRules = rules.filter((rule) => sourceIds.has(rule.questionId));
  const kept = rules.filter((rule) => !oldDestinationIds.has(rule.questionId) && !newDestinationIds.has(rule.questionId));
  const cloned: ManifestRule[] = [];

  for (const rule of sourceRules) {
    const newQuestionId = idMap.get(rule.questionId);
    if (!newQuestionId) continue;
    cloned.push({
      ...rule,
      id: `${newQuestionId}:${normalize(rule.answer)}`,
      questionId: newQuestionId,
    });
  }

  const deduped = new Map<string, ManifestRule>();
  for (const rule of [...kept, ...cloned]) {
    deduped.set(`${rule.questionId}:${normalize(rule.answer)}`, rule);
  }
  return { rules: Array.from(deduped.values()), copied: cloned.length };
}

function findQuestionBuilder(modal: HTMLElement): HTMLElement | null {
  const enhanced = modal.closest<HTMLElement>(".h2-question-builder");
  if (enhanced) return enhanced;

  let current: HTMLElement | null = modal.parentElement;
  while (current && current !== document.body) {
    if ((current.textContent || "").includes("Perguntas do Formulário")) return current;
    current = current.parentElement;
  }
  return null;
}

function optionHeader(builder: HTMLElement): { productName: string; optionLabel: string } {
  let current: HTMLElement | null = builder;
  let optionLabel = "";
  let productName = "";

  while (current && current !== document.body) {
    if (!optionLabel) {
      const option = current.querySelector<HTMLElement>("span.flex-1.text-sm.font-medium.truncate");
      if (option) optionLabel = option.textContent?.trim() || "";
    }
    if (!productName) {
      const product = current.querySelector<HTMLElement>("h3.font-bold.text-sm.truncate");
      if (product) productName = product.textContent?.trim() || "";
    }
    if (optionLabel && productName) break;
    current = current.parentElement;
  }

  return { productName, optionLabel };
}

function resolveDestination(modal: HTMLElement, options: OptionContext[]): OptionContext | null {
  const builder = findQuestionBuilder(modal);
  if (!builder) return null;
  const header = optionHeader(builder);
  const productName = normalize(header.productName);
  const optionLabel = normalize(header.optionLabel);

  const exact = options.filter((option) =>
    (!productName || normalize(option.productName) === productName) &&
    (!optionLabel || normalize(option.optionLabel) === optionLabel),
  );
  if (exact.length === 1) return exact[0];

  const visibleRoots = Array.from(builder.querySelectorAll<HTMLElement>(".h2-q-root-card"))
    .map((card) => {
      const preferred = card.querySelector<HTMLElement>("span.text-xs.block.truncate");
      return normalize(preferred?.textContent || "");
    })
    .filter(Boolean);

  const matches = options.filter((option) => {
    const roots = option.questions
      .filter((question) => !question.parentQuestionId)
      .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id))
      .map((question) => normalize(question.question));
    return roots.length === visibleRoots.length && roots.every((value, index) => value === visibleRoots[index]);
  });
  return matches.length === 1 ? matches[0] : null;
}

function resolveSourceButton(button: HTMLButtonElement, options: OptionContext[]): OptionContext | null {
  const text = normalize(button.textContent || "");
  const matches = options.filter((option) => {
    const prefix = normalize(`${option.productName} / ${option.optionLabel}`);
    return text.startsWith(prefix) || text.includes(prefix);
  });
  if (matches.length === 1) return matches[0];

  return matches.sort((a, b) => b.optionLabel.length - a.optionLabel.length)[0] || null;
}

function isCopyModal(element: Element): HTMLElement | null {
  const modal = element.closest<HTMLElement>("div.fixed.inset-0");
  if (!modal) return null;
  return (modal.textContent || "").includes("Copiar perguntas de outro produto") ? modal : null;
}

function finalAudit(source: Question[], destination: Question[], idMap: Map<number, number>) {
  if (source.length !== destination.length) {
    throw new Error(`Auditoria falhou: deveriam existir ${source.length} perguntas, mas existem ${destination.length}.`);
  }
  const destinationById = new Map(destination.map((question) => [question.id, question]));

  for (const sourceQuestion of source) {
    const destinationId = idMap.get(sourceQuestion.id);
    if (!destinationId) throw new Error("Auditoria falhou: pergunta sem correspondência no destino.");
    const destinationQuestion = destinationById.get(destinationId);
    if (!destinationQuestion) throw new Error("Auditoria falhou: pergunta copiada não foi encontrada.");

    const expectedParent = sourceQuestion.parentQuestionId ? idMap.get(sourceQuestion.parentQuestionId) || null : null;
    if ((destinationQuestion.parentQuestionId || null) !== expectedParent) {
      throw new Error(`Auditoria falhou no vínculo da pergunta "${sourceQuestion.question}".`);
    }
    if (fingerprint(destinationQuestion) !== fingerprint(sourceQuestion)) {
      throw new Error(`Auditoria falhou nos dados da pergunta "${sourceQuestion.question}".`);
    }
    if (sourceQuestion.questionPresentation === "audio" && sourceQuestion.questionAudioUrl && !destinationQuestion.questionAudioUrl) {
      throw new Error(`Auditoria falhou: o áudio de "${sourceQuestion.question}" não foi copiado.`);
    }
  }
}

export default function AdminQuestionCopyIntegrityEnhancer() {
  const isAdminProducts = typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/admin/products";
  const { data: products = [] } = trpc.products.list.useQuery(undefined, { enabled: isAdminProducts });
  const utils = trpc.useUtils();
  const selectedSourceRef = useRef<OptionContext | null>(null);
  const busyRef = useRef(false);

  const options = useMemo<OptionContext[]>(() => {
    const result: OptionContext[] = [];
    for (const product of (products || []) as any[]) {
      for (const option of product.options || []) {
        result.push({
          productId: asNumber(product.id),
          productName: String(product.name || ""),
          optionId: asNumber(option.id),
          optionLabel: String(option.label || ""),
          questions: (option.questions || []).map(toQuestion),
        });
      }
    }
    return result;
  }, [products]);

  const copyMutation = trpc.productQuestions.copyFromOption.useMutation();
  const updateMutation = trpc.productQuestions.update.useMutation();
  const settingsMutation = trpc.settings.update.useMutation();

  useEffect(() => {
    if (!isAdminProducts || options.length === 0) return;

    const executeCompleteCopy = async (modal: HTMLElement, confirmButton: HTMLButtonElement) => {
      if (busyRef.current) return;
      const source = selectedSourceRef.current;
      const destination = resolveDestination(modal, options);

      if (!source) {
        toast.error("Selecione novamente a opção de origem para copiar.");
        return;
      }
      if (!destination) {
        toast.error("Não foi possível identificar a opção que receberá a cópia.");
        return;
      }
      if (source.optionId === destination.optionId) {
        toast.error("Origem e destino não podem ser a mesma opção.");
        return;
      }

      const confirmed = window.confirm(
        `SUBSTITUIR 100% das perguntas de "${destination.optionLabel}" pelas de "${source.optionLabel}"?\n\n` +
        "Todas as perguntas atuais do destino serão removidas e a árvore completa da origem será recriada.",
      );
      if (!confirmed) return;

      busyRef.current = true;
      const originalLabel = confirmButton.textContent || "✓ Copiar Perguntas";
      confirmButton.disabled = true;
      confirmButton.textContent = "Copiando 100%...";

      try {
        await utils.productQuestions.listByOption.invalidate({ optionId: source.optionId });
        await utils.productQuestions.listByOption.invalidate({ optionId: destination.optionId });
        const [sourceRaw, oldDestinationRaw, settingsBefore] = await Promise.all([
          utils.productQuestions.listByOption.fetch({ optionId: source.optionId }),
          utils.productQuestions.listByOption.fetch({ optionId: destination.optionId }),
          utils.settings.getAll.fetch(),
        ]);

        const sourceQuestions = ((sourceRaw || []) as any[]).map(toQuestion);
        const oldDestinationQuestions = ((oldDestinationRaw || []) as any[]).map(toQuestion);
        validateSourceTree(sourceQuestions);

        const rulesBefore = parseManifestRules((settingsBefore as Record<string, string> | undefined)?.[RULES_KEY]);
        const sourceIds = new Set(sourceQuestions.map((question) => question.id));
        const oldDestinationIds = new Set(oldDestinationQuestions.map((question) => question.id));

        await copyMutation.mutateAsync({
          fromOptionId: source.optionId,
          toOptionId: destination.optionId,
          toProductId: destination.productId,
        });

        await utils.productQuestions.listByOption.invalidate({ optionId: destination.optionId });
        const copiedRaw = await utils.productQuestions.listByOption.fetch({ optionId: destination.optionId });
        const copiedQuestions = ((copiedRaw || []) as any[]).map(toQuestion);
        const idMap = buildIdMap(sourceQuestions, copiedQuestions);

        // A rota antiga pode criar sub-da-sub antes do pai e perder parentQuestionId.
        // Regrava explicitamente TODO vínculo usando o mapa origem -> destino.
        for (const sourceQuestion of [...sourceQuestions].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id))) {
          const destinationId = idMap.get(sourceQuestion.id);
          if (!destinationId) throw new Error("Falha ao mapear uma pergunta durante a reconstrução da árvore.");
          const expectedParent = sourceQuestion.parentQuestionId ? idMap.get(sourceQuestion.parentQuestionId) : undefined;
          if (sourceQuestion.parentQuestionId && !expectedParent) {
            throw new Error(`Não foi possível reconstruir a sub-pergunta "${sourceQuestion.question}".`);
          }

          await updateMutation.mutateAsync({
            id: destinationId,
            parentQuestionId: expectedParent || null,
            triggerOption: sourceQuestion.triggerOption || null,
            sortOrder: sourceQuestion.sortOrder,
          });
        }

        const newDestinationIds = new Set(Array.from(idMap.values()));
        const manifestCopy = copyManifestRules(
          rulesBefore,
          sourceIds,
          oldDestinationIds,
          newDestinationIds,
          idMap,
        );
        await settingsMutation.mutateAsync({
          settings: { [RULES_KEY]: JSON.stringify(manifestCopy.rules) },
        });

        await utils.productQuestions.listByOption.invalidate({ optionId: destination.optionId });
        const finalRaw = await utils.productQuestions.listByOption.fetch({ optionId: destination.optionId });
        const finalQuestions = ((finalRaw || []) as any[]).map(toQuestion);
        finalAudit(sourceQuestions, finalQuestions, idMap);

        await Promise.all([
          utils.products.list.invalidate(),
          utils.settings.getAll.invalidate(),
        ]);

        toast.success(
          `Cópia 100% concluída: ${sourceQuestions.length} perguntas e ${manifestCopy.copied} manifesto(s) copiados.`,
        );
        selectedSourceRef.current = null;
        const cancel = Array.from(modal.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => normalize(button.textContent || "") === "CANCELAR");
        cancel?.click();
      } catch (error: any) {
        console.error("[question-copy-integrity]", error);
        toast.error(error?.message || "A cópia não passou na auditoria de integridade.");
      } finally {
        busyRef.current = false;
        if (document.body.contains(confirmButton)) {
          confirmButton.disabled = false;
          confirmButton.textContent = originalLabel;
        }
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!button) return;
      const modal = isCopyModal(button);
      if (!modal) return;

      const label = normalize(button.textContent || "");
      if (label === "CANCELAR") {
        selectedSourceRef.current = null;
        return;
      }

      if (!label.includes("COPIAR PERGUNTAS")) {
        const source = resolveSourceButton(button, options);
        if (source) selectedSourceRef.current = source;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void executeCompleteCopy(modal, button);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [copyMutation, isAdminProducts, options, settingsMutation, updateMutation, utils]);

  return null;
}
