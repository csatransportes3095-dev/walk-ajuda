import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Monitor, Play, Square, ShieldCheck, Search, Wifi, WifiOff, Smartphone, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import H2AdsMobileRemoteViewer from "./H2AdsMobileRemoteViewer";

/**
 * Painel H2ADS Mobile, fase 1.
 * Controle por comandos administrativos existentes; não transmite vídeo nem
 * envia eventos de mouse/teclado. O Chrome continua executando no Windows.
 */
export default function H2AdsMobile() {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const dashboard = trpc.h2Ads.listDashboard.useQuery(undefined, {
    retry: false, refetchInterval: 3_000, refetchOnWindowFocus: true,
  });
  const prepare = trpc.h2Ads.prepareBrowser.useMutation();
  const launch = trpc.h2Ads.launchBrowser.useMutation();
  const close = trpc.h2Ads.closeBrowser.useMutation();
  const remoteStatus = trpc.h2Ads.mobileRemoteStatus.useQuery(undefined, { retry: false });
  const remoteStart = trpc.h2Ads.mobileRemoteStart.useMutation();
  const remoteStop = trpc.h2Ads.mobileRemoteStop.useMutation();
  const [remote, setRemote] = useState<{ instanceId: number; instanceName: string; sessionToken: string } | null>(null);

  async function startRemote(instanceId: number, instanceName: string) {
    try {
      const created = await remoteStart.mutateAsync({ instanceId });
      setRemote({ instanceId, instanceName, sessionToken: created.sessionToken });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel iniciar o controle remoto.");
    }
  }

  function stopRemote() {
    const current = remote;
    setRemote(null);
    if (current) {
      void remoteStop.mutateAsync({ instanceId: current.instanceId, sessionToken: current.sessionToken })
        .catch(() => { /* a sessao termina automaticamente em 20 s */ });
    }
  }


  const workers = useMemo(() => new Map((dashboard.data?.browserWorkers ?? []).map(w => [w.id, w])), [dashboard.data?.browserWorkers]);
  const assignments = useMemo(() => new Map((dashboard.data?.instanceWorkerAssignments ?? []).map(a => [a.instanceId, a])), [dashboard.data?.instanceWorkerAssignments]);
  const runs = useMemo(() => new Map((dashboard.data?.instanceBrowserRuns ?? []).map(r => [r.instanceId, r])), [dashboard.data?.instanceBrowserRuns]);
  const instances = useMemo(() => (dashboard.data?.instances ?? []).filter(instance => {
    const text = query.trim().toLocaleLowerCase("pt-BR");
    return !text || instance.name.toLocaleLowerCase("pt-BR").includes(text) || String(instance.id).includes(text);
  }), [dashboard.data?.instances, query]);
  const activeCount = (dashboard.data?.instanceBrowserRuns ?? []).filter(r => r.state === "browser_open").length;

  async function command(instanceId: number, action: "prepare" | "launch" | "close") {
    if (busyId !== null) return;
    if (action === "close" && !window.confirm("Fechar somente o navegador desta instância? O perfil e proxy serão preservados.")) return;
    setBusyId(instanceId);
    try {
      if (action === "prepare") await prepare.mutateAsync({ instanceId });
      if (action === "launch") await launch.mutateAsync({ instanceId });
      if (action === "close") await close.mutateAsync({ instanceId });
      toast.success(action === "prepare" ? "Preparação enviada ao computador." : action === "launch" ? "Abertura solicitada ao computador." : "Fechamento solicitado ao computador.");
      await dashboard.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "O computador não conseguiu receber o comando.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#06070A] px-4 py-5 text-slate-100">
      <main className="mx-auto w-full max-w-3xl space-y-5 pb-20">
        <header className="flex items-center justify-between gap-3">
          <Link href="/h2ads" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-bold text-slate-200"><ArrowLeft className="h-4 w-4" /> H2ADS</Link>
          <button type="button" onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-bold text-slate-200"><RefreshCw className={`h-4 w-4 ${dashboard.isFetching ? "animate-spin" : ""}`} /> Atualizar</button>
        </header>
        <section className="rounded-3xl border border-[#148CFF]/35 bg-gradient-to-br from-[#0A1E35] to-[#101016] p-5">
          <div className="flex items-center gap-2 text-[#8CC8FF]"><Smartphone className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-widest">H2ADS Mobile • Fase 1</span></div>
          <h1 className="mt-3 text-2xl font-black">Controle de instâncias</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">Abra e feche os navegadores no computador pelo Android. A imagem ao vivo e os cliques dentro do Chrome serão adicionados em uma etapa própria, após validação de segurança.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-lg bg-emerald-500/15 px-3 py-2 text-emerald-200">{activeCount} navegador(es) aberto(s)</span>
            <span className="rounded-lg bg-white/10 px-3 py-2 text-slate-200">{workers.size} computador(es) cadastrado(s)</span>
          </div>
        </section>
        <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/15 bg-[#10151E] px-4">
          <Search className="h-5 w-5 text-[#8CC8FF]" />
          <input aria-label="Buscar instância H2ADS" type="search" autoComplete="off" placeholder="Buscar pelo nome ou número..." value={query} onChange={event => setQuery(event.target.value)} className="w-full bg-transparent py-3 text-sm font-medium text-white outline-none placeholder:text-slate-500" />
        </label>
        {dashboard.isError && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/40 p-4 text-sm text-rose-200">Não foi possível consultar o H2ADS. Confira o login administrativo e tente atualizar.</div>}
        {dashboard.isLoading && <div className="py-14 text-center text-slate-400">Carregando instâncias...</div>}
        <section className="space-y-3">
          {!dashboard.isLoading && !dashboard.isError && instances.length === 0 && <p className="rounded-xl border border-dashed border-white/20 p-6 text-center text-slate-400">Nenhuma instância encontrada.</p>}
          {instances.map(instance => {
            const assignment = assignments.get(instance.id);
            const worker = assignment ? workers.get(assignment.workerId) : null;
            const run = runs.get(instance.id);
            const online = worker?.connectionStatus === "online";
            const isOpen = run?.state === "browser_open";
            const waiting = run?.state === "queued" || run?.state === "preparing";
            const canPrepare = online && instance.status !== "archived" && !waiting && !isOpen;
            const canLaunch = online && instance.status !== "archived" && !waiting && !isOpen && (run?.state === "proxy_verified" || run?.state === "closed");
            const canClose = online && isOpen;
            const busy = busyId !== null;
            return <article key={instance.id} className="rounded-2xl border border-white/15 bg-[#10151E] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-black text-white">{instance.name}</h2>
                  <p className="mt-1 text-xs text-slate-400">Instância #{instance.id} • {worker?.name || "Sem computador atribuído"}</p>
                </div>
                <div className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${online ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
                  {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  {online ? "PC ONLINE" : "PC OFFLINE"}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-300"><Monitor className="h-4 w-4" />{isOpen ? "Chrome aberto no Windows" : waiting ? "Preparando no computador" : run?.state === "proxy_verified" ? "Proxy verificado — pronto para abrir" : run?.state === "blocked" ? "Instância bloqueada — verifique no ADM" : "Navegador fechado ou não preparado"}</div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button type="button" disabled={!canPrepare || busy} onClick={() => void command(instance.id, "prepare")} className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-blue-400/40 bg-blue-500/10 px-2 text-xs font-black text-blue-200 disabled:cursor-not-allowed disabled:opacity-35"><ShieldCheck className="h-4 w-4" />Preparar</button>
                <button type="button" disabled={!canLaunch || busy} onClick={() => void command(instance.id, "launch")} className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-2 text-xs font-black text-emerald-200 disabled:cursor-not-allowed disabled:opacity-35">{busyId === instance.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Abrir</button>
                <button type="button" disabled={!canClose || busy} onClick={() => void command(instance.id, "close")} className="flex min-h-12 items-center justify-center gap-1 rounded-xl border border-rose-400/40 bg-rose-500/10 px-2 text-xs font-black text-rose-200 disabled:cursor-not-allowed disabled:opacity-35"><Square className="h-4 w-4" />Fechar</button>
              </div>
              {isOpen && online && remoteStatus.data?.enabled && <button type="button" disabled={Boolean(remote) || remoteStart.isPending} onClick={() => void startRemote(instance.id, instance.name)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-300/50 bg-blue-600/20 px-3 text-sm font-black text-blue-100 disabled:opacity-40"><Monitor className="h-4 w-4" /> Visualizar / Controlar (piloto)</button>}
              {isOpen && !remoteStatus.data?.enabled && <p className="mt-3 text-[11px] text-slate-500">Controle visual: fase 2 em validacao, ainda nao liberada.</p>}
              {run?.lastErrorCategory && <p className="mt-3 break-words text-xs text-rose-300">Diagnóstico: {run.lastErrorCategory}</p>}
            </article>;
          })}
        </section>
        <p className="text-center text-xs leading-5 text-slate-500">Somente administração. O Chrome permanece no Windows; perfis e proxies não são transferidos para o celular.</p>
        {remote && <H2AdsMobileRemoteViewer instanceId={remote.instanceId} instanceName={remote.instanceName} sessionToken={remote.sessionToken} onClose={stopRemote} />}
      </main>
    </div>
  );
}
