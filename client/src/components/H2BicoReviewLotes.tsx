import {useState} from "react";
import {trpc} from "@/lib/trpc";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Textarea} from "@/components/ui/textarea";

type Filter="all"|"pending"|"confirmed"|"discarded";
type Scope="all"|"active"|"archived"|"used";
export default function H2BicoReviewLotes(){
  const utils=trpc.useUtils();
  const stats=trpc.h2bicoReview.stats.useQuery();
  const runs=trpc.h2bicoReview.runs.useQuery();
  const [filter,setFilter]=useState<Filter>("pending");
  const [scope,setScope]=useState<Scope>("all");
  const [runId,setRunId]=useState<number|null>(null);
  const [index,setIndex]=useState(0);
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState("");
  const create=trpc.h2bicoReview.createRun.useMutation();
  const lots=trpc.h2bicoReview.lots.useQuery({runId:runId||1},{enabled:!!runId});
  const current=trpc.h2bicoReview.lot.useQuery({runId:runId||1,lotIndex:index},{enabled:!!runId});
  const refresh=async()=>{await Promise.all([utils.h2bicoReview.invalidate(),utils.h2bico.invalidate()]);};
  const start=async()=>{
    if(busy)return;setBusy(true);
    try{
      const res=await create.mutateAsync({reviewFilter:filter,statusScope:scope});
      setRunId(res.runId);setIndex(0);setCopied("");
      await refresh();toast.success(res.total+" CPFs organizados em "+res.lotCount+" lotes.");
    }catch(e){toast.error(e instanceof Error?e.message:"Falha ao montar lotes.");}
    finally{setBusy(false);}
  };
  const rows=current.data?.records||[];
  const copy=async()=>{
    if(!rows.length)return;
    const lines=rows.map(r=>r.cpf);
    const value=lines.join("\n");setCopied(value);
    try{await navigator.clipboard.writeText(value);toast.success(lines.length+" CPFs do lote copiados.");}
    catch{toast.warning("Não foi possível copiar automaticamente. Abra a lista abaixo para selecionar.");}
  };
  const openRun=(id:number)=>{setRunId(id);setIndex(0);setCopied("");};
  return <Card className="border-emerald-500/30 bg-gray-900 p-4 space-y-3 text-white">
    <div className="text-xs font-bold tracking-widest text-emerald-300">H2BICO · EXPORTAÇÃO POR LOTES</div>
    <h2 className="text-xl font-black">COPIAR CPFs EM LOTES DE 1.500</h2>
    <p className="text-sm text-gray-400">Esta área serve apenas para copiar CPFs em lotes de 1.500. Confirmação e descarte ficam na Gestão em Massa abaixo.</p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
      {([["Total",stats.data?.total],["Pendentes",stats.data?.pending],["Confirmados",stats.data?.confirmed],["Descartados",stats.data?.discarded]] as const).map(([label,count])=>
        <div key={label} className="bg-gray-950 rounded-lg p-2"><p className="text-xs text-gray-400">{label}</p><p className="text-xl font-bold">{count??"..."}</p></div>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <label className="text-xs">Conferência
        <select aria-label="Estado de conferência" value={filter} onChange={e=>setFilter(e.target.value as Filter)} className="ml-2 rounded bg-gray-950 border border-gray-700 p-2">
          <option value="pending">Somente não confirmados</option><option value="all">Todos</option><option value="confirmed">Somente confirmados</option><option value="discarded">Somente descartados</option>
        </select>
      </label>
      <label className="text-xs">Situação
        <select aria-label="Situação no H2BICO" value={scope} onChange={e=>setScope(e.target.value as Scope)} className="ml-2 rounded bg-gray-950 border border-gray-700 p-2">
          <option value="all">Todos</option><option value="active">Ativos</option><option value="archived">Arquivados</option><option value="used">Usados</option>
        </select>
      </label>
      <Button disabled={busy} onClick={()=>void start()}>GERAR LOTES DE 1.500</Button>
    </div>
    {!!runs.data?.length&&<div className="flex flex-wrap gap-2">
      <span className="text-xs text-gray-400 self-center">Conferências anteriores:</span>
      {runs.data.slice(0,8).map(r=><Button key={r.id} size="sm" variant={runId===r.id?"default":"outline"} onClick={()=>openRun(r.id)}>#{r.id} · {r.total} CPFs</Button>)}
    </div>}
    {!!lots.data&&<div className="flex flex-wrap gap-2">
      {lots.data.lots.map(l=><Button key={l.index} size="sm" variant={index===l.index?"default":"outline"} onClick={()=>{setIndex(l.index);setCopied("");}}>
        LOTE {l.index+1} · {l.total} CPFs
      </Button>)}
    </div>}
    {!!runId&&current.isLoading&&<p role="status">Carregando lote...</p>}
    {!!current.data&&<div className="space-y-3 border-t border-white/10 pt-3">
      <p className="font-bold">LOTE {index+1} · {current.data.total} CPFs</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy||!rows.length} onClick={()=>void copy()}>COPIAR CPFs DO LOTE</Button></div>
      <p className="text-xs text-gray-400">Para confirmar, cole a lista conferida na Gestão em Massa abaixo.</p>
      {!!copied&&<details><summary className="text-xs">Visualizar CPFs copiados</summary><Textarea className="font-mono min-h-24" readOnly value={copied}/></details>}
    </div>}
  </Card>;
}
