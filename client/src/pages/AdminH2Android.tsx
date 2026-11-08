import { useState } from "react";
import H2AndroidLiveManager from "@/components/H2AndroidLiveManager";
import H2AndroidAdminShell, { type AndroidAdminSection } from "@/components/H2AndroidAdminShell";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, BatteryFull, Check, Cpu, HardDrive, LockKeyhole,
  MonitorSmartphone, Pencil, Plus, Power, RefreshCw, ShieldCheck,
  Smartphone, Trash2, Wifi, WifiOff, X, Download, Copy, Link2, Monitor, ServerOff,
} from "lucide-react";

type AndroidProfile = {
  id: string;
  label: string;
  createdAt: string;
  state: "not_provisioned";
};

function PhoneFrame({ label }: { label: string }) {
  return (
    <div className="relative mx-auto w-[156px] sm:w-[174px] aspect-[9/19] overflow-hidden rounded-[2.2rem] border-[6px] border-[#30384a] bg-[#080d1b] shadow-[0_12px_40px_rgba(0,0,0,.5)] ring-1 ring-white/15">
      <div className="absolute inset-[3px] overflow-hidden rounded-[1.8rem] bg-gradient-to-b from-[#142039] via-[#0d1426] to-[#060912]">
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "linear-gradient(rgba(80,200,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(80,200,255,.35) 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="relative z-10 flex h-7 items-center justify-between px-3 text-[9px] font-bold text-white/85">
          <span>09:41</span>
          <div className="flex items-center gap-1">
            <Wifi className="h-3 w-3" aria-label="Wi-Fi visual" />
            <span>100%</span>
            <BatteryFull className="h-3 w-3" aria-label="Bateria visual" />
          </div>
        </div>
        <div className="absolute left-1/2 top-[4px] z-20 h-[13px] w-14 -translate-x-1/2 rounded-b-xl bg-[#060912]" />
        <div className="relative z-10 flex h-[calc(100%-60px)] flex-col items-center justify-center gap-3 px-3 text-center">
          <div className="rounded-2xl border border-[#8ce2bd]/20 bg-[#80dcb5]/10 p-3">
            <Smartphone className="h-8 w-8 text-[#8ce2bd]/70" strokeWidth={1.5} />
          </div>
          <p className="w-full truncate text-xs font-extrabold text-white">{label}</p>
          <p className="text-[10px] font-semibold text-amber-300">Aguardando agente</p>
          <p className="text-[9px] leading-relaxed text-white/45">Prévia visual da moldura. Nenhum Android está rodando.</p>
        </div>
        <div className="absolute bottom-3 inset-x-0 flex justify-around px-7 text-white/45" aria-hidden="true">
          <span className="h-2 w-2 rotate-45 border-b border-l border-white/50" />
          <span className="h-2.5 w-2.5 rounded-full border border-white/50" />
          <span className="h-2 w-2 border border-white/50" />
        </div>
      </div>
    </div>
  );
}

