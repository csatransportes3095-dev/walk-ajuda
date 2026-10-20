import { useMemo, useState } from "react";
import { splitSiteBulkBatches, siteBulkEmail } from "@shared/siteSecurityBulk";
import type { SiteBulkFilter } from "@shared/siteSecurityBulk";
import { manualSiteAccessFeedback, manualSiteAccessErrorMessage } from "@shared/siteSecurityManualFeedback";
import { indexFilteredSiteAccess } from "@shared/siteSecurityFilteredAccess";
import { SiteSecurityFilteredCandidate } from "@/components/SiteSecurityFilteredCandidate";
import { filterSiteDirectory, siteDirectoryRegistrationLabel, siteDirectoryAccessLabel, type SiteDirectoryFilter } from "@shared/siteSecurityDirectory";
import { SiteSecurityDirectoryControls } from "@/components/SiteSecurityDirectoryControls";
import { useLocation } from "wouter";
import { ShieldCheck, ArrowLeft, UserPlus, Trash2, RefreshCcw, Image as ImageIcon, Expand, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
type Mode = "public" | "restricted" | "blocked";
export default function AdminSiteSecurity() {
 const [, navigate]=useLocation();
 const status=trpc.siteSecurity.status.useQuery(undefined,{retry:false,refetchOnWindowFocus:true});
 const people=trpc.siteSecurity.list.useQuery(undefined,{retry:false});
 const accessByEmail=useMemo(()=>indexFilteredSiteAccess(people.isError?[]:people.data??[]),[people.data,people.isError]);
 const [directoryFilter,setDirectoryFilter]=useState<SiteDirectoryFilter>("all");
 const [directorySearch,setDirectorySearch]=useState("");
 const directoryPeople=useMemo(()=>filterSiteDirectory(people.isError?[]:people.data??[],directoryFilter,directorySearch),[people.data,people.isError,directoryFilter,directorySearch]);
 const utils=trpc.useUtils();
 const [name,setName]=useState("");const [email,setEmail]=useState("");const [phone,setPhone]=useState("");
 const setMode=trpc.siteSecurity.setMode.useMutation({onSuccess:()=>{void utils.siteSecurity.status.invalidate();toast.success("Modo atualizado.");},onError:e=>toast.error(e.message)});
 const add=trpc.siteSecurity.add.useMutation({
  onSuccess:result=>{
   void utils.siteSecurity.list.invalidate();
   void utils.siteSecurity.bulkCandidates.invalidate();
   const feedback=manualSiteAccessFeedback(result);
   if(feedback.clearForm){setName("");setEmail("");setPhone("");}
   if(feedback.kind==="success")toast.success(feedback.message);else toast.warning(feedback.message);
  },
  onError:e=>toast.error(manualSiteAccessErrorMessage(e.data?.code)),
 });
 const change=trpc.siteSecurity.changeStatus.useMutation({
  onSuccess:async(_,input)=>{
   await Promise.all([utils.siteSecurity.list.invalidate(),utils.siteSecurity.bulkCandidates.invalidate()]);
   toast.success(input.status==="suspended"?"Acesso suspenso.":"Acesso reativado.");
  },
  onError:e=>toast.error(e.data?.code==="FORBIDDEN"||e.data?.code==="UNAUTHORIZED"?"Acesso reservado ao Super Admin. Entre novamente no ADM.":"Não foi possível atualizar a autorização. Atualize a lista e tente novamente."),
 });
 const remove=trpc.siteSecurity.remove.useMutation({onSuccess:()=>void people.refetch(),onError:e=>toast.error(e.message)});
 const [photoModal,setPhotoModal]=useState<{url:string;name:string}|null>(null);
 const [brokenPhotos,setBrokenPhotos]=useState<string[]>([]);
 const [bulkOpen,setBulkOpen]=useState(false);
 const [bulkFilter,setBulkFilter]=useState<SiteBulkFilter>("with_orders");
 const [bulkSearch,setBulkSearch]=useState("");
 const [selectedIds,setSelectedIds]=useState<number[]>([]);
 const [bulkRunning,setBulkRunning]=useState(false);
 const [bulkProgress,setBulkProgress]=useState({done:0,total:0,added:0,already:0});
 const bulk=trpc.siteSecurity.bulkCandidates.useQuery({filter:bulkFilter,search:bulkSearch},{enabled:bulkOpen,retry:false});
 const bulkAdd=trpc.siteSecurity.bulkAdd.useMutation({
  onError:e=>console.error("[site-security bulk]",e.message),
 });
 const candidates=bulk.data||[];
 const eligible=candidates.filter(c=>!c.alreadyAuthorized);
 const selected=selectedIds.filter(id=>eligible.some(c=>c.id===id));
 const runBulk=async()=>{
  const batches=splitSiteBulkBatches(selected);
  if(!batches.length)return;
  if(!window.confirm("Confirmar autorização de "+selected.length+" cliente(s) selecionado(s)?"))return;
  setBulkRunning(true);setBulkProgress({done:0,total:selected.length,added:0,already:0});
  let done=0,addedCount=0,alreadyCount=0;
  try{
   for(const batch of batches){
    const result=await bulkAdd.mutateAsync({customerIds:batch});
    done+=batch.length;addedCount+=result.added;alreadyCount+=result.already;
    setBulkProgress({done,total:selected.length,added:addedCount,already:alreadyCount});
   }
   toast.success("Importação concluída: "+addedCount+" autorizado(s), "+alreadyCount+" já existente(s).");
   setSelectedIds([]);await Promise.all([bulk.refetch(),people.refetch()]);
  }catch(e){
   toast.error("Importação interrompida após "+done+" cliente(s). Atualize a lista antes de continuar.");
   await Promise.all([bulk.refetch(),people.refetch()]);
  }finally{setBulkRunning(false)}
 };
 const current=status.data?.mode;
 const choose=(mode:Mode)=>{if(!window.confirm("Confirmar alteração do site para o modo "+mode+"?"))return;setMode.mutate({mode});};
 if(status.error) return <div className="min-h-screen bg-[#0a0a1a] p-5 text-white"><button onClick={()=>navigate("/admin/codes")} className="text-yellow-300">← Voltar</button><p className="mt-8 text-red-300">Acesso reservado ao Super Admin ou configuração de segurança indisponível.</p></div>;
 return <main className="min-h-screen bg-[#0a0a1a] text-white p-4 sm:p-8">
 <div className="mx-auto max-w-4xl space-y-5">
 <header className="flex items-center gap-3"><button onClick={()=>navigate("/admin/codes")} className="p-2 rounded-xl bg-white/10" aria-label="Voltar"><ArrowLeft/></button><ShieldCheck className="text-yellow-300"/><h1 className="text-xl font-black">SEGURANÇA DO SITE</h1></header>
 <section className="rounded-2xl border border-yellow-500/25 bg-white/5 p-4 space-y-3"><p className="text-xs text-white/60">Modo atual: <strong className="text-yellow-200">{current ?? "Carregando..."}</strong></p>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{([["public","🟢 Público"],["restricted","🔐 Restrito"],["blocked","⛔ Bloqueado 403"]] as const).map(([value,label])=><button key={value} type="button" disabled={!current||setMode.isPending||current===value} onClick={()=>choose(value)} className={`rounded-xl border p-3 font-bold text-sm disabled:opacity-60 ${current===value?"border-green-500 bg-green-600/20":"border-white/20 bg-white/10 hover:border-yellow-400"}`}>{label}</button>)}</div>
 <p className="text-xs text-white/50">Modo Restrito e Bloqueado só podem ser usados quando a proteção do servidor estiver validada na homologação.</p></section>
 <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold">Pessoas autorizadas</h2><button aria-label="Atualizar lista" onClick={()=>void people.refetch()} className="p-2 rounded bg-white/10"><RefreshCcw size={18}/></button></div>
 <form className="grid gap-2 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();if(add.isPending)return;add.mutate({displayName:name.trim(),email:email.trim(),phone:phone.trim()||undefined});}}>
 <input required minLength={2} maxLength={128} value={name} onChange={e=>setName(e.target.value)} placeholder="Nome" className="w-full rounded-lg p-3 bg-white/10 border border-white/20"/>
 <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail autorizado" className="w-full rounded-lg p-3 bg-white/10 border border-white/20"/>
 <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Telefone (opcional)" className="w-full rounded-lg p-3 bg-white/10 border border-white/20"/>
 <button disabled={add.isPending} className="sm:col-span-3 rounded-lg p-3 bg-yellow-500 text-black font-black flex items-center gap-2 justify-center"><UserPlus size={18}/> Adicionar pessoa</button></form>

 <div className="rounded-xl border border-yellow-500/25 bg-black/20 p-3 space-y-3">
  <button type="button" disabled={bulkRunning} onClick={()=>{setBulkOpen(!bulkOpen);setSelectedIds([])}} className="rounded-lg bg-yellow-500/15 border border-yellow-500/40 px-4 py-3 font-bold text-yellow-200 w-full sm:w-auto">Adicionar clientes em massa {bulkOpen?"▲":"▼"}</button>
  {bulkOpen&&<div className="space-y-3">
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    <select aria-label="Filtrar clientes por pedidos" value={bulkFilter} disabled={bulkRunning} onChange={e=>{setBulkFilter(e.target.value as SiteBulkFilter);setSelectedIds([])}} className="bg-[#292939] border border-white/20 rounded-lg p-3">
     <option value="all">Todos os cadastros</option>
     <option value="with_orders">Todos com pedido</option>
     <option value="active">Pedido ativo</option>
     <option value="delivered">Pedido entregue</option>
     <option value="in_progress">Pedido em andamento</option>
     <option value="without_orders">Sem pedido</option>
     <option value="with_loans">Todos com empréstimos (antigos ou ativos)</option>
    </select>
    <input aria-label="Pesquisar clientes" value={bulkSearch} disabled={bulkRunning} onChange={e=>{setBulkSearch(e.target.value);setSelectedIds([])}} placeholder="Nome, e-mail ou telefone" className="bg-[#292939] border border-white/20 rounded-lg p-3"/>
   </div>
   <p className="text-sm text-white/70">{bulk.isLoading?"Buscando cadastros...":bulk.error?"Erro ao buscar cadastros: "+bulk.error.message:candidates.length+" cliente(s) encontrado(s), "+eligible.length+" disponível(is) para autorizar"}</p>
   {!bulk.error&&<div className="flex flex-wrap gap-2 items-center">
    <button type="button" disabled={bulk.isLoading||bulkRunning} onClick={()=>setSelectedIds(eligible.map(c=>c.id))} className="px-3 py-2 rounded-lg bg-white/10 border border-white/20">Selecionar todos do filtro</button>
    <button type="button" disabled={bulkRunning} onClick={()=>setSelectedIds([])} className="px-3 py-2 rounded-lg bg-white/10 border border-white/20">Limpar seleção</button>
    <span className="text-yellow-200 font-bold">{selected.length} selecionado(s)</span>
   </div>}
   <div className="max-h-80 overflow-y-auto space-y-1 border border-white/10 rounded-xl p-2">
    {candidates.map(c=><SiteSecurityFilteredCandidate
     key={c.id} candidate={c} authorization={accessByEmail.get(siteBulkEmail(c.email))}
     selected={selected.includes(c.id)} bulkRunning={bulkRunning} showLoans={bulkFilter==="with_loans"}
     actionDisabled={change.isPending||people.isFetching||people.isError||bulk.isFetching||bulk.isError}
     actionPending={change.isPending&&change.variables?.id===accessByEmail.get(siteBulkEmail(c.email))?.id}
     onSelect={(id,checked)=>setSelectedIds(previous=>checked?[...previous,id]:previous.filter(value=>value!==id))}
     onChangeStatus={input=>{if(change.isPending||bulkRunning||people.isFetching||people.isError||bulk.isFetching||bulk.isError)return;change.mutate(input);}}
    />)}
    {!bulk.isLoading&&!bulk.error&&candidates.length===0&&<p className="p-3 text-white/60">Nenhum cliente encontrado nesse filtro.</p>}
   </div>
   <button type="button" disabled={bulkRunning||bulkAdd.isPending||selected.length===0} onClick={()=>void runBulk()} className="w-full bg-yellow-500 disabled:opacity-50 text-black font-black p-3 rounded-lg">{bulkRunning?"Processando "+bulkProgress.done+" de "+bulkProgress.total+"...":"Autorizar "+selected.length+" cliente(s) selecionado(s)"}</button>
   {bulkRunning&&<p role="status" className="text-sm text-yellow-200">Concluídos: {bulkProgress.done} / {bulkProgress.total} · Novos: {bulkProgress.added} · Já existentes: {bulkProgress.already}. Aguarde a finalização.</p>}
  </div>}
 </div>
 <SiteSecurityDirectoryControls filter={directoryFilter} search={directorySearch} found={directoryPeople.length} total={people.data?.length??0} loading={people.isFetching} onFilter={setDirectoryFilter} onSearch={setDirectorySearch} onClear={()=>{setDirectorySearch("");setDirectoryFilter("all");}}/>
 {people.isLoading?<p>Carregando lista...</p>:people.error?<p className="text-red-300">Não foi possível carregar as autorizações.</p>:people.data?.length===0?<p className="text-white/50 text-sm">Nenhuma pessoa autorizada cadastrada.</p>:directoryPeople.length===0?<p className="text-white/60 text-sm">Nenhuma autorização encontrada nessa busca.</p>:directoryPeople.map(p=><div key={p.id} className="rounded-xl bg-black/20 border border-white/10 p-3 flex flex-wrap justify-between items-center gap-3"><div className="flex items-center gap-3 min-w-0 flex-1">
 <div className="shrink-0">
 {p.profilePhotoUrl && !brokenPhotos.includes(p.profilePhotoUrl)?<button type="button" onClick={()=>setPhotoModal({url:p.profilePhotoUrl!,name:p.displayName})} aria-label={"Expandir foto de "+p.displayName} title="Ampliar foto" className="relative rounded-lg overflow-hidden border border-white/20 focus-visible:ring-2 focus-visible:ring-yellow-400 group">
  <img loading="lazy" src={p.profilePhotoUrl} onError={()=>setBrokenPhotos(prev=>[...prev,p.profilePhotoUrl!])} alt={"Foto de "+p.displayName} className="w-14 h-14 object-cover"/>
  <Expand size={13} className="absolute bottom-0.5 right-0.5 text-white drop-shadow-md" aria-hidden="true"/>
 </button>:<div aria-label="Foto não disponível" className="w-14 h-14 rounded-lg flex items-center justify-center bg-white/5 border border-white/15"><ImageIcon size={22} className="text-white/35"/></div>}
 </div>
 <div className="min-w-0"><p className="font-bold break-words">{p.displayName}</p><p className="text-xs text-white/55 break-all">{p.email} · {siteDirectoryAccessLabel(p)}</p><p className="text-xs text-yellow-200/80 break-words">{siteDirectoryRegistrationLabel(p)}</p>{(p.phone||p.registeredPhone)&&<p className="text-xs text-white/55 break-words">{p.phone||p.registeredPhone}</p>}</div>
 </div><div className="flex gap-2"><button disabled={change.isPending||bulkRunning||people.isFetching} onClick={()=>change.mutate({id:p.id,status:p.status==="active"?"suspended":"active"})} className="rounded-lg border border-white/20 p-2 text-xs">{p.status==="active"?"Suspender":"Reativar"}</button><button aria-label={"Remover "+p.displayName} onClick={()=>{if(window.confirm("Remover autorização?"))remove.mutate({id:p.id});}} className="rounded-lg border border-red-500/30 p-2 text-red-300"><Trash2 size={16}/></button></div></div>)}
 </section>
 {photoModal&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setPhotoModal(null)}}>
  <div role="dialog" aria-modal="true" aria-label={"Foto de "+photoModal.name} className="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-[#10101f] p-4 shadow-2xl">
   <div className="mb-3 flex items-center justify-between gap-3"><p className="font-bold break-words">{photoModal.name}</p><button type="button" aria-label="Fechar foto" title="Fechar" onClick={()=>setPhotoModal(null)} className="rounded-lg border border-white/20 bg-white/10 p-2"><X size={20}/></button></div>
   <img alt={"Foto ampliada de "+photoModal.name} src={photoModal.url} onError={()=>{setBrokenPhotos(prev=>[...prev,photoModal.url]);setPhotoModal(null);toast.error("Foto indisponível no cadastro.");}} className="mx-auto max-h-[76vh] w-auto max-w-full rounded-xl object-contain"/>
  </div>
 </div>}
 </div></main>;
}
