import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Camera, Loader2 } from "lucide-react";

type Question = {
  id: string;
  text: string;
  type: "check_cross" | "thumbs" | "mood" | "text";
  required: boolean;
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const [y,m,d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function answerLabel(question: Question, value: string) {
  if (question.type === "check_cross") return value === "yes" ? "✅ SIM" : value === "no" ? "❌ NÃO" : value;
  if (question.type === "thumbs") return value === "up" ? "👍 POSITIVO" : value === "down" ? "👎 NEGATIVO" : value;
  if (question.type === "mood") return value === "happy" ? "😀 OK" : value === "neutral" ? "😐 MAIS OU MENOS" : value === "sad" ? "😞 NÃO ESTÁ OK" : value;
  return value;
}

export default function PhotoConfirmationPage() {
  const [, params] = useRoute("/confirmacao-foto/:token");
  const token = params?.token || "";
  const query = trpc.photoConfirmation.getPublic.useQuery({ token }, { enabled: token.length >= 32, refetchOnWindowFocus: true });
  const saveMut = trpc.photoConfirmation.savePublic.useMutation();
  const completeMut = trpc.photoConfirmation.completePublic.useMutation({
    onSuccess: async () => {
      toast.success("CONFIRMAÇÃO PARA FOTO concluída.");
      await query.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const [answers, setAnswers] = useState<Record<string,string>>({});
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

  function saveAnswer(id: string, value: string) {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    saveMut.mutate({ token, answers: { [id]: value } }, {
      onError: error => toast.error("Não foi possível salvar esta resposta: " + error.message),
    });
  }

  if (query.isLoading) {
    return <div className="min-h-screen bg-[#05070d] text-white grid place-items-center">
      <div className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-5 w-5 animate-spin"/>Carregando confirmação...</div>
    </div>;
  }

  if (!data) {
    return <div className="min-h-screen bg-[#05070d] text-white grid place-items-center p-5">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-950 p-6 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h1 className="text-xl font-black">Link inválido</h1>
        <p className="mt-2 text-sm text-slate-400">Esta CONFIRMAÇÃO PARA FOTO não foi encontrada.</p>
      </div>
    </div>;
  }

  return <div className="min-h-screen bg-[#05070d] text-white px-3 py-5 sm:px-5">
    <main className="mx-auto w-full max-w-2xl space-y-4">
      <header className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-slate-950 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10">
            <Camera className="h-6 w-6 text-cyan-200"/>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black tracking-[0.18em] text-cyan-300">H2 COLOMBIANO</p>
            <h1 className="mt-1 text-2xl font-black">CONFIRMAÇÃO PARA FOTO</h1>
            {data.customerName && <p className="mt-1 text-sm text-slate-300">{data.customerName}</p>}
            {data.orderNumber && <p className="text-xs text-slate-500">Pedido #{data.orderNumber}</p>}
          </div>
        </div>
        {data.appointment?.slotDate && <div className="mt-4 flex items-center gap-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-2.5 text-sm text-fuchsia-100">
          <CalendarClock className="h-4 w-4"/>
          <strong>Horário da foto:</strong> {formatDate(data.appointment.slotDate)} {data.appointment.slotTime ? `às ${data.appointment.slotTime.slice(0,5)}` : ""}
        </div>}
        {!complete && <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>Obrigatórias respondidas</span><span>{requiredAnswered}/{requiredTotal}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-cyan-400 transition-all" style={{width: requiredTotal ? `${Math.round(requiredAnswered/requiredTotal*100)}%` : "100%"}}/>
          </div>
        </div>}
      </header>

      {complete ? <section className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-5">
        <div className="flex items-center gap-2 text-emerald-200">
          <CheckCircle2 className="h-6 w-6"/>
          <h2 className="text-lg font-black">CONFIRMAÇÃO CONCLUÍDA</h2>
        </div>
        <p className="mt-2 text-sm text-slate-300">Suas respostas foram registradas com sucesso.</p>
        <div className="mt-4 space-y-2">
          {questions.map((q,index)=><div key={q.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-bold text-slate-400">{index+1}. {q.text}</p>
            <p className="mt-1 text-sm font-bold text-white">{answerLabel(q, answers[q.id] || "—")}</p>
          </div>)}
        </div>
      </section> : <>
        <section className="space-y-3">
          {questions.map((q,index)=><div key={q.id} className="rounded-2xl border border-white/10 bg-slate-950/90 p-4">
            <div className="flex gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-xs font-black text-slate-300">{index+1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-snug">{q.text} {q.required && <span className="text-red-400">*</span>}</p>
                {q.type === "check_cross" && <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={()=>saveAnswer(q.id,"yes")} className={`min-h-12 rounded-xl border text-sm font-black transition ${answers[q.id]==="yes"?"border-emerald-400 bg-emerald-500/25 text-emerald-100":"border-slate-700 bg-slate-900 text-slate-300"}`}>✅ SIM</button>
                  <button onClick={()=>saveAnswer(q.id,"no")} className={`min-h-12 rounded-xl border text-sm font-black transition ${answers[q.id]==="no"?"border-red-400 bg-red-500/25 text-red-100":"border-slate-700 bg-slate-900 text-slate-300"}`}>❌ NÃO</button>
                </div>}
                {q.type === "thumbs" && <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={()=>saveAnswer(q.id,"up")} className={`min-h-12 rounded-xl border text-sm font-black transition ${answers[q.id]==="up"?"border-emerald-400 bg-emerald-500/25":"border-slate-700 bg-slate-900"}`}>👍 POSITIVO</button>
                  <button onClick={()=>saveAnswer(q.id,"down")} className={`min-h-12 rounded-xl border text-sm font-black transition ${answers[q.id]==="down"?"border-red-400 bg-red-500/25":"border-slate-700 bg-slate-900"}`}>👎 NEGATIVO</button>
                </div>}
                {q.type === "mood" && <div className="mt-3 grid grid-cols-3 gap-2">
                  {([["happy","😀","OK"],["neutral","😐","MAIS OU MENOS"],["sad","😞","NÃO ESTÁ OK"]] as const).map(([value,emoji,label])=>
                    <button key={value} onClick={()=>saveAnswer(q.id,value)} className={`min-h-16 rounded-xl border px-2 text-xs font-black transition ${answers[q.id]===value?"border-cyan-400 bg-cyan-500/25":"border-slate-700 bg-slate-900"}`}>
                      <span className="block text-2xl">{emoji}</span>{label}
                    </button>)}
                </div>}
                {q.type === "text" && <textarea
                  defaultValue={answers[q.id] || ""}
                  onBlur={e=>saveAnswer(q.id,e.target.value.trim())}
                  placeholder="Digite sua resposta..."
                  className="mt-3 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                />}
              </div>
            </div>
          </div>)}
        </section>
        <button
          disabled={completeMut.isPending || requiredAnswered < requiredTotal}
          onClick={()=>completeMut.mutate({token,answers})}
          className="min-h-14 w-full rounded-xl bg-emerald-500 px-4 text-base font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {completeMut.isPending ? "ENVIANDO..." : "FINALIZAR CONFIRMAÇÃO PARA FOTO"}
        </button>
        <p className="pb-4 text-center text-xs text-slate-500">As respostas são salvas durante o preenchimento.</p>
      </>}
    </main>
  </div>;
}
