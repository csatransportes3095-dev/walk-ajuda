import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";

const PRESET_COLORS = [
  { label: "Verde", value: "#22c55e" },
  { label: "Vermelho", value: "#ef4444" },
  { label: "Amarelo", value: "#eab308" },
  { label: "Azul", value: "#3b82f6" },
  { label: "Roxo", value: "#a855f7" },
  { label: "Laranja", value: "#f97316" },
  { label: "Cinza", value: "#6b7280" },
];

type OptionMeta = {
  label: string;
  color?: string | null;
  blocking?: boolean;
  blockingMessage?: string;
  [key: string]: unknown;
};

type QuestionMeta = {
  id: number;
  question: string;
  options: string | null;
  parentQuestionId: number | null;
  triggerOption: string | null;
};

function parseOptions(raw: string | null): OptionMeta[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => typeof item === "string" ? { label: item } : { ...item, label: String(item?.label || "") })
        .filter((item) => item.label.trim());
    }
  } catch {}
  return raw.split(",").map((label) => ({ label: label.trim() })).filter((item) => item.label);
}

function labelsFromInput(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function findEditForm(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("div"));
  for (const element of candidates) {
    const cls = element.className || "";
    if (!cls.includes("border-purple-500/40") || !cls.includes("space-y-2")) continue;
    const labels = Array.from(element.querySelectorAll("label")).map((label) => (label.textContent || "").trim());
    if (labels.includes("Pergunta") && labels.includes("Resposta")) return element;
  }
  return null;
}

function getQuestionInput(form: HTMLElement): HTMLInputElement | null {
  const labels = Array.from(form.querySelectorAll("label"));
  const label = labels.find((item) => (item.textContent || "").trim() === "Pergunta");
  const parent = label?.parentElement;
  return parent?.querySelector("input") || null;
}

function getOptionsInput(form: HTMLElement): HTMLInputElement | null {
  const labels = Array.from(form.querySelectorAll("label"));
  const label = labels.find((item) => (item.textContent || "").includes("Opções (separadas por vírgula)"));
  const parent = label?.parentElement;
  return parent?.querySelector("input") || null;
}

