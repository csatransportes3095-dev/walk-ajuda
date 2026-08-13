import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, CircleStop, CornerDownLeft, Loader2, MessageCircle, Mic, Minimize2, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

export type H2AssistantNavigationTarget = "gastos" | "ganhos" | "operacional" | "metas" | "graficos" | "emprestimos" | "analisador" | "particular" | "cartoes";

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  type?: "answer" | "navigation" | "preview" | "error";
  data?: any;
  action?: { id: number; summary: string; riskLevel?: string; expiresAt?: string | Date };
  target?: H2AssistantNavigationTarget;
};

type H2AssistantPanelProps = {
  token: string;
  onNavigate?: (target: H2AssistantNavigationTarget) => void;
  onDataChanged?: () => void;
  placement?: "floating" | "client-card";
};

const WELCOME: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  type: "answer",
  content: "Olá. Sou o H2 Assistente. Posso consultar sua Planilha, abrir módulos, preparar lançamentos e organizar o H2 Particular. Nada é gravado sem sua confirmação.",
};

function formatMoney(value: unknown) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function formatPreviewValue(value: unknown) {
  if (typeof value === "number") return formatMoney(value);
  if (typeof value === "string" && /^\d{4}-\d{2}(-\d{2})?/.test(value)) {
    const [year, month, day] = value.split("T")[0].split("-");
    return day ? `${day}/${month}/${year}` : `${month}/${year}`;
  }
  return String(value || "—");
}

function responseCards(data: any) {
  if (!data || typeof data !== "object") return [] as Array<[string, unknown]>;
  const source = data.data || data.preview || data;
  const allowed = [
    ["Ganhos", source.earnings], ["Gastos", source.expenses], ["Resultado", source.profit],
    ["Meta diária", source.dailyGoal], ["Meta semanal", source.weeklyGoal], ["Meta mensal", source.monthlyGoal],
    ["Data", source.date || source.month], ["Passageiro", source.passengerName], ["Valor", source.finalPrice],
    ["Origem", source.pickupAddress], ["Destino", source.destinationAddress], ["Início", source.startsAt],
  ] as Array<[string, unknown]>;
  return allowed.filter(([, value]) => value !== undefined && value !== null && value !== "");
}

