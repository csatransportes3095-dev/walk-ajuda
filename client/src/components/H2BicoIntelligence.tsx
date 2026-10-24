import {useState} from "react";
import {trpc} from "@/lib/trpc";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Textarea} from "@/components/ui/textarea";
import {formatMissingH2BicoCpfs} from "@/lib/h2bicoImportReview";
import {isValidCpf} from "@/lib/h2bicoCpfExtractor";
const stateLabels={pending:"PENDENTE",confirmed:"JÁ CONFIRMADO",discarded:"DESCARTADO / BLOQUEADO"};
type Decision="confirm"|"unconfirm"|"discard"|"restore";
type Filter="all"|"pending"|"confirmed"|"discarded";
export default function H2BicoIntelligence(){
 const utils=trpc.useUtils();
 const [value,setValue]=useState("");
 const [analysis,setAnalysis]=useState<any>(null);
 const [decision,setDecision]=useState<Decision>("confirm");
 const [busy,setBusy]=useState(false);
 const [operationId,setOperationId]=useState<string|null>(null);
 const [filter,setFilter]=useState<Filter>("confirmed");
 const [term,setTerm]=useState("");
 const [page,setPage]=useState(0);
 const [historyId,setHistoryId]=useState<number|null>(null);
 const intelligence=trpc.h2bicoIntelligence;
 const analyze=intelligence.analyzePaste.useMutation();
 const start=intelligence.startOperation.useMutation();
 const process=intelligence.processOperation.useMutation();
 const operations=intelligence.recentOperations.useQuery();
 const directory=intelligence.listReviewed.useQuery({review:filter,search:term,page,pageSize:30});
 const history=intelligence.history.useQuery({recordId:historyId||1},{enabled:!!historyId});
 const current=intelligence.operation.useQuery({id:operationId||"00000000-0000-4000-8000-000000000000"},{enabled:!!operationId});
 const getCpfSelection=()=>{
  const raw=[...new Set(value.split(/\r?\n/).map(x=>x.replace(/\D/g,"")).filter(Boolean))];
  const valid=raw.filter(cpf=>isValidCpf(cpf));
  const invalid=raw.filter(cpf=>!isValidCpf(cpf));
  return {raw,valid,invalid};
 };
 const runAnalysis=async()=>{
  const {valid:cpfs,invalid}=getCpfSelection();
  if(!cpfs.length){toast.error(invalid.length?"Nenhum CPF válido encontrado. Confira os dígitos verificadores.":"Cole pelo menos um CPF.");return;}
  if(invalid.length)toast.warning(invalid.length+" CPF(s) inválido(s) foram ignorados; os válidos serão analisados normalmente.");
  setBusy(true);
  try{const data=await analyze.mutateAsync({cpfs});setAnalysis({...data,invalidCpfs:invalid});toast.success(data.confirmed+" já confirmados; "+data.pending+" pendentes; "+invalid.length+" inválido(s) ignorado(s).");}
  catch(e){toast.error(e instanceof Error?e.message:"Falha ao analisar CPFs.");}
  finally{setBusy(false);}
 };
 const resume=async(id:string)=>{
  if(busy)return;setBusy(true);setOperationId(id);
  try{
   for(let i=0;i<30;i++){
    const p=await process.mutateAsync({id});
    if(p.complete){toast.success(p.updated+" atualizados, "+p.already+" já estavam assim, "+p.protected+" protegidos.");break;}
    if(i===29)toast.info("Operação salva. Clique em RETOMAR para continuar.");
   }
   await Promise.all([utils.h2bicoIntelligence.invalidate(),utils.h2bicoReview.invalidate(),utils.h2bico.invalidate()]);
   if(analysis&&value.trim())await runAnalysis();
  }catch(e){toast.error("Operação salva para retomar: "+(e instanceof Error?e.message:"Erro"));}
  finally{setBusy(false);}
 };
 const startOperation=async()=>{
  if(!analysis||busy)return;
  const count=analysis.counts[decision]||0;
  if(!count){toast.info("Nenhum CPF precisa dessa alteração.");return;}
  if(!window.confirm("Executar "+decision+" nos registros elegíveis da lista? "+count+" possíveis alterações. CPFs protegidos serão preservados."))return;
  setBusy(true);
  try{
   const id=crypto.randomUUID();
   const {valid:cpfs,invalid}=getCpfSelection();
   if(!cpfs.length){toast.error("Nenhum CPF válido disponível para processar.");setBusy(false);return;}
   if(invalid.length)toast.warning(invalid.length+" CPF(s) inválido(s) continuam fora da operação.");
   await start.mutateAsync({id,decision,cpfs});
   setBusy(false);
   await resume(id);
  }catch(e){setBusy(false);toast.error(e instanceof Error?e.message:"Não foi possível iniciar.");}
 };
 return <Card className="border-cyan-500/30 bg-gray-900 p-4 space-y-4 text-white">
  <div><p className="text-xs font-bold text-cyan-300">H2BICO INTELLIGENCE · AUDITORIA</p><h2 className="text-xl font-black">ANÁLISE INTELIGENTE E CADASTROS CONFIRMADOS</h2><p className="text-sm text-gray-400">Detecta listas repetidas, exibe situações atuais e mantém histórico. Analisar nunca altera registros.</p></div>
  <Textarea value={value} onChange={e=>{setValue(e.target.value);setAnalysis(null);}} className="min-h-28 font-mono" placeholder="Cole CPFs, um por linha, para saber quais já estão confirmados"/>
  <Button disabled={busy||!value.trim()} onClick={()=>void runAnalysis()}>LOCALIZAR E ANALISAR CPFs</Button>
  {getCpfSelection().invalid.length>0&&<section className="rounded-lg border border-red-500/35 bg-red-950/20 p-3 text-sm">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <strong className="text-red-300">CPFs INVÁLIDOS IGNORADOS ({getCpfSelection().invalid.length})</strong>
    <Button size="sm" variant="outline" onClick={async()=>{
     try{await navigator.clipboard.writeText(getCpfSelection().invalid.join("\n"));toast.success("Lista de CPFs inválidos copiada.");}
     catch{toast.error("Não foi possível copiar automaticamente.");}
    }}>COPIAR INVÁLIDOS</Button>
   </div>
   <p className="mt-1 text-xs text-slate-400">Esses números têm formato de CPF, mas falham nos dígitos verificadores. Eles não são enviados ao servidor e não interrompem os CPFs válidos.</p>
  </section>}
  {!!analysis&&<div className="space-y-3 border border-gray-700 rounded-lg p-3">
   <p className="font-bold">{analysis.total} CPFs únicos analisados</p>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">{([["JÁ CONFIRMADOS",analysis.confirmed],["PENDENTES",analysis.pending],["DESCARTADOS",analysis.discarded],["NÃO ENCONTRADOS",analysis.missing.length]] as const).map(([label,n])=><div key={label} className="rounded bg-gray-950 p-2"><p className="text-xs text-gray-400">{label}</p><p className="text-xl font-bold">{n}</p></div>)}</div>
   {analysis.previousProcessing&&<p className="text-sm text-amber-200">Lista já processada anteriormente: {new Date(analysis.previousProcessing.startedAt).toLocaleString("pt-BR")}</p>}
   {!!analysis.missing?.length&&<section className="space-y-2 rounded-lg border border-amber-500/40 bg-gray-950/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <h3 className="font-bold text-amber-200">CPFs NÃO ENCONTRADOS ({analysis.missing.length})</h3>
     <Button size="sm" variant="outline" onClick={async()=>{
      try{
       await navigator.clipboard.writeText(formatMissingH2BicoCpfs(analysis.missing));
       toast.success(analysis.missing.length+" CPF(s) não encontrados copiados.");
      }catch{toast.error("Cópia automática bloqueada. Selecione os números abaixo e copie com Ctrl+C.");}
     }}>COPIAR TODOS</Button>
    </div>
    <Textarea aria-label="Lista de CPFs não encontrados" readOnly value={formatMissingH2BicoCpfs(analysis.missing)}
      className="min-h-32 max-h-64 resize-y overflow-y-auto font-mono text-sm" />
    <p className="text-xs text-gray-400">Um CPF por linha, mantendo zeros à esquerda. Nenhum cadastro é alterado ao copiar.</p>
   </section>}
   {!!analysis.missingPhoto&&<p className="text-amber-200 text-sm">{analysis.missingPhoto} registros sem foto.</p>}
   <div className="max-h-60 overflow-y-auto space-y-1">{analysis.records.map((r:any)=><div key={r.id} className="flex items-center gap-2 border-b border-gray-800 py-1 text-xs"><span className="font-mono">{r.cpf}</span><span className="flex-1 truncate">{r.name}</span><strong className={r.reviewState==="confirmed"?"text-emerald-300":r.reviewState==="discarded"?"text-red-300":"text-amber-200"}>{stateLabels[r.reviewState as keyof typeof stateLabels]}</strong></div>)}</div>
   <div className="flex flex-wrap gap-2"><select aria-label="Ação proposta" className="bg-gray-950 p-2 rounded" value={decision} onChange={e=>setDecision(e.target.value as Decision)}><option value="confirm">CONFIRMAR PENDENTES</option><option value="unconfirm">VOLTAR A PENDENTE</option><option value="discard">DESCARTAR E ARQUIVAR</option><option value="restore">RESTAURAR DESCARTADOS</option></select><Button disabled={busy||!analysis.counts[decision]} onClick={()=>void startOperation()}>{busy?"PROCESSANDO...":"APLICAR SOMENTE "+(analysis.counts[decision]||0)+" ELEGÍVEIS"}</Button></div>
  </div>}
  <div className="border-t border-gray-700 pt-3 space-y-2">
   <h3 className="font-black">CADASTROS CONFIRMADOS · CONSULTA DO BANCO</h3>
   <div className="flex flex-wrap gap-2"><select aria-label="Conferência do diretório" className="bg-gray-950 p-2 rounded" value={filter} onChange={e=>{setFilter(e.target.value as Filter);setPage(0);}}><option value="confirmed">Já confirmados</option><option value="pending">Pendentes</option><option value="discarded">Descartados</option><option value="all">Todos</option></select><input aria-label="Pesquisar nome ou CPF" value={term} onChange={e=>{setTerm(e.target.value);setPage(0);}} placeholder="Buscar nome ou CPF" className="rounded border border-gray-700 bg-gray-950 p-2"/></div>
   <p className="text-sm text-gray-400">{directory.data?.total??"..."} cadastros encontrados</p>
   <div className="max-h-80 overflow-y-auto space-y-2">{directory.data?.records.map(r=><div key={r.id} className="flex gap-2 items-center border border-gray-800 rounded p-2"><div className="h-12 w-12 shrink-0">{r.hasPhoto?<img alt="Foto do cadastro" src={"/api/admin/h2bico/photo/"+r.id} className="h-12 w-12 object-cover rounded"/>: <span className="text-xs">Sem foto</span>}</div><div className="min-w-0 flex-1"><p className="text-xs font-bold truncate">{r.name}</p><p className="text-xs font-mono">{r.cpf}</p><p className="text-xs text-gray-400">{stateLabels[r.reviewState]} {r.reviewedAt?"· "+new Date(r.reviewedAt).toLocaleString("pt-BR"):""} {r.reviewer?"· ADM "+r.reviewer:""}</p></div><Button size="sm" variant="outline" onClick={()=>setHistoryId(r.id)}>HISTÓRICO</Button></div>)}</div>
   <div className="flex gap-2"><Button size="sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}>ANTERIOR</Button><span className="text-sm self-center">Página {page+1}</span><Button size="sm" disabled={!directory.data||((page+1)*30>=directory.data.total)} onClick={()=>setPage(p=>p+1)}>PRÓXIMA</Button></div>
   {!!historyId&&<div className="border border-gray-700 p-2 rounded"><Button size="sm" variant="outline" onClick={()=>setHistoryId(null)}>FECHAR HISTÓRICO</Button>{history.data?.map((h,i)=><p className="text-xs mt-1" key={i}>{new Date(h.createdAt).toLocaleString("pt-BR")} · {h.action} · {h.details}</p>)}</div>}
  </div>
  <div className="border-t border-gray-700 pt-3 space-y-2"><h3 className="font-black">PROCESSAMENTOS RECENTES / RETOMADA</h3>
   {operations.data?.map(p=><div key={p.id} className="flex flex-wrap items-center gap-2 rounded bg-gray-950 p-2 text-xs"><span className="flex-1">{p.decision.toUpperCase()} · {p.processed}/{p.found} processados · {p.updated} alterados · {p.protected} protegidos</span>{!p.complete&&<Button size="sm" disabled={busy} onClick={()=>void resume(p.id)}>RETOMAR</Button>}</div>)}
   {current.data&&!current.data.complete&&<p className="text-amber-300 text-xs">Operação atual: {current.data.processed}/{current.data.found} · pode ser retomada.</p>}
  </div>
 </Card>;
}