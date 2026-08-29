import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";

const SETTING_KEY = "question_blocking_manifest_rules_v1";

type Rule = {
  id: string;
  questionId: number;
  answer: string;
  title: string;
  message: string;
  buttonLabel: string;
  enabled: boolean;
};

type Question = {
  id: number;
  question: string;
  fieldType: string;
  options: string | null;
};

type Match = {
  question: Question;
  answer: string;
  title: string;
  message: string;
  buttonLabel: string;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
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
    })).filter((rule) => rule.enabled && Number.isFinite(rule.questionId) && rule.answer.trim());
  } catch {
    return [];
  }
}

function parseOptionMeta(raw: string | null): Array<{ label: string; blocking?: boolean; blockingMessage?: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => typeof item === "string" ? { label: item } : {
        label: String(item?.label || ""),
        blocking: item?.blocking === true,
        blockingMessage: typeof item?.blockingMessage === "string" ? item.blockingMessage : undefined,
      }).filter((item) => item.label.trim());
    }
  } catch {}
  return raw.split(",").map((label) => ({ label: label.trim() })).filter((item) => item.label);
}

function elementVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}

function findCurrentQuestion(questions: Question[]): Question | null {
  const visibleTextNodes = Array.from(document.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,label,span"))
    .filter(elementVisible)
    .map((el) => ({ el, text: normalize(el.textContent || "") }))
    .filter((item) => item.text.length > 0);

  for (const question of questions) {
    const wanted = normalize(question.question);
    if (visibleTextNodes.some((item) => item.text === wanted)) return question;
  }
  return null;
}

function answerFromButton(target: EventTarget | null): { button: HTMLButtonElement; answer: string } | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement) || !elementVisible(button)) return null;
  const text = (button.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const lower = text.toLocaleLowerCase("pt-BR");
  if (lower.includes("continuar") || lower === "voltar" || lower.includes("próximo") || lower.includes("fechar")) return null;
  return { button, answer: text };
}

export default function QuestionBlockingManifestGuard() {
  const { data: rawProducts } = trpc.products.listActive.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const [blocked, setBlocked] = useState<Match | null>(null);

  const questions = useMemo<Question[]>(() => {
    const result: Question[] = [];
    for (const product of (rawProducts || []) as any[]) {
      for (const option of product.options || []) {
        for (const question of option.questions || []) {
          if (question.fieldType !== "select") continue;
          result.push({
            id: Number(question.id),
            question: String(question.question || ""),
            fieldType: String(question.fieldType || ""),
            options: question.options ?? null,
          });
        }
      }
    }
    return result;
  }, [rawProducts]);

  const rules = useMemo(() => parseRules((settings as Record<string, string> | undefined)?.[SETTING_KEY]), [settings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname.toLowerCase().startsWith("/admin")) return;
    if (questions.length === 0) return;

    const onClickCapture = (event: MouseEvent) => {
      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const answerHit = answerFromButton(event.target);
      if (!answerHit) return;
      const currentQuestion = findCurrentQuestion(questions);
      if (!currentQuestion) return;

      const normalizedAnswer = normalize(answerHit.answer);
      const configured = rules.find((rule) => rule.questionId === currentQuestion.id && normalize(rule.answer) === normalizedAnswer);
      const legacy = parseOptionMeta(currentQuestion.options).find((opt) => normalize(opt.label) === normalizedAnswer && opt.blocking === true);

      if (!configured && !legacy) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      setBlocked({
        question: currentQuestion,
        answer: configured?.answer || legacy?.label || answerHit.answer,
        title: configured?.title || "Antes de continuar",
        message: configured?.message || legacy?.blockingMessage || "Esta resposta não permite continuar com este pedido. Se você mudar de ideia, volte e escolha outra opção para continuar.",
        buttonLabel: configured?.buttonLabel || "Voltar e alterar resposta",
      });
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [questions, rules, blocked]);

  if (!blocked) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-5 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border-2 border-amber-400/70 bg-[#050812] text-white shadow-[0_30px_100px_rgba(0,0,0,.75)]">
        <div className="border-b border-amber-400/20 bg-amber-500/10 px-6 py-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/40 bg-amber-400/10 text-3xl">⚠️</div>
          <p className="text-xl font-black text-amber-200">{blocked.title}</p>
        </div>
        <div className="space-y-4 px-6 py-6">
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pergunta</p>
            <p className="mt-1 text-sm font-bold leading-relaxed text-white">{blocked.question.question}</p>
            <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Resposta escolhida</p>
            <p className="mt-1 inline-flex rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-black text-red-300">{blocked.answer}</p>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{blocked.message}</p>
          <p className="text-xs leading-relaxed text-slate-500">O pedido não avançou. Você continua nesta mesma pergunta e pode escolher outra resposta.</p>
          <button
            type="button"
            onClick={() => setBlocked(null)}
            className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-black transition hover:bg-amber-400 active:scale-[.99]"
          >
            {blocked.buttonLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
