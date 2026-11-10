import { useState } from "react";
import H2AndroidLiveManager from "@/components/H2AndroidLiveManager";
import H2AndroidAdminShell, { type AndroidAdminSection } from "@/components/H2AndroidAdminShell";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Activity, Cpu, HardDrive, Wifi, Download, Copy, Link2, Monitor, ServerOff } from "lucide-react";

export default function AdminH2Android() {
  const utils = trpc.useUtils();
  const [activeSection, setActiveSection] = useState<AndroidAdminSection>("overview");
  const overviewQuery = trpc.h2Android.overview.useQuery(undefined, {
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
  });
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

  const agents = overviewQuery.data?.agents ?? [];
  const onlineAgents = agents.filter(agent => agent.online).length;
  const nativeAgentPaired = agents.some(agent => agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native"));
  const nativeAgentOnline = agents.some(agent => agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native") && agent.online);
  const nativeCount = agents.filter(agent => agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native"))
    .reduce((count, agent) => count + agent.avdNames.length, 0);
  const activeCount = overviewQuery.data?.activeCount ?? 0;
  const commands = overviewQuery.data?.commands ?? [];
  const maxRunning = overviewQuery.data?.maxSimultaneous ?? 5;

  return (
    <H2AndroidAdminShell
      activeSection={activeSection}
      onNavigate={(section) => {
        setActiveSection(section);
        document.getElementById("h2-android-content-top")?.scrollIntoView({ behavior: "auto", block: "start" });
      }}
    >
      <main id="h2-android-content-top" className="mx-auto max-w-[1400px] space-y-6 px-4 py-7 sm:px-6 lg:px-7">
        {activeSection === "overview" && (
        <section id="overview" className="scroll-mt-6 flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8ce2bd]">H2 Android</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#e9edf2] sm:text-[34px]">Seus Androids, em um só lugar.</h1>
            <p className="mt-2 text-sm text-[#92a0ad]">Controle os aparelhos e acompanhe cada operação.</p>
          </div>
        </section>
        )}

        {(activeSection === "overview" || activeSection === "devices") && (
        <div id="devices" className="scroll-mt-6">
        <H2AndroidLiveManager agents={agents} commands={overviewQuery.data?.commands ?? []} refresh={() => overviewQuery.refetch({ throwOnError: true })} />
        </div>
        )}

        {activeSection === "overview" && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo de instâncias">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><HardDrive className="h-4 w-4" /> Máquinas H2 detectadas</div>
            <p className="mt-2 text-2xl font-black tabular-nums">{nativeCount}</p>
            <p className="text-[11px] text-slate-500">Somente máquinas reais informadas pelo agente</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Activity className="h-4 w-4" /> Androids ligados</div>
            <p className="mt-2 text-2xl font-black tabular-nums">{activeCount}</p>
            <p className="text-[11px] text-slate-500">{onlineAgents} agente(s) conectado(s)</p>
          </div>
          <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:col-span-1">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Cpu className="h-4 w-4" /> Limite simultâneo planejado</div>
            <p className="mt-2 text-2xl font-black tabular-nums">{maxRunning}</p>
            <p className="text-[11px] text-slate-500">Máquinas desligadas não contam</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-slate-400"><Wifi className="h-4 w-4" /> Agentes online</div>
            <p className="mt-2 text-2xl font-black tabular-nums">{onlineAgents}</p>
            <p className="text-[11px] text-slate-500">Computadores conectados</p>
          </div>
        </section>
        )}

        {activeSection === "activity" && (
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
        )}

        {activeSection === "settings" && (
        <section id="settings" className="scroll-mt-6 space-y-4 rounded-2xl border border-[#80dcb5]/25 bg-[#101827] p-4 sm:p-5" aria-label="Agente Windows H2 Android">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-black text-[#a0e8cc]"><Monitor className="h-5 w-5" /> Agente Windows H2 Android</h2>
              <p className="mt-1 text-xs text-slate-400">Gerencie o computador que executa seus Androids. Não reinstale o agente nativo já conectado.</p>
            </div>
          </div>
          {nativeAgentPaired && (
            <div className={"rounded-xl border p-3 text-xs " + (nativeAgentOnline ? "border-[#80dcb5]/35 bg-[#80dcb5]/[0.06] text-[#b5ecd6]" : "border-amber-400/35 bg-amber-400/[0.06] text-amber-100")}>
              {nativeAgentOnline
                ? "Agente Hyper-V nativo já instalado e conectado. Não é necessário baixar, reinstalar ou parear outro agente."
                : "Agente nativo já pareado, mas offline. Verifique a conexão do computador e o serviço Windows."}
              <a href="/api/h2-android/agent/installer.zip" download="H2-Android-Nativo.zip"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#80dcb5]/40 bg-[#80dcb5]/10 px-3 py-2 text-xs font-bold text-[#b5ecd6]">
                <Download className="h-4 w-4" /> Baixar atualização do agente H2
              </a>
              <p className="mt-2 text-[11px] text-slate-400">Extraia o ZIP e execute Atualizar-H2-Android-Nativo.cmd como administrador. A atualização preserva o Android 01 e o pareamento. Depois, confira a versão 0.3.3-native-guard no painel. Se aparecer 0.3.2, a proteção nova ainda não está ativa.</p>
            </div>
          )}
          {!nativeAgentPaired && (
            <>
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
            </>
          )}
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
                  <div>Motor: <strong>{agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native") ? "H2 Hyper-V nativo" : "Agente antigo"}</strong></div>
                  <div>RAM: <strong>{agent.ramGb === null ? "—" : agent.ramGb + " GB"}</strong></div>
                  <div>Hyper-V: <strong>{agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native") ? (agent.hyperVReady ? "Pronto" : "Pendente") : "Agente antigo"}</strong></div>
                  <div>VMs H2: <strong>{agent.avdNames.length}</strong></div>
                </div>
                {agent.agentVersion.startsWith("0.3.") && agent.agentVersion.includes("-native") && !agent.hyperVReady && (
                  <p className="mt-2 text-[11px] font-semibold text-amber-200">Hyper-V: {agent.hyperVReason || "Verifique Windows Pro e permissões."}</p>
                )}
                <p className="mt-2 text-[11px] text-slate-500">CPU lógica: {agent.logicalProcessors ?? "—"} · Virtualização: {agent.virtualizationEnabled === null ? "não identificada" : agent.virtualizationEnabled ? "ativa" : "inativa"} · Instâncias: {agent.avdNames.length ? agent.avdNames.join(", ") : "nenhuma"}</p>
                <p className="mt-1 text-[11px] text-slate-500">VMs ligadas: {agent.runningAvds.length ? agent.runningAvds.join(", ") : "nenhuma"} · Último sinal: {agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleString("pt-BR") : "ainda não recebido"}</p>
              </div>)}
            </div>}
          </div>
        </section>
        )}

      </main>
    </H2AndroidAdminShell>
  );
}
