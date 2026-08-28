import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, CloudUpload, DatabaseBackup, Download, Loader2, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, X } from "lucide-react";
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
    "r2-list": "Listando ficheiros",
    "r2-download": "Baixando ficheiros",
    source: "Código e migrações",
    "source-snapshot": "Guardando snapshot do código",
    manifest: "Montando manifesto",
    archive: "Cifrando pacote",
    upload: "Guardando cópia privada",
    "r2-upload": "Confirmando upload privado",
    verification: "Verificando objeto final",
    completed: "Verificado",
    failed: "Falhou",
  };
  return labels[stage] || stage;
}

function restoreStageLabel(stage: string) {
  const labels: Record<string, string> = {
    "safety-backup": "Criando backup de segurança atual",
    validating: "Validando e abrindo o pacote",
    database: "Restaurando banco de dados",
    "r2-upload": "Restaurando fotos e arquivos",
    "r2-prune": "Sincronizando snapshot do R2",
    completed: "Restauração concluída",
    failed: "Restauração interrompida",
  };
  return labels[stage] || stage;
}

type RestorePreview = {
  token: string;
  expiresAt: string;
  confirmationPhrase: string;
  restoreEnabled: boolean;
  backup: {
    id: string;
    createdAt: Date | string;
    fileSize: number | null;
    archiveSha256: string;
    sourceCommit: string;
    sourceCommitMatchesCurrent: boolean | null;
    currentCommit: string;
    tableCount: number | null;
    r2ObjectCount: number | null;
    r2TotalBytes: number | null;
    driveAvailable: boolean;
  };
};

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

  const verifyMut = trpc.backup.verifyStored.useMutation({
    onSuccess: ({ accepted }) => {
      toast.success(accepted ? "Verificação profunda iniciada. A página acompanhará automaticamente." : "Este backup já está sendo verificado.");
      void backupsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível verificar o arquivo armazenado."),
  });

  const restoreConfigQuery = trpc.backup.restoreConfig.useQuery(undefined, { refetchInterval: 5000 });
  const restoreStatusQuery = trpc.backup.restoreStatus.useQuery(undefined, { refetchInterval: 2000 });
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [restoreChecks, setRestoreChecks] = useState({ safety: false, destructive: false, code: false });

  const prepareRestoreMut = trpc.backup.prepareRestore.useMutation({
    onSuccess: (data) => {
      setRestorePreview(data as RestorePreview);
      setRestoreConfirmation("");
      setRestoreChecks({ safety: false, destructive: false, code: false });
    },
    onError: (error) => toast.error(error.message || "Não foi possível preparar a restauração."),
  });

  const startRestoreMut = trpc.backup.startRestore.useMutation({
    onSuccess: () => {
      toast.success("Restauração protegida iniciada. Primeiro será criado um backup de segurança do estado atual.");
      setRestorePreview(null);
      setRestoreConfirmation("");
      void restoreStatusQuery.refetch();
      void backupsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível iniciar a restauração."),
  });

  const cancelMut = trpc.backup.cancel.useMutation({
    onSuccess: ({ cancelled }) => {
      toast.success(cancelled ? "Execução encerrada. O registro foi mantido e nenhum artefato foi validado." : "Essa execução já não está ativa.");
      void backupsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível encerrar a execução."),
  });

  const activeBackup = useMemo(
    () => backupsQuery.data?.find((backup) => backup.status === "queued" || backup.status === "running"),
    [backupsQuery.data],
  );

  const restoreStatus = restoreStatusQuery.data;
  const restoreActive = Boolean(restoreStatus && restoreStatus.stage !== "completed" && restoreStatus.stage !== "failed");
  const isStarting = startMut.isPending;
  const isBusy = Boolean(activeBackup) || isStarting || restoreActive;
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
                O processo copia os registos reais de todas as tabelas do banco, fotos e ficheiros do R2, código, migrações e um cofre de recuperação total. O pacote é cifrado antes de ser guardado e só fica disponível para download após conclusão e verificação.
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <div className="rounded-xl border border-white/10 bg-[#111128] p-4">
            <ShieldAlert className="h-5 w-5 text-violet-300" />
            <h3 className="mt-3 text-sm font-bold">Recuperação do zero</h3>
            <p className="mt-1 text-xs leading-5 text-slate-400">Novos backups levam cofre cifrado de configuração, ferramenta independente e guia para reconstruir o sistema sem depender do GitHub.</p>
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
                      if (window.confirm("Encerrar esta execução? Ela será marcada como falha técnica, o registro será mantido e nenhum dado será apagado.")) cancelMut.mutate({ id: activeBackup.id });
                    }}
                    disabled={cancelMut.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/30 bg-red-300/10 px-3 py-2 text-xs font-black text-red-100 hover:bg-red-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    {cancelMut.isPending ? "Encerrando..." : "Cancelar execução"}
                  </button>
                  <p className="text-[11px] leading-4 text-amber-100/70">Encerra somente esta execução. O histórico permanece e nenhum dado do sistema é apagado.</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {restoreStatus && (
          <section className={`rounded-2xl border p-5 ${restoreStatus.stage === "failed" ? "border-red-300/30 bg-red-300/10" : restoreStatus.stage === "completed" ? "border-emerald-300/30 bg-emerald-300/10" : "border-violet-300/30 bg-violet-300/10"}`}>
            <div className="flex items-start gap-3">
              {restoreActive ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-violet-200" /> : restoreStatus.stage === "completed" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-200" /> : <ShieldAlert className="mt-0.5 h-5 w-5 text-red-200" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-black">{restoreStageLabel(restoreStatus.stage)}</p><p className="mt-1 text-xs text-slate-300">{restoreStatus.message}</p></div>
                  <span className="text-2xl font-black">{restoreStatus.progress}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-violet-300 transition-all" style={{ width: `${Math.max(0, Math.min(100, restoreStatus.progress))}%` }} /></div>
                <div className="mt-3 grid gap-1 text-[11px] text-slate-300 sm:grid-cols-2">
                  <span>Backup restaurado: <strong className="font-mono">{restoreStatus.backupId.slice(-12)}</strong></span>
                  <span>Backup de segurança: <strong className="font-mono">{restoreStatus.safetyBackupId ? restoreStatus.safetyBackupId.slice(-12) : "aguardando"}</strong></span>
                  {restoreStatus.artifactSource && <span>Fonte do pacote: <strong>{restoreStatus.artifactSource === "r2" ? "R2" : "Google Drive"}</strong></span>}
                  {restoreStatus.sourceCommit && <span>Commit do snapshot: <strong className="font-mono">{restoreStatus.sourceCommit.slice(0, 12)}</strong></span>}
                </div>
                {restoreStatus.sourceCommitMatchesCurrent === false && restoreStatus.stage === "completed" && <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">Os dados foram restaurados, mas o snapshot pertence a outro commit. Faça o rollback do código no Render/GitHub para o commit mostrado antes de considerar a recuperação encerrada.</p>}
                {restoreStatus.error && <p className="mt-3 flex items-start gap-2 text-xs text-red-200"><AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />{restoreStatus.error}</p>}
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
                      {backup.driveStatus === "failed" && backup.driveError && <p className="mt-2 flex max-w-2xl items-start gap-1.5 break-words text-xs text-red-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> Drive: {backup.driveError}</p>}
                      {backup.status === "completed" && (
                        <p className={`mt-1 text-xs ${backup.disasterRecoveryReady ? "text-violet-200" : backup.disasterRecoveryVersion ? "text-amber-300" : "text-slate-500"}`}>
                          Recuperação total: {backup.disasterRecoveryReady ? backup.recoveryDriveKitStatus === "completed" ? "pronta · cofre cifrado + ferramenta no Drive" : backup.recoveryDriveKitStatus === "failed" ? "cofre pronto · ferramenta do Drive falhou" : "cofre cifrado incluído · envie ao Drive para completar o kit externo" : backup.disasterRecoveryVersion ? `incompleta · ${backup.recoveryMissingCriticalVariables.length} configuração(ões) essencial(is) ausente(s)` : "backup antigo · gere um novo backup para incluir o kit"}
                        </p>
                      )}
                      {backup.status === "completed" && (
                        <p className={`mt-1 text-xs ${backup.integrityStatus === "verified" ? "text-emerald-300" : backup.integrityStatus === "failed" ? "text-red-300" : backup.integrityStatus === "verifying" ? "text-amber-300" : "text-slate-500"}`}>
                          Integridade profunda: {backup.integrityStatus === "verified" ? `verificada${backup.integrityVerifiedAt ? ` em ${formatDate(backup.integrityVerifiedAt)}` : ""}` : backup.integrityStatus === "verifying" ? "verificando o arquivo armazenado..." : backup.integrityStatus === "failed" ? "falhou" : "pendente"}
                        </p>
                      )}
                      {backup.integrityError && <p className="mt-2 flex items-start gap-1.5 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {backup.integrityError}</p>}
                      {backup.errorMessage && <p className="mt-2 flex items-start gap-1.5 text-xs text-red-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" /> {backup.errorMessage}</p>}
                    </div>
                    {backup.status === "completed" && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          onClick={() => verifyMut.mutate({ id: backup.id })}
                          disabled={verifyMut.isPending || backup.integrityStatus === "verifying" || backup.integrityStatus === "verified"}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-4 py-2.5 text-xs font-black text-emerald-100 hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Lê novamente o arquivo inteiro no R2, confere tamanho, SHA-256 e autenticação AES-GCM"
                        >
                          {verifyMut.isPending && verifyMut.variables?.id === backup.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          {backup.integrityStatus === "verified" ? "Integridade OK" : backup.integrityStatus === "verifying" ? "Verificando..." : backup.integrityStatus === "failed" ? "Verificar novamente" : "Verificar arquivo"}
                        </button>
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
                        <button
                          type="button"
                          onClick={() => prepareRestoreMut.mutate({ id: backup.id })}
                          disabled={backup.integrityStatus !== "verified" || prepareRestoreMut.isPending || restoreActive}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-xs font-black text-amber-100 hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                          title={backup.integrityStatus === "verified" ? "Abrir restauração protegida em múltiplas etapas" : "Faça a verificação profunda antes de restaurar"}
                        >
                          {prepareRestoreMut.isPending && prepareRestoreMut.variables?.id === backup.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                          Restaurar backup
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
          <strong className="text-blue-100">Recuperação protegida:</strong> o Google Drive mantém uma segunda cópia do pacote cifrado. A restauração tenta o R2 primeiro e pode usar a cópia do Drive se o artefato principal estiver indisponível. Nenhum clique simples substitui dados: é exigida Integridade OK, backup automático de segurança, três confirmações, frase vinculada ao ID e a trava de emergência do Render.
        </section>
        {restorePreview && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-300/30 bg-[#101024] p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div><p className="text-[11px] font-black tracking-[0.18em] text-amber-200">RESTAURAÇÃO PROTEGIDA</p><h2 className="mt-1 text-xl font-black">Restaurar este backup</h2><p className="mt-1 text-xs text-slate-400">Esta janela não altera nada até todas as travas abaixo serem atendidas.</p></div>
                <button type="button" onClick={() => setRestorePreview(null)} className="rounded-lg border border-white/10 p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button>
              </div>

              <div className="mt-4 rounded-xl border border-red-300/25 bg-red-300/10 p-4 text-sm text-red-100">
                <div className="flex gap-2"><ShieldAlert className="mt-0.5 h-5 w-5 flex-none" /><div><strong>Operação destrutiva.</strong><p className="mt-1 text-xs leading-5 text-red-100/80">Depois da validação, o banco atual e os arquivos ativos do R2 serão substituídos pelo snapshot. Os próprios backups e auditorias de restauração nunca são apagados.</p></div></div>
              </div>

              <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-xs sm:grid-cols-2">
                <span>Data: <strong>{formatDate(restorePreview.backup.createdAt)}</strong></span>
                <span>Tamanho: <strong>{formatBytes(restorePreview.backup.fileSize)}</strong></span>
                <span>Tabelas: <strong>{restorePreview.backup.tableCount ?? "—"}</strong></span>
                <span>Arquivos R2: <strong>{restorePreview.backup.r2ObjectCount ?? "—"}</strong></span>
                <span>Commit do backup: <strong className="font-mono">{restorePreview.backup.sourceCommit.slice(0, 12)}</strong></span>
                <span>Commit atual: <strong className="font-mono">{restorePreview.backup.currentCommit.slice(0, 12)}</strong></span>
                <span className="sm:col-span-2">Cópia no Drive: <strong>{restorePreview.backup.driveAvailable ? "disponível" : "não registrada"}</strong></span>
              </div>

              {restorePreview.backup.sourceCommitMatchesCurrent === false && <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100"><strong>Atenção ao código:</strong> este backup foi criado em outro commit. O botão restaura banco + R2; o código do Render não é trocado automaticamente. Após recuperar os dados, faça rollback do código para o commit do snapshot.</div>}

              {!restorePreview.restoreEnabled && <div className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100"><strong>Trava de emergência ativa.</strong> Para liberar o último botão somente quando houver necessidade real, crie no Render <code className="rounded bg-black/30 px-1.5 py-0.5">BACKUP_RESTORE_ENABLED=true</code> e faça o deploy. No uso normal deixe ausente/false.</div>}

              <div className="mt-5 space-y-3">
                <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-200"><input type="checkbox" checked={restoreChecks.safety} onChange={(event) => setRestoreChecks((current) => ({ ...current, safety: event.target.checked }))} className="mt-1" /><span><strong>Backup de segurança automático:</strong> entendo que antes de apagar qualquer dado o sistema criará e verificará uma nova cópia do estado atual; se ela falhar, a restauração será cancelada.</span></label>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-200"><input type="checkbox" checked={restoreChecks.destructive} onChange={(event) => setRestoreChecks((current) => ({ ...current, destructive: event.target.checked }))} className="mt-1" /><span><strong>Banco e arquivos:</strong> entendo que tabelas atuais serão substituídas e arquivos do R2 que não existiam no snapshot serão removidos, exceto os diretórios protegidos de backup.</span></label>
                <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-200"><input type="checkbox" checked={restoreChecks.code} onChange={(event) => setRestoreChecks((current) => ({ ...current, code: event.target.checked }))} className="mt-1" /><span><strong>Código:</strong> entendo que o Render/GitHub não é alterado automaticamente e, se o commit for diferente, farei o rollback do código separadamente.</span></label>
              </div>

              <label className="mt-5 block"><span className="text-xs font-bold text-slate-300">Digite exatamente <strong className="font-mono text-amber-200">{restorePreview.confirmationPhrase}</strong></span><input value={restoreConfirmation} onChange={(event) => setRestoreConfirmation(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 font-mono text-sm text-white outline-none focus:border-amber-300/60" /></label>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setRestorePreview(null)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-white/5">Cancelar</button>
                <button
                  type="button"
                  onClick={() => startRestoreMut.mutate({ id: restorePreview.backup.id, token: restorePreview.token, confirmation: restoreConfirmation })}
                  disabled={!restorePreview.restoreEnabled || !restoreChecks.safety || !restoreChecks.destructive || !restoreChecks.code || restoreConfirmation.trim().toUpperCase() !== restorePreview.confirmationPhrase || startRestoreMut.isPending || restoreActive}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {startRestoreMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {startRestoreMut.isPending ? "Iniciando proteção..." : "Confirmar restauração protegida"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
