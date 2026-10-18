import {useState} from "react";
import {trpc} from "@/lib/trpc";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Textarea} from "@/components/ui/textarea";

type Row={id:number;name:string;cpf:string;status:string;hasPhoto:boolean;earStatus:"com_ear"|"sem_ear"|null;protected:boolean};
const statuses:Record<string,string>={available:"Disponível",reserved:"Reservado",in_use:"Em uso",used:"USADO",archived:"Arquivado"};
export default function H2BicoBulkManager(){
  const [text,setText]=useState("");
  const [records,setRecords]=useState<Row[]>([]);
  const [selected,setSelected]=useState<number[]>([]);
  const [missing,setMissing]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [filter,setFilter]=useState("all");
  const [earFilter,setEarFilter]=useState("all");
  const [action,setAction]=useState("com_ear");
  const [copyCategory,setCopyCategory]=useState<"all"|"active"|"archived">("all");
  const [copied,setCopied]=useState("");
  const [copyProgress,setCopyProgress]=useState(0);
  const lookup=trpc.useUtils();
  const ear=trpc.h2bico.bulkEarMarker.useMutation();
  const archive=trpc.h2bico.bulkArchive.useMutation();
  const pasted=trpc.h2bicoReview.managePasted.useMutation();
  const [reviewAction,setReviewAction]=useState<"confirm"|"unconfirm"|"discard"|"restore">("confirm");
  const parse=()=>{
    const all=text.split(/\r?\n/).map(x=>x.replace(/\D/g,"")).filter(Boolean);
    const invalid=all.filter(x=>x.length!==11);
    return {cpfs:[...new Set(all.filter(x=>x.length===11))],invalid};
  };
  const search=async()=>{
    const {cpfs,invalid}=parse();
    if(invalid.length){toast.error(invalid.length+" linha(s) com CPF fora do formato de 11 dígitos.");return;}
    if(!cpfs.length){toast.error("Cole pelo menos um CPF.");return;}
    setBusy(true);
    try{
      const found:Row[]=[];
      for(let i=0;i<cpfs.length;i+=300){
        const chunk=await lookup.h2bico.bulkLookup.fetch({cpfs:cpfs.slice(i,i+300)});
        found.push(...chunk as Row[]);
      }
      const byCpf=new Map(found.map(r=>[r.cpf,r]));
      setRecords(cpfs.flatMap(cpf=>byCpf.has(cpf)?[byCpf.get(cpf)!]:[]));
      setMissing(cpfs.filter(cpf=>!byCpf.has(cpf)));
      setSelected([]);
      toast.success(found.length+" encontrado(s), "+(cpfs.length-found.length)+" não encontrado(s).");
    }catch(error){toast.error(error instanceof Error?error.message:"Falha na consulta.");}
    finally{setBusy(false);}
  };
  const displayed=records.filter(r=>(filter==="all"||r.status===filter)&&
    (earFilter==="all"||r.earStatus===(earFilter==="none"?null:earFilter)));
  const ids=selected.filter(id=>records.some(r=>r.id===id));
  const run=async()=>{
    if(!ids.length||busy)return;
    const active=records.filter(r=>ids.includes(r.id));
    const statusAction=action==="archive"||action==="restore";
    const allowed=statusAction?active.filter(r=>!r.protected&&
      (action==="archive"?["available","reserved"].includes(r.status):r.status==="archived")):active;
    if(!allowed.length){toast.error("Nenhum registro elegível.");return;}
    const skipped=active.length-allowed.length;
    if(!window.confirm("Confirmar "+action+" em "+allowed.length+" registro(s)?"+(skipped?" "+skipped+" protegido(s) ignorado(s).":"")))return;
    setBusy(true);
    let done=0;
    try{
      // Each operation uses an authenticated admin endpoint, validates IDs
      // and preserves the existing database status / usage safeguards.
      for(let i=0;i<allowed.length;i+=300){
        const chunk=allowed.slice(i,i+300).map(r=>r.id);
        if(statusAction)await archive.mutateAsync({ids:chunk,mode:action as "archive"|"restore"});
        else await ear.mutateAsync({ids:chunk,earStatus:action==="clear_ear"?null:action as "com_ear"|"sem_ear"});
        done+=chunk.length;
      }
      toast.success(done+" registro(s) atualizado(s).");
      setSelected([]);
      await lookup.h2bico.invalidate();
      // Reconsulta a lista original para recuperar os novos status.
      const {cpfs}=parse();
      const found:Row[]=[];
      for(let i=0;i<cpfs.length;i+=300)found.push(...(await lookup.h2bico.bulkLookup.fetch({cpfs:cpfs.slice(i,i+300)}, {staleTime:0})) as Row[]);
      const byCpf=new Map(found.map(r=>[r.cpf,r]));
      setRecords(cpfs.flatMap(cpf=>byCpf.has(cpf)?[byCpf.get(cpf)!]:[]));
    }catch(error){toast.error("Atualizados "+done+" antes da falha: "+(error instanceof Error?error.message:"Erro"));}
    finally{setBusy(false);}
  };
  const reviewPasted=async()=>{
    const {cpfs,invalid}=parse();
    if(invalid.length||!cpfs.length){toast.error("Cole CPFs válidos, um por linha.");return;}
    if(busy)return;
    const labels={confirm:"CONFIRMAR",unconfirm:"VOLTAR A PENDENTE",discard:"DESCARTAR / ARQUIVAR",restore:"RESTAURAR"};
    if(!window.confirm(labels[reviewAction]+" os "+cpfs.length+" CPFs colados encontrados no H2BICO? Descartados ficam protegidos da confirmação."))return;
    setBusy(true);
    let updated=0,skipped=0,missingCount=0;
    try{
      for(let i=0;i<cpfs.length;i+=250){
        const res=await pasted.mutateAsync({cpfs:cpfs.slice(i,i+250),decision:reviewAction});
        updated+=res.updated;
        skipped+=res.already+res.skippedDiscarded+res.skippedProtected;
        missingCount+=res.missing;
      }
      await Promise.all([lookup.h2bico.invalidate(),lookup.h2bicoReview.invalidate()]);
      setSelected([]);setRecords([]);setMissing([]);
      toast.success(updated+" atualizado(s); "+skipped+" ignorado(s)/protegido(s); "+missingCount+" não encontrado(s).");
    }catch(e){toast.error("Ação interrompida após "+updated+" atualizados: "+(e instanceof Error?e.message:"erro"));}
    finally{setBusy(false);}
  };
  const copyBank=async()=>{
    if(busy)return;
    setBusy(true);
    setCopyProgress(0);
    setCopied("");
    const cpfs:string[]=[];
    let cursor=0;
    try{
      while(true){
        const result=await lookup.h2bico.bulkCopyCpfs.fetch({category:copyCategory,cursor},{staleTime:0});
        cpfs.push(...result.cpfs);
        setCopyProgress(cpfs.length);
        if(!result.hasMore)break;
        if(result.nextCursor==null||result.nextCursor<=cursor)throw new Error("Falha na paginação de CPFs. Nenhum resultado parcial será copiado.");
        cursor=result.nextCursor;
      }
      const body=cpfs.join("\n");
      setCopied(body);
      if(body){
        try{await navigator.clipboard.writeText(body);toast.success(cpfs.length+" CPFs copiados, um por linha.");}
        catch{toast.warning("Lista completa carregada. Use o campo Visualizar lista para selecionar e copiar.");}
      }else toast.info("Nenhum CPF encontrado nesta categoria.");
    }catch(error){
      setCopied("");
      toast.error(error instanceof Error?error.message:"Falha ao consultar todos os CPFs.");
    }finally{setBusy(false);}
  };
  return <Card className="border-cyan-500/30 bg-gray-900 p-4 space-y-4 text-white">
    <div>
      <div className="text-xs font-black tracking-widest text-cyan-300">H2BICO · ADMIN</div>
      <h2 className="text-xl font-black">GESTÃO DE CPFs EM MASSA</h2>
      <p className="text-sm text-gray-400">Cole CPFs, um por linha. Localize fotos e atualize marcadores EAR, arquive ou restaure registros permitidos. Registros usados permanecem protegidos.</p>
    </div>
    <Textarea value={text} onChange={e=>setText(e.target.value)}
      placeholder={"Cole CPFs aqui, um por linha.\n000.000.000-00"} className="min-h-36 font-mono" />
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={()=>void search()}>LOCALIZAR CPFs</Button>
      <Button variant="outline" disabled={busy} onClick={()=>{setText("");setRecords([]);setMissing([]);setSelected([]);setCopied("");}}>LIMPAR LISTA</Button>
      <span className="self-center text-sm text-gray-400">{records.length} encontrados • {missing.length} não encontrados • {selected.length} selecionados</span>
    </div>
    {missing.length>0&&<details className="text-sm text-amber-300"><summary>CPFs não encontrados ({missing.length})</summary><p className="break-all font-mono">{missing.join(", ")}</p></details>}
    <div className="flex flex-wrap gap-2">
      <label className="text-sm">Situação <select aria-label="Filtrar situação" className="ml-2 rounded bg-gray-950 border border-gray-700 p-2" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">Todos</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="text-sm">EAR <select aria-label="Filtrar EAR" className="ml-2 rounded bg-gray-950 border border-gray-700 p-2" value={earFilter} onChange={e=>setEarFilter(e.target.value)}>
        <option value="all">Todos</option><option value="com_ear">Com EAR</option><option value="sem_ear">Sem EAR</option><option value="none">Não marcado</option>
      </select></label>
      <Button variant="outline" disabled={!displayed.length} onClick={()=>setSelected([...new Set([...selected,...displayed.map(r=>r.id)])])}>SELECIONAR FILTRADOS</Button>
      <Button variant="outline" disabled={!selected.length} onClick={()=>setSelected([])}>DESMARCAR</Button>
    </div>
    <div className="max-h-80 overflow-y-auto space-y-2">
      {displayed.map(r=><div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/10 p-2">
        <input aria-label={"Selecionar "+r.name} type="checkbox" checked={selected.includes(r.id)}
          onChange={e=>setSelected(ids=>e.target.checked?[...new Set([...ids,r.id])]:ids.filter(id=>id!==r.id))}/>
        {r.hasPhoto?<img alt={"Foto do registro "+r.name} src={"/api/admin/h2bico/photo/"+r.id} className="h-12 w-12 rounded object-cover" loading="lazy"/>:<div className="h-12 w-12 rounded bg-slate-800 grid place-items-center text-xs">Sem foto</div>}
        <div className="min-w-0 flex-1"><p className="truncate font-bold text-sm">{r.name}</p><p className="text-xs text-gray-400 font-mono">{r.cpf}</p></div>
        <div className="text-right text-xs"><p>{statuses[r.status]||r.status}</p><p className="text-cyan-300">{r.earStatus==="com_ear"?"COM EAR":r.earStatus==="sem_ear"?"SEM EAR":"Sem marcação"}</p>{r.protected&&<p className="text-amber-300">Protegido</p>}</div>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Ação em massa" className="rounded border border-gray-700 bg-gray-950 p-2" value={action} onChange={e=>setAction(e.target.value)}>
        <option value="com_ear">🟢 COM EAR</option><option value="sem_ear">🔴 SEM EAR</option>
        <option value="clear_ear">Remover EAR</option><option value="archive">Arquivar</option><option value="restore">Restaurar</option>
      </select>
      <Button disabled={busy||!ids.length} onClick={()=>void run()}>{busy?"PROCESSANDO...":"APLICAR A "+ids.length+" CPF(s)"}</Button>
    </div>
    <div className="border-t border-white/10 pt-3 space-y-2">
      <p className="font-bold">CONFERÊNCIA DOS CPFs COLADOS</p>
      <p className="text-sm text-gray-400">Após conferir sua lista, cole os CPFs no campo superior. O botão aplica a conferência a todos os CPFs encontrados, sem selecionar cada registro. Copiar não confirma.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Ação de conferência dos CPFs colados" value={reviewAction} onChange={e=>setReviewAction(e.target.value as typeof reviewAction)} className="rounded border border-gray-700 bg-gray-950 p-2">
          <option value="confirm">CONFIRMAR CPFs COLADOS</option>
          <option value="unconfirm">VOLTAR A PENDENTE</option>
          <option value="discard">DESCARTAR / ARQUIVAR</option>
          <option value="restore">RESTAURAR DESCARTADOS</option>
        </select>
        <Button disabled={busy||!parse().cpfs.length} onClick={()=>void reviewPasted()}>{busy?"PROCESSANDO...":"APLICAR À LISTA COLADA"}</Button>
      </div>
    </div>
    <div className="border-t border-white/10 pt-3 space-y-2">
      <p className="font-bold">COPIAR CPFs DO BANCO H2BICO</p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Categoria para copiar" value={copyCategory} onChange={e=>{setCopyCategory(e.target.value as "all"|"active"|"archived");setCopied("");setCopyProgress(0);}} className="rounded border border-gray-700 bg-gray-950 p-2">
          <option value="all">TODOS OS CPFs CADASTRADOS (inclusive usados e arquivados)</option><option value="active">Ativos (disponível, reservado, em uso)</option><option value="archived">Arquivados</option>
        </select>
        <Button onClick={()=>void copyBank()} disabled={busy}>{busy?"CONSULTANDO...":"COPIAR TODOS OS CPFs"}</Button>
      </div>
      {busy&&copyProgress>0&&<p role="status" className="text-sm text-cyan-300">{copyProgress} CPFs consultados...</p>}
      {copied&&<details><summary className="text-xs text-gray-400">Visualizar lista gerada</summary><Textarea value={copied} readOnly className="mt-2 h-28 font-mono"/></details>}
    </div>
  </Card>;
}
