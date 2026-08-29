import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

type QuestionMeta = {
  id: number;
  question: string;
  parentQuestionId: number | null;
  triggerOption: string | null;
};

type ProductLike = {
  options?: Array<{
    questions?: QuestionMeta[];
  }>;
};

type AnswerBlock = {
  question: string;
  answer: string;
};

const FORM_HEADER = "RESPOSTAS DO FORMULARIO:";
const BLOCK_SEPARATOR = "-------------------------";
const BLOCK_MARKER = "*************************";

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

function shortQuestion(value: string, max = 74): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

function parseAnswerBlocks(section: string): AnswerBlock[] {
  return section
    .split(BLOCK_SEPARATOR)
    .map((chunk) => chunk.replace(BLOCK_MARKER, "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      return {
        question: lines[0] || "",
        answer: lines.slice(1).join("\n").trim(),
      };
    })
    .filter((item) => item.question && item.answer);
}

function collectQuestions(products: ProductLike[] | undefined): QuestionMeta[] {
  const result: QuestionMeta[] = [];
  for (const product of products || []) {
    for (const option of product.options || []) {
      for (const question of option.questions || []) {
        if (!question?.id || !question.question) continue;
        result.push({
          id: Number(question.id),
          question: String(question.question),
          parentQuestionId: question.parentQuestionId == null ? null : Number(question.parentQuestionId),
          triggerOption: question.triggerOption == null ? null : String(question.triggerOption),
        });
      }
    }
  }
  return result;
}

function resolveQuestionTree(blocks: AnswerBlock[], questions: QuestionMeta[]) {
  const byText = new Map<string, QuestionMeta[]>();
  const byId = new Map<number, QuestionMeta>();
  for (const question of questions) {
    byId.set(question.id, question);
    const key = normalized(question.question);
    const list = byText.get(key) || [];
    list.push(question);
    byText.set(key, list);
  }

  const selectedIds = new Set<number>();
  const resolved: Array<{ block: AnswerBlock; meta: QuestionMeta | null; depth: number; parent: QuestionMeta | null }> = [];

  const depthOf = (question: QuestionMeta, guard = new Set<number>()): number => {
    if (!question.parentQuestionId || guard.has(question.id)) return 0;
    guard.add(question.id);
    const parent = byId.get(question.parentQuestionId);
    return parent ? 1 + depthOf(parent, guard) : 1;
  };

  for (const block of blocks) {
    const candidates = byText.get(normalized(block.question)) || [];
    const meta =
      candidates.find((candidate) => candidate.parentQuestionId != null && selectedIds.has(candidate.parentQuestionId)) ||
      candidates.find((candidate) => candidate.parentQuestionId == null) ||
      candidates.sort((a, b) => depthOf(a) - depthOf(b))[0] ||
      null;

    if (meta) selectedIds.add(meta.id);
    const parent = meta?.parentQuestionId ? byId.get(meta.parentQuestionId) || null : null;
    resolved.push({ block, meta, depth: meta ? depthOf(meta) : 0, parent });
  }

  return resolved;
}

function formatTreeSection(blocks: AnswerBlock[], questions: QuestionMeta[]): string {
  const resolved = resolveQuestionTree(blocks, questions);
  return resolved.map(({ block, meta, depth, parent }) => {
    if (!meta || depth === 0) {
      return `${BLOCK_SEPARATOR}\n${BLOCK_MARKER}\nPERGUNTA PRINCIPAL\n${block.question}\nRESPOSTA: ${block.answer}`;
    }

    const indent = "   ".repeat(Math.min(depth, 5));
    const parentLabel = parent ? shortQuestion(parent.question) : "pergunta anterior";
    const trigger = meta.triggerOption?.trim();
    const condition = trigger ? ` · ativada pela resposta "${trigger}"` : "";

    return `${BLOCK_SEPARATOR}\n${BLOCK_MARKER}\n${indent}↳ COMPLEMENTO DE: ${parentLabel}${condition}\n${indent}${block.question}\n${indent}RESPOSTA: ${block.answer}`;
  }).join("\n");
}

function rewriteWhatsappMessage(message: string, products: ProductLike[] | undefined): string {
  const headerIndex = message.indexOf(FORM_HEADER);
  if (headerIndex < 0) return message;

  const sectionStart = headerIndex + FORM_HEADER.length;
  const filesIndex = message.indexOf("\n\nARQUIVOS:", sectionStart);
  const sectionEnd = filesIndex >= 0 ? filesIndex : message.length;
  const originalSection = message.slice(sectionStart, sectionEnd);
  const blocks = parseAnswerBlocks(originalSection);
  if (blocks.length === 0) return message;

  const questions = collectQuestions(products);
  if (questions.length === 0) return message;

  const formatted = `\n${formatTreeSection(blocks, questions)}\n${BLOCK_SEPARATOR}\n${BLOCK_MARKER}`;
  return `${message.slice(0, sectionStart)}${formatted}${message.slice(sectionEnd)}`;
}

export default function OrderWhatsappQuestionTreeEnhancer() {
  const enabled = typeof window !== "undefined" && !window.location.pathname.toLowerCase().startsWith("/admin");
  const { data: rawProducts } = trpc.products.listActive.useQuery(undefined, {
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const productsRef = useRef<ProductLike[] | undefined>(undefined);

  useEffect(() => {
    productsRef.current = rawProducts as unknown as ProductLike[] | undefined;
  }, [rawProducts]);

  useEffect(() => {
    if (!enabled) return;
    const originalOpen = window.open.bind(window);

    const enhancedOpen: typeof window.open = ((url?: string | URL, target?: string, features?: string) => {
      try {
        if (url) {
          const parsed = new URL(String(url), window.location.origin);
          const isWhatsapp = parsed.hostname === "wa.me" || parsed.hostname.endsWith("whatsapp.com");
          const text = parsed.searchParams.get("text");
          if (isWhatsapp && text?.includes(FORM_HEADER)) {
            const rewritten = rewriteWhatsappMessage(text, productsRef.current);
            if (rewritten !== text) {
              parsed.searchParams.set("text", rewritten);
              return originalOpen(parsed.toString(), target, features);
            }
          }
        }
      } catch (error) {
        console.warn("[WhatsAppQuestionTree] Não foi possível reorganizar a mensagem; mantendo formato original.", error);
      }
      return originalOpen(url as string | URL | undefined, target, features);
    }) as typeof window.open;

    window.open = enhancedOpen;
    return () => {
      window.open = originalOpen as typeof window.open;
    };
  }, [enabled]);

  return null;
}