export default function AdminH2Android() {
  const utils = trpc.useUtils();
  const [activeSection, setActiveSection] = useState<AndroidAdminSection>("overview");
  const overviewQuery = trpc.h2Android.overview.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
  const [newLabel, setNewLabel] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const pairingMutation = trpc.h2Android.createPairingCode.useMutation({
    onSuccess: (data) => {
      setPairingCode(data.code);
      toast.success("Código temporário gerado. Expira em 10 minutos.");
    },
    onError: error => toast.error(error.message),
  });
  const revokeMutation = trpc.h2Android.revokeAgent.useMutation({
    onSuccess: () => {
      setConfirmRevoke(null);
      void utils.h2Android.overview.invalidate();
      toast.success("Agente desconectado e revogado.");
    },
    onError: error => toast.error(error.message),
  });

  const createMutation = trpc.h2Android.createProfile.useMutation({
    onSuccess: () => {
      setNewLabel("");
      void utils.h2Android.overview.invalidate();
      toast.success("Perfil Android criado. O aparelho ainda não foi instalado.");
    },
    onError: (error) => toast.error(error.message || "Erro ao criar perfil."),
  });
  const renameMutation = trpc.h2Android.renameProfile.useMutation({
    onSuccess: () => {
      setRenamingId(null);
      void utils.h2Android.overview.invalidate();
      toast.success("Perfil renomeado.");
    },
    onError: (error) => toast.error(error.message || "Erro ao renomear perfil."),
  });
  const deleteMutation = trpc.h2Android.deleteProfile.useMutation({
    onSuccess: () => {
      setConfirmDeleteId(null);
      void utils.h2Android.overview.invalidate();
      toast.success("Perfil removido.");
    },
    onError: (error) => toast.error(error.message || "Erro ao remover perfil."),
  });

  const profiles: AndroidProfile[] = overviewQuery.data?.profiles ?? [];
  const agents = overviewQuery.data?.agents ?? [];
  const onlineAgents = agents.filter(agent => agent.online).length;
  const activeCount = overviewQuery.data?.activeCount ?? 0;
  const commands = overviewQuery.data?.commands ?? [];
  const maxRunning = overviewQuery.data?.maxSimultaneous ?? 5;

  function createProfile() {
    const defaultLabel = "Android " + String(profiles.length + 1).padStart(2, "0");
    createMutation.mutate({ label: newLabel.trim() || defaultLabel });
  }

  function saveRename(id: string) {
    if (!renameLabel.trim()) return toast.error("Informe um nome.");
    renameMutation.mutate({ id, label: renameLabel.trim() });
  }

  return (
    <H2AndroidAdminShell
      activeSection={activeSection}
      onNavigate={(section) => {
        setActiveSection(section);
        document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-7 sm:px-6 lg:px-7">
        <section id="overview" className="scroll-mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8ce2bd]">H2 Android</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#e9edf2] sm:text-[34px]">Seus Androids, em um só lugar.</h1>
            <p className="mt-2 text-sm text-[#92a0ad]">Controle os aparelhos e acompanhe cada operação.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void overviewQuery.refetch()} disabled={overviewQuery.isFetching}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#2a3948] bg-[#14202c] px-3.5 text-xs font-semibold text-[#b2bdc7] transition hover:bg-[#1a2835] disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
            <button type="button" onClick={() => {
              setActiveSection("devices");
              document.getElementById("devices")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#8ce2bd] px-3.5 text-xs font-bold text-[#123126] transition hover:bg-[#9de9ca]">
              <Plus className="h-3.5 w-3.5" /> Novo Android
            </button>
          </div>
        </section>

        <div id="devices" className="scroll-mt-6">
        <H2AndroidLiveManager agents={agents} commands={overviewQuery.data?.commands ?? []} refresh={() => { void overviewQuery.refetch(); }} />
        </div>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo de instâncias">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><HardDrive className="h-4 w-4" /> Perfis cadastrados</div>
            <p className="mt-2 text-2xl font-black tabular-nums">{profiles.length}</p>
            <p className="text-[11px] text-slate-500">Limite conforme armazenamento</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Activity className="h-4 w-4" /> Androids ligados</div>
            <p className="mt-2 text-2xl font-black tabular-nums">{activeCount}</p>
            <p className="text-[11px] text-slate-500">{onlineAgents} agente(s) conectado(s)</p>
          </div>
          <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:col-span-1">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Cpu className="h-4 w-4" /> Limite simultâneo planejado</div>
            <p className="mt-2 text-2xl font-black tabular-nums">{maxRunning}</p>
            <p className="text-[11px] text-slate-500">Perfis desligados não contam</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Wifi className="h-4 w-4" /> Agentes online</div>
            <p className="mt-2 text-2xl font-black tabular-nums">{onlineAgents}</p>
            <p className="text-[11px] text-slate-500">Computadores conectados</p>
          </div>
        </section>

        <section id="activity" className="scroll-mt-6 rounded-xl border border-[#263543] bg-[#111b26] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8ce2bd]">Acompanhamento</p>
              <h2 className="mt-1 text-base font-bold text-[#e6ebf1]">Atividade recente</h2>
            </div>
            <Activity className="h-5 w-5 text-[#8ce2bd]" />
          </div>
          {overviewQuery.isLoading ? (
            <p className="text-xs text-[#95a2af]">Carregando atividade...</p>
          ) : commands.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#334252] px-3 py-4 text-xs text-[#95a2af]">Nenhuma operação registrada.</p>
          ) : (
            <div className="space-y-2">
              {commands.slice(0, 6).map((command) => (
                <div key={command.id} className="grid gap-1 rounded-lg border border-[#273543] bg-[#0c1520] px-3 py-2.5 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[#e2e8ed]">{command.avdName}</p>
                    <p className="mt-0.5 text-[10px] text-[#8d9aa7]">{command.commandType}</p>
                  </div>
                  <span className="text-[10px] font-semibold text-[#9ce6c8]">
                    {({ queued: "Na fila", delivered: "Enviado", completed: "Concluído", failed: "Falhou", expired: "Expirado" } as Record<string, string>)[command.status] ?? command.status}
                  </span>
                  <time className="text-[10px] text-[#788694]">{new Date(command.createdAt).toLocaleString("pt-BR")}</time>
                </div>
              ))}
            </div>
          )}
        </section>

        <section id="settings" className="scroll-mt-6 space-y-4 rounded-2xl border border-[#80dcb5]/25 bg-[#101827] p-4 sm:p-5" aria-label="Agente Windows H2 Android">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-black text-[#a0e8cc]"><Monitor className="h-5 w-5" /> H2 Android — conexão e substituição do agente</h2>
              <p className="mt-1 text-xs text-slate-400">O agente antigo usa SDK/ADB. Para usar o motor Hyper-V nativo, instale o novo pacote abaixo. A troca preserva o pareamento.</p>
            </div>
          </div>
          <div className="rounded-xl border border-[#80dcb5]/35 bg-[#80dcb5]/[0.06] p-4" aria-label="Download H2 Android nativo">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-2xl">
                <h3 className="text-sm font-extrabold text-[#b5ecd6]">H2 Android Nativo — substituir agente antigo</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  Novo agente Hyper-V, controle nativo e instalação offline, sem Android Studio ou ADB. Baixe pelo ADM e execute o instalador nativo no Windows. O pareamento atual será preservado. Não desinstale manualmente o agente anterior.
                </p>
                <p className="mt-1.5 text-[11px] text-amber-200">
                  Instalador experimental: exige Hyper-V pronto e confirmação. O agente antigo só será interrompido após o novo ser registrado. Tela interativa, proxy e aplicativos ainda não estão disponíveis no motor nativo.
                </p>
              </div>
              <a href="/api/h2-android/agent/installer.zip" download="H2-Android-Nativo.zip"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#80dcb5] px-4 py-2.5 text-sm font-extrabold text-[#102b23] transition hover:bg-[#a4eed1]">
                <Download className="h-4 w-4" /> Baixar novo agente H2 nativo
              </a>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <h3 className="mb-2 text-sm font-bold">1. Gerar código de pareamento</h3>
              <button type="button" disabled={pairingMutation.isPending} onClick={() => pairingMutation.mutate()} className="inline-flex items-center gap-2 rounded-lg bg-[#74cfa9] px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">
                <Link2 className="h-4 w-4" /> {pairingMutation.isPending ? "Gerando..." : "Gerar código válido por 10 minutos"}
              </button>
              {pairingCode && <div className="mt-3 space-y-2">
                <p className="break-all rounded-lg border border-amber-400/25 bg-slate-950 p-2.5 font-mono text-xs tracking-wider text-amber-200">{pairingCode}</p>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(pairingCode); toast.info("Código copiado, se permitido pelo navegador."); }} className="flex items-center gap-1 text-xs font-bold text-[#a0e8cc]"><Copy className="h-3.5 w-3.5" /> Copiar código</button>
              </div>}
              <p className="mt-2 text-[11px] text-slate-400">Código de uso único. Não compartilhe com outras pessoas.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <h3 className="mb-2 text-sm font-bold">2. Instalar no computador Windows</h3>
              <p className="text-xs leading-relaxed text-slate-300">Baixe o ZIP nativo e extraia os arquivos. Execute <strong>Instalar-H2-Android-Nativo.cmd</strong>. Ele reutiliza o pareamento existente e substitui somente a tarefa H2 Android após validar Hyper-V.</p>
              <div className="mt-2 rounded-lg border border-[#80dcb5]/25 bg-[#80dcb5]/5 p-2.5 text-[11px] text-[#b5ecd6]">O motor antigo usa ADB; a substituição nativa só ocorre se Hyper-V estiver pronto. A nova versão não fornece tela remota, Play Store ou proxy automaticamente.</div>
              <p className="mt-2 text-[11px] text-slate-400">Execute apenas o pacote baixado do seu próprio ADM. O agente se comunica por HTTPS e não altera o H2 ADS.</p>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-extrabold">Computadores pareados ({agents.length})</h3>
            {agents.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 p-4 text-xs text-slate-400"><ServerOff className="h-4 w-4" /> Nenhum agente pareado.</div>
            ) : <div className="space-y-2">
              {agents.map(agent => <div key={agent.id} className="rounded-xl border border-white/10 bg-slate-950/75 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-bold text-white">{agent.computerName}</p>
                    <p className={agent.online ? "text-xs font-bold text-[#8ce2bd]" : "text-xs font-bold text-amber-300"}>{agent.online ? "ONLINE" : "OFFLINE"} · Agente v{agent.agentVersion || "não informado"}</p>
                  </div>
                  {confirmRevoke === agent.id
                    ? <div className="flex flex-wrap gap-2">
                        <button disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate({ id: agent.id })} className="rounded-lg bg-red-600 px-2 py-1.5 text-xs font-bold">Confirmar revogação</button>
                        <button onClick={() => setConfirmRevoke(null)} className="rounded-lg border border-white/20 px-2 py-1.5 text-xs">Cancelar</button>
                      </div>
                    : <button onClick={() => setConfirmRevoke(agent.id)} className="rounded-lg border border-red-500/30 px-2 py-1.5 text-xs font-bold text-red-300">Desconectar</button>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-3">
                  <div>Motor: <strong>{agent.agentVersion === "0.3.0-native" ? "H2 Hyper-V nativo" : "Agente antigo"}</strong></div>
                  <div>RAM: <strong>{agent.ramGb === null ? "—" : agent.ramGb + " GB"}</strong></div>
                  <div>Hyper-V: <strong>{agent.agentVersion === "0.3.0-native" ? (agent.hyperVReady ? "Pronto" : "Pendente") : "Agente antigo"}</strong></div>
                  <div>VMs H2: <strong>{agent.avdNames.length}</strong></div>
                </div>
                {agent.agentVersion === "0.3.0-native" && !agent.hyperVReady && (
                  <p className="mt-2 text-[11px] font-semibold text-amber-200">Hyper-V: {agent.hyperVReason || "Verifique Windows Pro e permissões."}</p>
                )}
                <p className="mt-2 text-[11px] text-slate-500">CPU lógica: {agent.logicalProcessors ?? "—"} · Virtualização: {agent.virtualizationEnabled === null ? "não identificada" : agent.virtualizationEnabled ? "ativa" : "inativa"} · Instâncias: {agent.avdNames.length ? agent.avdNames.join(", ") : "nenhuma"}</p>
                <p className="mt-1 text-[11px] text-slate-500">VMs ligadas: {agent.runningAvds.length ? agent.runningAvds.join(", ") : "nenhuma"} · Último sinal: {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleString("pt-BR") : "ainda não recebido"}</p>
              </div>)}
            </div>}
          </div>
        </section>

        <section className="rounded-2xl border border-[#80dcb5]/20 bg-[#10192b] p-4 sm:p-5">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); createProfile(); }}>
            <div className="min-w-0 flex-1">
              <label htmlFor="android-label" className="mb-1.5 block text-xs font-semibold text-slate-200">Nome do novo Android</label>
              <input
                id="android-label"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                maxLength={80}
                placeholder="Ex.: Android 01 (opcional)"
                className="h-11 w-full rounded-lg border border-slate-500/35 bg-[#090f1d] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#80dcb5]"
              />
            </div>
            <button type="submit" disabled={createMutation.isPending || overviewQuery.isLoading} className="flex h-11 shrink-0 items-center justify-center gap-2 self-end rounded-lg bg-[#74cfa9] px-5 text-sm font-black text-slate-950 transition hover:bg-[#80dcb5] disabled:opacity-50">
              <Plus className="h-4 w-4" /> {createMutation.isPending ? "Criando..." : "Criar perfil Android"}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-400">Criar um perfil não instala nem liga um emulador nesta primeira versão.</p>
        </section>

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold">Meus aparelhos <span className="text-[#8ce2bd]">({profiles.length})</span></h2>
          <button type="button" onClick={() => void overviewQuery.refetch()} disabled={overviewQuery.isFetching} className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>

        {overviewQuery.isError && (
          <div role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            Não foi possível consultar o H2 Android: {overviewQuery.error.message}
          </div>
        )}
        {overviewQuery.isLoading && (
          <div className="rounded-xl border border-white/10 p-8 text-center text-sm text-slate-400">Carregando perfis...</div>
        )}
        {!overviewQuery.isLoading && !overviewQuery.isError && profiles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#80dcb5]/20 bg-white/[0.025] p-8 text-center">
            <Smartphone className="mx-auto mb-3 h-10 w-10 text-[#8ce2bd]/60" />
            <p className="font-bold">Nenhum Android cadastrado</p>
            <p className="mt-1 text-sm text-slate-400">Crie o primeiro perfil acima. Ele ficará aguardando a instalação do agente.</p>
          </div>
        )}

        {profiles.length > 0 && (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Perfis de Android cadastrados">
            {profiles.map((profile) => (
              <article key={profile.id} className="min-w-0 rounded-2xl border border-white/10 bg-[#111727] p-4 shadow-lg">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {renamingId === profile.id ? (
                      <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); saveRename(profile.id); }}>
                        <input aria-label="Renomear Android" value={renameLabel} maxLength={80} onChange={(event) => setRenameLabel(event.target.value)} className="min-w-0 w-full rounded border border-[#74cfa9]/60 bg-black/40 px-2 py-1 text-sm text-white" />
                        <button type="submit" title="Salvar nome" disabled={renameMutation.isPending} className="rounded p-1 text-[#8ce2bd] hover:bg-[#80dcb5]/10"><Check className="h-4 w-4" /></button>
                        <button type="button" title="Cancelar" onClick={() => setRenamingId(null)} className="rounded p-1 text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-1">
                        <h3 className="truncate text-sm font-extrabold">{profile.label}</h3>
                        <button type="button" title="Renomear Android" onClick={() => { setRenamingId(profile.id); setRenameLabel(profile.label); }} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-[#8ce2bd]"><Pencil className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Não instalado
                    </span>
                  </div>
                  <LockKeyhole className="h-4 w-4 shrink-0 text-slate-500" aria-label="Área administrativa" />
                </div>
                <PhoneFrame label={profile.label} />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" disabled title="Disponível somente após conectar o agente H2 Android" className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold text-slate-500"><Power className="h-4 w-4" /> Iniciar</button>
                  <button type="button" disabled title="Disponível somente após conectar o agente H2 Android" className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold text-slate-500"><Smartphone className="h-4 w-4" /> Abrir tela</button>
                </div>
                {confirmDeleteId === profile.id ? (
                  <div className="mt-3 rounded-xl border border-red-400/35 bg-red-500/10 p-3">
                    <p className="text-xs font-semibold text-red-100">Excluir o perfil {profile.label}?</p>
                    <p className="mt-1 text-[11px] text-slate-300">Nesta fase apenas o cadastro será removido. Não existem dados de Android virtual para apagar.</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => deleteMutation.mutate({ id: profile.id })} disabled={deleteMutation.isPending} className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50">Confirmar exclusão</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(profile.id)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/20 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/10"><Trash2 className="h-3.5 w-3.5" /> Excluir perfil</button>
                )}
              </article>
            ))}
          </section>
        )}

        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/80">
          <p className="mb-1 font-extrabold">Etapa 2 — Pareamento e diagnóstico Windows</p>
          <p>Os cadastros antigos e as molduras ilustrativas foram preservados apenas como histórico. O gerenciamento real de aparelhos está no painel superior.</p>
        </div>

      </main>
    </H2AndroidAdminShell>
  );
}
