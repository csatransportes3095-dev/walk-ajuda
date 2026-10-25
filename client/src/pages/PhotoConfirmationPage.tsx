import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Camera,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Question = {
  id: string;
  text: string;
  type: "check_cross" | "thumbs" | "mood" | "text";
  required: boolean;
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function answerLabel(question: Question, value: string) {
  if (question.type === "check_cross") return value === "yes" ? "✅ SIM" : value === "no" ? "❌ NÃO" : value;
  if (question.type === "thumbs") return value === "up" ? "👍 POSITIVO" : value === "down" ? "👎 NEGATIVO" : value;
  if (question.type === "mood") {
    return value === "happy"
      ? "😀 OK"
      : value === "neutral"
        ? "😐 MAIS OU MENOS"
        : value === "sad"
          ? "😞 NÃO ESTÁ OK"
          : value;
  }
  return value;
}

export default function PhotoConfirmationPage() {
  const [, params] = useRoute("/confirmacao-foto/:token");
  const token = params?.token || "";
  const query = trpc.photoConfirmation.getPublic.useQuery(
    { token },
    { enabled: token.length >= 32, refetchOnWindowFocus: true },
  );
  const saveMut = trpc.photoConfirmation.savePublic.useMutation();
  const completeMut = trpc.photoConfirmation.completePublic.useMutation({
    onSuccess: async () => {
      toast.success("CONFIRMAÇÃO PARA FOTO concluída.");
      await query.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const data = query.data?.found ? query.data : null;

  useEffect(() => {
    if (data?.answers) setAnswers(data.answers);
  }, [data?.answers]);

  const questions = (data?.questions || []) as Question[];
  const requiredTotal = questions.filter(q => q.required).length;
  const requiredAnswered = useMemo(
    () => questions.filter(q => q.required && String(answers[q.id] || "").trim()).length,
    [questions, answers],
  );
  const complete = data?.status === "completed";
  const progress = requiredTotal ? Math.round((requiredAnswered / requiredTotal) * 100) : 100;

  function saveAnswer(id: string, value: string) {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    saveMut.mutate(
      { token, answers: { [id]: value } },
      {
        onError: error => toast.error("Não foi possível salvar esta resposta: " + error.message),
      },
    );
  }

  if (query.isLoading) {
    return (
      <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#050713] text-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 18% 12%, rgba(37,99,235,.24), transparent 34%), radial-gradient(circle at 82% 18%, rgba(236,72,153,.2), transparent 32%), radial-gradient(circle at 55% 88%, rgba(124,58,237,.18), transparent 36%)",
          }}
        />
        <div className="relative flex items-center gap-3 rounded-2xl border border-cyan-400/25 bg-white/[0.04] px-5 py-4 text-sm text-slate-200 shadow-2xl backdrop-blur-xl">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          Carregando confirmação...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#050713] p-5 text-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 10%, rgba(127,29,29,.22), transparent 34%), radial-gradient(circle at 80% 80%, rgba(124,58,237,.2), transparent 32%)",
          }}
        />
        <div className="relative w-full max-w-md rounded-[28px] border border-red-400/25 bg-[#0b1020]/85 p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,.5)] backdrop-blur-2xl">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-red-400/25 bg-red-500/10 text-3xl shadow-[0_0_30px_rgba(239,68,68,.16)]">⚠️</div>
          <h1 className="text-2xl font-black tracking-tight">Link inválido</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">Esta CONFIRMAÇÃO PARA FOTO não foi encontrada.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050713] px-3 py-4 text-white sm:px-5 sm:py-7">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(circle at 12% 8%, rgba(37,99,235,.30), transparent 28%), radial-gradient(circle at 88% 12%, rgba(236,72,153,.22), transparent 30%), radial-gradient(circle at 50% 92%, rgba(124,58,237,.25), transparent 36%), linear-gradient(180deg, #050713 0%, #080b19 45%, #050713 100%)",
        }}
      />
      <div className="pointer-events-none fixed inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      <main className="relative mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
        <header className="overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#0a1020]/80 shadow-[0_24px_80px_rgba(0,0,0,.45)] backdrop-blur-2xl">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-cyan-400" />
          <div className="p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-gradient-to-br from-cyan-400/20 via-blue-500/15 to-fuchsia-500/20 shadow-[0_0_32px_rgba(34,211,238,.16)] sm:h-14 sm:w-14">
                <Camera className="h-6 w-6 text-cyan-100 sm:h-7 sm:w-7" />
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-cyan-200/60 bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,.9)]" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black tracking-[0.24em] text-cyan-300 sm:text-[11px]">H2 COLOMBIANO</p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/20 bg-violet-500/10 px-2 py-1 text-[9px] font-black tracking-[0.14em] text-violet-200">
                    <Sparkles className="h-3 w-3" /> VERIFICAÇÃO
                  </span>
                </div>
                <h1 className="bg-gradient-to-r from-white via-cyan-100 to-fuchsia-200 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
                  CONFIRMAÇÃO PARA FOTO
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 sm:text-sm">
                  {data.customerName && <span className="font-bold text-slate-200">{data.customerName}</span>}
                  {data.orderNumber && <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">Pedido #{data.orderNumber}</span>}
                </div>
              </div>
            </div>

            {data.appointment?.slotDate && (
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-fuchsia-300/20 bg-gradient-to-r from-fuchsia-500/10 via-violet-500/10 to-cyan-500/10 px-3 py-3 text-sm text-fuchsia-50 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] sm:px-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-500/10">
                  <CalendarClock className="h-4 w-4 text-fuchsia-200" />
                </div>
                <div>
                  <p className="text-[10px] font-black tracking-[0.15em] text-fuchsia-300">HORÁRIO DA FOTO</p>
                  <p className="mt-0.5 font-black text-white">
                    {formatDate(data.appointment.slotDate)} {data.appointment.slotTime ? `às ${data.appointment.slotTime.slice(0, 5)}` : ""}
                  </p>
                </div>
              </div>
            )}

            {!complete && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-3 sm:p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-slate-400">Progresso da confirmação</span>
                  <span className="font-black text-cyan-200">{requiredAnswered}/{requiredTotal}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full border border-white/10 bg-[#070b14] p-[2px]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 via-fuchsia-500 to-cyan-400 shadow-[0_0_20px_rgba(34,211,238,.35)] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-500">
                  <span>Responda todas as obrigatórias</span>
                  <span className="text-cyan-300">{progress}%</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {complete ? (
          <section className="overflow-hidden rounded-[28px] border border-emerald-300/25 bg-[#091612]/85 shadow-[0_24px_80px_rgba(0,0,0,.42)] backdrop-blur-2xl">
            <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500" />
            <div className="p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 shadow-[0_0_30px_rgba(16,185,129,.15)]">
                  <CheckCircle2 className="h-6 w-6 text-emerald-200" />
                </div>
                <div>
                  <p className="text-[10px] font-black tracking-[0.18em] text-emerald-300">PROCESSO FINALIZADO</p>
                  <h2 className="text-xl font-black sm:text-2xl">CONFIRMAÇÃO CONCLUÍDA</h2>
                </div>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-300">Suas respostas foram registradas com sucesso.</p>

              <div className="mt-5 space-y-3">
                {questions.map((q, index) => (
                  <div key={q.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                    <div className="border-b border-white/10 bg-gradient-to-r from-blue-500/10 via-violet-500/10 to-fuchsia-500/10 px-3 py-3">
                      <p className="text-xs font-black leading-relaxed text-slate-200">
                        <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-lg border border-cyan-300/20 bg-cyan-400/10 text-[10px] text-cyan-200">{index + 1}</span>
                        {q.text}
                      </p>
                    </div>
                    <div className="px-3 py-3">
                      <p className="text-sm font-black text-white">{answerLabel(q, answers[q.id] || "—")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="space-y-4">
              {questions.map((q, index) => (
                <div key={q.id} className="group overflow-hidden rounded-[24px] border border-white/10 bg-[#0a0f1d]/88 shadow-[0_18px_50px_rgba(0,0,0,.30)] backdrop-blur-xl transition hover:border-cyan-300/20">
                  <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-r from-blue-600/20 via-violet-600/20 to-fuchsia-500/20 px-4 py-4">
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-cyan-300/[0.06] to-transparent" />
                    <div className="relative flex items-start gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-400/10 text-xs font-black text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,.10)]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black tracking-[0.16em] text-cyan-300">PERGUNTA</p>
                        <p className="mt-1 text-sm font-black leading-relaxed text-white sm:text-[15px]">
                          {q.text} {q.required && <span className="text-fuchsia-300">*</span>}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-fuchsia-500/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
                      <span className="text-[9px] font-black tracking-[0.18em] text-slate-500">RESPOSTA</span>
                      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-fuchsia-300/20 to-transparent" />
                    </div>

                    {q.type === "check_cross" && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          onClick={() => saveAnswer(q.id, "yes")}
                          className={`min-h-14 rounded-2xl border px-3 text-sm font-black transition-all duration-200 active:scale-[.98] ${
                            answers[q.id] === "yes"
                              ? "border-emerald-300/70 bg-gradient-to-br from-emerald-400/30 to-cyan-500/20 text-emerald-50 shadow-[0_0_28px_rgba(16,185,129,.22)]"
                              : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-emerald-300/30 hover:bg-emerald-500/[0.08]"
                          }`}
                        >
                          ✅ SIM
                        </button>
                        <button
                          onClick={() => saveAnswer(q.id, "no")}
                          className={`min-h-14 rounded-2xl border px-3 text-sm font-black transition-all duration-200 active:scale-[.98] ${
                            answers[q.id] === "no"
                              ? "border-rose-300/70 bg-gradient-to-br from-rose-500/30 to-fuchsia-500/20 text-rose-50 shadow-[0_0_28px_rgba(244,63,94,.22)]"
                              : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-rose-300/30 hover:bg-rose-500/[0.08]"
                          }`}
                        >
                          ❌ NÃO
                        </button>
                      </div>
                    )}

                    {q.type === "thumbs" && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          onClick={() => saveAnswer(q.id, "up")}
                          className={`min-h-14 rounded-2xl border px-3 text-sm font-black transition-all duration-200 active:scale-[.98] ${
                            answers[q.id] === "up"
                              ? "border-emerald-300/70 bg-gradient-to-br from-emerald-400/30 to-cyan-500/20 text-emerald-50 shadow-[0_0_28px_rgba(16,185,129,.22)]"
                              : "border-white/10 bg-white/[0.035] text-slate-300"
                          }`}
                        >
                          👍 POSITIVO
                        </button>
                        <button
                          onClick={() => saveAnswer(q.id, "down")}
                          className={`min-h-14 rounded-2xl border px-3 text-sm font-black transition-all duration-200 active:scale-[.98] ${
                            answers[q.id] === "down"
                              ? "border-rose-300/70 bg-gradient-to-br from-rose-500/30 to-fuchsia-500/20 text-rose-50 shadow-[0_0_28px_rgba(244,63,94,.22)]"
                              : "border-white/10 bg-white/[0.035] text-slate-300"
                          }`}
                        >
                          👎 NEGATIVO
                        </button>
                      </div>
                    )}

                    {q.type === "mood" && (
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ["happy", "😀", "OK"],
                          ["neutral", "😐", "MAIS OU MENOS"],
                          ["sad", "😞", "NÃO ESTÁ OK"],
                        ] as const).map(([value, emoji, label]) => (
                          <button
                            key={value}
                            onClick={() => saveAnswer(q.id, value)}
                            className={`min-h-20 rounded-2xl border px-2 text-[11px] font-black transition-all duration-200 active:scale-[.98] ${
                              answers[q.id] === value
                                ? "border-cyan-300/65 bg-gradient-to-br from-cyan-400/20 via-blue-500/15 to-fuchsia-500/15 text-white shadow-[0_0_26px_rgba(34,211,238,.18)]"
                                : "border-white/10 bg-white/[0.035] text-slate-300"
                            }`}
                          >
                            <span className="mb-1 block text-2xl">{emoji}</span>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.type === "text" && (
                      <textarea
                        defaultValue={answers[q.id] || ""}
                        onBlur={e => saveAnswer(q.id, e.target.value.trim())}
                        placeholder="Digite sua resposta..."
                        className="min-h-28 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:shadow-[0_0_24px_rgba(34,211,238,.10)]"
                      />
                    )}
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-[24px] border border-white/10 bg-[#0a0f1d]/88 p-3 shadow-[0_18px_50px_rgba(0,0,0,.28)] backdrop-blur-xl sm:p-4">
              <button
                disabled={completeMut.isPending || requiredAnswered < requiredTotal}
                onClick={() => completeMut.mutate({ token, answers })}
                className="group relative min-h-16 w-full overflow-hidden rounded-2xl border border-emerald-300/30 bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 px-4 text-sm font-black text-[#04100f] shadow-[0_0_35px_rgba(34,211,238,.18)] transition-all duration-200 hover:brightness-110 active:scale-[.995] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-none disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
              >
                <span className="relative z-10 inline-flex items-center justify-center gap-2">
                  {completeMut.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      ENVIANDO...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-5 w-5" />
                      FINALIZAR CONFIRMAÇÃO PARA FOTO
                    </>
                  )}
                </span>
              </button>
              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-300/70" />
                As respostas são salvas durante o preenchimento.
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
