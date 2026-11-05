import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  Image,
  Mic,
  Power,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import H2AutoHistoryPanel from "@/components/H2AutoHistoryPanel";
import H2AutoValidationBlocks from "@/components/H2AutoValidationBlocks";
import H2AutoSilencedContacts from "@/components/H2AutoSilencedContacts";
import H2AutoWhatsAppPreview from "@/components/H2AutoWhatsAppPreview";
import { H2_AUTO_CONFIRMATION_DEFAULTS as confirmationDefaults, H2_AUTO_CONFIRMATION_GROUPS as confirmationGroups, type H2AutoConfirmation } from "@shared/h2AutoConfirmation";
import { H2_AUTO_SHORT_MEDIA, H2_AUTO_SHORT_ORDER_NOT_FOUND } from "@shared/h2AutoShortReplies";
import { H2_AUTO_PERSONALIZATION_DEFAULT, H2_AUTO_FAQ_MAX_VARIATION_CHARS, H2_AUTO_FAQ_MAX_VARIATION_LINES, h2AutoFaqVariationLineCount, type H2AutoPersonalization } from "@shared/h2AutoPersonalization";
import { prepareH2AutoCommonFaq, H2_AUTO_FAQ_SUGGESTIONS } from "@shared/h2AutoFaqPresets";

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-5 space-y-3">
    {children}
  </div>
);

const mediaDefaults = {
  enabled: false,
  transcribeAudio: false,
  audioFallback:
    H2_AUTO_SHORT_MEDIA.audioFallback,
  photoReply:
    H2_AUTO_SHORT_MEDIA.photoReply,
  videoReply:
    H2_AUTO_SHORT_MEDIA.videoReply,
  documentReply:
    H2_AUTO_SHORT_MEDIA.documentReply,
  stickerReply: H2_AUTO_SHORT_MEDIA.stickerReply,
  unknownReply: H2_AUTO_SHORT_MEDIA.unknownReply,
  cooldownSeconds: 120,
  maxAudioSeconds: 30,
};

const statusLabels: Record<string, string> = {
  NOT_CHECKED: "Ainda não verificado",
  NOT_CONFIGURED: "Mídia/transcrição não configurada",
  UNSUPPORTED_ANDROID: "Android não compatível",
  PERMISSION_REQUIRED: "Permissão de microfone necessária",
  AUDIO_SOURCE_MISSING: "Fonte/URI de áudio indisponível",
  AUDIO_ACCESS_FAILED: "Falha ao acessar o áudio",
  AUDIO_FORMAT_UNSUPPORTED: "Formato de áudio não suportado",
  AUDIO_TOO_LONG: "Áudio acima do limite",
  RECOGNIZER_BUSY: "Reconhecedor ocupado",
  LOCAL_RECOGNIZER_UNAVAILABLE: "Reconhecedor local indisponível",
  LANGUAGE_MODEL_UNAVAILABLE: "Modelo de idioma indisponível",
  INPUT_UNSUPPORTED: "Entrada não suportada",
  TRANSCRIBING: "Transcrevendo",
  TRANSCRIBED: "Transcrito",
  TRANSCRIBED_NO_RULE: "Transcrito sem regra correspondente",
  TRANSCRIPTION_ERROR: "Erro de transcrição",
  TRANSCRIPTION_TIMEOUT: "Tempo de transcrição esgotado",
  EMPTY_TRANSCRIPT: "Transcrição vazia",
  COOLDOWN: "Aguardando intervalo da conversa",
  NO_REPLY_ACTION: "Nenhuma ação de resposta",
  MEDIA_DETECTED: "Mídia detectada",
  CONFIGURATION_DISABLED: "Configuração desabilitada",
  STALE_MESSAGE: "Mensagem antiga ignorada",
};
const replyLabels: Record<string, string> = {
  NOT_CHECKED: "Ainda não verificado",
  FALLBACK_SENT: "Fallback enviado",
  RULE_SENT: "Resposta de regra enviada",
  MEDIA_SENT: "Resposta de mídia enviada",
  NO_REPLY_ACTION: "WhatsApp não disponibilizou Responder",
  SEND_FAILED: "Falha ao enviar resposta",
  SKIPPED: "Ignorado",
};
const field =
  "w-full rounded-xl border border-cyan-500/30 bg-slate-950 px-3 py-2 text-white";
const dateLabel = (value: number | null | undefined) =>
  value == null || value <= 0 ? "Ainda não verificado" : new Date(value).toLocaleString("pt-BR");
const isStale = (value: number | null | undefined) =>
  value != null && Date.now() - value > 24 * 60 * 60 * 1000;


function H2AutoLearningPanel({deviceId, enabled}:{deviceId:string,enabled:boolean}) {
  const utils = trpc.useUtils();
  const {data, isLoading, refetch} = trpc.h2AutoAdmin.learningQuestions.useQuery(
    {id:deviceId,limit:100}, {refetchInterval:30000}
  );
  const [answers,setAnswers] = useState<Record<string,string>>({});
  const [variations,setVariations] = useState<Record<string,string>>({});
  const toggle = trpc.h2AutoAdmin.setQuestionCollection.useMutation({
    onSuccess:async()=>{toast.success("Controle da coleta atualizado"); await utils.h2AutoAdmin.list.invalidate();},
    onError:error=>toast.error(error.message),
  });
  const remove = trpc.h2AutoAdmin.deleteLearningQuestion.useMutation({
    onSuccess:()=>{toast.success("Pergunta excluída");void refetch();},
    onError:error=>toast.error(error.message),
  });
  const clear = trpc.h2AutoAdmin.clearLearningQuestions.useMutation({
    onSuccess:()=>{toast.success("Fila de perguntas limpa");void refetch();},
    onError:error=>toast.error(error.message),
  });
  const approve = trpc.h2AutoAdmin.answerLearningQuestion.useMutation({
    onSuccess:result=>{
      toast.success(result.active?"Resposta aprovada e liberada":"Resposta salva. Ative a personalização para responder automaticamente.");
      void refetch(); void utils.h2AutoAdmin.list.invalidate();
    },
    onError:error=>toast.error(error.message),
  });
  return <section className="rounded-2xl border border-emerald-400/40 bg-slate-950 p-4 space-y-4">
    <div className="flex flex-wrap gap-3 items-center justify-between">
      <div>
        <h4 className="font-black text-lg text-emerald-200">🧠 CENTRAL INTELIGENTE — PERGUNTAS SEM RESPOSTA</h4>
        <p className="text-xs text-slate-300">Sem IA ou API paga. Perguntas agrupadas, editáveis e excluíveis. Coleta desligada até você autorizar.</p>
      </div>
      <button type="button" disabled={toggle.isPending}
        onClick={()=>toggle.mutate({id:deviceId,enabled:!enabled})}
        className={`rounded-xl px-4 py-3 font-black text-sm ${enabled?"bg-red-700 text-white":"bg-emerald-600 text-slate-950"}`}>
        {enabled?"⛔ DESATIVAR COLETA":"✅ ATIVAR COLETA"}
      </button>
    </div>
    <div className="flex gap-2 flex-wrap items-center justify-between">
      <p className="text-sm font-bold text-cyan-200">{data?.pending??0} perguntas agrupadas · {data?.received??0} ocorrências</p>
      <div className="flex gap-2">
        <button type="button" onClick={()=>void refetch()} className="rounded-lg px-3 py-2 border border-slate-600 text-xs">ATUALIZAR</button>
        <button type="button" disabled={!data?.pending||clear.isPending}
          onClick={()=>{if(window.confirm("Excluir definitivamente todas as perguntas pendentes deste aparelho?"))clear.mutate({id:deviceId,confirmed:true});}}
          className="rounded-lg px-3 py-2 border border-red-600 text-red-300 text-xs">LIMPAR FILA</button>
      </div>
    </div>
    {isLoading?<p className="text-sm text-slate-400">Carregando...</p>:
      !data?.questions.length?<p className="rounded-xl bg-slate-900 p-4 text-sm text-slate-300">Nenhuma pergunta desconhecida coletada.</p>:
      <div className="grid gap-3 xl:grid-cols-2">
        {data.questions.map(q=><div key={q.questionHash} className="rounded-xl border border-slate-700 bg-slate-900 p-3 space-y-2">
          <div className="flex justify-between gap-2">
            <p className="font-bold text-sm text-white break-words">{q.question}</p>
            <span className="text-xs whitespace-nowrap text-cyan-200">{q.occurrences}x</span>
          </div>
          <textarea className={field} rows={3} maxLength={1200} placeholder="Escreva a resposta que o cliente receberá"
            value={answers[q.questionHash]??""} onChange={e=>setAnswers(old=>({...old,[q.questionHash]:e.target.value}))}/>
          <label className="block text-xs font-bold text-emerald-200">SUBPERGUNTAS — até 1.000 linhas por pergunta</label>
          <textarea className={field+" min-h-40 resize-y"} rows={6} maxLength={H2_AUTO_FAQ_MAX_VARIATION_CHARS} placeholder="Uma forma de perguntar por linha (até 1.000 linhas)" 
            value={variations[q.questionHash]??""} onChange={e=>setVariations(old=>({...old,[q.questionHash]:e.target.value}))}/>
          <p className={"text-right text-xs "+(h2AutoFaqVariationLineCount(variations[q.questionHash]??"")>H2_AUTO_FAQ_MAX_VARIATION_LINES?"text-red-300":"text-emerald-300")}>{h2AutoFaqVariationLineCount(variations[q.questionHash]??"")} / {H2_AUTO_FAQ_MAX_VARIATION_LINES} linhas</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={approve.isPending||(answers[q.questionHash]??"").trim().length<3||h2AutoFaqVariationLineCount(variations[q.questionHash]??"")>H2_AUTO_FAQ_MAX_VARIATION_LINES}
              onClick={()=>approve.mutate({id:deviceId,questionHash:q.questionHash,answer:answers[q.questionHash].trim(),variations:variations[q.questionHash]??""})}
              className="rounded-lg bg-emerald-600 text-slate-950 font-black px-3 py-2 text-xs disabled:opacity-40">APROVAR RESPOSTA</button>
            <button type="button" disabled={remove.isPending} onClick={()=>remove.mutate({id:deviceId,questionHash:q.questionHash})}
              className="rounded-lg border border-red-500 text-red-300 px-3 py-2 text-xs">EXCLUIR</button>
          </div>
        </div>)}
      </div>}
  </section>;
}

