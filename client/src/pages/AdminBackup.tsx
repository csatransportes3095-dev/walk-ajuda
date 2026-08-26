import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock3, CloudUpload, DatabaseBackup, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import { trpc } from "@/lib/trpc";

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function statusLabel(status: string) {
  if (status === "completed") return "Concluído";
  if (status === "running") return "Em processamento";
  if (status === "queued") return "Na fila";
  return "Falhou";
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    queued: "Aguardando",
    database: "Banco de dados",
    r2: "Fotos e ficheiros",
    source: "Código e migrações",
    archive: "Cifrando pacote",
    upload: "Guardando cópia privada",
    completed: "Verificado",
    failed: "Falhou",
  };
  return labels[stage] || stage;
}

export default function AdminBackup() {
  const backupsQuery = trpc.backup.list.useQuery({ limit: 20 }, { refetchInterval: 4000 });
  const backupConfigQuery = trpc.backup.config.useQuery();
  const startMut = trpc.backup.start.useMutation({
    onSuccess: () => {
      toast.success("Backup iniciado. O progresso aparecerá nesta página.");
      void backupsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível iniciar o backup."),
  });

  const driveMut = trpc.backup.sendToDrive.useMutation({
    onSuccess: () => {
      toast.success("Backup enviado para o Google Drive.");
      void backupsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar para o Google Drive."),
  });

  const reconcileMut = trpc.backup.reconcileStale.useMutation({
    onSuccess: ({ reconciled }) => {
      if (reconciled > 0) toast.success(`${reconciled} execução(ões) abandonada(s) encerrada(s). O registro foi mantido no histórico.`);
      else toast.info("Nenhuma execução abandonada foi encontrada. Um backup ainda ativo não foi alterado.");
      void backupsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível verificar a execução travada."),
  });

  const activeBackup = useMemo(
    () => backupsQuery.data?.find((backup) => backup.status === "queued" || backup.status === "running"),
    [backupsQuery.data],
  );

  const isStarting = startMut.isPending;
  const isBusy = Boolean(activeBackup) || isStarting;
  const encryptionConfigured = backupConfigQuery.data?.encryptionConfigured === true;
  const backupButtonDisabled = isBusy || backupConfigQuery.isLoading || !encryptionConfigured;

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      <AdminHeader
        title="Backup completo do sistema"
        icon={<DatabaseBackup className="w-5 h-5" />}
        backTo="/admin/settings"
      />

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 via-[#111128] to-[#111128] p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black tracking-[0.2em] text-cyan-200">PROTEÇÃO DE DADOS</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight">Backup real, não apenas estrutura</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                O processo copia os registos reais de todas as tabelas do banco, fotos e ficheiros do R2, código e migrações. O pacote é cifrado antes de ser guardado e só fica disponível para download após conclusão e verificação.
              </p>
            </div>
            <div className="flex min-w-[240px] flex-col items-stretch gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!encryptionConfigured) {
                    toast.error("Backup bloqueado: configure BACKUP_ENCRYPTION_KEY no Render e atualize esta página.");
                    return;
                  }
                  startMut.mutate();
                }}
                disabled={backupButtonDisabled}
                aria-disabled={backupButtonDisabled}
                title={backupConfigQuery.isLoading ? "Verificando a chave de cifragem" : encryptionConfigured ? "Iniciar backup completo" : "Configure uma BACKUP_ENCRYPTION_KEY válida no Render"}
                className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isStarting || activeBackup ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
                {activeBackup ? "Backup em processamento" : isStarting ? "Iniciando..." : "Gerar backup completo"}
              </button>
              <p className={`text-center text-[11px] leading-4 ${backupConfigQuery.isLoading ? "text-slate-400" : encryptionConfigured ? "text-emerald-300" : "text-amber-300"}`}>
                {backupConfigQuery.isLoading ? "Verificando a chave de cifragem..." : encryptionConfigured ? "Chave de cifragem reconhecida." : "Botão bloqueado: chave ausente ou inválida no Render."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#111128] p-4">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h3 className="mt-3 text-sm font-bold">Pacote cifrado</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">A chave fica somente no ambiente seguro do servidor e não entra no arquivo nem no GitHub.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111128] p-4">
            <CheckCircle2 className="h-5 w-5 text-cyan-300" />
            <h3 className="mt-3 text-sm font-bold">Verificação de integridade</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">O sistema compara tamanhos e calcula SHA-256 do banco, ficheiros e pacote final.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#111128] p-4">
            <Clock3 className="h-5 w-5 text-amber-300" />
            <h3 className="mt-3 text-sm font-bold">Snapshot do momento</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Cada execução é uma fotografia do sistema naquele instante; ela não sincroniza alterações futuras.</p>
          </div>
        </section>

        {activeBackup && (
          <section className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-5">
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 h-5 w-5 animate-spin text-amber-200" />
              <div className="flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-amber-100">Backup em execução</p>
                    <p className="mt-1 text-xs text-amber-100/70">{stageLabel(activeBackup.stage)} · não feche a página até aparecer como concluído.</p>
                  </div>
                  <span className="text-2xl font-black text-amber-100">{activeBackup.progress}%</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${Math.max(0, Math.min(100, activeBackup.progress))}%` }} />
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Encerrar somente se esta execução estiver travada há mais de 10 minutos? O registro será mantido e nenhum dado será apagado.")) reconcileMut.mutate();
                    }}
                    disabled={reconcileMut.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/30 bg-red-300/10 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {reconcileMut.isPending ? "Verificando..." : "Encerrar se estiver travado"}
                  </button>
                  <p className="text-[11px] leading-4 text-amber-100/70">Só altera execuções sem atualização há mais de 10 minutos. O histórico permanece.</p>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-white/10 bg-[#111128] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black">Histórico de backups</h2>
              <p className="mt-1 text-xs text-slate-400">Somente backups concluídos e verificados podem ser baixados.</p>
            </div>
            <button type="button" onClick={() => { void backupsQuery.refetch(); void backupConfigQuery.refetch(); }} className="inline-flex items-center gap-2 self-start rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
          </div>

          {backupsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...</div>
          ) : backupsQuery.data?.length ? (
            <div className="mt-5 space-y-3">
              {backupsQuery.data.map((backup) => (
                <div key={backup.id} className="rounded-xl border border-white/10 bg-[#0d0d25] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${backup.status === "completed" ? "bg-emerald-400/15 text-emerald-200" : backup.status === "failed" ? "bg-red-400/15 text-red-200" : "bg-amber-400/15 text-amber-200"}`}>{statusLabel(backup.status)}</span>
                        <span className="text-xs text-slate-400">{stageLabel(backup.stage)}</span>
                        <span className="text-xs text-slate-500">{backup.progress}%</span>
                      </div>
                      <p className="mt-2 truncate font-mono text-[11px] text-slate-500">ID: {backup.id}</p>
                      <p className="mt-1 text-xs text-slate-400">Criado em {formatDate(backup.createdAt)} · Tamanho: {formatBytes(backup.fileSize)}</p>
                      {backup.archiveSha256 && <p className="mt-1 break-all font-mono text-[10px] text-cyan-300/70">SHA-256: {backup.archiveSha256}</p>}
                      {backup.status === "completed" && <p className="mt-1 text-xs text-slate-500">Google Drive: {backup.driveStatus === "completed" ? `enviado em ${formatDate(backup.driveUploadedAt)}` : backup.driveStatus === "uploading" ? "enviando..." : backup.driveStatus === "failed" ? "falhou" : backupConfigQuery.data?.driveConfigured ? "não enviado" : "não configurado"}</p>}
                      {backup.errorMessage && <p className="mt-2 flex items-start gap-1.5 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {backup.errorMessage}</p>}
                    </div>
                    {backup.status === "completed" && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <a href={`/api/admin/backups/${backup.id}/download`} className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-xs font-black text-cyan-100 hover:bg-cyan-300/20">
                          <Download className="h-4 w-4" /> Baixar para o computador
                        </a>
                        <button
                          type="button"
                          onClick={() => driveMut.mutate({ id: backup.id })}
                          disabled={!backupConfigQuery.data?.driveConfigured || driveMut.isPending || backup.driveStatus === "uploading" || backup.driveStatus === "completed"}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-300/30 bg-violet-300/10 px-4 py-2.5 text-xs font-black text-violet-100 hover:bg-violet-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                          title={backupConfigQuery.data?.driveConfigured ? "Enviar uma cópia para o Google Drive" : "Configure o Google Drive no ambiente seguro do Render"}
                        >
                          {driveMut.isPending && driveMut.variables?.id === backup.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                          {backup.driveStatus === "completed" ? "No Drive" : "Enviar ao Drive"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Nenhum backup foi gerado ainda.</div>
          )}
        </section>

        <section className="rounded-xl border border-blue-300/15 bg-blue-300/5 p-4 text-xs leading-5 text-blue-100/75">
          <strong className="text-blue-100">Google Drive:</strong> o botão envia somente um backup cifrado já concluído para a pasta privada configurada no ambiente seguro. As credenciais não ficam no pacote, no banco ou no GitHub. A restauração será uma função separada e nunca substituirá o banco atual com um clique.
        </section>
      </main>
    </div>
  );
}