export function H2AssistantPanel({ token, onNavigate, onDataChanged, placement = "floating" }: H2AssistantPanelProps) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([WELCOME]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<number | undefined>();
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [voiceState, setVoiceState] = useState<"ready" | "listening" | "processing" | "responding" | "error">("ready");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAnchorRef = useRef<HTMLDivElement | null>(null);
  const discardRecordingRef = useRef(false);
  const scrollPositionRef = useRef(0);
  const [visualViewportHeight, setVisualViewportHeight] = useState(0);

  const bootstrap = trpc.h2Assistant.bootstrap.useQuery({ token }, { enabled: Boolean(token), staleTime: 60_000, retry: 1 });
  const transcriptMutation = trpc.h2Assistant.voice.transcribe.useMutation();
  const speechMutation = trpc.h2Assistant.voice.synthesize.useMutation();
  const settingsMutation = trpc.h2Assistant.settings.update.useMutation();
  const sendMutation = trpc.h2Assistant.chat.send.useMutation();
  const confirmMutation = trpc.h2Assistant.actions.confirm.useMutation();
  const cancelMutation = trpc.h2Assistant.actions.cancel.useMutation();

  useEffect(() => {
    if (bootstrap.data?.settings) setSpeakEnabled(Boolean(Number(bootstrap.data.settings.speakResponses)));
  }, [bootstrap.data?.settings]);

  useEffect(() => {
    endAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  useEffect(() => () => {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (!open || minimized || typeof window === "undefined") return;
    scrollPositionRef.current = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const updateViewport = () => setVisualViewportHeight(Math.round(window.visualViewport?.height || window.innerHeight));
    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      window.scrollTo(0, scrollPositionRef.current);
    };
  }, [open, minimized]);

  const canUseMic = useMemo(() => typeof window !== "undefined" && typeof (navigator as any).mediaDevices?.getUserMedia === "function" && typeof (window as any).MediaRecorder !== "undefined", []);

  const playBrowserFallback = (content: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  };

  const announce = async (content: string, audioBase64?: string | null, audioMimeType?: string | null) => {
    if (!speakEnabled || !content) return;
    setVoiceState("responding");
    try {
      if (audioBase64) {
        const audio = new Audio(`data:${audioMimeType || "audio/mpeg"};base64,${audioBase64}`);
        await audio.play().catch(() => playBrowserFallback(content));
        return;
      }
      const audio = await speechMutation.mutateAsync({ token, text: content.slice(0, 1000) });
      if (audio.audioBase64) {
        const player = new Audio(`data:${audio.audioMimeType || "audio/mpeg"};base64,${audio.audioBase64}`);
        await player.play();
        return;
      }
      playBrowserFallback(content);
    } catch {
      playBrowserFallback(content);
    } finally {
      setVoiceState("ready");
    }
  };

  const appendAssistantResult = (result: any) => {
    const response = result?.response || result;
    const message: AssistantMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: response?.message || "Pronto.",
      type: response?.type || "answer",
      data: response?.data || response?.preview,
      action: response?.action,
      target: response?.target,
    };
    setMessages(previous => [...previous, message]);
    if (response?.conversationId) setActiveConversationId(response.conversationId);
    if (response?.type === "navigation" && response?.target) {
      onNavigate?.(response.target as H2AssistantNavigationTarget);
      // A navegação é executada imediatamente; fechar o portal revela a aba solicitada.
      setOpen(false);
      setMinimized(false);
    }
    void announce(message.content, response?.audioBase64, response?.audioMimeType);
  };

  const submit = async (message = text) => {
    const content = message.trim();
    if (!content || sendMutation.isPending) return;
    setText("");
    setMessages(previous => [...previous, { id: `user-${Date.now()}`, role: "user", content }]);
    try {
      const result = await sendMutation.mutateAsync({ token, text: content, conversationId: activeConversationId });
      appendAssistantResult(result);
    } catch (error: any) {
      setMessages(previous => [...previous, { id: `error-${Date.now()}`, role: "assistant", type: "error", content: error?.message || "Não consegui processar agora. Tente novamente." }]);
    }
  };

  const releaseMicrophone = () => {
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    speechRecognitionRef.current = null;
    setIsListening(false);
    setRecordingElapsed(0);
  };

  const friendlyVoiceUnavailable = "Voz temporariamente indisponível. Você pode continuar usando o H2 pelo texto.";
  const voiceStatusLabel = voiceState === "listening" ? "Ouvindo…" : voiceState === "processing" ? "Processando…" : voiceState === "responding" ? "Respondendo…" : voiceState === "error" ? "Voz indisponível" : "Pronto para ouvir";

  const closeAssistant = () => {
    discardRecordingRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else speechRecognitionRef.current?.stop?.();
    releaseMicrophone();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setOpen(false);
    setMinimized(false);
  };

  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const startBrowserSpeechFallback = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceState("error");
      setMessages(previous => [...previous, { id: `mic-error-${Date.now()}`, role: "assistant", type: "error", content: friendlyVoiceUnavailable }]);
      return;
    }
    const recognition = new Recognition();
    speechRecognitionRef.current = recognition;
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsListening(true);
    setVoiceState("listening");
    recognition.onresult = (event: any) => {
      setText(String(event.results?.[0]?.[0]?.transcript || ""));
      setIsListening(false);
      setVoiceState("ready");
    };
    recognition.onerror = () => { speechRecognitionRef.current = null; setIsListening(false); setVoiceState("error"); };
    recognition.onend = () => { speechRecognitionRef.current = null; setIsListening(false); setVoiceState(previous => previous === "error" ? "error" : "ready"); };
    recognition.start();
  };

  const startRecording = async () => {
    if (isListening || isProcessingVoice) return;
    if (!canUseMic) return startBrowserSpeechFallback();
    discardRecordingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const shouldDiscard = discardRecordingRef.current;
        releaseMicrophone();
        if (shouldDiscard || !blob.size) { setVoiceState("ready"); return; }
        setIsProcessingVoice(true);
        setVoiceState("processing");
        try {
          const audioBase64 = await blobToBase64(blob);
          const transcription = await transcriptMutation.mutateAsync({ token, audioBase64, mimeType: blob.type || "audio/webm", durationSeconds: Math.min(90, Math.max(1, recordingElapsed)) });
          const transcript = String(transcription?.text || "").trim();
          if (transcript) await submit(transcript);
        } catch {
          setVoiceState("error");
          setMessages(previous => [...previous, { id: `voice-error-${Date.now()}`, role: "assistant", type: "error", content: friendlyVoiceUnavailable }]);
        } finally {
          setIsProcessingVoice(false);
          setVoiceState(previous => previous === "error" ? "error" : "ready");
        }
      };
      recorder.start();
      setIsListening(true);
      setVoiceState("listening");
      setRecordingElapsed(0);
      elapsedTimerRef.current = setInterval(() => setRecordingElapsed(value => {
        const next = value + 1;
        if (next >= 90) recorder.stop();
        return next;
      }), 1_000);
    } catch {
      startBrowserSpeechFallback();
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else {
      speechRecognitionRef.current?.stop?.();
      releaseMicrophone();
      setVoiceState("ready");
    }
  };

  const confirmAction = async (actionId: number) => {
    try {
      const result = await confirmMutation.mutateAsync({ token, actionId });
      setMessages(previous => [...previous, { id: `confirmed-${Date.now()}`, role: "assistant", type: "answer", content: result.message || "Confirmado e salvo com sucesso." }]);
      onDataChanged?.();
    } catch (error: any) {
      setMessages(previous => [...previous, { id: `confirm-error-${Date.now()}`, role: "assistant", type: "error", content: error?.message || "Não consegui confirmar esta ação." }]);
    }
  };

  const cancelAction = async (actionId: number) => {
    try {
      await cancelMutation.mutateAsync({ token, actionId });
      setMessages(previous => [...previous, { id: `cancelled-${Date.now()}`, role: "assistant", type: "answer", content: "Prévia cancelada. Nenhuma alteração foi feita." }]);
    } catch (error: any) {
      setMessages(previous => [...previous, { id: `cancel-error-${Date.now()}`, role: "assistant", type: "error", content: error?.message || "Não consegui cancelar esta prévia." }]);
    }
  };

  if (!token) return null;

  const assistantDialog = (
    <AnimatePresence>
        {open && !minimized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeAssistant}
            className="fixed inset-0 z-[1000] flex items-end justify-center bg-[#020611]/72 p-0 backdrop-blur-[3px] sm:items-stretch sm:justify-end sm:p-4"
            aria-label="Fechar H2 Assistente"
          >
            <motion.section
              initial={{ opacity: 0, y: 46, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 38, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
              onClick={(event) => event.stopPropagation()}
              style={visualViewportHeight && typeof window !== "undefined" && window.innerWidth < 640 ? { height: `${Math.max(320, Math.floor(visualViewportHeight * 0.92))}px` } : undefined}
              className="relative flex h-[92dvh] max-h-[calc(100dvh-0.75rem)] w-full max-w-none flex-col overflow-hidden rounded-t-[28px] border border-cyan-300/25 bg-[#071224]/[.98] pb-[env(safe-area-inset-bottom)] shadow-[0_-16px_70px_rgba(0,0,0,.5)] backdrop-blur-2xl sm:h-[calc(100dvh-2rem)] sm:max-h-none sm:w-[min(460px,calc(100vw-2rem))] sm:rounded-[26px] sm:border-cyan-300/20 sm:shadow-[0_25px_80px_rgba(0,0,0,.52)]"
              aria-label="H2 Assistente"
            >
            <header className="relative overflow-hidden border-b border-white/10 px-4 py-3.5">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,.22),transparent_43%),radial-gradient(circle_at_94%_20%,rgba(124,58,237,.25),transparent_43%)]" />
              <div className="relative flex items-center gap-3">
                <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-200/30 bg-gradient-to-br from-cyan-300 to-blue-600 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(34,211,238,.3)]">
                  H2
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#071224] bg-emerald-400 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[.18em] text-cyan-200/70">Assistente universal</p>
                  <h2 className="truncate text-base font-black tracking-tight text-white">H2 Assistente</h2>
                  <p className="mt-0.5 text-[11px] text-slate-300">Texto e voz · confirmações protegidas</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => {
                    const next = !speakEnabled;
                    setSpeakEnabled(next);
                    settingsMutation.mutate({ token, speakResponses: next });
                  }} className="grid h-9 w-9 place-items-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label={speakEnabled ? "Desativar resposta falada" : "Ativar resposta falada"}>
                    {speakEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => { discardRecordingRef.current = true; if (recorderRef.current?.state === "recording") recorderRef.current.stop(); else releaseMicrophone(); setMinimized(true); }} className="grid h-9 w-9 place-items-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Minimizar assistente"><Minimize2 className="h-4 w-4" /></button>
                  <button type="button" onClick={closeAssistant} className="grid h-9 w-9 place-items-center rounded-xl text-slate-300 transition hover:bg-red-400/15 hover:text-red-200" aria-label="Fechar assistente"><X className="h-4 w-4" /></button>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-4">
              {bootstrap.isLoading && <div className="flex items-center gap-2 px-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparando seu assistente…</div>}
              {messages.length === 1 && !bootstrap.isLoading && (
                <div className="mx-1 rounded-2xl border border-cyan-200/12 bg-cyan-300/[.045] p-3.5">
                  <p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-200/70">Experimente perguntar</p>
                  <div className="mt-2.5 grid gap-1.5">
                    {["Quanto ganhei hoje?", "Como estão minhas metas?", "Quanto gastei este mês?", "Quem tenho agendado amanhã?"].map(suggestion => <button key={suggestion} type="button" onClick={() => void submit(suggestion)} className="rounded-xl border border-white/8 bg-slate-950/25 px-3 py-2 text-left text-xs font-medium text-slate-200 transition hover:border-cyan-300/25 hover:bg-cyan-300/[.07] active:scale-[.99]">“{suggestion}”</button>)}
                  </div>
                </div>
              )}
              {messages.map(message => {
                const cards = responseCards(message.data);
                return (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-3.5 py-3 text-sm leading-relaxed ${message.role === "user" ? "rounded-br-md bg-gradient-to-br from-cyan-400 to-blue-600 font-medium text-slate-950 shadow-lg" : message.type === "error" ? "rounded-bl-md border border-red-400/25 bg-red-500/10 text-red-100" : "rounded-bl-md border border-white/10 bg-white/[.055] text-slate-100"}`}>
                      <p>{message.content}</p>
                      {cards.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {cards.map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-white/10 bg-slate-950/35 px-2.5 py-2"><p className="truncate text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-0.5 truncate text-xs font-bold text-white">{formatPreviewValue(value)}</p></div>)}
                        </div>
                      )}
                      {message.type === "navigation" && message.target && <button type="button" onClick={() => onNavigate?.(message.target!)} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-cyan-300 px-2.5 py-1.5 text-xs font-black text-slate-950 transition active:scale-95">Abrir agora <CornerDownLeft className="h-3.5 w-3.5" /></button>}
                      {message.action && (
                        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[.075] p-2.5">
                          <p className="text-xs font-bold text-amber-100">Prévia aguardando sua confirmação</p>
                          <p className="mt-1 text-[11px] leading-snug text-amber-50/75">{message.action.summary}</p>
                          <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                            <button type="button" disabled={confirmMutation.isPending} onClick={() => confirmAction(message.action!.id)} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-emerald-400 px-2 text-[10px] font-black text-emerald-950 transition active:scale-95 disabled:opacity-60"><Check className="h-3.5 w-3.5" />Confirmar</button>
                            <button type="button" onClick={() => { setText("Corrigir: "); }} className="h-9 rounded-lg border border-amber-200/20 px-2 text-[10px] font-black text-amber-100 transition hover:bg-white/10 active:scale-95">Corrigir</button>
                            <button type="button" disabled={cancelMutation.isPending} onClick={() => cancelAction(message.action!.id)} className="h-9 rounded-lg border border-red-300/15 px-2 text-[10px] font-black text-red-200 transition hover:bg-red-500/10 active:scale-95 disabled:opacity-60">Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {(sendMutation.isPending || isProcessingVoice) && <div className="flex items-center gap-2 px-2 text-xs text-cyan-100"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.2s]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-.1s]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300" /></span>{isProcessingVoice ? "Processando sua voz…" : "Entendendo e consultando…"}</div>}
              <div ref={endAnchorRef} />
            </div>

            <div className="border-t border-white/10 bg-slate-950/35 px-3.5 py-3">
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                {["Como foi hoje?", "Minhas metas", "Agenda de amanhã", "Abrir gastos"].map(shortcut => <button key={shortcut} type="button" disabled={sendMutation.isPending} onClick={() => void submit(shortcut)} className="shrink-0 rounded-full border border-white/10 bg-white/[.055] px-2.5 py-1 text-[10px] font-semibold text-slate-200 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 active:scale-95 disabled:opacity-50">{shortcut}</button>)}
              </div>
              <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-slate-900/80 p-1.5 shadow-inner">
                <button type="button" onClick={isListening ? stopRecording : startRecording} disabled={isProcessingVoice} className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-xl transition active:scale-95 disabled:opacity-50 ${isListening ? "bg-cyan-300 text-slate-950 shadow-[0_0_22px_rgba(34,211,238,.48)] animate-pulse" : voiceState === "error" ? "border border-amber-300/35 bg-amber-300/10 text-amber-100" : "border border-cyan-200/20 bg-cyan-300/12 text-cyan-200 hover:bg-cyan-300/20"}`} aria-label={isListening ? "Parar gravação" : "Falar com o assistente"}>
                  {isListening ? <CircleStop className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`mb-1 px-1 text-[10px] font-bold ${voiceState === "error" ? "text-amber-200" : voiceState === "listening" ? "text-cyan-200" : "text-slate-400"}`}>{isListening ? `Ouvindo… ${String(Math.floor(recordingElapsed / 60)).padStart(2, "0")}:${String(recordingElapsed % 60).padStart(2, "0")}` : voiceStatusLabel}</p>
                  <textarea value={text} onChange={event => setText(event.target.value.slice(0, 2000))} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={1} maxLength={2000} placeholder={isListening ? "Fale e toque para parar" : "Digite ou fale com o H2…"} className="block max-h-28 min-h-10 w-full resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-500" />
                </div>
                <button type="button" onClick={() => void submit()} disabled={!text.trim() || sendMutation.isPending || isListening} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 to-blue-600 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,.25)] transition hover:brightness-110 active:scale-95 disabled:opacity-35" aria-label="Enviar mensagem"><Send className="h-4 w-4" /></button>
              </div>
              <p className="mt-2 text-center text-[9px] leading-relaxed text-slate-500">Consultas são imediatas. Qualquer alteração exige sua confirmação.</p>
            </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
  );

  return (
    <>
      {typeof document !== "undefined" ? createPortal(assistantDialog, document.body) : null}
      <div className={placement === "client-card" ? "absolute right-2 top-2 z-[120]" : "fixed bottom-24 right-4 z-[120] flex flex-col items-end sm:bottom-6 sm:right-[6.25rem]"}>
      <motion.button
        type="button"
        onClick={() => { setOpen(true); setMinimized(false); }}
        whileTap={{ scale: 0.97 }}
        className="group relative ml-auto flex items-center gap-2 text-left"
        aria-label="Abrir H2 Assistente: fale, tire dúvidas e registre ganhos ou gastos na Planilha"
      >
        {placement !== "client-card" && !open && (
          <span className="max-w-[158px] rounded-2xl border border-cyan-200/20 bg-[#09172d]/95 px-3 py-2 shadow-[0_10px_25px_rgba(0,0,0,.32)] backdrop-blur-xl transition group-hover:border-cyan-200/40">
            <span className="block text-[10px] font-black uppercase tracking-[.12em] text-cyan-200">Assistente H2</span>
            <span className="mt-0.5 block text-[10px] font-medium leading-tight text-slate-200">Fale, tire dúvidas e lance na Planilha</span>
          </span>
        )}
        <span className={`relative grid shrink-0 place-items-center border border-cyan-200/35 bg-gradient-to-br from-cyan-300 via-blue-500 to-violet-600 text-slate-950 shadow-[0_12px_34px_rgba(34,211,238,.28)] transition group-hover:brightness-110 ${placement === "client-card" ? "h-[54px] w-[68px] rounded-2xl" : "h-[58px] w-[58px] rounded-[20px]"}`}>
          <span aria-hidden="true" className={`${placement === "client-card" ? "rounded-2xl" : "rounded-[20px]"} absolute inset-0 border border-cyan-100/45 animate-ping opacity-25 [animation-duration:2.8s]`} />
          {open && minimized ? <ChevronDown className="relative h-5 w-5" /> : <span className={`relative flex font-black ${placement === "client-card" ? "flex-col items-center leading-none" : "items-center gap-0.5"}`}><span className="flex items-center gap-0.5"><Sparkles className="h-3.5 w-3.5" /><span className="text-sm">H2</span></span>{placement === "client-card" && <span className="mt-1 text-[8px] font-black uppercase tracking-[.06em]">Assistente</span>}</span>}
          {!open && <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-[#071224] bg-emerald-400" />}
        </span>
      </motion.button>
      </div>
    </>
  );
}