function getTriggerFromForm(form: HTMLElement): string {
  const text = (form.textContent || "").replace(/\s+/g, " ");
  const match = text.match(/Sub-pergunta quando resposta\s*=\s*([^✕]+?)(?:\s*✕|$)/i);
  return match?.[1]?.trim() || "";
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function AdminQuestionEditOptionsEnhancer() {
  const isAdminProducts = typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/admin/products";
  const { data: products = [] } = trpc.products.list.useQuery(undefined, { enabled: isAdminProducts });
  const [form, setForm] = useState<HTMLElement | null>(null);
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [optionMeta, setOptionMeta] = useState<Record<string, OptionMeta>>({});
  const [revision, setRevision] = useState(0);

  const questions = useMemo<QuestionMeta[]>(() => {
    const result: QuestionMeta[] = [];
    for (const product of products as any[]) {
      for (const option of product.options || []) {
        for (const question of option.questions || []) {
          result.push({
            id: Number(question.id),
            question: String(question.question || ""),
            options: question.options ?? null,
            parentQuestionId: question.parentQuestionId == null ? null : Number(question.parentQuestionId),
            triggerOption: question.triggerOption ?? null,
          });
        }
      }
    }
    return result;
  }, [products]);

  useEffect(() => {
    if (!isAdminProducts) return;

    let frame = 0;
    const inspect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nextForm = findEditForm();
        if (nextForm !== form) setForm(nextForm);
        if (!nextForm) {
          setQuestionId(null);
          return;
        }

        const questionText = getQuestionInput(nextForm)?.value.trim() || "";
        if (!questionText) return;
        const trigger = getTriggerFromForm(nextForm);
        const candidates = questions.filter((question) => question.question.trim() === questionText);
        const matched = candidates.find((question) => !trigger || String(question.triggerOption || "").trim() === trigger) || candidates[0];
        if (!matched) return;

        if (questionId !== matched.id) {
          setQuestionId(matched.id);
          const parsed = parseOptions(matched.options);
          setOptionMeta(Object.fromEntries(parsed.map((item) => [item.label, item])));
          setRevision((value) => value + 1);
        }
      });
    };

    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", inspect, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("input", inspect, true);
      cancelAnimationFrame(frame);
    };
  }, [isAdminProducts, questions, form, questionId]);

  useEffect(() => {
    if (!form || !questionId) return;
    const onSaveCapture = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
      if (!button || !form.contains(button)) return;
      const label = (button.textContent || "").replace(/\s+/g, " ").trim();
      if (label !== "Salvar" && label !== "Salvando...") return;
      if (button.dataset.h2SmartEditPass === "1") {
        delete button.dataset.h2SmartEditPass;
        return;
      }

      const input = getOptionsInput(form);
      if (!input) return;
      const labels = labelsFromInput(input.value);
      if (labels.length === 0) return;

      const encoded = JSON.stringify(labels.map((label) => ({
        ...(optionMeta[label] || {}),
        label,
        color: optionMeta[label]?.color || null,
        blocking: optionMeta[label]?.blocking === true,
      })));

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setReactInputValue(input, encoded);
      button.dataset.h2SmartEditPass = "1";
      window.setTimeout(() => button.click(), 0);
    };
    document.addEventListener("click", onSaveCapture, true);
    return () => document.removeEventListener("click", onSaveCapture, true);
  }, [form, questionId, optionMeta]);

  if (!form || !questionId) return null;
  const optionsInput = getOptionsInput(form);
  if (!optionsInput) return null;
  const labels = labelsFromInput(optionsInput.value);
  if (labels.length === 0) return null;
  const host = optionsInput.parentElement;
  if (!host) return null;

  return createPortal(
    <div key={revision} className="mt-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/15 p-3 space-y-2" data-h2-edit-option-tools>
      <div>
        <p className="text-[10px] font-black text-fuchsia-300">🎨 CORES E REGRAS DAS OPÇÕES</p>
        <p className="text-[10px] text-gray-400">Mesmo controle da criação. As configurações existentes são preservadas ao salvar.</p>
      </div>
      <div className="space-y-2">
        {labels.map((label) => {
          const current = optionMeta[label] || { label };
          return (
            <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="min-w-20 text-[11px] font-bold text-white/80">{label}</span>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setOptionMeta((prev) => ({ ...prev, [label]: { ...(prev[label] || { label }), label, color: preset.value } }))}
                      className="h-5 w-5 rounded-full border-2 transition-transform"
                      style={{ backgroundColor: preset.value, borderColor: current.color === preset.value ? "#fff" : "transparent", transform: current.color === preset.value ? "scale(1.18)" : "scale(1)" }}
                      title={preset.label}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setOptionMeta((prev) => ({ ...prev, [label]: { ...(prev[label] || { label }), label, color: null } }))}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-600 bg-gray-800 text-[9px] text-gray-400"
                    title="Sem cor"
                  >✕</button>
                </div>
                <label className="ml-auto flex cursor-pointer items-center gap-1">
                  <input
                    type="checkbox"
                    checked={current.blocking === true}
                    onChange={(event) => setOptionMeta((prev) => ({ ...prev, [label]: { ...(prev[label] || { label }), label, blocking: event.target.checked } }))}
                    className="h-3.5 w-3.5 accent-red-500"
                  />
                  <span className="text-[10px] font-semibold text-red-400">Bloquear pedido</span>
                </label>
              </div>
              {current.color && <span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${current.color}33`, color: current.color, border: `1px solid ${current.color}66` }}>{label}</span>}
            </div>
          );
        })}
      </div>
    </div>,
    host,
  );
}
