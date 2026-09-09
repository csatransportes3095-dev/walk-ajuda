import { AlertTriangle, CheckCircle2, CloudUpload, Image, Loader2, PauseCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function mediaStatusLabel(status: string) {
  if (status === "running") return "Em processamento";
  if (status === "completed") return "Concluído";
  if (status === "paused") return "Pausado após reinício";
  if (status === "cancelled") return "Cancelado";
  if (status === "failed") return "Falhou";
  return "Aguardando primeiro backup";
}

export default function MediaBackupPanel() {
  const configQuery = trpc.backup.config.useQuery(undefined, { refetchInterval: 10000 });
  const statusQuery = trpc.backup.mediaStatus.useQuery(undefined, { refetchInterval: 3000 });
  const startMut = trpc.backup.mediaStart.useMutation({
    onSuccess: () => {
      toast.success("Backup incremental das fotos e documentos iniciado.");
      void statusQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível iniciar o backup de mídia."),
  });
  const cancelMut = trpc.backup.mediaCancel.useMutation({
    onSuccess: ({ cancelled }) => {
      toast.success(cancelled ? "Backup de mídia interrompido. Os arquivos já confirmados no Drive permanecem salvos." : "Não havia backup de mídia ativo.");
      void statusQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível interromper o backup de mídia."),
  });

  const status = statusQuery.data;
  const configured = configQuery.data?.mediaConfigured === true;
  const active = status?.status === "running" && status.active;
  const canStart = configured && !active && !startMut.isPending;

  return (
    <section className="rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-400/10 via-[#111128] to-[#111128] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5 text-violet-200" />
            <p className="text-[11px] font-black tracking-[0.18em] text-violet-200">BACKUP DE MÍDIA V2</p>
          </div>
          <h2 className="mt-2 text-xl font-black">Fotos e documentos separados do backup principal</h2>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            Copia os arquivos do R2 para uma pasta privada no Google Drive, um por um, criptografados. Na próxima execução, arquivos já copiados e sem alteração são pulados. Se o servidor reiniciar, os arquivos já confirmados continuam aproveitados e o progresso não volta ao zero.
          </p>
        </div>

        <div className="flex min-w-[230px] flex-col gap-2">
          <button
            type="button"
            onClick={() => startMut.mutate()}
            disabled={!canStart}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-300/30 bg-violet-300/15 px-4 py-3 text-sm font-black text-violet-100 hover:bg-violet-300/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startMut.isPending || active ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            {active ? "Copiando mídias..." : status?.status === "completed" ? "Sincronizar novamente" : "Iniciar backup de mídia"}
          </button>
          {active && (
            <button
              type="button"
              onClick={() => cancelMut.mutate()}
              disabled={cancelMut.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-2.5 text-xs font-black text-red-100 hover:bg-red-300/20 disabled:opacity-40"
            >
              <PauseCircle className="h-4 w-4" /> {cancelMut.isPending ? "Interrompendo..." : "Interromper"}
            </button>
          )}
          <p className={`text-center text-[11px] ${configured ? "text-emerald-300" : "text-amber-300"}`}>
            {configured ? "Drive e chave de criptografia reconhecidos." : "Aguardando Google Drive e chave de criptografia."}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {status?.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : status?.status === "failed" ? <AlertTriangle className="h-4 w-4 text-red-300" /> : <RefreshCw className={`h-4 w-4 text-violet-200 ${active ? "animate-spin" : ""}`} />}
            <span className="text-sm font-black">{mediaStatusLabel(status?.status || "idle")}</span>
          </div>
          <span className="text-xl font-black">{status?.progress || 0}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-violet-300 transition-all" style={{ width: `${Math.max(0, Math.min(100, status?.progress || 0))}%` }} />
        </div>
        <div className="mt-3 grid gap-1 text-[11px] text-slate-400 sm:grid-cols-2">
          <span>Arquivos: <strong className="text-slate-200">{status?.completedObjects || 0} / {status?.totalObjects || 0}</strong></span>
          <span>Dados: <strong className="text-slate-200">{formatBytes(status?.completedBytes)} / {formatBytes(status?.totalBytes)}</strong></span>
          {status?.currentKey && <span className="sm:col-span-2 truncate">Atual: <strong className="font-mono text-slate-300">{status.currentKey}</strong></span>}
        </div>
        {status?.status === "paused" && <p className="mt-3 text-xs text-amber-200">O servidor reiniciou. Clique em iniciar novamente: o sistema consulta o que já foi copiado e continua pelos arquivos restantes.</p>}
        {status?.errorMessage && <p className="mt-3 flex items-start gap-2 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />{status.errorMessage}</p>}
      </div>
    </section>
  );
}
