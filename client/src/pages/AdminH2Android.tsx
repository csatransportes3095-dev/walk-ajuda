import { useState } from "react";
import AdminHeader from "@/components/AdminHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MonitorSmartphone, Plus, RefreshCw, Trash2, Play, Square, Download, Wifi, WifiOff, RefreshCcw } from "lucide-react";

export default function AdminH2Android() {
  const utils = trpc.useUtils();
  const overview = trpc.h2Android.overview.useQuery(undefined, { refetchInterval: 5000, refetchIntervalInBackground: true, refetchOnWindowFocus: true, staleTime: 0, retry: false });
  const [label, setLabel] = useState("");
  const [agentLabel, setAgentLabel] = useState("Meu computador");
  const [proxyList, setProxyList] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<"all" | "available" | "assigned" | "retired">("available");
  const [vaultCursor, setVaultCursor] = useState(0);
  const [vaultHistory, setVaultHistory] = useState<number[]>([]);
  const [selectedProxies, setSelectedProxies] = useState<number[]>([]);
  const [proxyDeletion, setProxyDeletion] = useState<{ mode: "selected" | "allAvailable"; ids: number[] } | null>(null);
  const [proxyDeleteConfirmText, setProxyDeleteConfirmText] = useState("");
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [lastManualRefresh, setLastManualRefresh] = useState<{ at: number; changed: boolean } | null>(null);
  const refresh = async () => { await Promise.all([utils.h2Android.overview.invalidate(), utils.h2Android.listProxies.invalidate()]); };
  const refreshInstances = async () => {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      const fingerprint = (profiles: NonNullable<typeof overview.data>["profiles"] | undefined) =>
        (profiles ?? []).map(p => [p.id, p.state, p.proxyId, p.lastError, p.observedIp].join(":")).join("|");
      const previous = fingerprint(overview.data?.profiles);
      // Force a real request; cache invalidation alone gives no confirmation.
      const response = await overview.refetch({ cancelRefetch: true });
      if (response.error) throw response.error;
      if (!response.data) throw new Error("Servidor não retornou as instâncias.");
      const changed = fingerprint(response.data.profiles) !== previous;
      setLastManualRefresh({ at: Date.now(), changed });
      await utils.h2Android.listProxies.invalidate();
      toast[changed ? "success" : "info"](changed
        ? "Dados atualizados. Confira o novo status do Android."
        : "Consulta concluída. O servidor ainda não informou mudança de status.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar o status do Android.");
    } finally {
      setManualRefreshing(false);
    }
  };
  const messages = (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha na operação.");
  const vault = trpc.h2Android.listProxies.useQuery({ status: vaultStatus, cursor: vaultCursor }, { enabled: vaultOpen, staleTime: 0 });
  const deleteProxies = trpc.h2Android.deleteProxies.useMutation({
    onSuccess: async result => {
      toast.success(`${result.deleted} proxy(s) disponível(is) excluído(s).`);
      setProxyDeletion(null); setProxyDeleteConfirmText(""); setSelectedProxies([]);
      setVaultCursor(0); setVaultHistory([]);
      await Promise.all([utils.h2Android.overview.invalidate(), utils.h2Android.listProxies.invalidate()]);
    },
    onError: messages,
  });
  const changeVaultStatus = (status: "all" | "available" | "assigned" | "retired") => {
    setVaultStatus(status); setVaultCursor(0); setVaultHistory([]); setSelectedProxies([]);
  };
  const openProxyDeletion = (mode: "selected" | "allAvailable", ids: number[] = []) => {
    setProxyDeletion({ mode, ids }); setProxyDeleteConfirmText("");
  };
  const toggleProxy = (id: number) => setSelectedProxies(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  const importProxy = trpc.h2Android.importProxies.useMutation({
    onSuccess: async r => { toast.success(String(r.added) + " importados, " + String(r.duplicates) + " duplicados, " + String(r.invalid) + " inválidos."); setProxyList(""); await refresh(); },
    onError: messages,
  });
  const pairing = trpc.h2Android.createPairing.useMutation({
    onSuccess: r => { setPairCode(r.code); toast.success("Código válido por 10 minutos."); },
    onError: messages,
  });
  const create = trpc.h2Android.createProfile.useMutation({
    onSuccess: async () => { setLabel(""); toast.success("Criação enviada ao Windows."); await refresh(); },
    onError: messages,
  });
  const command = trpc.h2Android.command.useMutation({
    onSuccess: async () => { toast.success("Comando enviado ao Windows."); setConfirmDelete(null); await refresh(); },
    onError: messages,
  });
  const rotateProxy = trpc.h2Android.rotateProxy.useMutation({
    onSuccess: async result => {
      toast.info(result.queued ? "Troca do proxy #" + String(result.proxyId) + " enviada ao Android ligado. O proxy anterior segue ativo até a validação." : "Proxy #" + String(result.proxyId) + " reservado. É necessário iniciar o Android para validar.");
      await refresh();
    },
    onError: messages,
  });
  const revoke = trpc.h2Android.revokeAgent.useMutation({
    onSuccess: async () => { toast.success("Agente revogado."); await refresh(); },
    onError: messages,
  });
  const data = overview.data;
  const online = data?.agents.some(a => a.online) ?? false;
  const busy = command.isPending || create.isPending || rotateProxy.isPending;

  return <div className="min-h-screen bg-[#090d18] text-white">
    <AdminHeader title="H2 Android" icon={<MonitorSmartphone className="h-5 w-5" />} backTo="/admin/codes" />
    <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-5">
      <header className="rounded-2xl border border-cyan-400/25 bg-[#111c2e] p-5">
        <h1 className="text-2xl font-black">H2 Android — Instâncias nativas</h1>
        <p className="mt-2 text-sm text-slate-300">O site prepara e envia comandos. Cada Android abre apenas no Windows, com arquivos próprios e proxy exclusivo. Nenhuma tela é transmitida no navegador.</p>
        <p className="mt-3 flex items-center gap-2 text-sm font-bold">{online ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-amber-400" />}{online ? "Agente Windows conectado" : "Agente Windows desconectado"}</p>
      </header>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Disponíveis",data?.counts.available ?? 0], ["Reservados",data?.counts.assigned ?? 0],
          ["Androids",data?.profiles.length ?? 0], ["Limite simultâneo",data?.maxSimultaneous ?? 5],
        ].map(([name,num])=><div key={name} className="rounded-xl border border-white/10 bg-[#12192a] p-4">
          <div className="text-xs text-slate-400">{name}</div><div className="mt-2 text-2xl font-black">{num}</div>
        </div>)}
      </section>
      <section className="rounded-2xl border border-white/10 bg-[#12192a] p-4 sm:p-5">
        <h2 className="text-lg font-bold">1. Cofre de proxies H2 Android</h2>
        <p className="mt-1 text-xs text-slate-400">Proxy SOCKS5 por linha: servidor:porta:usuário:senha. O Emulator usa uma ponte HTTP local 127.0.0.1; as credenciais SOCKS5 ficam protegidas. Este cofre é separado do H2ADS.</p>
        <textarea value={proxyList} onChange={e=>setProxyList(e.target.value)} rows={4} placeholder={"proxy.exemplo.com:1234:usuario:senha\nproxy2.exemplo.com:1234:usuario:senha"} className="mt-3 w-full rounded-xl border border-white/15 bg-[#080d17] p-3 text-sm outline-none focus:border-cyan-400" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">Credenciais protegidas e ocultas após importação</span>
          <button disabled={importProxy.isPending || !proxyList.trim() || !data?.encryptionReady} onClick={()=>importProxy.mutate({proxies:proxyList})} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40">Importar proxies</button>
        </div>
        {data && !data.encryptionReady && <p className="mt-2 text-sm text-amber-300">Chave de criptografia indisponível no servidor.</p>}

        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold">Gerenciar proxies cadastrados</h3>
              <p className="text-xs text-slate-400">Listar e excluir somente proxies livres. Proxies reservados por Androids não podem ser excluídos.</p>
            </div>
            <button onClick={()=>setVaultOpen(v=>!v)} className="rounded-lg border border-cyan-400/35 px-4 py-2 text-sm font-bold text-cyan-200">{vaultOpen ? "Ocultar cofre" : "Ver proxies e opções de exclusão"}</button>
          </div>
          {vaultOpen && <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-300" htmlFor="h2-proxy-filter">Filtrar por status:</label>
              <select id="h2-proxy-filter" value={vaultStatus} onChange={e=>changeVaultStatus(e.target.value as "all" | "available" | "assigned" | "retired")} className="rounded-lg border border-white/20 bg-[#080d17] p-2 text-sm">
                <option value="available">Disponíveis</option>
                <option value="assigned">Reservados</option>
                <option value="retired">Aposentados</option>
                <option value="all">Todos</option>
              </select>
              <button onClick={()=>void utils.h2Android.listProxies.invalidate()} className="rounded-lg border border-white/15 p-2" aria-label="Atualizar lista de proxies"><RefreshCw className="h-4 w-4"/></button>
              <span className="text-xs text-slate-400">Até 80 proxies por página</span>
            </div>
            {vault.isLoading && <p className="text-sm text-slate-400">Carregando proxies...</p>}
            {vault.isError && <p className="text-sm text-red-300">{vault.error.message}</p>}
            {!!vault.data?.proxies.length && <div className="flex flex-wrap items-center gap-2">
              <button disabled={deleteProxies.isPending || !vault.data.proxies.some(p=>p.status==="available")} onClick={()=>{
                const pageIds = vault.data.proxies.filter(p=>p.status==="available").map(p=>p.id);
                setSelectedProxies(old=>Array.from(new Set([...old, ...pageIds])));
              }} className="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40">Selecionar livres desta página</button>
              <button disabled={!selectedProxies.length || deleteProxies.isPending} onClick={()=>setSelectedProxies([])} className="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40">Limpar seleção</button>
              <button disabled={!selectedProxies.length || deleteProxies.isPending} onClick={()=>openProxyDeletion("selected",selectedProxies)} className="rounded-lg border border-red-400/35 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-40">Excluir selecionados ({selectedProxies.length})</button>
            </div>}
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {vault.data?.proxies.map(p=><div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-[#080d17] p-3">
                <input type="checkbox" aria-label={`Selecionar proxy #${p.id}`} checked={selectedProxies.includes(p.id)} disabled={p.status!=="available" || deleteProxies.isPending} onChange={()=>toggleProxy(p.id)} className="h-4 w-4 accent-cyan-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Proxy #{p.id} <span className={p.status==="available"?"text-emerald-300":p.status==="assigned"?"text-amber-300":"text-slate-400"}>• {p.status==="available"?"Disponível":p.status==="assigned"?"Reservado":"Aposentado"}</span></div>
                  <p className="break-all text-xs text-slate-400">{p.endpoint ? `${p.endpoint.protocol} ${p.endpoint.host}:${p.endpoint.port}` : "Dados protegidos ou indisponíveis"}{p.instanceLabel ? ` • Instância ${p.instanceLabel}` : ""}</p>
                </div>
                <button disabled={p.status!=="available" || deleteProxies.isPending} onClick={()=>openProxyDeletion("selected",[p.id])} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-30"><Trash2 className="mr-1 inline h-4 w-4"/>Excluir</button>
              </div>)}
              {vault.data && !vault.data.proxies.length && <p className="text-sm text-slate-400">Nenhum proxy encontrado neste filtro.</p>}
            </div>
            {vault.data && <div className="flex items-center justify-between gap-2">
              <button disabled={!vaultHistory.length || deleteProxies.isPending} onClick={()=>{
                const previous = vaultHistory[vaultHistory.length-1];
                setVaultHistory(x=>x.slice(0,-1)); setVaultCursor(previous); setSelectedProxies([]);
              }} className="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-30">Anterior</button>
              <button disabled={!vault.data.nextCursor || deleteProxies.isPending} onClick={()=>{
                if(vault.data?.nextCursor) {setVaultHistory(x=>[...x,vaultCursor]);setVaultCursor(vault.data.nextCursor);setSelectedProxies([]);}
              }} className="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-30">Próxima página</button>
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/20 p-3">
              <p className="text-xs text-slate-400">Limpar apenas proxies livres, de todas as páginas, sem mexer nos reservados.</p>
              <button disabled={deleteProxies.isPending || !(data?.counts.available ?? 0)} onClick={()=>openProxyDeletion("allAvailable")} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-30">Limpar todos os disponíveis ({data?.counts.available ?? 0})</button>
            </div>
            {proxyDeletion && <div className="rounded-xl border border-red-400/50 bg-red-500/10 p-4">
              <h4 className="text-sm font-bold text-red-200">Confirmar exclusão permanente</h4>
              <p className="mt-1 text-xs text-slate-300">{proxyDeletion.mode==="allAvailable" ? "Você excluirá TODOS os proxies atualmente disponíveis no cofre H2 Android." : `Você excluirá ${proxyDeletion.ids.length} proxy(s) selecionado(s).`} Proxies reservados não serão removidos. Esta ação não pode ser desfeita e os proxies usados não voltarão à fila.</p>
              <label htmlFor="h2-confirm-proxy-delete" className="mt-3 block text-xs text-slate-200">Digite EXCLUIR para confirmar:</label>
              <input id="h2-confirm-proxy-delete" value={proxyDeleteConfirmText} onChange={e=>setProxyDeleteConfirmText(e.target.value)} className="mt-1 w-full max-w-xs rounded-lg border border-red-400/40 bg-[#080d17] p-2 text-sm" placeholder="EXCLUIR" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={proxyDeleteConfirmText!=="EXCLUIR" || deleteProxies.isPending} onClick={()=>deleteProxies.mutate({mode:proxyDeletion.mode, ids:proxyDeletion.ids, confirmed:true})} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-30">Confirmar exclusão</button>
                <button disabled={deleteProxies.isPending} onClick={()=>{setProxyDeletion(null);setProxyDeleteConfirmText("");}} className="rounded-lg border border-white/25 px-4 py-2 text-sm">Cancelar</button>
              </div>
            </div>}
          </div>}
        </div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-[#12192a] p-4 sm:p-5">
        <h2 className="text-lg font-bold">2. Conectar o Windows</h2>
        <p className="mt-1 text-xs text-slate-400">Agente separado do H2ADS. Precisa do Android SDK e da imagem Android com Play Store no computador.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input aria-label="Nome do computador" value={agentLabel} onChange={e=>setAgentLabel(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#080d17] p-3 text-sm"/>
          <button onClick={()=>pairing.mutate({label:agentLabel})} disabled={pairing.isPending || agentLabel.trim().length<2} className="rounded-lg bg-cyan-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40">Gerar código</button>
        </div>
        {pairCode && <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
          <p className="text-xs text-slate-300">Código temporário, válido por 10 minutos:</p>
          <strong className="select-all break-all font-mono text-lg tracking-wider text-cyan-300">{pairCode}</strong>
        </div>}
        <a href="/api/h2-android/install-windows.cmd" download className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-500/10"><Download className="h-4 w-4"/> Instalar / corrigir conexao Windows (.cmd)</a>
        <p className="mt-2 text-xs text-slate-400">Abra o .cmd com dois cliques. Se o agente ja estiver pareado, ele sera atualizado sem pedir outro codigo. Para uma primeira instalacao, gere o codigo acima. O H2ADS permanece intacto.</p>
        <div className="mt-3 space-y-2">
          {(data?.agents ?? []).map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3">
            <div><div className="font-semibold">{a.label} — {a.computerName || "Aguardando"}</div>
            <span className={a.online?"text-xs text-emerald-300":"text-xs text-slate-400"}>{a.revoked?"Revogado":a.online?"Online":"Offline"}</span>
            <span className="ml-2 text-xs text-slate-400">Versão do agente: {a.version || "Não informada"}</span></div>
            {!a.revoked && <button onClick={()=>{if(window.confirm("Revogar acesso deste computador?")) revoke.mutate({id:a.id});}} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-300">Revogar</button>}
          </div>)}
        </div>
      </section>
      <section className="rounded-2xl border border-cyan-400/20 bg-[#12192a] p-4 sm:p-5">
        <h2 className="text-lg font-bold">3. Criar Android no computador</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Nome do Android" maxLength={80} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#080d17] p-3 text-sm"/>
          <button disabled={busy || !online || !data?.counts.available || label.trim().length<2} onClick={()=>create.mutate({label})} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 py-2 font-bold text-slate-950 disabled:opacity-40"><Plus className="h-4 w-4"/> Criar e abrir</button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Exige agente online e proxy livre. Em caso de erro, o proxy continua reservado para evitar duplicação.</p>
      </section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">Instâncias ({data?.profiles.length ?? 0})</h2>
        <div className="flex flex-col items-end gap-1">
          <button type="button" aria-label="Atualizar status das instâncias" title="Consultar novamente o servidor" onClick={()=>void refreshInstances()} disabled={manualRefreshing} className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${manualRefreshing ? "animate-spin" : ""}`}/>{manualRefreshing ? "Atualizando..." : "Atualizar status"}</button>
          {lastManualRefresh && <span className="text-right text-xs text-slate-400" role="status">Consultado às {new Date(lastManualRefresh.at).toLocaleTimeString("pt-BR")} • {lastManualRefresh.changed ? "Dados alterados" : "Sem mudança no servidor"}</span>}
        </div>
      </div>
      {overview.isError && <p className="rounded-xl border border-red-400/40 p-4 text-red-200">Erro de consulta: {overview.error.message}</p>}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data?.profiles ?? []).map(p=><article key={p.id} className="rounded-2xl border border-white/10 bg-[#111928] p-4">
          <div className="flex items-start justify-between gap-2">
            <div><h3 className="font-extrabold">{p.label}</h3><p className="mt-1 text-xs text-slate-400">Proxy #{p.proxyId} • {p.agentLabel}</p>
            <p className="mt-1 break-all text-xs font-medium text-violet-200">{p.proxyEndpoint ? `${p.proxyEndpoint.protocol} ${p.proxyEndpoint.host}:${p.proxyEndpoint.port}` : "Dados do proxy indisponíveis"}</p>
            <p className="mt-1 text-xs text-amber-200">{p.state==="running" ? "Teste TCP/HTTP do Android; confira o IP no navegador e a rede dos aplicativos." : p.state==="error" ? "Falha de inicialização; proxy permanece reservado" : ["provisioning","queued","starting"].includes(p.state) ? "Proxy reservado • validação da rede do Android pendente" : "Proxy reservado • IP do Android não verificado"}</p></div>
            <MonitorSmartphone className="h-6 w-6 text-cyan-300"/>
          </div>
          <p className="mt-3 text-sm text-slate-300">Estado: <b>{({queued:"Na fila",provisioning:"Preparando",running:"Ligado",stopped:"Desligado",starting:"Iniciando",stopping:"Parando",deleting:"Excluindo",error:"Erro"} as Record<string,string>)[p.state] || p.state}</b></p>
          {p.observedIp && <p className="mt-1 text-xs text-amber-200">IP retornado no teste de rede: {p.observedIp} — confira também no navegador do Android.</p>}
          {p.state==="running" && <div role="alert" className="mt-2 rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 text-xs font-semibold text-amber-100">Atenção: o proxy TCP/HTTP não garante todo o tráfego dos aplicativos. Confira o IP público DENTRO do Android antes de acessar contas. Se aparecer o IP direto da sua conexão, clique em Parar.</div>}
          {p.lastError && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200">{p.lastError}</p>}
          {p.state==="error" && !p.lastError && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200">O Android está em erro, mas o servidor não recebeu um diagnóstico. A reserva do proxy não comprova conexão. Confira a versão do agente Windows.</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button disabled={busy || !online || p.state!=="stopped"} onClick={()=>command.mutate({id:p.id,action:"start"})} className="flex items-center justify-center gap-1 rounded-lg border border-emerald-400/25 p-2 text-xs font-bold text-emerald-300 disabled:opacity-30"><Play className="h-4 w-4"/> Iniciar</button>
            <button disabled={busy || !online || p.state!=="running"} onClick={()=>command.mutate({id:p.id,action:"stop"})} className="flex items-center justify-center gap-1 rounded-lg border border-white/15 p-2 text-xs disabled:opacity-30"><Square className="h-4 w-4"/> Parar</button>
            <button disabled={busy || !online || p.state!=="running"} onClick={()=>command.mutate({id:p.id,action:"configure"})} className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-400/10 p-2 text-xs font-bold text-cyan-200 disabled:opacity-30">Ajustar idioma e visual do celular</button>
            <button
              disabled={busy || !online || !["stopped", "error", "running"].includes(p.state) || (data?.counts.available ?? 0)<1}
              onClick={()=>{if(window.confirm(p.state==="running" ? "Trocar proxy AGORA sem desligar o Android? O proxy antigo sera preservado se a validacao falhar." : "Reservar outro proxy para esta instancia parada?")) rotateProxy.mutate({id:p.id});}}
              title={!["stopped","error","running"].includes(p.state) ? "Aguarde o comando em andamento" : (data?.counts.available ?? 0)<1 ? "Nao existem proxies livres no cofre H2 Android" : p.state==="running" ? "Trocar proxy com Android aberto, sem reiniciar" : "Selecionar proximo proxy livre do cofre"}
              className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-violet-400/35 bg-violet-400/10 p-2 text-sm font-bold text-violet-200 disabled:cursor-not-allowed disabled:opacity-30"
            ><RefreshCcw className="h-4 w-4" /> Trocar proxy automatico {p.state==="running" ? "• Android ligado" : ""}</button>
            <button disabled={busy || !online || p.state!=="error"} onClick={()=>{if(window.confirm("Recriar este Android de teste do zero? Os dados locais anteriores deste aparelho serão apagados. O proxy SOCKS5 vinculado será mantido.")) command.mutate({id:p.id,action:"retry"});}} className="rounded-lg border border-amber-400/25 p-2 text-xs text-amber-200 disabled:opacity-30">Recriar teste do zero</button>
            <button disabled={busy || !online} onClick={()=>setConfirmDelete(p.id)} className="flex items-center justify-center gap-1 rounded-lg border border-red-400/25 p-2 text-xs text-red-300 disabled:opacity-30"><Trash2 className="h-4 w-4"/> Excluir</button>
          </div>
          {confirmDelete===p.id && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs">
            <p>Excluir definitivamente o aparelho, todos os dados e o proxy reservado? Esta operação não pode ser desfeita.</p>
            <div className="mt-3 flex gap-2"><button disabled={busy} onClick={()=>command.mutate({id:p.id,action:"delete"})} className="rounded-lg bg-red-500 px-3 py-2 font-bold text-white">Confirmar</button><button onClick={()=>setConfirmDelete(null)} className="rounded-lg border border-white/15 px-3 py-2">Cancelar</button></div>
          </div>}
        </article>)}
      </section>
      <p className="text-xs text-slate-500">O teste de IP é externo ao Android. Não prova que todos os aplicativos respeitem o proxy; tráfego UDP e aplicativos com rede própria precisam de validação separada.</p>
    </main>
  </div>;
}