export default function AdminH2Auto() {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.h2AutoAdmin.list.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const [label, setLabel] = useState("Celular principal");
  const [section, setSection] = useState<"intelligence" | "fixed" | "responses" | "operations" | "diagnostics" | "devices">("intelligence");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const { data: h2AutoApk, refetch: refreshH2AutoApk, isLoading: loadingH2AutoApk } =
    trpc.apk.getH2AutoRelease.useQuery(undefined, { refetchOnWindowFocus: true });
  const [h2AutoFile, setH2AutoFile] = useState<File | null>(null);
  const [h2AutoVersion, setH2AutoVersion] = useState("1.61");
  const [h2AutoVersionCode, setH2AutoVersionCode] = useState("61");
  const [h2AutoChecksum, setH2AutoChecksum] = useState(
    "8368a87e6fb22241ff4e97c1e174d4907a96aefbe4f54ad67a3d60329d51f882"
  );
  const [h2AutoUploading, setH2AutoUploading] = useState(false);
  const h2AutoDownloadUrl = "https://h2colombiano.com/baixar-h2-auto";
  const uploadH2AutoApk = async () => {
    if (!h2AutoFile || h2AutoUploading) return;
    setH2AutoUploading(true);
    try {
      const payload = new FormData();
      payload.append("file", h2AutoFile);
      payload.append("versionName", h2AutoVersion);
      payload.append("versionCode", h2AutoVersionCode);
      payload.append("sha256", h2AutoChecksum);
      const result = await fetch("/api/upload/h2-auto", {
        method: "POST",
        credentials: "same-origin",
        body: payload,
      });
      const response = await result.json();
      if (!result.ok || !response.success)
        throw new Error(response.error || "Não foi possível publicar o APK.");
      setH2AutoFile(null);
      await refreshH2AutoApk();
      toast.success("H2 AUTO publicado! O link direto já aponta para esta versão.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro no upload do APK.");
    } finally {
      setH2AutoUploading(false);
    }
  };

  const [personalDrafts, setPersonalDrafts] = useState<Record<string, H2AutoPersonalization>>({});
  const [personalSamples, setPersonalSamples] = useState<Record<string,string>>({});
  const [personalPreviews, setPersonalPreviews] = useState<Record<string,string>>({});
  const savePersonalization = trpc.h2AutoAdmin.savePersonalization.useMutation({
    onSuccess: (_result, vars) => {
      setPersonalDrafts(prev => { const next = {...prev}; delete next[vars.id]; return next; });
      toast.success("Personalização salva, sem alterar menus, pausas ou autenticação.");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: e => toast.error(e.message || "Falha ao salvar personalização"),
  });
  const previewPersonalization = trpc.h2AutoAdmin.previewPersonalization.useMutation({
    onError: e => toast.error(e.message || "Falha ao gerar prévia"),
  });
  const [pair, setPair] = useState<{ id: string; code: string } | null>(null);
  const [editing, setEditing] = useState<
    Record<string, { config: any; revision: number }>
  >({});
  // Isolado: não apaga rascunhos de regras, mídia ou comandos.
  const [fixedDrafts, setFixedDrafts] = useState<Record<string, {
    confirmation: H2AutoConfirmation; revision: number;
  }>>({});
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});
  const clearDraft = (id: string) =>
    setEditing(previous => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  const refreshDevice = (id: string) => {
    clearDraft(id);
    setConflicts(previous => ({ ...previous, [id]: false }));
    void utils.h2AutoAdmin.list.invalidate();
  };
  const create = trpc.h2AutoAdmin.create.useMutation({
    onSuccess: x => {
      setPair({ id: x.id, code: x.code });
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: () => toast.error("Falha ao criar aparelho"),
  });
  const pairCode = trpc.h2AutoAdmin.pairCode.useMutation({
    onSuccess: (x, variables) => setPair({ id: variables.id, code: x.code }),
    onError: () => toast.error("Falha ao gerar código"),
  });
  const save = trpc.h2AutoAdmin.save.useMutation({
    onSuccess: (_result, variables) => {
      clearDraft(variables.id);
      setConflicts(previous => ({ ...previous, [variables.id]: false }));
      toast.success(
        "Configuração geral salva; aguardando sincronização do celular"
      );
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT")
        setConflicts(previous => ({ ...previous, [variables.id]: true }));
      toast.error(error.message || "Falha ao salvar");
    },
  });
  const saveReplyRules = trpc.h2AutoAdmin.saveReplyRules.useMutation({
    onSuccess: (result, variables) => {
      setEditing(previous => {
        const draft = previous[variables.id];
        if (!draft || draft.revision !== variables.expectedRevision) return previous;
        return { ...previous, [variables.id]: { ...draft, revision: result.revision } };
      });
      setConflicts(previous => ({ ...previous, [variables.id]: false }));
      toast.success("Respostas antigas preservadas e salvas. Aguardando sincronização do aparelho.");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT") setConflicts(previous => ({ ...previous, [variables.id]: true }));
      toast.error(error.message || "Não foi possível salvar as respostas.");
    },
  });
  const saveConfirmation = trpc.h2AutoAdmin.saveConfirmation.useMutation({
    onSuccess: (_result, variables) => {
      setFixedDrafts(previous => {
        const current = previous[variables.id];
        if (!current || current.revision !== variables.expectedRevision) return previous;
        const next = { ...previous }; delete next[variables.id]; return next;
      });
      toast.success("Mensagens fixas salvas sem alterar autenticação, chaves ou regras do APK.");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: error => toast.error(error.message || "Falha ao salvar mensagens fixas."),
  });
  const [validityDraft, setValidityDraft] = useState<Record<string,string>>({});
  const validity = trpc.h2AutoAdmin.saveIdentificationValidity.useMutation({
    onSuccess: (_result, variables) => {
      toast.success("Validade da identificação atualizada no servidor");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: error => toast.error(error.message || "Não foi possível alterar validade"),
  });
  const safety = trpc.h2AutoAdmin.saveSafetySwitch.useMutation({
    onSuccess: () => { toast.success("Controle atualizado imediatamente no servidor"); void utils.h2AutoAdmin.list.invalidate(); },
    onError: e => toast.error(e.message || "Falha ao atualizar controle"),
  });
  const saveMedia = trpc.h2AutoAdmin.saveMedia.useMutation({
    onSuccess: (result, variables) => {
      // Only media was persisted. Keep unsaved menus/rules and any edits made
      // while the request was in flight; advance only the matching draft lease.
      setEditing(previous => {
        const draft = previous[variables.id];
        if (!draft || draft.revision !== variables.expectedRevision) return previous;
        return { ...previous, [variables.id]: { ...draft, revision: result.revision } };
      });
      setConflicts(previous => ({ ...previous, [variables.id]: false }));
      toast.success("Configuração de mídia salva separadamente");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: (error, variables) => {
      if (error.data?.code === "CONFLICT")
        setConflicts(previous => ({ ...previous, [variables.id]: true }));
      toast.error(error.message || "Falha ao salvar mídia");
    },
  });
  const merge = trpc.h2AutoAdmin.mergeLocal.useMutation({
    onSuccess: () => {
      toast.success("Configurações locais mescladas sem apagar as atuais");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const revoke = trpc.h2AutoAdmin.revoke.useMutation({
    onSuccess: (_result, variables) => {
      clearDraft(variables.id);
      toast.success(
        "Celular desvinculado. Configurações preservadas e diagnóstico limpo."
      );
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const remove = trpc.h2AutoAdmin.remove.useMutation({
    onSuccess: () => {
      toast.success("Celular removido do H2 AUTO.");
      void utils.h2AutoAdmin.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <div className="min-h-screen bg-[#040814] text-white">
      <AdminHeader title="H2 AUTO — CENTRAL DE COMANDO" icon={<Bot className="h-5 w-5" />} stackOnMobile />
      <main className="mx-auto max-w-[1540px] space-y-5 px-3 pb-16 pt-5 sm:px-6">
        <section className="relative overflow-hidden rounded-[28px] border border-cyan-400/30 bg-gradient-to-br from-[#103253] via-[#0d1837] to-[#170c36] p-5 shadow-2xl shadow-cyan-950/40 sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-cyan-400/15 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl space-y-3">
              <span className="inline-flex rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-black tracking-[0.16em] text-cyan-200">H2 COLOMBIANO · ADM 2.0</span>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">Central de <span className="text-cyan-300">Atendimento</span></h1>
              <p className="max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">Perguntas, respostas, controles e aparelhos em áreas independentes. A inteligência agora abre primeiro.</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200">SEM IA PAGA</span>
                <span className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-xs font-bold text-violet-200">COMANDO PELO ADM</span>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <a href="/baixar-h2-auto"
                aria-label="Baixar o APK H2 AUTO atualizado"
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200/50 bg-emerald-400 px-5 py-3 text-sm font-black text-[#04241e] shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-300 sm:w-auto">
                <ExternalLink className="h-5 w-5" />
                BAIXAR APK H2 AUTO {h2AutoApk?.versionName || ""}
              </a>
              <button type="button" onClick={() => {setSection("fixed"); void utils.h2AutoAdmin.list.invalidate();}}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/50 bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-amber-200 sm:w-auto">
                <Save className="h-4 w-4" /> EDITAR MENSAGENS FIXAS
              </button>
              <button type="button" onClick={() => {setSection("intelligence"); void utils.h2AutoAdmin.list.invalidate();}}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-300/15 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20 sm:w-auto">
                <RefreshCw className="h-4 w-4" /> ABRIR INTELIGÊNCIA
              </button>
            </div>
          </div>
        </section>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            {title:"APARELHOS",value:data.length,note:"cadastrados",color:"text-cyan-300"},
            {title:"VINCULADOS",value:data.filter((item:any)=>item.paired).length,note:"conectados ao ADM",color:"text-violet-300"},
            {title:"ROBÔ ATIVO",value:data.filter((item:any)=>item.config?.enabled).length,note:"respostas habilitadas",color:"text-emerald-300"},
            {title:"COLETA ATIVA",value:data.filter((item:any)=>item.config?.questionCollectionEnabled).length,note:"aprendizado controlado",color:"text-amber-300"},
          ].map(card=><div key={card.title} className="rounded-2xl border border-white/10 bg-[#0b1629] p-4 shadow-lg">
            <p className="text-[11px] font-bold tracking-widest text-slate-400">{card.title}</p>
            <p className={"mt-2 text-3xl font-black "+card.color}>{card.value}</p>
            <p className="mt-1 text-xs text-slate-400">{card.note}</p>
          </div>)}
        </div>
        <nav aria-label="Áreas do H2 AUTO" className="sticky top-[56px] z-40 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#081427]/95 p-2 shadow-xl backdrop-blur-md sm:mx-0">
          {([
            ["intelligence","🧠 INTELIGÊNCIA"],
            ["fixed","🔐 MENSAGENS FIXAS"],
            ["responses","💬 RESPOSTAS"],
            ["operations","⚡ OPERAÇÃO"],
            ["diagnostics","📊 DIAGNÓSTICO"],
            ["devices","📱 APARELHOS"],
          ] as const).map(([id,name])=><button key={id} type="button" onClick={()=>setSection(id)}
            aria-current={section===id?"page":undefined}
            className={"shrink-0 rounded-xl px-4 py-3 text-xs font-black tracking-wide transition sm:text-sm "+(section===id?"bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20":"border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white")}>
            {name}
          </button>)}
        </nav>
        {data.length>0 && (
          <button type="button" onClick={() => setSection("operations")}
            className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/40 bg-cyan-950/30 p-4 text-left transition hover:bg-cyan-900/35">
            <span>
              <strong className="block text-sm font-black text-cyan-100">🖥️ WHATSAPP DESKTOP — LER SEM PAUSAR O ROBÔ</strong>
              <span className="mt-1 block text-xs text-slate-300">Controle restaurado. Acompanhe mensagens no PC enquanto o APK responde pelo celular, quando houver notificação disponível.</span>
            </span>
            <span className="rounded-lg border border-cyan-400/50 px-3 py-2 text-xs font-black text-cyan-100">ABRIR EM OPERAÇÃO</span>
          </button>
        )}
        {data.length>0 && <div className="rounded-2xl border border-white/10 bg-[#09152a] p-3">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Selecionar aparelho</p>
          <div className="flex flex-wrap gap-2">
            {data.map((item:any)=><button key={item.id} type="button" onClick={()=>setSelectedDeviceId(item.id)}
              className={"inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-bold transition "+(item.id===(selectedDeviceId&&data.some((x:any)=>x.id===selectedDeviceId)?selectedDeviceId:data[0]?.id)?"border-cyan-300 bg-cyan-500/20 text-white ring-1 ring-cyan-400/40":"border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-700")}>
              <Smartphone className="h-4 w-4" />
              <span>{item.label}</span>
              <span className={"ml-1 h-2 w-2 rounded-full "+(item.paired&&!isStale(item.lastSeen)?"bg-emerald-400":"bg-slate-500")} />
            </button>)}
          </div>
        </div>}
        {!isLoading && data.length===0 && section!=="devices" && <div className="rounded-2xl border border-amber-400/30 bg-amber-950/20 p-6 text-sm text-amber-100">
          Nenhum aparelho vinculado. Abra <button type="button" className="font-black underline" onClick={()=>setSection("devices")}>APARELHOS</button> para cadastrar um.
        </div>}
        <div className={section==="devices"?"space-y-4":"hidden"}>
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/30 p-4 text-sm text-emerald-200">
          <ShieldCheck className="inline h-4 w-4 mr-2" />
          Sem API do WhatsApp e sem áudio no servidor. Apenas configurações e
          diagnóstico seguro sincronizados com o APK; o aparelho continua
          responsável por responder.
        </div>
        <div className="space-y-4 rounded-2xl border border-cyan-400/30 bg-cyan-950/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black text-cyan-200">
                APK H2 AUTO {h2AutoApk?.versionName || "— não publicado"}
              </p>
              <p className="text-xs text-slate-300">
                Download direto pelo H2 Colombiano, sem GitHub e sem alterar o robô.
              </p>
              {h2AutoApk ? (
                <p className="mt-1 text-xs text-emerald-300">
                  Versão {h2AutoApk.versionName} · código {h2AutoApk.versionCode} ·
                  {" "}{(h2AutoApk.fileSize / 1024).toFixed(1)} KB ·
                  publicado em {dateLabel(h2AutoApk.uploadedAt)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-300">
                  {loadingH2AutoApk ? "Consultando publicação..." : "Nenhum APK carregado no ADM H2 AUTO."}
                </p>
              )}
            </div>
            {h2AutoApk ? (
              <a href="/baixar-h2-auto"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-300">
                <ExternalLink className="h-4 w-4" />
                BAIXAR APK {h2AutoApk.versionName}
              </a>
            ) : (
              <span className="rounded-xl border border-amber-400/30 px-4 py-2 text-xs font-bold text-amber-200">
                DOWNLOAD INDISPONÍVEL
              </span>
            )}
          </div>
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-950/20 p-3 space-y-2">
            <p className="text-sm font-black text-emerald-300">PUBLICAÇÃO AUTOMÁTICA ATIVADA NO PROCESSO DE COMPILAÇÃO</p>
            <p className="text-xs text-slate-300">
              Após a compilação e validação da assinatura no GitHub Actions, o
              H2 AUTO é enviado diretamente para o armazenamento do site.
              Nenhum download ou upload manual é necessário.
            </p>
            <p className="text-xs text-slate-300">
              {h2AutoApk ? `Versão disponibilizada: ${h2AutoApk.versionName} (código ${h2AutoApk.versionCode}).`
                : "A publicação inicial ainda não foi recebida do processo oficial."}
            </p>
          </div>
          <details className="rounded-xl border border-cyan-400/20 bg-[#081223] p-3 space-y-3">
            <summary className="cursor-pointer text-sm font-bold text-cyan-300">Envio manual de emergência (opcional)</summary>
            <p className="pt-2 text-xs text-slate-300">
              Utilize apenas se a publicação automática falhar. O arquivo precisa
              ser assinado e validado; o atendimento e as configurações não são alterados.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-300">
                Versão
                <input className={field} value={h2AutoVersion}
                  onChange={event => {
                    const value=event.target.value;
                    setH2AutoVersion(value);
                    if(value !== "1.61") setH2AutoChecksum("");
                  }} placeholder="1.61" />
              </label>
              <label className="text-xs text-slate-300">
                Código da versão Android
                <input className={field} type="number" min={61} step={1}
                  value={h2AutoVersionCode}
                  onChange={event => setH2AutoVersionCode(event.target.value)} />
              </label>
            </div>
            <label className="block text-xs text-slate-300">
              SHA-256 do APK assinado
              <input className={field} value={h2AutoChecksum}
                onChange={event => setH2AutoChecksum(event.target.value)}
                maxLength={64} spellCheck={false} placeholder="64 caracteres hexadecimais" />
            </label>
            <input type="file" accept=".apk,application/vnd.android.package-archive"
              className="block w-full text-xs text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-700 file:px-3 file:py-2 file:text-white"
              onChange={event => setH2AutoFile(event.target.files?.[0] || null)} />
            {h2AutoFile && <p className="text-xs text-slate-300">
              {h2AutoFile.name} · {(h2AutoFile.size / 1024).toFixed(1)} KB
            </p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void uploadH2AutoApk()}
                disabled={!h2AutoFile || h2AutoUploading || !/^[a-f0-9]{64}$/i.test(h2AutoChecksum)}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
                {h2AutoUploading ? "VALIDANDO E ENVIANDO..." : "PUBLICAR APK H2 AUTO"}
              </button>
              <button type="button"
                onClick={() => { void navigator.clipboard.writeText(h2AutoDownloadUrl); toast.success("Link direto copiado."); }}
                disabled={!h2AutoApk}
                className="rounded-xl border border-cyan-400/40 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40">
                COPIAR LINK DIRETO
              </button>
            </div>
            <p className="break-all text-xs text-cyan-300">{h2AutoDownloadUrl}</p>
            <p className="text-xs text-amber-200">
              O link só é liberado após upload validado; preserve o H2 AUTO instalado e atualize por cima.
            </p>
          </details>
        </div>
        <Box>
          <h2 className="font-black text-cyan-300 flex gap-2">
            <Smartphone /> VINCULAR APARELHO
          </h2>
          <div className="flex gap-2">
            <input
              className={field}
              value={label}
              maxLength={80}
              onChange={e => setLabel(e.target.value)}
              placeholder="Nome do aparelho"
            />
            <button
              className="rounded-xl bg-cyan-500 px-4 font-bold text-slate-950"
              disabled={!label.trim() || create.isPending}
              onClick={() => create.mutate({ label })}
            >
              ADICIONAR
            </button>
          </div>
          {pair && (
            <div className="rounded-xl border border-yellow-400/40 p-4">
              <p className="text-yellow-300 font-black">
                CÓDIGO TEMPORÁRIO — 10 MINUTOS
              </p>
              <p className="text-3xl tracking-widest font-black">{pair.code}</p>
              <p className="text-xs opacity-70">
                Aparelho: {pair.id}. Insira este código no H2 AUTO. Ele aparece
                somente agora.
              </p>
            </div>
          )}
        </Box>
        </div>
        {isLoading && <p>Carregando aparelhos...</p>}
        {data.filter((item:any)=>item.id===(selectedDeviceId&&data.some((x:any)=>x.id===selectedDeviceId)?selectedDeviceId:data[0]?.id)).map((d: any) => {
          const draft = editing[d.id];
          const value = draft?.config || d.config;
          const expectedRevision = draft?.revision ?? d.revision;
          const media = { ...mediaDefaults, ...(value.media || {}) };
          const presetPreparation = prepareH2AutoCommonFaq(personalDrafts[d.id] ?? d.config.personalization ?? H2_AUTO_PERSONALIZATION_DEFAULT);
          const personalization = presetPreparation.personalization;
          const updatePersonalization = (patch: Partial<H2AutoPersonalization>) => {
            setPersonalDrafts(prev => ({...prev, [d.id]: {...personalization,...patch}}));
            setPersonalPreviews(prev => ({...prev, [d.id]: ""}));
          };
          const fixedDraft = fixedDrafts[d.id];
          const confirmation: H2AutoConfirmation = {
            ...confirmationDefaults,
            ...(fixedDraft?.confirmation ?? d.config.confirmation ?? {}),
          };
          const fixedNeedsRefresh = Boolean(fixedDraft && fixedDraft.revision !== d.revision);
          const changeConfirmation = (key: keyof H2AutoConfirmation, text: string) =>
            setFixedDrafts(previous => {
              const current = previous[d.id];
              const base = current?.confirmation ??
                ({ ...confirmationDefaults, ...(d.config.confirmation || {}) } as H2AutoConfirmation);
              return {
                ...previous,
                [d.id]: {
                  confirmation: { ...base, [key]: text },
                  revision: current?.revision ?? d.revision,
                },
              };
            });
          const mediaDirty =
            Boolean(draft) &&
            JSON.stringify(media) !==
              JSON.stringify({ ...mediaDefaults, ...(d.config.media || {}) });
          const staleDraft = Boolean(draft) && draft.revision !== d.revision;
          const needsRefresh = Boolean(conflicts[d.id] || staleDraft);
          const diagnostic = d.diagnostics;
          const diagnosticsStale = isStale(d.diagnosticsReceivedAt);
          const change = (fieldName: string, nextValue: any) =>
            setEditing(previous => {
              const current = previous[d.id]?.config || d.config;
              const revision = previous[d.id]?.revision ?? d.revision;
              return {
                ...previous,
                [d.id]: {
                  config: { ...current, [fieldName]: nextValue },
                  revision,
                },
              };
            });
          const updateMedia = (key: string, nextValue: any) =>
            change("media", { ...media, [key]: nextValue });
          const saveGeneral = () => {
            if (mediaDirty) {
              toast.warning(
                "Salve a Central de Áudios e Mídias pelo botão próprio antes da configuração geral."
              );
              return;
            }
            if (needsRefresh) return;
            save.mutate({
              id: d.id,
              config: { ...value, media: d.config.media, welcome: "", menu: Array(9).fill(""), rules: [] },
              expectedRevision,
            });
          };
          const saveOnlyMedia = () => {
            if (!mediaDirty || needsRefresh) return;
            saveMedia.mutate({ id: d.id, media, expectedRevision });
          };
          return (
            <Box key={d.id}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">{d.label}</h3>
                  <p className="text-xs opacity-65">
                    {d.paired ? "VINCULADO" : "AGUARDANDO VÍNCULO"} · Config.{" "}
                    {d.revision} · Aplicada {d.appliedRevision} ·{" "}
                    {d.lastSeen
                      ? "Última sincronização: " + dateLabel(d.lastSeen)
                      : "Nunca sincronizado"}
                  </p>
                </div>
                {section==="devices" && <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs"
                    onClick={() => pairCode.mutate({ id: d.id })}
                  >
                    NOVO CÓDIGO
                  </button>
                  <button
                    disabled={!d.paired || revoke.isPending}
                    className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-bold text-amber-300 disabled:opacity-40"
                    onClick={() => {
                      if (
                        confirm(
                          "DESVINCULAR " +
                            d.label +
                            "?\nO celular perderá a autorização de sincronizar e consultar pedidos. As configurações do ADM serão preservadas."
                        )
                      )
                        revoke.mutate({ id: d.id });
                    }}
                  >
                    DESVINCULAR CELULAR
                  </button>
                  <button
                    disabled={remove.isPending}
                    className="rounded-lg border border-red-500/50 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-40"
                    onClick={() => {
                      if (
                        confirm(
                          "REMOVER DEFINITIVAMENTE " +
                            d.label +
                            "?\nIsso apagará somente o aparelho H2 AUTO, sua cópia local armazenada no ADM, diagnóstico e sessões de consulta. Não apaga pedidos, clientes nem outros serviços."
                        )
                      )
                        remove.mutate({ id: d.id });
                    }}
                  >
                    REMOVER APARELHO
                  </button>
                </div>}
              </div>
              {needsRefresh && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-950/30 p-3 text-sm text-amber-100">
                  <span>
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    Este rascunho começou na revisão {draft?.revision}; o
                    servidor está na revisão {d.revision}. Nada foi mesclado
                    automaticamente.
                  </span>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-300 px-3 py-2 text-xs font-black text-slate-950"
                    onClick={() => refreshDevice(d.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    RECARREGAR E DESCARTAR RASCUNHO
                  </button>
                </div>
              )}
              <div className={section==="devices"?"space-y-4":"hidden"}>
              {d.snapshotConfig && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 space-y-2">
                  <div className="font-bold text-amber-200">
                    CÓPIA DAS CONFIGURAÇÕES DO CELULAR DISPONÍVEL
                  </div>
                  <p className="text-xs text-white/70">
                    Recebida em{" "}
                    {d.snapshotReceivedAt
                      ? dateLabel(d.snapshotReceivedAt)
                      : "data desconhecida"}
                    . A cópia original fica preservada. Mesclar preenche os
                    campos vazios e adiciona regras que ainda não existem no
                    ADM.
                  </p>
                  <button
                    className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-black"
                    disabled={merge.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          "Mesclar dados locais sem apagar configurações atuais do ADM?"
                        )
                      )
                        merge.mutate({
                          id: d.id,
                          expectedRevision: d.revision,
                        });
                    }}
                  >
                    IMPORTAR CONFIGURAÇÕES DO CELULAR
                  </button>
                </div>
              )}
              </div>
              <div className={section==="operations"?"space-y-4":"hidden"}>
              <section className="rounded-2xl border border-rose-400/40 bg-rose-950/25 p-4 space-y-3">
                <h4 className="font-black text-rose-200 flex items-center gap-2"><Power className="h-5 w-5"/> CONTROLES IMEDIATOS DO ROBÔ</h4>
                <p className="text-xs text-slate-300">A atualização é aplicada no servidor sem aguardar a sincronização do celular. Se não houver internet, o APK deve bloquear envios por segurança.</p>
                <p className="text-xs text-amber-200">Ao desativar a identificação, ficam disponíveis apenas os caminhos públicos de novos clientes. Dados de clientes continuam protegidos.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" disabled={safety.isPending} onClick={() => safety.mutate({id:d.id,key:"enabled",value:!d.config.enabled})}
                    className={`rounded-xl p-4 font-black border ${d.config.enabled?"border-red-400 bg-red-700 text-white":"border-emerald-400 bg-emerald-800 text-white"}`}>
                    {d.config.enabled ? "⛔ DESLIGAR TODAS AS RESPOSTAS" : "✅ ATIVAR RESPOSTAS"}
                  </button>
                  <button type="button" disabled={safety.isPending} onClick={() => safety.mutate({id:d.id,key:"identificationEnabled",value:d.config.identificationEnabled===false})}
                    className="rounded-xl p-4 font-black border border-cyan-500/50 bg-slate-800 text-white">
                    {d.config.identificationEnabled===false?"ATIVAR IDENTIFICAÇÃO INICIAL":"DESATIVAR IDENTIFICAÇÃO INICIAL"}
                  </button>
                </div>

              </section>
              <section className="rounded-2xl border border-emerald-400/50 bg-emerald-950/25 p-4 space-y-3">
                <h4 className="text-lg font-black text-emerald-200">📦 ACOMPANHAR PEDIDO — STATUS PELO WHATSAPP</h4>
                <p className="text-sm text-slate-200">Após a identificação do cliente, o H2 AUTO permite consultar pedidos sem árvore de atendimento, usando os recursos de consulta já autorizados.</p>
                <p className="text-xs text-slate-300">A consulta só funciona para clientes autenticados e com sessão válida. As perguntas personalizadas substituem a antiga árvore de atendimento.</p>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-slate-950/55 p-3">
                  <div>
                    <p className="text-sm font-black">{d.config.ordersEnabled ? "✅ CONSULTA DE STATUS ATIVADA" : "⛔ CONSULTA DE STATUS DESATIVADA"}</p>
                    <p className="mt-1 text-xs text-slate-400">Ação independente. Não apaga perguntas, regras ou mensagens existentes.</p>
                  </div>
                  <button type="button" disabled={safety.isPending}
                    onClick={() => safety.mutate({id:d.id,key:"ordersEnabled",value:!Boolean(d.config.ordersEnabled)})}
                    className={`rounded-xl border px-4 py-3 text-sm font-black disabled:opacity-50 ${d.config.ordersEnabled ? "border-rose-400/50 bg-rose-700 text-white" : "border-emerald-400 bg-emerald-500 text-slate-950"}`}>
                    {d.config.ordersEnabled ? "DESATIVAR CONSULTA" : "ATIVAR CONSULTA DE PEDIDOS"}
                  </button>
                </div>
                <p className="text-xs text-amber-200">Requer APK H2 Auto 1.45 instalado e sincronizado para corrigir o encaminhamento do menu.</p>
              </section>
              <section className="rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-cyan-950/40 to-slate-950 p-4 space-y-3">
                <h4 className="text-lg font-black text-cyan-200">🖥️ DESKTOP + PRAZO DE AUTENTICAÇÃO</h4>
                <p className="text-sm text-slate-300">Você pode acompanhar e ler conversas no WhatsApp Desktop sem iniciar pausa automática. O H2 AUTO continua respondendo pelo celular enquanto houver notificação utilizável. Pausas manuais, contatos silenciados e comandos seguem funcionando.</p>
                <p className="text-xs text-amber-200">Não garante respostas quando o WhatsApp remove a notificação antes do Android receber a mensagem. A resposta pelo PC não é identificada como atendimento manual; pause o contato no ADM antes de responder.</p>
                <button type="button" disabled={safety.isPending}
                  onClick={() => safety.mutate({id:d.id,key:"desktopReadOnly",value:d.config.desktopReadOnly!==true})}
                  className={`w-full rounded-xl border px-4 py-3 font-black ${d.config.desktopReadOnly?"border-cyan-400 bg-cyan-800 text-white":"border-slate-600 bg-slate-800 text-slate-200"}`}>
                  {d.config.desktopReadOnly?"✅ DESKTOP SOMENTE LEITURA — ATIVADO":"ATIVAR DESKTOP SOMENTE LEITURA"}
                </button>
                <p className={d.paired && d.appliedRevision===d.revision?"text-emerald-300 text-xs":"text-amber-200 text-xs"}>
                  {d.paired && d.appliedRevision===d.revision?"Configuração sincronizada com o APK":"Após ativar, sincronize o H2 AUTO no celular para aplicar."}
                </p>
                <div className="rounded-xl border border-cyan-400/40 bg-slate-950/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="flex items-center gap-2 text-sm font-black text-cyan-100">
                      <Clock className="h-4 w-4"/> AUTENTICAÇÃO — QUANDO PEDIR NOVAMENTE
                    </h5>
                    <span className="rounded-lg bg-cyan-950 px-3 py-1 text-xs font-bold text-cyan-200">
                      Atual: {d.config.identificationSessionHours ?? 24} horas
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">Depois da confirmação do telefone e código por e-mail, o acesso continua válido pelo prazo escolhido. O cliente só precisa se identificar novamente quando vencer ou se o acesso for revogado.</p>
                  <div className="flex flex-wrap gap-2" aria-label="Prazos rápidos de autenticação">
                    {([{hours:1,label:"1 hora"},{hours:6,label:"6 horas"},{hours:12,label:"12 horas"},{hours:24,label:"24 horas"},{hours:72,label:"3 dias"},{hours:168,label:"7 dias"},{hours:720,label:"30 dias"}] as const).map(item => {
                      const chosen = Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24) === item.hours;
                      return <button type="button" key={item.hours} onClick={() => setValidityDraft(old => ({...old,[d.id]:String(item.hours)}))}
                        aria-pressed={chosen} className={"rounded-lg border px-3 py-2 text-xs font-bold transition "+(chosen?"border-cyan-300 bg-cyan-600 text-white":"border-slate-600 bg-slate-900 text-slate-300 hover:border-cyan-400")}>
                        {item.label}
                      </button>;
                    })}
                  </div>
                  <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-200">
                    Ou defina o prazo em horas (1 a 720):
                    <input type="number" min={1} max={720} step={1}
                      className="w-28 rounded-lg border border-cyan-500/40 bg-slate-900 p-2 text-white"
                      value={validityDraft[d.id] ?? String(d.config.identificationSessionHours ?? 24)}
                      onChange={e => setValidityDraft(old => ({...old,[d.id]:e.target.value}))}/>
                  </label>
                  <button type="button" disabled={validity.isPending || !Number.isInteger(Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)) || Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)<1 || Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)>720 || Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)===Number(d.config.identificationSessionHours ?? 24)}
                    onClick={() => validity.mutate({id:d.id,hours:Number(validityDraft[d.id] ?? d.config.identificationSessionHours ?? 24)})}
                    className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40">
                    {validity.isPending?"SALVANDO...":"SALVAR TEMPO DE AUTENTICAÇÃO"}
                  </button>
                  <p className="text-xs text-amber-200">Não elimina autenticação, verificação de e-mail ou bloqueio. A alteração vale no servidor sem recompilar o APK; diminuir o prazo também pode antecipar uma nova confirmação.</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/25 p-3 space-y-1 text-xs text-slate-300">
                  <p><strong>Diagnóstico Android:</strong> {diagnostic?.desktopLastCode ?? "Sem registro"}</p>
                  <p><strong>Último evento:</strong> {dateLabel(diagnostic?.desktopLastAt)}</p>
                  <p><strong>Modo no APK:</strong> {diagnostic?.desktopReadOnly?"Ativado":diagnostic?"Desativado":"Não informado"}</p>
                </div>
              </section>

              </div>
              <div className={section==="intelligence"?"space-y-4":"hidden"}>
                <div className="rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-cyan-950/50 to-indigo-950/40 p-4 sm:p-5">
                  <h2 className="text-xl font-black text-white sm:text-2xl">🧠 Inteligência de Atendimento</h2>
                  <p className="mt-1 text-sm text-slate-300">Colete dúvidas reais, aprove respostas e expanda o conhecimento do H2 AUTO sem mensalidade de IA.</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-950/20 p-4">
                  <div>
                    <h3 className="font-black text-amber-200">🔐 MENSAGENS FIXAS — IDENTIFICAÇÃO</h3>
                    <p className="mt-1 text-xs text-slate-300">Edite início, opções 1, 2 e 3, pedidos de telefone, código e confirmações. As regras permanecem protegidas.</p>
                  </div>
                  <button type="button" onClick={() => setSection("fixed")}
                    className="rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950">ABRIR FORMULÁRIO DE MENSAGENS FIXAS</button>
                </div>
              <H2AutoLearningPanel deviceId={d.id} enabled={Boolean(d.config.questionCollectionEnabled)} />
              <section className="rounded-2xl border border-violet-400/45 bg-gradient-to-br from-violet-950/30 to-slate-950 p-4 space-y-4">
                <h4 className="text-lg font-black text-violet-200">🧠 ATENDIMENTO PERSONALIZADO — SEM CUSTO DE IA</h4>
                <p className="text-sm text-slate-300">Reconhece perguntas livres sobre pedidos, códigos, fotos, valores, indicações e atendimento. Responde com orientação pública e tom escolhido; só usa o primeiro nome após validação do cliente. Não consulta status sem autenticação nem faz promessas de atendimento. Nenhum serviço de IA pago será contratado.</p>
                <p className="text-xs text-amber-200">Respostas personalizadas substituem a árvore. A identificação, código de e-mail, /H2, /H3, bloqueios e pausas continuam obrigatórios. O envio depende do aplicativo Android.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-xl border border-violet-400/25 bg-slate-900 p-3 font-bold text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={personalization.enabled} onChange={e => updatePersonalization({enabled:e.target.checked})}/>
                    {personalization.enabled ? "PERSONALIZAÇÃO ATIVADA" : "ATIVAR PERSONALIZAÇÃO"}
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-violet-400/25 bg-slate-900 p-3 text-sm">
                    TOM
                    <select className={field} value={personalization.tone} onChange={e => updatePersonalization({tone:e.target.value as H2AutoPersonalization["tone"]})}>
                      <option value="acolhedor">Acolhedor</option>
                      <option value="objetivo">Objetivo</option>
                      <option value="profissional">Profissional</option>
                    </select>
                  </label>
                  <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-200">
                    <input type="checkbox" checked={personalization.verifiedName} onChange={e => updatePersonalization({verifiedName:e.target.checked})}/>
                    Usar primeiro nome somente após identificação por código
                  </label>
                </div>
                <div className="space-y-3 rounded-xl border border-violet-400/25 bg-slate-950/65 p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div><h5 className="font-black text-violet-100">PERGUNTAS E RESPOSTAS LIVRES</h5><p className="text-xs text-slate-300">Sem botões ou números para o cliente. Até 1000 respostas individuais por aparelho.</p></div>
                    <button type="button" disabled={(personalization.faq ?? []).length>=1000} className="rounded-lg bg-violet-600 px-4 py-2 font-black text-xs disabled:opacity-40"
                      onClick={()=>updatePersonalization({faq:[...(personalization.faq??[]),{id:"faq_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,6),question:"",variations:"",answer:"",enabled:true}]})}>+ ADICIONAR PERGUNTA E RESPOSTA</button>
                  </div>
                  {(personalization.faq ?? []).map((faq,index)=><div key={faq.id} className="rounded-xl border border-violet-500/30 bg-[#080b1c] p-3 space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <strong className="text-sm">PERGUNTA {index+1}</strong>
                      <div className="flex gap-3 items-center">
                        <label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={faq.enabled} onChange={e=>updatePersonalization({faq:personalization.faq.map(x=>x.id===faq.id?{...x,enabled:e.target.checked}:x)})}/> Ativa</label>
                        <button type="button" className="text-red-300 text-xs font-bold" onClick={()=>updatePersonalization({faq:personalization.faq.filter(x=>x.id!==faq.id)})}>EXCLUIR</button>
                      </div>
                    </div>
                    <input className={field} maxLength={160} placeholder="Pergunta que o cliente pode escrever" value={faq.question}
                      onChange={e=>updatePersonalization({faq:personalization.faq.map(x=>x.id===faq.id?{...x,question:e.target.value}:x)})}/>
                    <label className="block text-xs font-black text-violet-200">SUBPERGUNTAS — outras formas de perguntar</label>
                    <textarea className={field+" min-h-44 resize-y"} rows={7} maxLength={H2_AUTO_FAQ_MAX_VARIATION_CHARS} placeholder="Digite ou cole até 1.000 linhas, uma subpergunta por linha" value={faq.variations}
                      onChange={e=>updatePersonalization({faq:personalization.faq.map(x=>x.id===faq.id?{...x,variations:e.target.value}:x)})}/>
                    <p className={"text-right text-xs font-bold "+(h2AutoFaqVariationLineCount(faq.variations)>H2_AUTO_FAQ_MAX_VARIATION_LINES?"text-red-300":"text-emerald-300")}>
                      {h2AutoFaqVariationLineCount(faq.variations)} / {H2_AUTO_FAQ_MAX_VARIATION_LINES} linhas de subperguntas
                    </p>
                    <textarea className={field} rows={4} maxLength={1200} placeholder="Resposta automática em texto livre, com quebras de linha para celular" value={faq.answer}
                      onChange={e=>updatePersonalization({faq:personalization.faq.map(x=>x.id===faq.id?{...x,answer:e.target.value}:x)})}/>
                  </div>)}
                  <p className="text-xs text-emerald-200">{H2_AUTO_FAQ_SUGGESTIONS.length} perguntas sugeridas, desativadas e editáveis. Confira e salve para conservar as edições.</p>
                  <p className="text-xs text-amber-200">Salve apenas perguntas e respostas completas. Perguntas ambíguas seguem o atendimento atual, sem inventar respostas.</p>
                </div>
                <div className="space-y-2 rounded-xl border border-violet-400/25 bg-slate-950/65 p-3">
                  <p className="text-sm font-bold text-violet-200">TESTAR RESPOSTA ANTES DE ATIVAR</p>
                  <input className={field} maxLength={280} placeholder="Digite uma pergunta como o cliente escreveria..." value={personalSamples[d.id] ?? ""} onChange={e => setPersonalSamples(prev=>({...prev,[d.id]:e.target.value}))}/>
                  <button type="button" className="rounded-lg border border-violet-400/50 bg-violet-800/40 px-4 py-2 text-xs font-black" disabled={previewPersonalization.isPending || !(personalSamples[d.id] ?? "").trim()}
                    onClick={async () => {
                      try {
                        const result = await previewPersonalization.mutateAsync({
                          input: (personalSamples[d.id] ?? "").trim(),
                          personalization: {...personalization,enabled:true},
                        });
                        setPersonalPreviews(prev => ({...prev,[d.id]:result.answer?.message ?? "Nenhuma regra encontrou resposta para essa pergunta."}));
                      } catch { /* onError exibe mensagem */ }
                    }}>VISUALIZAR RESPOSTA</button>
                  {personalPreviews[d.id] && <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-white">{personalPreviews[d.id]}</pre>}
                </div>
                <button type="button" className="rounded-xl bg-violet-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50"
                  disabled={savePersonalization.isPending || (!personalDrafts[d.id] && presetPreparation.added===0) || (personalization.faq??[]).some(x=>x.question.trim().length<3 || x.answer.trim().length<3 || h2AutoFaqVariationLineCount(x.variations)>H2_AUTO_FAQ_MAX_VARIATION_LINES)}
                  onClick={()=>savePersonalization.mutate({id:d.id,personalization})}>SALVAR PERSONALIZAÇÃO DESTE APARELHO</button>
              </section>
              </div>
              <div className={section==="responses"?"space-y-4":"hidden"}>
              <nav aria-label="Central de respostas" className="sticky top-1 z-20 rounded-xl border border-cyan-400/30 bg-[#071629]/95 p-3 shadow-xl">
                <p className="mb-2 text-sm font-black text-cyan-200">💬 RESPOSTAS E CONFIRMAÇÕES</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSection("fixed")} className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-bold text-amber-200">Editar mensagens fixas</button>
                  <a href={`#h2-media-${d.id}`} className="rounded-lg border border-sky-400/30 px-3 py-2 text-xs font-bold text-sky-100">Mídias</a>
                </div>
              </nav>
              </div>
              <div className={section==="diagnostics"?"space-y-4":"hidden"}>
              <H2AutoValidationBlocks deviceId={d.id} deviceLabel={d.label} />
              <H2AutoSilencedContacts deviceId={d.id} deviceLabel={d.label} />
              <H2AutoHistoryPanel
                deviceId={d.id}
                label={d.label}
                history={d.history}
                receivedAt={d.historyReceivedAt}
              />
              <section className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-950/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Image className="h-5 w-5 text-fuchsia-300" />
                  <h4 className="font-black text-fuchsia-200">
                    DIAGNÓSTICO REPORTADO PELO APK
                  </h4>
                </div>
                {diagnostic ? (
                  <>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <p>
                        APK reportado:{" "}
                        <strong>
                          {diagnostic.apkVersion || "versão não informada"}
                        </strong>{" "}
                        (código {diagnostic.apkVersionCode})
                        {diagnosticsStale && (
                          <span className="ml-1 text-amber-300">
                            · relatório antigo
                          </span>
                        )}
                      </p>
                      <p>
                        Recebido pelo ADM:{" "}
                        <strong>{dateLabel(d.diagnosticsReceivedAt)}</strong>
                      </p>
                      <p>
                        Mídias:{" "}
                        <strong>
                          {diagnostic.mediaEnabled
                            ? "habilitadas"
                            : "desabilitadas"}
                        </strong>{" "}
                        · transcrição configurada:{" "}
                        <strong>
                          {diagnostic.transcribeConfigured ? "sim" : "não"}
                        </strong>
                      </p>
                      <p>
                        Permissão de microfone:{" "}
                        <strong>
                          {diagnostic.recordAudioPermission
                            ? "concedida"
                            : "necessária"}
                        </strong>{" "}
                        · listener:{" "}
                        <strong>
                          {diagnostic.listenerConnected
                            ? "conectado"
                            : "desconectado"}
                        </strong>
                      </p>
                      <p>
                        Último estado:{" "}
                        <strong>
                          {statusLabels[diagnostic.statusCode] ||
                            diagnostic.statusCode}
                        </strong>{" "}
                        <span className="opacity-60">
                          ({diagnostic.statusCode})
                        </span>{" "}
                        em {dateLabel(diagnostic.statusAt)}
                      </p>
                      <p>
                        Última resposta:{" "}
                        <strong>
                          {replyLabels[diagnostic.replyStatusCode] ||
                            diagnostic.replyStatusCode}
                        </strong>{" "}
                        <span className="opacity-60">
                          ({diagnostic.replyStatusCode})
                        </span>{" "}
                        em {dateLabel(diagnostic.replyStatusAt)}
                      </p>
                      <p>
                        Último erro Android:{" "}
                        <strong>
                          {diagnostic.androidErrorCode === -1
                            ? "nenhum código seguro reportado"
                            : `código ${diagnostic.androidErrorCode}`}
                        </strong>
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-300">
                    Nenhum relatório recebido. Versão instalada:{" "}
                    <strong>desconhecida</strong>; o ADM não presume 1.15 nem
                    qualquer outra versão.
                  </p>
                )}
                <p className="text-xs text-slate-300">
                  Permissão de microfone não garante acesso à fonte do áudio ou
                  à notificação. A captura de áudio de notificações é uma
                  tentativa de melhor esforço; se a fonte/URI estiver
                  indisponível, o ADM não consegue corrigir isso remotamente —
                  aguarde o APK atualizado. Nenhuma configuração é ativada
                  automaticamente.
                </p>
              </section>
              </div>
              <div className={section==="operations"?"space-y-4":"hidden"}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs flex flex-col gap-2">
                  APLICATIVO WHATSAPP
                  <select
                    className={field}
                    value={value.whatsappMode}
                    onChange={e =>
                      change("whatsappMode", Number(e.target.value))
                    }
                  >
                    <option value={-1}>Manter seleção do celular</option>
                    <option value={0}>WhatsApp Normal</option>
                    <option value={1}>WhatsApp Business</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value.enabled}
                    onChange={e => change("enabled", e.target.checked)}
                  />
                  <Power className="h-4 w-4" /> Robô habilitado remotamente
                </label>
                <p className="col-span-full text-xs text-emerald-200/80">A consulta de pedidos pode ser ativada e desativada no card “ACOMPANHAR PEDIDO — STATUS PELO WHATSAPP” acima.</p>
              </div>
              </div>
              <div className={section==="fixed"?"space-y-4":"hidden"}>
                <div id={`h2-confirm-${d.id}`} className="col-span-full scroll-mt-32 rounded-2xl border border-violet-400/40 bg-violet-950/20 p-3 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-black text-violet-200">
                        🔐 MENSAGENS FIXAS DO ATENDIMENTO — H2 AUTO
                      </h4>
                      <p className="mt-1 text-xs text-slate-300">
                        Edite apenas os textos de início, opções 1, 2 e 3, telefone, código e avisos.
                        Chaves, validação por e-mail, tentativas e bloqueios continuam obrigatórios. Os números e as frases são atalhos de autenticação, não a árvore antiga.
                      </p>
                    </div>
                    <span className="rounded-lg border border-violet-400/30 px-3 py-2 text-xs font-bold text-violet-200">
                      {confirmationGroups.reduce((total, group) => total + group.fields.length, 0)} campos editáveis
                    </span>
                  </div>
                  {confirmationGroups.map((group, groupIndex) => (
                    <details key={group.id} open={groupIndex === 0} className="rounded-xl border border-violet-400/20 bg-slate-950/60 p-3 sm:p-4">
                      <summary className="cursor-pointer select-none text-sm font-black text-violet-200">
                        {groupIndex + 1}. {group.title} ({group.fields.length})
                      </summary>
                      <p className="mt-2 text-xs text-slate-400">{group.description}</p>
                      <div className="mt-3 space-y-4">
                        {group.fields.map(({ key, label, help }) => (
                          <div key={key} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label htmlFor={`h2-confirm-${d.id}-${key}`} className="text-xs font-bold text-white">
                                {label}
                              </label>
                              <button type="button" className="rounded-lg border border-slate-500/40 px-2 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-800"
                                onClick={() => changeConfirmation(key, confirmationDefaults[key])}>
                                Restaurar padrão
                              </button>
                            </div>
                            {help && <p className="text-[11px] text-amber-200">{help}</p>}
                            <textarea id={`h2-confirm-${d.id}-${key}`}
                              rows={key === "identificationWelcome" || key === "customerProfileUpdate" ? 9 : 4}
                              maxLength={2000}
                              className={field + " min-h-24 resize-y whitespace-pre-wrap"}
                              value={confirmation[key]}
                              onChange={e => changeConfirmation(key, e.target.value)}
                            />
                            <div className="text-right text-[11px] text-slate-400">{confirmation[key].length}/2000 caracteres</div>
                            <details className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2">
                              <summary className="cursor-pointer text-xs font-bold text-cyan-200">Visualizar mensagem no WhatsApp</summary>
                              <div className="mt-2"><H2AutoWhatsAppPreview message={confirmation[key]} /></div>
                            </details>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                  {fixedNeedsRefresh && (
                    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/50 bg-amber-950/30 p-3 text-xs font-bold text-amber-100">
                      <span>O aparelho teve uma nova revisão. Recarregue as mensagens para evitar conflitos.</span>
                      <button type="button" onClick={() => {
                        setFixedDrafts(previous => { const next = { ...previous }; delete next[d.id]; return next; });
                        void utils.h2AutoAdmin.list.invalidate();
                      }} className="rounded-lg bg-amber-300 px-3 py-2 text-slate-950">RECARREGAR MENSAGENS</button>
                    </div>
                  )}
                  <button type="button" disabled={saveConfirmation.isPending || fixedNeedsRefresh || !fixedDraft}
                    onClick={() => {
                      const invalid = Object.entries(confirmation).find(([, message]) => !String(message).trim());
                      if (invalid) { toast.error("Preencha todos os textos de confirmação antes de salvar."); return; }
                      saveConfirmation.mutate({ id: d.id, confirmation, expectedRevision: fixedDraft.revision });
                    }}
                    className="w-full rounded-xl border border-emerald-400/60 bg-emerald-700 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-600 disabled:opacity-50">
                    {saveConfirmation.isPending ? "SALVANDO..." : "💾 SALVAR MENSAGENS FIXAS DESTE APARELHO"}
                  </button>
                  <p className="text-xs text-slate-400">O salvamento muda somente os textos: chaves, autenticação, regras, perguntas personalizadas e pausas permanecem intactas.</p>
                </div>
              </div>
              <div className={section==="operations"?"space-y-4":"hidden"}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="col-span-full rounded-xl border border-cyan-400/30 bg-cyan-950/20 p-3 space-y-3">
                  <h4 className="font-black text-cyan-300">
                    INTEGRAÇÃO COM PEDIDOS DO SITE
                  </h4>
                  <p className="text-xs text-white/60">
                    Ative somente após instalar e testar o APK compatível.
                    Código de e-mail sempre obrigatório.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="text-xs">
                      Sessão autenticada (horas)
                      <input
                        type="number"
                        min={1}
                        max={72}
                        className={field}
                        value={value.orderSessionHours ?? 24}
                        onChange={e =>
                          change("orderSessionHours", Number(e.target.value))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Validade do código (minutos)
                      <input
                        type="number"
                        min={5}
                        max={30}
                        className={field}
                        value={value.orderCodeTtlMinutes ?? 10}
                        onChange={e =>
                          change("orderCodeTtlMinutes", Number(e.target.value))
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Tentativas de código
                      <input
                        type="number"
                        min={3}
                        max={10}
                        className={field}
                        value={value.orderCodeMaxAttempts ?? 5}
                        onChange={e =>
                          change("orderCodeMaxAttempts", Number(e.target.value))
                        }
                      />
                    </label>
                  </div>
                  <label className="block text-xs">
                    Mensagem para cliente sem pedidos
                    <textarea
                      rows={3}
                      className={field}
                      maxLength={600}
                      value={
                        value.orderNoOrdersMessage ??
                        H2_AUTO_SHORT_ORDER_NOT_FOUND
                      }
                      onChange={e =>
                        change("orderNoOrdersMessage", e.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs space-y-1">
                  <p className="font-bold text-cyan-200">PAUSA DO ATENDENTE — 24 HORAS</p>
                  <p>Tempo configurado no ADM: <strong>{d.config.pauseMinutes} min</strong>{draft && value.pauseMinutes !== d.config.pauseMinutes ? ` · Novo valor ainda não salvo: ${value.pauseMinutes} min` : ""}</p>
                  <p className={d.paired && d.appliedRevision === d.revision ? "text-emerald-300" : "text-amber-300"}>
                    {d.paired && d.appliedRevision === d.revision
                      ? `Revisão ${d.appliedRevision} confirmada pelo APK`
                      : !d.paired ? "Celular não vinculado — tempo ainda não aplicado"
                        : `Sincronização pendente: servidor ${d.revision}, APK ${d.appliedRevision}`}
                  </p>
                  <p className="text-muted-foreground">A pausa não depende dos horários ativos. A confirmação da revisão não garante que o WhatsApp tenha informado a resposta manual.</p>
                </div>
                <label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Pausa atendente (min)
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    className={field}
                    value={value.pauseMinutes}
                    onChange={e =>
                      change("pauseMinutes", Number(e.target.value))
                    }
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={value.scheduleOn}
                    onChange={e => change("scheduleOn", e.target.checked)}
                  />{" "}
                  Horários ativos
                </label>
                <div className="flex gap-2">
                  <input
                    className={field}
                    value={value.scheduleStart}
                    onChange={e => change("scheduleStart", e.target.value)}
                    placeholder="09:00"
                  />
                  <input
                    className={field}
                    value={value.scheduleEnd}
                    onChange={e => change("scheduleEnd", e.target.value)}
                    placeholder="18:00"
                  />
                </div>
              </div>
              </div>
              <div className={section==="responses"?"space-y-4":"hidden"}>
              <section id={`h2-media-${d.id}`} className="scroll-mt-32 rounded-2xl border border-sky-400/35 bg-sky-950/25 p-4 space-y-3">
                <h4 className="font-black text-sky-300 flex items-center gap-2">
                  <Mic className="h-5 w-5" /> CENTRAL DE ÁUDIOS E MÍDIAS
                </h4>
                <p className="text-xs text-slate-300">
                  Esta área tem salvamento próprio e não altera menu, pedidos ou
                  regras. O fallback vazio continua independente de corrigir ou
                  não a transcrição do APK.
                </p>
                <label className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={media.enabled}
                    onChange={e => updateMedia("enabled", e.target.checked)}
                  />
                  Responder mídias recebidas
                </label>
                <label className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={media.transcribeAudio}
                    onChange={e =>
                      updateMedia("transcribeAudio", e.target.checked)
                    }
                  />
                  Tentar transcrever áudio localmente quando acessível
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs">
                    Intervalo por conversa (segundos)
                    <input
                      type="number"
                      min={15}
                      max={3600}
                      className={field}
                      value={media.cooldownSeconds}
                      onChange={e =>
                        updateMedia("cooldownSeconds", Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="text-xs">
                    Duração máxima de áudio (segundos)
                    <input
                      type="number"
                      min={5}
                      max={120}
                      className={field}
                      value={media.maxAudioSeconds}
                      onChange={e =>
                        updateMedia("maxAudioSeconds", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                {(
                  [
                    ["audioFallback", "ÁUDIO NÃO TRANSCRITO"],
                    ["photoReply", "FOTO"],
                    ["videoReply", "VÍDEO"],
                    ["documentReply", "DOCUMENTO"],
                    ["stickerReply", "FIGURINHA"],
                    ["unknownReply", "MÍDIA DESCONHECIDA"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="block text-xs font-bold text-sky-200"
                  >
                    {label}
                    <textarea
                      className={field}
                      rows={2}
                      maxLength={3000}
                      value={media[key]}
                      onChange={e => updateMedia(key, e.target.value)}
                    />
                  </label>
                ))}
                <button
                  className="w-full rounded-xl bg-sky-300 p-3 text-slate-950 font-black disabled:opacity-40"
                  disabled={!mediaDirty || needsRefresh || saveMedia.isPending}
                  onClick={saveOnlyMedia}
                >
                  <Save className="inline h-4 w-4 mr-1" />
                  SALVAR SOMENTE ÁUDIOS E MÍDIAS
                </button>
              </section>
              </div>
              <div className={section==="operations"?"space-y-4":"hidden"}>
              <label className="block text-xs">
                CONTATOS BLOQUEADOS (um por linha)
                <textarea
                  className={field}
                  rows={2}
                  value={value.blocked}
                  onChange={e => change("blocked", e.target.value)}
                />
              </label>
              <button
                className="w-full rounded-xl bg-emerald-400 p-3 text-slate-950 font-black disabled:opacity-40"
                disabled={needsRefresh || save.isPending || mediaDirty}
                onClick={saveGeneral}
              >
                <Save className="inline h-4 w-4 mr-1" />
                SALVAR CONFIGURAÇÃO GERAL
              </button>
              </div>
            </Box>
          );
        })}
        <p className="text-xs text-slate-500">
          <CheckCircle2 className="mr-1 inline h-4 w-4" />
          Alterações só funcionam quando o APK atualizado está vinculado e
          conectado à internet. As permissões do Android não podem ser liberadas
          remotamente; o fallback pode continuar ativo mesmo quando a
          transcrição local estiver indisponível.
        </p>
      </main>
    </div>
  );
}
