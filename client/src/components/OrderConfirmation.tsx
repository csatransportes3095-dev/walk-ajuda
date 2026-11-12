import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ClipboardCheck, CheckCircle2, ClipboardCopy, ExternalLink, MessageCircle, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { publicSiteUrl } from "@shared/publicLinks";
import { buildWhatsappMessageUrl } from "@shared/whatsappUrl";


type QuestionType = "check_cross" | "thumbs" | "mood" | "text";
type Question = { id: string; text: string; type: QuestionType; required: boolean };

interface Props {
  registrationId: number;
  subOrderIndex: number;
  customerPhone: string;
  customerName?: string | null;
  orderNumber?: number | null;
}

const DEFAULT_QUESTIONS: Question[] = [
  { id: "geral_01", text: "Você leu a descrição completa do produto ou serviço contratado?", type: "check_cross", required: true },
  { id: "geral_02", text: "Você entendeu a diferença entre as opções de serviço disponíveis?", type: "check_cross", required: true },
  { id: "geral_03", text: "Você confirmou que escolheu a modalidade correta no pedido?", type: "check_cross", required: true },
  { id: "geral_04", text: "Você está ciente de que o pagamento é antecipado e realizado pelo site?", type: "check_cross", required: true },
  { id: "geral_05", text: "Você sabe que os pagamentos devem ser feitos exclusivamente pelos meios apresentados no site?", type: "check_cross", required: true },
  { id: "geral_06", text: "Você sabe onde acompanhar os status e atualizações do seu pedido?", type: "check_cross", required: true },
  { id: "geral_07", text: "Você está ciente de que o atendimento humano ocorre no horário informado no site?", type: "check_cross", required: true },
  { id: "geral_08", text: "Você compreendeu que os prazos podem depender da análise da plataforma?", type: "check_cross", required: true },
  { id: "geral_09", text: "Você leu e compreendeu as condições de garantia do produto contratado?", type: "check_cross", required: true },
  { id: "geral_10", text: "Você sabe que mudanças em dados cadastrais podem exigir nova verificação?", type: "check_cross", required: true },
  { id: "geral_11", text: "Você confirmou que seu telefone e e-mail cadastrados estão corretos?", type: "check_cross", required: true },
  { id: "geral_12", text: "Você sabe que o acesso à sua conta no site utiliza um código enviado ao e-mail cadastrado?", type: "check_cross", required: true },
  { id: "geral_13", text: "Você está ciente de que os documentos enviados precisam ser autênticos, válidos e legíveis?", type: "check_cross", required: true },
  { id: "geral_14", text: "Você confirma que o nome e os dados dos documentos correspondem ao titular verdadeiro?", type: "check_cross", required: true },
  { id: "geral_15", text: "Você sabe que o veículo informado deve corresponder à placa e aos documentos oficiais?", type: "check_cross", required: true },
  { id: "geral_16", text: "Você verificou se o veículo atende aos requisitos de ano, categoria e cidade da plataforma?", type: "check_cross", required: true },
  { id: "geral_17", text: "Você está ciente de que uma reprovação de documento pode exigir correção ou reenvio oficial?", type: "check_cross", required: true },
  { id: "geral_18", text: "Você entende que restrições ou bloqueios anteriores devem ser informados corretamente?", type: "check_cross", required: true },
  { id: "geral_19", text: "Você está ciente de que a aprovação da conta depende das regras da plataforma?", type: "check_cross", required: true },
  { id: "geral_20", text: "Você sabe que a plataforma pode solicitar foto ou verificação facial adicional?", type: "check_cross", required: true },
  { id: "geral_21", text: "Você está ciente de que a foto deve mostrar a identidade verdadeira do titular, sem disfarces?", type: "check_cross", required: true },
  { id: "geral_22", text: "Você preparou um ambiente interno com iluminação suficiente para uma foto nítida?", type: "check_cross", required: true },
  { id: "geral_23", text: "Você está ciente de que acessórios que cubram o rosto podem prejudicar a verificação?", type: "check_cross", required: true },
  { id: "geral_24", text: "Você verificou se o aparelho está funcionando corretamente para receber as instruções?", type: "check_cross", required: true },
  { id: "geral_25", text: "Você está ciente de que uma restauração do aparelho apaga dados e exige backup prévio?", type: "check_cross", required: true },
  { id: "geral_26", text: "Você sabe que o aparelho deve cumprir os requisitos técnicos e de segurança do aplicativo?", type: "check_cross", required: true },
  { id: "geral_27", text: "Você compreendeu que não deve compartilhar senhas ou códigos de acesso com terceiros?", type: "check_cross", required: true },
  { id: "geral_28", text: "Você sabe que a disponibilidade de agendamento deve ser consultada no site?", type: "check_cross", required: true },
  { id: "geral_29", text: "Você está ciente de que horários liberados por desistência podem aparecer na agenda?", type: "check_cross", required: true },
  { id: "geral_30", text: "Você sabe que deve respeitar o horário confirmado e as regras de reagendamento?", type: "check_cross", required: true },
  { id: "geral_31", text: "Você está ciente de que o status de foto em análise não significa aprovação definitiva?", type: "check_cross", required: true },
  { id: "geral_32", text: "Você sabe que indicações promocionais podem não gerar comissão conforme as regras da campanha?", type: "check_cross", required: true },
  { id: "geral_33", text: "Você entende que empréstimos dependem de cadastro, movimentação e liberação automática do sistema?", type: "check_cross", required: true },
  { id: "geral_34", text: "Você sabe que pedidos de suporte devem informar o código do pedido para facilitar o atendimento?", type: "check_cross", required: true },
  { id: "geral_35", text: "Você confirma que leu as instruções específicas exibidas no produto antes de contratar?", type: "check_cross", required: true },
];

