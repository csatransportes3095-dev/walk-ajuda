import { useEffect, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const RULES_KEY = "question_blocking_manifest_rules_v1";
const SYNC_DONE_KEY = "question_blocking_manifest_copy_sync_v1";

type Rule = {
  id: string;
  questionId: number;
  answer: string;
  title: string;
  message: string;
  buttonLabel: string;
  enabled: boolean;
};

type FlatQuestion = {
  id: number;
  optionId: number;
  question: string;
  fieldType: string;
  options: string | null;
  triggerOption: string | null;
  sortOrder: number;
  optionFingerprint: string;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function optionLabels(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalize(typeof item === "string" ? item : String(item?.label || "")))
        .filter(Boolean);
    }
  } catch {}
  return raw.split(",").map(normalize).filter(Boolean);
}

function parseRules(raw: unknown): Rule[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((rule: any) => ({
      id: String(rule.id || `${rule.questionId}:${rule.answer}`),
      questionId: Number(rule.questionId),
      answer: String(rule.answer || ""),
      title: String(rule.title || "Antes de continuar"),
      message: String(rule.message || "Esta resposta não permite continuar com o pedido."),
      buttonLabel: String(rule.buttonLabel || "Voltar e alterar resposta"),
      enabled: rule.enabled !== false,
    })).filter((rule) => Number.isFinite(rule.questionId) && rule.answer.trim());
  } catch {
    return [];
  }
}

function parseDone(raw: unknown): Set<string> {
  if (typeof raw !== "string" || !raw.trim()) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function questionSignature(question: Pick<FlatQuestion, "question" | "fieldType" | "options" | "triggerOption" | "sortOrder">): string {
  return [
    question.sortOrder,
    normalize(question.question),
    normalize(question.fieldType),
    normalize(question.triggerOption || ""),
    optionLabels(question.options).join("|"),
  ].join("::");
}

export default function QuestionManifestCopySync() {
  const isAdminProducts = typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/admin/products";
  const { data: products = [] } = trpc.products.list.useQuery(undefined, { enabled: isAdminProducts });
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: isAdminProducts });
  const utils = trpc.useUtils();
  const lastWriteRef = useRef("");

  const syncMutation = trpc.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.getAll.invalidate();
      toast.success("Manifesto copiado junto com as perguntas.");
    },
    onError: (error) => toast.error(error.message || "Erro ao copiar manifesto das perguntas"),
  });

  const questions = useMemo<FlatQuestion[]>(() => {
    const result: FlatQuestion[] = [];
    for (const product of products as any[]) {
      for (const option of product.options || []) {
        const allQuestions = (option.questions || []) as any[];
        const optionFingerprint = allQuestions
          .map((question) => questionSignature({
            question: String(question.question || ""),
            fieldType: String(question.fieldType || ""),
            options: question.options ?? null,
            triggerOption: question.triggerOption ?? null,
            sortOrder: Number(question.sortOrder || 0),
          }))
          .sort()
          .join("##");

        for (const question of allQuestions) {
          if (question.fieldType !== "select") continue;
          result.push({
            id: Number(question.id),
            optionId: Number(option.id),
            question: String(question.question || ""),
            fieldType: String(question.fieldType || ""),
            options: question.options ?? null,
            triggerOption: question.triggerOption ?? null,
            sortOrder: Number(question.sortOrder || 0),
            optionFingerprint,
          });
        }
      }
    }
    return result;
  }, [products]);

  useEffect(() => {
    if (!isAdminProducts || !settings || questions.length === 0 || syncMutation.isPending) return;

    const rawSettings = settings as Record<string, string>;
    const currentRules = parseRules(rawSettings[RULES_KEY]);
    if (currentRules.length === 0) return;

    const done = parseDone(rawSettings[SYNC_DONE_KEY]);
    const byId = new Map(questions.map((question) => [question.id, question]));
    const existing = new Set(currentRules.map((rule) => `${rule.questionId}:${normalize(rule.answer)}`));
    const nextRules = [...currentRules];
    let copiedCount = 0;

    for (const rule of currentRules) {
      const source = byId.get(rule.questionId);
      if (!source) continue;
      const sourceSignature = questionSignature(source);
      const normalizedAnswer = normalize(rule.answer);

      for (const candidate of questions) {
        if (candidate.id === source.id || candidate.optionId === source.optionId) continue;
        if (candidate.optionFingerprint !== source.optionFingerprint) continue;
        if (questionSignature(candidate) !== sourceSignature) continue;
        if (!optionLabels(candidate.options).includes(normalizedAnswer)) continue;

        const key = `${candidate.id}:${normalizedAnswer}`;
        if (existing.has(key) || done.has(key)) continue;

        nextRules.push({ ...rule, id: key, questionId: candidate.id });
        existing.add(key);
        done.add(key);
        copiedCount += 1;
      }
    }

    if (copiedCount === 0) return;

    const payload = {
      [RULES_KEY]: JSON.stringify(nextRules),
      [SYNC_DONE_KEY]: JSON.stringify(Array.from(done).sort()),
    };
    const fingerprint = JSON.stringify(payload);
    if (lastWriteRef.current === fingerprint) return;
    lastWriteRef.current = fingerprint;
    syncMutation.mutate({ settings: payload });
  }, [isAdminProducts, questions, settings, syncMutation]);

  return null;
}
