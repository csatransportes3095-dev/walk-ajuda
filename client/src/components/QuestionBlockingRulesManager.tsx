import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

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

type FlatQuestion = Question & {
  productName: string;
  optionName: string;
};

function parseOptions(raw: string | null): Array<{ label: string; blocking?: boolean; blockingMessage?: string }> {
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

function parseRules(raw: unknown): Rule[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean).map((rule: any) => ({
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

export default function QuestionBlockingRulesManager() {
  const isAdminProducts = typeof window !== "undefined" && window.location.pathname.toLowerCase() === "/admin/products";
  const [open, setOpen] = useState(false);
  const { data: products = [], refetch: refetchProducts } = trpc.products.list.useQuery(undefined, {
    enabled: isAdminProducts,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: isAdminProducts });
  const utils = trpc.useUtils();
  const saveMutation = trpc.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.getAll.invalidate();
      toast.success("Regras de bloqueio salvas!");
    },
    onError: (error) => toast.error(error.message || "Erro ao salvar regras"),
  });

  const [rules, setRules] = useState<Rule[]>([]);
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [title, setTitle] = useState("Antes de continuar");
  const [message, setMessage] = useState("");
  const [buttonLabel, setButtonLabel] = useState("Voltar e alterar resposta");

  useEffect(() => {
    if (!settings) return;
    setRules(parseRules((settings as Record<string, string>)[SETTING_KEY]));
  }, [settings]);

  // O editor de perguntas e este manifesto usam a mesma lista de produtos, mas o modal
  // pode permanecer montado com um snapshot antigo. Ao abrir, força uma leitura nova e,
  // enquanto estiver aberto, sincroniza a cada 1 segundo. Assim perguntas recém-criadas,
  // editadas, copiadas ou removidas aparecem sem F5 e sem fechar o painel administrativo.
  useEffect(() => {
    if (!open || !isAdminProducts) return;
    void refetchProducts();
    const timer = window.setInterval(() => {
      void refetchProducts();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, isAdminProducts, refetchProducts]);

  const questions = useMemo<FlatQuestion[]>(() => {
    const result: FlatQuestion[] = [];
    for (const product of products as any[]) {
      for (const option of product.options || []) {
        for (const question of option.questions || []) {
          if (question.fieldType !== "select") continue;
          result.push({
            id: Number(question.id),
            question: String(question.question || ""),
            fieldType: String(question.fieldType || ""),
            options: question.options ?? null,
            productName: String(product.name || "Produto"),
            optionName: String(option.label || "Opção"),
          });
        }
      }
    }
    return result;
  }, [products]);

  const selectedQuestion = questions.find((q) => q.id === questionId) || null;
  const selectedOptions = parseOptions(selectedQuestion?.options || null);

  const resetForm = () => {
    setQuestionId(null);
    setAnswer("");
    setTitle("Antes de continuar");
    setMessage("");
    setButtonLabel("Voltar e alterar resposta");
  };

  const persist = (nextRules: Rule[]) => {
    setRules(nextRules);
    saveMutation.mutate({ settings: { [SETTING_KEY]: JSON.stringify(nextRules) } });
  };

  const addRule = () => {
    if (!questionId || !answer.trim()) {
      toast.error("Escolha a pergunta e a resposta que deve bloquear.");
      return;
    }
    if (!message.trim()) {
      toast.error("Escreva a mensagem que o cliente deve receber.");
      return;
    }
    const key = `${questionId}:${answer.trim().toLocaleUpperCase("pt-BR")}`;
    const next: Rule = {
      id: key,
      questionId,
      answer: answer.trim(),
      title: title.trim() || "Antes de continuar",
      message: message.trim(),
      buttonLabel: buttonLabel.trim() || "Voltar e alterar resposta",
      enabled: true,
    };
    const merged = [...rules.filter((rule) => rule.id !== key), next];
    persist(merged);
    resetForm();
  };

  if (!isAdminProducts) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[80] rounded-full border border-red-400/40 bg-red-950/95 px-4 py-3 text-xs font-black text-red-200 shadow-2xl hover:bg-red-900"
      >
        🚫 Regras de bloqueio {rules.filter((r) => r.enabled).length > 0 ? `(${rules.filter((r) => r.enabled).length})` : ""}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-red-500/35 bg-[#080b14] p-5 text-white shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-red-300">Regras de bloqueio das perguntas</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">Escolha uma resposta que não permite avançar. O cliente verá o manifesto, continuará logado e poderá voltar para a mesma pergunta e trocar a resposta.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">Fechar</button>
            </div>

            <div className="rounded-xl border border-red-500/25 bg-red-950/10 p-4 space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-300">Pergunta</label>
                <select value={questionId ?? ""} onChange={(e) => { setQuestionId(e.target.value ? Number(e.target.value) : null); setAnswer(""); }} className="w-full rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm text-black">
                  <option value="">Selecione...</option>
                  {questions.map((q) => <option key={q.id} value={q.id}>{q.productName} / {q.optionName} — {q.question}</option>)}
                </select>
              </div>

              {selectedQuestion && (
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-300">Resposta que bloqueia</label>
                  <select value={answer} onChange={(e) => setAnswer(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm text-black">
                    <option value="">Selecione...</option>
                    {selectedOptions.map((opt) => <option key={opt.label} value={opt.label}>{opt.label}{opt.blocking ? " · já marcada como bloqueante" : ""}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-300">Título do manifesto</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm text-black" placeholder="Ex.: Atenção — esta resposta impede o pedido" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-300">Explicação para o cliente</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm text-black" placeholder="Ex.: Para realizar este serviço é obrigatório aceitar esta condição. Se você mudar de ideia, volte e selecione SIM para continuar." />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold text-slate-300">Texto do botão</label>
                <input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm text-black" />
              </div>
              <button type="button" disabled={saveMutation.isPending} onClick={addRule} className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-500 disabled:opacity-50">{saveMutation.isPending ? "Salvando..." : "Adicionar / atualizar regra"}</button>
            </div>

            <div className="mt-5 space-y-2">
              <h3 className="text-sm font-black text-white">Regras ativas</h3>
              {rules.length === 0 ? <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-500">Nenhuma regra criada ainda.</p> : rules.map((rule) => {
                const q = questions.find((item) => item.id === rule.questionId);
                return <div key={rule.id} className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-white">{q?.question || `Pergunta #${rule.questionId}`}</p>
                      <p className="mt-1 text-[11px] text-red-300">Bloqueia quando resposta = <strong>{rule.answer}</strong></p>
                      <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-400">{rule.message}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => persist(rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))} className={`rounded px-2 py-1 text-[10px] font-bold ${rule.enabled ? "bg-green-500/15 text-green-300" : "bg-slate-700 text-slate-400"}`}>{rule.enabled ? "ATIVA" : "INATIVA"}</button>
                      <button type="button" onClick={() => persist(rules.filter((item) => item.id !== rule.id))} className="rounded bg-red-500/15 px-2 py-1 text-[10px] font-bold text-red-300">Excluir</button>
                    </div>
                  </div>
                </div>;
              })}
            </div>
          </div>
        </div>, document.body
      )}
    </>
  );
}
