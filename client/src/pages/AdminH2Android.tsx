import { useState } from "react";
import AdminHeader from "@/components/AdminHeader";
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
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
            <Smartphone className="h-8 w-8 text-cyan-300/70" strokeWidth={1.5} />
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
    <div className="min-h-screen bg-[#080b17] text-white">
      <AdminHeader title="H2 Android" icon={<MonitorSmartphone className="h-5 w-5" />} backTo="/admin/codes" />
      <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-5 sm:py-7">
        <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-[#15253a] via-[#101628] to-[#0b0d19] p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
                <ShieldCheck className="h-3.5 w-3.5" /> Módulo exclusivo do ADM
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Gerenciador H2 Android</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300/75">
                Cadastre perfis, instale o agente separado no Windows e acompanhe os diagnósticos reais do Android SDK.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs font-semibold text-amber-200">
              {onlineAgents > 0 ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {onlineAgents > 0 ? onlineAgents + " agente(s) online" : agents.length ? "Agente offline" : "Agente ainda não instalado"}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Resumo de instâncias">
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
        </section>

        <section className="space-y-4 rounded-2xl border border-cyan-400/25 bg-[#101827] p-4 sm:p-5" aria-label="Agente Windows H2 Android">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-black text-cyan-200"><Monitor className="h-5 w-5" /> Agente Windows — Etapa 2</h2>
              <p className="mt-1 text-xs text-slate-400">Agente separado do H2 ADS. Detecta Android SDK, ADB, emulador, RAM e CPU. Não controla aparelhos nesta etapa.</p>
            </div>
            <a href="/api/h2-android/agent/windows-agent.ps1" download="H2AndroidAgent.ps1" className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2.5 text-sm font-bold text-cyan-200">
              <Download className="h-4 w-4" /> Baixar agente
            </a>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <h3 className="mb-2 text-sm font-bold">1. Gerar código de pareamento</h3>
              <button type="button" disabled={pairingMutation.isPending} onClick={() => pairingMutation.mutate()} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">
                <Link2 className="h-4 w-4" /> {pairingMutation.isPending ? "Gerando..." : "Gerar código válido por 10 minutos"}
              </button>
              {pairingCode && <div className="mt-3 space-y-2">
                <p className="break-all rounded-lg border border-amber-400/25 bg-slate-950 p-2.5 font-mono text-xs tracking-wider text-amber-200">{pairingCode}</p>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(pairingCode); toast.info("Código copiado, se permitido pelo navegador."); }} className="flex items-center gap-1 text-xs font-bold text-cyan-200"><Copy className="h-3.5 w-3.5" /> Copiar código</button>
              </div>}
              <p className="mt-2 text-[11px] text-slate-400">Código de uso único. Não compartilhe com outras pessoas.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <h3 className="mb-2 text-sm font-bold">2. Instalar no computador Windows</h3>
              <p className="text-xs leading-relaxed text-slate-300">Baixe o arquivo no seu computador, confira a origem e abra o PowerShell na pasta do download.</p>
              <div className="mt-2 space-y-2">
                <code className="block overflow-x-auto rounded-lg border border-white/10 bg-slate-950 p-2 text-[11px] text-emerald-200">powershell -NoProfile -File .&#92;H2AndroidAgent.ps1 -Install</code>
                <code className="block overflow-x-auto rounded-lg border border-white/10 bg-slate-950 p-2 text-[11px] text-emerald-200">powershell -NoProfile -File .&#92;H2AndroidAgent.ps1 -Run</code>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">O agente inicia com o Windows após o pareamento e se comunica apenas por HTTPS.</p>
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
                    <p className={agent.online ? "text-xs font-bold text-emerald-300" : "text-xs font-bold text-amber-300"}>{agent.online ? "ONLINE" : "OFFLINE"} · Agente v{agent.agentVersion || "não informado"}</p>
                  </div>
                  {confirmRevoke === agent.id
                    ? <div className="flex flex-wrap gap-2">
                        <button disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate({ id: agent.id })} className="rounded-lg bg-red-600 px-2 py-1.5 text-xs font-bold">Confirmar revogação</button>
                        <button onClick={() => setConfirmRevoke(null)} className="rounded-lg border border-white/20 px-2 py-1.5 text-xs">Cancelar</button>
                      </div>
                    : <button onClick={() => setConfirmRevoke(agent.id)} className="rounded-lg border border-red-500/30 px-2 py-1.5 text-xs font-bold text-red-300">Desconectar</button>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-4">
                  <div>Android SDK: <strong>{agent.sdkDetected ? "Detectado" : "Ausente"}</strong></div>
                  <div>ADB: <strong>{agent.adbDetected ? "Sim" : "Não"}</strong></div>
                  <div>Emulador: <strong>{agent.emulatorDetected ? "Sim" : "Não"}</strong></div>
                  <div>RAM: <strong>{agent.ramGb === null ? "—" : agent.ramGb + " GB"}</strong></div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">CPU lógica: {agent.logicalProcessors ?? "—"} · Virtualização: {agent.virtualizationEnabled === null ? "não identificada" : agent.virtualizationEnabled ? "ativa" : "inativa"} · AVDs: {agent.avdNames.length ? agent.avdNames.join(", ") : "nenhum"}</p>
                <p className="mt-1 text-[11px] text-slate-500">Emuladores em execução: {agent.emulatorDevices.length ? agent.emulatorDevices.join(", ") : "nenhum"} · Último sinal: {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleString("pt-BR") : "ainda não recebido"}</p>
              </div>)}
            </div>}
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-400/20 bg-[#10192b] p-4 sm:p-5">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); createProfile(); }}>
            <div className="min-w-0 flex-1">
              <label htmlFor="android-label" className="mb-1.5 block text-xs font-semibold text-slate-200">Nome do novo Android</label>
              <input
                id="android-label"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                maxLength={80}
                placeholder="Ex.: Android 01 (opcional)"
                className="h-11 w-full rounded-lg border border-slate-500/35 bg-[#090f1d] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
              />
            </div>
            <button type="submit" disabled={createMutation.isPending || overviewQuery.isLoading} className="flex h-11 shrink-0 items-center justify-center gap-2 self-end rounded-lg bg-cyan-500 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
              <Plus className="h-4 w-4" /> {createMutation.isPending ? "Criando..." : "Criar perfil Android"}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-400">Criar um perfil não instala nem liga um emulador nesta primeira versão.</p>
        </section>

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold">Meus aparelhos <span className="text-cyan-300">({profiles.length})</span></h2>
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
          <div className="rounded-2xl border border-dashed border-cyan-400/20 bg-white/[0.025] p-8 text-center">
            <Smartphone className="mx-auto mb-3 h-10 w-10 text-cyan-300/60" />
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
                        <input aria-label="Renomear Android" value={renameLabel} maxLength={80} onChange={(event) => setRenameLabel(event.target.value)} className="min-w-0 w-full rounded border border-cyan-500/60 bg-black/40 px-2 py-1 text-sm text-white" />
                        <button type="submit" title="Salvar nome" disabled={renameMutation.isPending} className="rounded p-1 text-emerald-300 hover:bg-emerald-400/10"><Check className="h-4 w-4" /></button>
                        <button type="button" title="Cancelar" onClick={() => setRenamingId(null)} className="rounded p-1 text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-1">
                        <h3 className="truncate text-sm font-extrabold">{profile.label}</h3>
                        <button type="button" title="Renomear Android" onClick={() => { setRenamingId(profile.id); setRenameLabel(profile.label); }} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-cyan-300"><Pencil className="h-3.5 w-3.5" /></button>
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
          <p>O agente mostra o SDK e o desempenho do computador. Moldura e comandos dos Androids continuam apenas visuais; nenhum aplicativo, proxy, câmera ou emulador é instalado ou iniciado automaticamente nesta etapa.</p>
        </div>
      </main>
    </div>
  );
}
