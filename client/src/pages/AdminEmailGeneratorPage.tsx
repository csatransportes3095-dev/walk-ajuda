import { useMemo, useState } from "react";
import { AlertCircle, ClipboardPaste, Search, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import AdminEmailGenerator from "@/components/AdminEmailGenerator";

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

type IauditSummary =
  | { tone: "blue"; label: "CHECAGEM AINDA NÃO EFETUADA" }
  | { tone: "amber"; label: "SEM APONTAMENTOS LOCALIZADOS" }
  | { tone: "neutral"; label: "VERIFICAR RESPOSTA" };

function summarizeIauditResponse(value: string): IauditSummary {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    text.includes("sua checagem de apontamentos criminais ainda nao foi efetuada") ||
    text.includes("checagem de apontamentos criminais ainda nao foi efetuada")
  ) {
    return { tone: "blue", label: "CHECAGEM AINDA NÃO EFETUADA" };
  }

  if (
    text.includes("nao encontramos apontamentos criminais em seu cpf") ||
    text.includes("nao encontramos apontamentos criminais")
  ) {
    return { tone: "amber", label: "SEM APONTAMENTOS LOCALIZADOS" };
  }

  return { tone: "neutral", label: "VERIFICAR RESPOSTA" };
}

export default function AdminEmailGeneratorPage() {
  const [, navigate] = useLocation();
  const [cpf, setCpf] = useState("");
  const [originalResponse, setOriginalResponse] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const summary = useMemo(() => summarizeIauditResponse(originalResponse), [originalResponse]);

  const summaryClass =
    summary.tone === "blue"
      ? "border-sky-400/30 bg-sky-400/10 text-sky-200"
      : summary.tone === "amber"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/[0.05] text-slate-200";

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setOriginalResponse(text);
      setShowSummary(Boolean(text.trim()));
    } catch {
      // O navegador pode negar leitura direta da área de transferência.
    }
  };

  return (
    <div className="min-h-screen bg-[#06080d]">
      <AdminEmailGenerator onBack={() => navigate("/admin/codes")} />

      <section className="border-t border-white/10 bg-[radial-gradient(circle_at_top,#101b31_0,#070b12_46%,#06080d_100%)] px-4 pb-10 pt-6 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-2xl border border-sky-400/20 bg-[#0b111d] p-4 shadow-2xl sm:p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em] text-sky-300">Ferramenta interna do ADM</p>
              <h2 className="mt-1 text-xl font-black text-white">Resumo visual iAudit</h2>
              <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">
                O iframe externo foi removido porque o próprio portal iAudit bloqueia incorporação em outros domínios. Esta área mantém o texto original e gera somente um resumo factual para leitura rápida.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <label className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">CPF consultado</label>
              <input
                value={cpf}
                onChange={event => setCpf(formatCpf(event.target.value))}
                inputMode="numeric"
                autoComplete="off"
                className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#090f1a] px-4 text-base font-black tracking-wide text-white outline-none transition focus:border-sky-400/60"
                placeholder="000.000.000-00"
              />
              <p className="mt-2 text-[11px] leading-5 text-slate-500">O CPF desta tela fica apenas no estado atual do navegador e não é salvo pelo gerador.</p>

              <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3 text-xs leading-5 text-amber-100/75">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>A consulta direta não é simulada. Para consultar sem sair do H2 será necessário um endpoint/API oficial ou autorizado do iAudit. O portal público atual retorna bloqueio para incorporação e acesso automatizado.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Resposta original do iAudit</label>
                  <p className="mt-1 text-xs text-slate-500">Cole a mensagem exatamente como apareceu no Portal de Revisão.</p>
                </div>
                <button
                  type="button"
                  onClick={handlePaste}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-200 transition hover:bg-white/10"
                >
                  <ClipboardPaste className="h-4 w-4" /> Colar
                </button>
              </div>

              <textarea
                value={originalResponse}
                onChange={event => {
                  setOriginalResponse(event.target.value);
                  setShowSummary(false);
                }}
                className="mt-3 min-h-[160px] w-full resize-y rounded-xl border border-white/10 bg-[#090f1a] p-4 text-sm leading-6 text-slate-100 outline-none transition focus:border-sky-400/60"
                placeholder="Cole aqui a mensagem retornada pelo Portal de Revisão..."
              />

              <button
                type="button"
                onClick={() => setShowSummary(Boolean(originalResponse.trim()))}
                disabled={!originalResponse.trim()}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 text-sm font-black text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Search className="h-4 w-4" /> Resumir resposta
              </button>
            </div>
          </div>

          {showSummary && (
            <div className={`mt-4 rounded-2xl border p-5 ${summaryClass}`}>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] opacity-70">Resumo visual</p>
              <p className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{summary.label}</p>
              <p className="mt-3 text-xs leading-5 opacity-75">O texto original permanece acima para conferência. Este resumo não altera a resposta emitida pelo iAudit e não representa decisão automática de contratação, ativação ou elegibilidade.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