const TYPE_LABELS: Record<QuestionType,string> = {
  check_cross: "✅ / ❌",
  thumbs: "👍 / 👎",
  mood: "😀 / 😐 / 😞",
  text: "Texto",
};

function newQuestion(): Question {
  return { id: `q_${Date.now()}_${Math.random().toString(36).slice(2,7)}`, text: "", type: "check_cross", required: true };
}

function answerLabel(question: Question, value: string) {
  if (!value) return "—";
  if (question.type === "check_cross") return value === "yes" ? "✅ SIM" : value === "no" ? "❌ NÃO" : value;
  if (question.type === "thumbs") return value === "up" ? "👍 POSITIVO" : value === "down" ? "👎 NEGATIVO" : value;
  if (question.type === "mood") return value === "happy" ? "😀 OK" : value === "neutral" ? "😐 MAIS OU MENOS" : value === "sad" ? "😞 NÃO ESTÁ OK" : value;
  return value;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const [y,m,d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

export default function OrderConfirmation({ registrationId, subOrderIndex, customerPhone, customerName, orderNumber }: Props) {
  const utils = trpc.useUtils();
  const input = { registrationId, subOrderIndex };
  const query = trpc.orderConfirmation.getForOrder.useQuery(input, { staleTime: 0, refetchInterval: 10000, refetchOnWindowFocus: true });
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);
  const record = query.data;
  const link = record?.token ? publicSiteUrl(`/confirmacao-pedido/${record.token}`) : "";

  useEffect(() => {
    if (record?.questions?.length) setQuestions(record.questions as Question[]);
    else if (!record) setQuestions(DEFAULT_QUESTIONS);
  }, [record?.id, record?.updatedAt]);

  const refresh = async () => {
    await utils.orderConfirmation.getForOrder.invalidate(input);
    await query.refetch();
  };

  const saveMut = trpc.orderConfirmation.saveForOrder.useMutation({
    onSuccess: async () => { toast.success("CONFIRMAÇÃO DO PEDIDO salva."); await refresh(); },
    onError: e => toast.error(e.message),
  });
  const reopenMut = trpc.orderConfirmation.reopen.useMutation({
    onSuccess: async () => { toast.success("CONFIRMAÇÃO DO PEDIDO reaberta."); await refresh(); },
    onError: e => toast.error(e.message),
  });

  const statusClass = record?.status === "completed"
    ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-200"
    : record
      ? "border-amber-500/45 bg-amber-500/15 text-amber-200"
      : "border-cyan-500/40 bg-cyan-500/15 text-cyan-200";

  const statusText = record?.status === "completed"
    ? "✓ CONFIRMAÇÃO DO PEDIDO"
    : record
      ? "⏳ CONFIRMAÇÃO DO PEDIDO"
      : "📋 CONFIRMAÇÃO DO PEDIDO";

  const answered = useMemo(() => {
    if (!record) return 0;
    return Object.values(record.answers || {}).filter(value => String(value || "").trim()).length;
  }, [record?.answers]);

  function saveQuestions() {
    const clean = questions.map(q => ({ ...q, text: q.text.trim() })).filter(q => q.text);
    if (!clean.length) { toast.error("Adicione pelo menos uma pergunta."); return; }
    saveMut.mutate({
      registrationId,
      subOrderIndex,
      customerPhone: customerPhone || "",
      customerName: customerName || null,
      orderNumber: orderNumber || null,
      questions: clean,
    });
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => toast.success("Link copiado.")).catch(() => toast.error("Não foi possível copiar o link."));
  }

  function openWhatsapp() {
    if (!link || !customerPhone) return;
    const msg = `Olá${customerName ? " " + customerName : ""}! Precisamos confirmar que você entendeu as condições do seu pedido. Responda às perguntas pelo link: ${link}`;
    const digits = customerPhone.replace(/\D/g, "");
    const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
    if (local.length !== 10 && local.length !== 11) {
      toast.error("Telefone do cliente inválido. Confira o DDD antes de enviar.");
      return;
    }
    window.open(buildWhatsappMessageUrl(`55${local}`, msg), "_blank", "noopener,noreferrer");
  }

  const modal = open ? createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-2 sm:p-4" onClick={()=>setOpen(false)}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-cyan-500/30 bg-[#080b12] text-white shadow-2xl" onClick={e=>e.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#080b12]/95 p-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-cyan-300"/><h2 className="text-lg font-black">CONFIRMAÇÃO DO PEDIDO</h2></div>
            <p className="mt-1 text-xs text-slate-400">Pedido {orderNumber ? `#${orderNumber}` : `cadastro ${registrationId}`} · {customerName || customerPhone}</p>
            
          </div>
          <button onClick={()=>setOpen(false)} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5"><X className="h-4 w-4"/></button>
        </header>

        <div className="space-y-4 p-4">
          {record && <div className={`rounded-xl border p-3 ${record.status==="completed"?"border-emerald-500/30 bg-emerald-500/10":"border-amber-500/30 bg-amber-500/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black">{record.status==="completed"?"🟢 CONCLUÍDA":"🟡 AGUARDANDO CLIENTE"}</p>
                <p className="mt-1 text-xs text-slate-400">{answered}/{record.questions.length} resposta(s) salva(s){record.openedAt ? " · link já aberto" : ""}</p>
              </div>
              {record.status==="completed" && <button onClick={()=>reopenMut.mutate(input)} disabled={reopenMut.isPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 text-xs font-black text-amber-100"><RotateCcw className="h-3.5 w-3.5"/>REABRIR</button>}
            </div>
          </div>}

          {record?.status !== "completed" && <section className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-black">PERGUNTAS</h3><p className="text-xs text-slate-500">Edite antes de enviar. O cliente verá exatamente esta ordem.</p></div>
              <button onClick={()=>setQuestions(q=>[...q,newQuestion()])} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 text-xs font-black text-cyan-100"><Plus className="h-4 w-4"/>ADICIONAR</button>
            </div>
            <div className="space-y-2">
              {questions.map((q,index)=><div key={q.id} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 p-2 sm:grid-cols-[32px_1fr_130px_auto_auto] sm:items-center">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-xs font-black">{index+1}</span>
                <input value={q.text} onChange={e=>setQuestions(list=>list.map(item=>item.id===q.id?{...item,text:e.target.value}:item))} placeholder="Digite a pergunta" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-400"/>
                <select value={q.type} onChange={e=>setQuestions(list=>list.map(item=>item.id===q.id?{...item,type:e.target.value as QuestionType}:item))} className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs font-bold">
                  {Object.entries(TYPE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-300"><input type="checkbox" checked={q.required} onChange={e=>setQuestions(list=>list.map(item=>item.id===q.id?{...item,required:e.target.checked}:item))}/>Obrigatória</label>
                <button onClick={()=>setQuestions(list=>list.filter(item=>item.id!==q.id))} className="grid h-9 w-9 place-items-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-300"><Trash2 className="h-4 w-4"/></button>
              </div>)}
            </div>
            <button onClick={saveQuestions} disabled={saveMut.isPending} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-black text-slate-950 hover:bg-cyan-400 disabled:opacity-40"><Save className="h-4 w-4"/>{record?"SALVAR PERGUNTAS":"CRIAR CONFIRMAÇÃO E GERAR LINK"}</button>
          </section>}

          {record && <section className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
            <h3 className="text-sm font-black">LINK DO CLIENTE</h3>
            <div className="mt-2 break-all rounded-lg border border-white/10 bg-black/25 p-2 text-xs text-cyan-200">{link}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <button onClick={copyLink} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-3 text-xs font-black text-cyan-100"><ClipboardCopy className="h-4 w-4"/>COPIAR LINK</button>
              <button onClick={openWhatsapp} disabled={!customerPhone} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 text-xs font-black text-emerald-100 disabled:opacity-30"><MessageCircle className="h-4 w-4"/>WHATSAPP</button>
              <button onClick={()=>window.open(link,"_blank","noopener,noreferrer")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/15 px-3 text-xs font-black text-violet-100"><ExternalLink className="h-4 w-4"/>ABRIR LINK</button>
            </div>
          </section>}

          {record?.status === "completed" && <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-emerald-200"><CheckCircle2 className="h-4 w-4"/><h3 className="text-sm font-black">RESPOSTAS DO CLIENTE</h3></div>
            <div className="space-y-2">
              {(record.questions as Question[]).map((q,index)=><div key={q.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <p className="text-xs font-bold text-slate-400">{index+1}. {q.text}</p>
                <p className="mt-1 text-sm font-black text-white">{answerLabel(q,String(record.answers?.[q.id]||""))}</p>
              </div>)}
            </div>
          </section>}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return <>
    <button
      type="button"
      onClick={e=>{e.stopPropagation();setOpen(true);}}
      className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-black transition sm:min-h-9 sm:text-[11px] ${statusClass}`}
      title="Abrir CONFIRMAÇÃO DO PEDIDO deste pedido"
    >
      {record?.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5"/> : <ClipboardCheck className="h-3.5 w-3.5"/>}
      {statusText}
    </button>
    {modal}
  </>;
}
