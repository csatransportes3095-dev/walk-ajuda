import { useEffect, useRef, useState } from "react";
import { Database, Download, Play, Pause, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getSimilarPlateVariants, normalizeBrazilPlate, validBrazilPlate } from "@shared/plateSimilarity";

const STATUS: Record<string,string> = {
  paused:"PAUSADO", running:"CONSULTANDO", checking:"CONSULTANDO",
  waiting:"AGUARDANDO COTA", stop_requested:"PAUSANDO...", paused_not_found:"PAUSADO: NÃO LOCALIZADA",
  paused_error:"PAUSADO: ERRO", completed:"CONCLUÍDO",
};
const OUTCOME: Record<string,string> = {
  found:"LOCALIZADA", not_found:"NÃO LOCALIZADA", inconclusive:"INCONCLUSIVO",
};

export default function PlateSimilarityPanel() {
  const [input,setInput] = useState("");
  const [runId,setRunId] = useState<number|null>(null);
  const [automatic,setAutomatic] = useState(false);
  const [busy,setBusy] = useState(false);
  const [waitUntil,setWaitUntil] = useState(0);
  const stepping = useRef(false);
  const utils = trpc.useUtils();
  const provider = trpc.vehicleVault.similarity.provider.useQuery(undefined,{retry:false,refetchInterval:15000});
  const runs = trpc.vehicleVault.similarity.recent.useQuery(undefined,{retry:false});
  const details = trpc.vehicleVault.similarity.details.useQuery({id:runId||1},
    {enabled:!!runId,retry:false,refetchInterval:automatic?4000:false});
  const create = trpc.vehicleVault.similarity.create.useMutation();
  const pause = trpc.vehicleVault.similarity.pause.useMutation();
  const resume = trpc.vehicleVault.similarity.resume.useMutation();
  const recordManual = trpc.vehicleVault.similarity.recordManual.useMutation();
  const step = trpc.vehicleVault.similarity.step.useMutation();
  const current=details.data;
  const preview = validBrazilPlate(input) ? getSimilarPlateVariants(input) : [];

  const refresh = async () => {
    await Promise.all([
      utils.vehicleVault.similarity.details.invalidate(),
      utils.vehicleVault.similarity.recent.invalidate(),
      utils.vehicleVault.similarity.provider.invalidate(),
    ]);
  };
  useEffect(() => {
    if (!automatic || !runId || !current || current.status !== "running") return;
    if (stepping.current) return;
    const timer = window.setTimeout(async () => {
      if (stepping.current) return;
      stepping.current=true;
      try {
        const next=await step.mutateAsync({id:runId});
        await refresh();
        if (next.action === "checked") {
          if(next.outcome==="not_found") {
            setAutomatic(false);
            toast.warning("Placa não localizada. Sequência pausada e resultado salvo.");
          }
          if(next.run.status!=="running")setAutomatic(false);
        } else if(next.action==="waiting"){
          // Mantem o modo automatico: a proxima consulta continua ao liberar a cota.
          setWaitUntil(Date.now()+Math.max(2,next.retryAfterSeconds)*1000);
        } else {
          setAutomatic(false);
          if(next.action==="error")toast.error(next.message);
        }
      } catch (err) {
        setAutomatic(false);
        toast.error(err instanceof Error ? err.message : "Erro na consulta.");
      } finally {stepping.current=false;}
    }, 500);
    return () => window.clearTimeout(timer);
  },[automatic,runId,current?.status,current?.nextIndex]);
  useEffect(()=>{
    if(!automatic || !runId || current?.status!=="waiting" || !waitUntil)return;
    const timer=window.setTimeout(async()=>{
      if(stepping.current)return;
      stepping.current=true;
      try {
        const result=await resume.mutateAsync({id:runId});
        await refresh();
        if(result.status!=="running")setAutomatic(false);
      }catch(error){
        setAutomatic(false);
        toast.error(error instanceof Error ? error.message : "Falha ao retomar consulta.");
      }finally{stepping.current=false;setWaitUntil(0);}
    },Math.max(500,waitUntil-Date.now()+500));
    return ()=>window.clearTimeout(timer);
  },[automatic,runId,current?.status,waitUntil]);
  const exportHistory = ()=>{
    if(!current?.results.length)return;
    const cells = [
      ["Placa","Troca","Resultado","Fonte","Modelo","Cor","Ano modelo","Consultado em"],
      ...current.results.map(r=>[
        r.plate,r.original+" > "+r.replacement,OUTCOME[r.outcome]||r.outcome,
        r.source,r.model||"",r.color||"",r.modelYear||"",
        new Date(r.checkedAt).toLocaleString("pt-BR")
      ])
    ];
    const csv="\uFEFF"+cells.map(row=>row.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const anchor=document.createElement("a");anchor.href=url;
    anchor.download="consultas-"+current.basePlate+"-"+current.id+".csv";
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),5000);
  };
  const execute = async (work:()=>Promise<unknown>) => {
    if(busy)return;
    setBusy(true);
    try {await work();await refresh();}
    catch(e){toast.error(e instanceof Error?e.message:"Operação não concluída.");}
    finally{setBusy(false);}
  };
  const start=()=>void execute(async()=>{
    const made=await create.mutateAsync({plate:input});
    setRunId(made.id);
    setAutomatic(false);
    setWaitUntil(0);
    toast.success("Sequência salva no Cofre. Uma letra por variante.");
  });
  const onPause=()=>{setAutomatic(false);setWaitUntil(0);if(runId)void execute(()=>pause.mutateAsync({id:runId}));};
  const onResume=()=>{if(!runId)return;void execute(async()=>{
    const result=await resume.mutateAsync({id:runId});
    setWaitUntil(0);
    setAutomatic(result.status==="running");
  });};
  const manual=(outcome:"found"|"not_found"|"inconclusive")=>{
    if(!runId||!current?.next)return;
    setAutomatic(false);
    setWaitUntil(0);
    void execute(async()=>{
      await recordManual.mutateAsync({id:runId,plate:current.next!.plate,outcome});
      if(outcome==="not_found")toast.info("Não localizada: salvo e pausado. Não significa placa inexistente.");
      else toast.success("Resultado manual guardado.");
    });
  };
  return <section className="rounded-3xl border border-fuchsia-400/35 bg-slate-950/85 p-4 text-white sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-lg font-black text-fuchsia-200">
        <Search className="h-5 w-5"/>GERADOR INTELIGENTE DE PLACAS</h2>
        <p className="mt-1 text-xs text-slate-400">Mesmo Cofre · apenas uma letra semelhante da placa original por tentativa · histórico separado dos CRLVs</p>
      </div>
      <span className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-200">
        ATÉ 60/H — CONFORME FORNECEDOR</span>
    </div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
      <label className="text-xs font-bold text-slate-300">PLACA ORIGINAL
        <input value={input} onChange={e=>setInput(normalizeBrazilPlate(e.target.value).slice(0,7))}
          placeholder="FWG8B54" maxLength={7}
          className="mt-2 block h-14 w-full rounded-xl border border-fuchsia-300/30 bg-black/50 px-4 text-center font-mono text-2xl font-black tracking-[.14em] uppercase outline-none focus:border-cyan-300"/>
      </label>
      <button type="button" onClick={start} disabled={!validBrazilPlate(input)||busy}
        className="self-end rounded-xl bg-fuchsia-500 px-6 py-4 text-sm font-black text-white disabled:opacity-35">
        GERAR SEQUÊNCIA ({preview.length})</button>
    </div>
    <p className="mt-2 text-xs text-slate-400">
      {preview.length ? "Ordem: "+preview.slice(0,6).map(v=>v.plate).join(" · ")+(preview.length>6?" ...":"") :
        "Digite uma placa brasileira válida para ver as trocas disponíveis."}
    </p>
    <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
      <p className="flex items-center gap-2 font-black"><ShieldAlert className="h-4 w-4"/>CONSULTA EXTERNA
        {provider.data?.configured?" · CREDENCIAIS CONFIGURADAS (NÃO VALIDADAS)":" · AINDA NÃO CONECTADA"}</p>
      <p className="mt-1">O portal divulga 60 consultas por hora. É necessário confirmar endpoint, chave e permissão de integração/armazenamento.
        Ausência na base própria não comprova inexistência no registro brasileiro. Os resultados manuais são identificados como manuais.</p>
      <p className="mt-1 text-amber-200/80">Uso na hora atual: {provider.data?.used??"—"}/{provider.data?.limit??60}
        {provider.data?.retryAfterSeconds ? " · Próxima tentativa em "+provider.data.retryAfterSeconds+" s":""}.</p>
    </div>
    {current && <div className="mt-4 space-y-3 rounded-2xl border border-cyan-400/25 bg-black/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-xs font-bold text-slate-400">SEQUÊNCIA #{current.id} · BASE {current.basePlate}</p>
          <p className="text-sm font-black text-cyan-200">{STATUS[current.status]||current.status} · {current.nextIndex}/{current.total} verificadas</p></div>
        {current.next&&<div className="text-right"><p className="text-xs text-slate-400">PRÓXIMA PLACA</p>
          <p className="font-mono text-xl font-black text-white">{current.next.plate}</p>
          <p className="text-xs text-slate-400">Posição {current.next.position}: {current.next.original} → {current.next.replacement}</p></div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onResume}
          disabled={!provider.data?.configured||busy||automatic||current.status==="completed"||current.status==="checking"||current.status==="stop_requested"}
          className="flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-xs font-black text-emerald-200 disabled:opacity-35">
          <Play className="h-4 w-4"/>INICIAR / CONTINUAR AUTO</button>
        <button type="button" onClick={onPause} disabled={busy||current.status==="completed"}
          className="flex items-center gap-2 rounded-xl border border-yellow-400/40 bg-yellow-500/10 px-4 py-2 text-xs font-black text-yellow-200 disabled:opacity-35">
          <Pause className="h-4 w-4"/>PAUSAR</button>
      </div>
      {current.next && current.status!=="checking" && current.status!=="running" && current.status!=="stop_requested" && <div className="rounded-xl border border-white/10 p-3">
        <p className="mb-2 text-xs font-black text-white/75">INSERIR RESULTADO DE CONSULTA MANUAL (NÃO É VALIDAÇÃO OFICIAL)</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy||automatic} onClick={()=>manual("found")} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-35">LOCALIZADA</button>
          <button disabled={busy||automatic} onClick={()=>manual("not_found")} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-200 disabled:opacity-35">NÃO LOCALIZADA · SALVAR E PAUSAR</button>
          <button disabled={busy||automatic} onClick={()=>manual("inconclusive")} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-35">INCONCLUSIVA</button>
        </div>
      </div>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-300">HISTÓRICO DE CONSULTAS</p>
        <button type="button" disabled={!current.results.length} onClick={exportHistory}
          className="flex items-center gap-2 rounded-lg border border-cyan-300/30 px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-35">
          <Download className="h-4 w-4"/>EXPORTAR CSV</button>
      </div>
      <div className="max-h-60 overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-slate-900 text-slate-300">
          <tr><th className="p-2">Placa</th><th className="p-2">Troca</th><th className="p-2">Resultado</th><th className="p-2">Origem</th><th className="p-2">Modelo / Cor / Ano</th><th className="p-2">Data</th></tr></thead>
          <tbody>{current.results.map((r,i)=><tr key={r.plate+"-"+i} className="border-t border-white/10">
            <td className="p-2 font-mono font-black">{r.plate}</td>
            <td className="p-2">{r.original} → {r.replacement}</td>
            <td className="p-2">{OUTCOME[r.outcome]||r.outcome}</td>
            <td className="p-2">{r.source==="manual"?"MANUAL":r.source}</td>
            <td className="p-2">{[r.model,r.color,r.modelYear].filter(Boolean).join(" · ")||"—"}</td>
            <td className="p-2">{new Date(r.checkedAt).toLocaleString("pt-BR")}</td>
          </tr>)}</tbody></table>
        {!current.results.length&&<p className="p-3 text-xs text-slate-400">Nenhuma placa consultada nesta sequência.</p>}
      </div>
    </div>}
    <div className="mt-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-black text-slate-300"><Database className="h-4 w-4"/>SEQUÊNCIAS SALVAS</p>
      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
        {runs.data?.map(r=><button key={r.id} type="button" onClick={()=>{setAutomatic(false);setWaitUntil(0);setRunId(r.id);}}
          className={"rounded-lg border px-3 py-2 text-xs font-bold "+(runId===r.id?"border-cyan-400 bg-cyan-400/15":"border-white/15 bg-white/5")}>
          {r.basePlate} · {r.nextIndex}/{r.total}</button>)}
        {!runs.data?.length&&<span className="text-xs text-slate-500">Nenhuma sequência salva.</span>}
      </div>
    </div>
  </section>;
}
