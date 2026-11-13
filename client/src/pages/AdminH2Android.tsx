import { useState } from "react";
import AdminHeader from "@/components/AdminHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { MonitorSmartphone, Plus, RefreshCw, Trash2, Play, Square, Download, Wifi, WifiOff, RefreshCcw } from "lucide-react";

export default function AdminH2Android() {
  const utils = trpc.useUtils();
  const overview = trpc.h2Android.overview.useQuery(undefined, { refetchInterval: 5000, staleTime: 0, retry: false });
  const [label, setLabel] = useState("");
  const [agentLabel, setAgentLabel] = useState("Meu computador");
  const [proxyList, setProxyList] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const refresh = async () => { await utils.h2Android.overview.invalidate(); };
  const messages = (e: unknown) => toast.error(e instanceof Error ? e.message : "Falha na operação.");
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
      toast.success("Proxy alterado para #" + String(result.proxyId) + ". Inicie o Android para validar a nova conexao.");
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
            <span className={a.online?"text-xs text-emerald-300":"text-xs text-slate-400"}>{a.revoked?"Revogado":a.online?"Online":"Offline"}</span></div>
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
        <button onClick={()=>void refresh()} className="rounded-lg border border-white/15 p-2"><RefreshCw className="h-4 w-4"/></button>
      </div>
      {overview.isError && <p className="rounded-xl border border-red-400/40 p-4 text-red-200">Erro de consulta: {overview.error.message}</p>}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data?.profiles ?? []).map(p=><article key={p.id} className="rounded-2xl border border-white/10 bg-[#111928] p-4">
          <div className="flex items-start justify-between gap-2">
            <div><h3 className="font-extrabold">{p.label}</h3><p className="mt-1 text-xs text-slate-400">Proxy #{p.proxyId} • {p.agentLabel}</p>
            <p className="mt-1 break-all text-xs font-medium text-violet-200">{p.proxyEndpoint ? `${p.proxyEndpoint.protocol} ${p.proxyEndpoint.host}:${p.proxyEndpoint.port}` : "Dados do proxy indisponíveis"}</p>
            <p className="mt-1 text-xs text-slate-400">{p.state==="running" && p.observedIp ? "IP externo verificado pelo agente" : p.state==="error" ? "Falha de inicialização; proxy permanece reservado" : ["provisioning","queued","starting"].includes(p.state) ? "Proxy reservado • aguardando validação no Windows" : "Proxy reservado • sem verificação recente dentro do Android"}</p></div>
            <MonitorSmartphone className="h-6 w-6 text-cyan-300"/>
          </div>
          <p className="mt-3 text-sm text-slate-300">Estado: <b>{({queued:"Na fila",provisioning:"Preparando",running:"Ligado",stopped:"Desligado",starting:"Iniciando",stopping:"Parando",deleting:"Excluindo",error:"Erro"} as Record<string,string>)[p.state] || p.state}</b></p>
          {p.observedIp && <p className="mt-1 text-xs text-emerald-300">IP externo testado: {p.observedIp} (não garante tráfego dos aplicativos)</p>}
          {p.lastError && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200">{p.lastError}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button disabled={busy || !online || p.state!=="stopped"} onClick={()=>command.mutate({id:p.id,action:"start"})} className="flex items-center justify-center gap-1 rounded-lg border border-emerald-400/25 p-2 text-xs font-bold text-emerald-300 disabled:opacity-30"><Play className="h-4 w-4"/> Iniciar</button>
            <button disabled={busy || !online || p.state!=="running"} onClick={()=>command.mutate({id:p.id,action:"stop"})} className="flex items-center justify-center gap-1 rounded-lg border border-white/15 p-2 text-xs disabled:opacity-30"><Square className="h-4 w-4"/> Parar</button>
            <button disabled={busy || !online || p.state!=="running"} onClick={()=>command.mutate({id:p.id,action:"configure"})} className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-cyan-400/35 bg-cyan-400/10 p-2 text-xs font-bold text-cyan-200 disabled:opacity-30">Ajustar idioma e visual do celular</button>
            <button
              disabled={busy || !online || !["stopped", "error"].includes(p.state) || (data?.counts.available ?? 0)<1}
              onClick={()=>{if(window.confirm("Trocar automaticamente o proxy desta instancia? O proxy atual sera aposentado e nao voltara ao cofre.")) rotateProxy.mutate({id:p.id});}}
              title={!['stopped', 'error'].includes(p.state) ? "Disponivel quando o Android estiver parado ou em erro" : (data?.counts.available ?? 0)<1 ? "Nao existem proxies livres no cofre H2 Android" : "Selecionar proximo proxy livre do cofre"}
              className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-violet-400/35 bg-violet-400/10 p-2 text-sm font-bold text-violet-200 disabled:cursor-not-allowed disabled:opacity-30"
            ><RefreshCcw className="h-4 w-4" /> Trocar proxy automatico</button>
            <button disabled={busy || !online || p.state!=="error"} onClick={()=>command.mutate({id:p.id,action:"retry"})} className="rounded-lg border border-amber-400/25 p-2 text-xs text-amber-200 disabled:opacity-30">Repetir criação</button>
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
