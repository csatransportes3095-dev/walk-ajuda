import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Mic, Play, RotateCcw, Square, Upload, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type AudioDraft = {
  id: string;
  audioUrl: string;
  mimeType: string;
  durationSeconds: number;
};

type Props = {
  questionId: number;
  productId: number;
  optionId: number;
  flowId: string;
  phone?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  allowRerecord?: boolean;
  allowFileUpload?: boolean;
  helpText?: string | null;
  value?: AudioDraft;
  onConfirmed: (draft: AudioDraft) => void;
  onClear?: () => void;
};

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ACCEPTED_MIME = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]);

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function getPreferredMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
  return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate)) || "";
}

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.slice(value.indexOf(",") + 1) : value);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o áudio."));
    reader.readAsDataURL(file);
  });
}

async function getAudioDuration(file: File) {
  return await new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível identificar a duração do áudio."));
    };
    audio.src = url;
  });
}

export function QuestionAudioRecorder({
  questionId,
  productId,
  optionId,
  flowId,
  phone,
  minDurationSeconds = 1,
  maxDurationSeconds = 120,
  allowRerecord = true,
  allowFileUpload = true,
  helpText,
  value,
  onConfirmed,
  onClear,
}: Props) {
  const uploadMutation = trpc.questionAudio.uploadDraft.useMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);
  const stopByLimitRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [candidateUrl, setCandidateUrl] = useState<string | null>(null);
  const [candidateDuration, setCandidateDuration] = useState(0);
  const [candidateSource, setCandidateSource] = useState<"recording" | "file">("recording");
  const [error, setError] = useState<string | null>(null);

  const hasConfirmedAudio = Boolean(value?.audioUrl);
  const isBusy = isRecording || uploadMutation.isPending;
  const canReplace = !hasConfirmedAudio || allowRerecord;
  const effectiveMax = Math.min(300, Math.max(minDurationSeconds, maxDurationSeconds));

  const statusLabel = useMemo(() => {
    if (isRecording) return `Gravando ${formatDuration(elapsedSeconds)} / ${formatDuration(effectiveMax)}`;
    if (uploadMutation.isPending) return "Anexando áudio com segurança...";
    return null;
  }, [effectiveMax, elapsedSeconds, isRecording, uploadMutation.isPending]);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const releaseMedia = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const clearCandidate = () => {
    if (candidateUrl) URL.revokeObjectURL(candidateUrl);
    setCandidateFile(null);
    setCandidateUrl(null);
    setCandidateDuration(0);
    setError(null);
  };

  useEffect(() => () => {
    clearTimer();
    releaseMedia();
    if (candidateUrl) URL.revokeObjectURL(candidateUrl);
  }, [candidateUrl]);

  const stageFile = async (file: File, source: "recording" | "file") => {
    setError(null);
    if (!ACCEPTED_MIME.has(file.type)) {
      setError("Formato não suportado. Use WEBM, OGG, M4A/MP4 ou MP3.");
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setError("O áudio está vazio ou acima do limite de 12 MB.");
      return;
    }
    try {
      const duration = await getAudioDuration(file);
      if (!duration || duration > effectiveMax + 1) {
        setError(`O áudio deve ter no máximo ${formatDuration(effectiveMax)}.`);
        return;
      }
      if (candidateUrl) URL.revokeObjectURL(candidateUrl);
      setCandidateFile(file);
      setCandidateUrl(URL.createObjectURL(file));
      setCandidateDuration(duration);
      setCandidateSource(source);
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : "Não foi possível preparar este áudio.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const startRecording = async () => {
    if (!canReplace || isBusy) return;
    clearCandidate();
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("A gravação de áudio não é suportada neste navegador. Envie um arquivo de áudio, se disponível.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredMime = getPreferredMime();
      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        clearTimer();
        releaseMedia();
        setIsRecording(false);
        setError("A gravação foi interrompida. Tente novamente.");
      };
      recorder.onstop = async () => {
        clearTimer();
        releaseMedia();
        setIsRecording(false);
        const duration = Math.max(0, (Date.now() - startedAtRef.current) / 1000);
        const mimeType = recorder.mimeType.split(";")[0] || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setError("Não foi capturado nenhum som. Verifique o microfone e grave novamente.");
          return;
        }
        const extension = mimeType === "audio/mp4" ? "m4a" : mimeType === "audio/ogg" ? "ogg" : mimeType === "audio/mpeg" ? "mp3" : "webm";
        await stageFile(new File([blob], `resposta-${questionId}.${extension}`, { type: mimeType }), "recording");
        if (stopByLimitRef.current) setError(`A gravação foi encerrada no limite de ${formatDuration(effectiveMax)}.`);
        stopByLimitRef.current = false;
      };
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      recorder.start(250);
      setIsRecording(true);
      intervalRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(seconds);
        if (seconds >= effectiveMax) {
          stopByLimitRef.current = true;
          stopRecording();
        }
      }, 250);
    } catch (recordError: any) {
      releaseMedia();
      const name = recordError?.name || "";
      setError(name === "NotAllowedError" ? "Permissão do microfone negada. Autorize o microfone nas configurações e tente novamente." : "Microfone indisponível. Verifique o dispositivo e tente novamente.");
    }
  };

  const confirmAudio = async () => {
    if (!candidateFile || isBusy) return;
    if (candidateDuration < minDurationSeconds) {
      setError(`Grave pelo menos ${formatDuration(minDurationSeconds)} antes de continuar.`);
      return;
    }
    try {
      const draft = await uploadMutation.mutateAsync({
        flowId,
        productId,
        optionId,
        questionId,
        phone: phone || localStorage.getItem("walk_client_phone") || undefined,
        accessCode: localStorage.getItem("walk_access_code") || undefined,
        cpToken: localStorage.getItem("cp_token") || undefined,
        source: candidateSource,
        mimeType: candidateFile.type.split(";")[0],
        durationSeconds: Math.round(candidateDuration),
        data: await fileToBase64(candidateFile),
      });
      onConfirmed(draft);
      clearCandidate();
    } catch (uploadError: any) {
      setError(uploadError?.message || "Não foi possível anexar o áudio. Sua gravação continua disponível para tentar novamente.");
    }
  };

  return (
    <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 space-y-3" aria-live="polite">
      <div className="flex items-start gap-2">
        <div className="rounded-full bg-sky-500/20 p-2 text-sky-300"><Mic className="w-4 h-4" /></div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">Resposta em áudio</p>
          <p className="text-xs text-sky-100/80">Grave, ouça e confirme antes de continuar.</p>
          {helpText && <p className="mt-1 text-xs text-white/70">{helpText}</p>}
        </div>
      </div>

      {statusLabel && <p className={`text-xs font-semibold ${isRecording ? "text-red-300" : "text-sky-200"}`}>{statusLabel}</p>}
      {error && <p className="rounded-lg bg-red-500/15 border border-red-500/30 px-2.5 py-2 text-xs text-red-200">{error}</p>}

      {hasConfirmedAudio && value ? (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2.5 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-300"><CheckCircle2 className="w-4 h-4" /> ÁUDIO ANEXADO · {formatDuration(value.durationSeconds)}</p>
          <audio controls preload="metadata" className="w-full h-9" src={value.audioUrl}>Seu navegador não suporta reprodução de áudio.</audio>
          {allowRerecord && <button type="button" onClick={onClear} disabled={isBusy} className="w-full rounded-lg border border-sky-300/40 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"><RotateCcw className="inline w-3.5 h-3.5 mr-1" /> GRAVAR NOVAMENTE</button>}
        </div>
      ) : (
        <>
          {candidateUrl && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 space-y-2">
              <p className="text-xs text-emerald-300 font-bold">Áudio pronto · {formatDuration(candidateDuration)}</p>
              <audio controls preload="metadata" className="w-full h-9" src={candidateUrl}>Seu navegador não suporta reprodução de áudio.</audio>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={clearCandidate} disabled={isBusy} className="rounded-lg bg-white/10 px-2 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50"><RotateCcw className="inline w-3.5 h-3.5 mr-1" /> GRAVAR NOVAMENTE</button>
                <button type="button" onClick={confirmAudio} disabled={isBusy} className="rounded-lg bg-emerald-600 px-2 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">{uploadMutation.isPending ? <><Loader2 className="inline w-3.5 h-3.5 mr-1 animate-spin" /> ANEXANDO</> : <><CheckCircle2 className="inline w-3.5 h-3.5 mr-1" /> USAR ESTE ÁUDIO</>}</button>
              </div>
            </div>
          )}

          {!candidateUrl && (
            <div className="space-y-2">
              {!isRecording ? (
                <button type="button" onClick={startRecording} disabled={!canReplace || isBusy} className="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500 active:scale-[0.99] disabled:opacity-50"><Mic className="inline w-4 h-4 mr-1.5" /> GRAVAR ÁUDIO</button>
              ) : (
                <button type="button" onClick={stopRecording} className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500 active:scale-[0.99]"><Square className="inline w-4 h-4 mr-1.5" /> PARAR GRAVAÇÃO</button>
              )}
              {allowFileUpload && !isRecording && (
                <>
                  <input ref={fileInputRef} type="file" accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,.webm,.ogg,.m4a,.mp3" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void stageFile(file, "file"); event.currentTarget.value = ""; }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canReplace || isBusy} className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 hover:bg-white/10 disabled:opacity-50"><Upload className="inline w-3.5 h-3.5 mr-1" /> ENVIAR ÁUDIO DO DISPOSITIVO</button>
                </>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[10px] leading-relaxed text-white/45">Duração permitida: {formatDuration(minDurationSeconds)} a {formatDuration(effectiveMax)}. O áudio é enviado somente após tocar em “Usar este áudio”.</p>
    </div>
  );
}

export type { AudioDraft };
