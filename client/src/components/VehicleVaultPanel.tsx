import { useState } from "react";
import { Archive, ClipboardPaste, FileSearch, FileText, FolderOpen, Loader2, Pencil, Plus, Printer, Search, ShieldCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import VehicleVaultBatchPanel from "./VehicleVaultBatchPanel";

type VehicleFields = {
  plate:string; renavam:string; chassis:string; model:string; color:string;
  manufactureYear:string; modelYear:string; category:string; exerciseYear:string;
};
const EMPTY:VehicleFields={plate:"",renavam:"",chassis:"",model:"",color:"",manufactureYear:"",modelYear:"",category:"",exerciseYear:""};
const NAMES: Array<[keyof VehicleFields,string]>=[
  ["plate","PLACA"],["renavam","RENAVAM"],["chassis","CHASSI"],
  ["model","MARCA / MODELO"],["color","COR"],["manufactureYear","ANO FABRICAÇÃO"],
  ["modelYear","ANO DO MODELO"],["category","CATEGORIA"],["exerciseYear","EXERCÍCIO"],
];
/**
 * Cor apresentada como etiqueta visual. Para BRANCO e PRETO, o fundo
 * permanece branco e o texto preto; a amostra distingue as duas cores.
 * Não altera os campos originais nem a pesquisa no banco.
 */
function colorPalette(input: string) {
  const name=String(input||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim();
  const palette: Array<[RegExp,string,string,string]>=[
    [/^BRANC/, "#FFFFFF", "#111827", "#FFFFFF"],
    [/^PRET/, "#FFFFFF", "#111827", "#111827"],
    [/^CINZA/, "#9CA3AF", "#111827", "#9CA3AF"],
    [/^PRATA/, "#D1D5DB", "#111827", "#D1D5DB"],
    [/^GRAFITE/, "#4B5563", "#FFFFFF", "#4B5563"],
    [/^AZUL/, "#2563EB", "#FFFFFF", "#2563EB"],
    [/^VERMELH/, "#DC2626", "#FFFFFF", "#DC2626"],
    [/^VERDE/, "#15803D", "#FFFFFF", "#15803D"],
    [/^AMAREL/, "#FDE047", "#111827", "#FDE047"],
    [/^MARROM/, "#92400E", "#FFFFFF", "#92400E"],
    [/^BEGE/, "#E9D5AE", "#111827", "#E9D5AE"],
    [/^DOURAD/, "#D4AF37", "#111827", "#D4AF37"],
    [/^LARANJA/, "#EA580C", "#FFFFFF", "#EA580C"],
    [/^ROSA/, "#F9A8D4", "#111827", "#F9A8D4"],
    [/^ROX/, "#7E22CE", "#FFFFFF", "#7E22CE"],
    [/^VINHO|^BORDO/, "#881337", "#FFFFFF", "#881337"],
  ];
  const found=palette.find(([pattern])=>pattern.test(name));
  return {background:found?.[1]||"#F8FAFC",text:found?.[2]||"#111827",swatch:found?.[3]||"#64748B"};
}
function VehicleColorBadge({color,compact=false}:{color:string;compact?:boolean}) {
  const selected=colorPalette(color);
  return <span
    className={"inline-flex max-w-full items-center gap-2 rounded-xl border border-black/15 font-black shadow-sm "+(compact?"px-2.5 py-1 text-xs":"px-3 py-2 text-sm")}
    style={{backgroundColor:selected.background,color:selected.text}}
    title={"Cor do veículo: "+color}>
    <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/30"
      style={{backgroundColor:selected.swatch}}/>
    <span className="break-words">{color||"NÃO INFORMADA"}</span>
  </span>;
}

function base64File(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error("Falha ao ler o arquivo."));
    reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
    reader.readAsDataURL(file);
  });
}
function downloadPdf(base64:string,name:string,print:boolean){
  const raw=atob(base64);
  const buffer=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)buffer[i]=raw.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([buffer],{type:"application/pdf"}));
  if(print){
    window.open(url,"_blank","noopener,noreferrer");
    setTimeout(()=>URL.revokeObjectURL(url),120000);
  }else{
    const a=document.createElement("a");
    a.href=url;a.download=name||"documento.pdf";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
}
export default function VehicleVaultPanel(){
  const utils=trpc.useUtils();
  const [mode,setMode]=useState<"search"|"extract">("search");
  const [text,setText]=useState("");
  const [fields,setFields]=useState<VehicleFields>({...EMPTY});
  const [pdfName,setPdfName]=useState("");
  const [pdfBase64,setPdfBase64]=useState("");
  const [editId,setEditId]=useState<number|null>(null);
  const [missing,setMissing]=useState<string[]>([]);
  const [query,setQuery]=useState("");
  const [searchQuery,setSearchQuery]=useState("");
  const [model,setModel]=useState("");
  const [color,setColor]=useState("");
  const [yearFab,setYearFab]=useState("");
  const [yearMod,setYearMod]=useState("");
  const [status,setStatus]=useState<"all"|"available"|"in_use"|"used"|"inactive">("all");
  const [selected,setSelected]=useState<number|null>(null);
  const [clientQuery,setClientQuery]=useState("");
  const [pendingClientQuery,setPendingClientQuery]=useState("");
  const [readingPdf,setReadingPdf]=useState(false);
  const search=trpc.vehicleVault.search.useQuery({
    query:searchQuery,model,color,
    manufactureYear:/^\d{4}$/.test(yearFab)?Number(yearFab):undefined,
    modelYear:/^\d{4}$/.test(yearMod)?Number(yearMod):undefined,
    status,limit:150,
  },{retry:false});
  const details=trpc.vehicleVault.details.useQuery({id:selected||1},{enabled:!!selected,retry:false});
  const customers=trpc.vehicleVault.findCustomers.useQuery({query:pendingClientQuery},
    {enabled:!!selected&&pendingClientQuery.length>=2,retry:false});
  const previewText=trpc.vehicleVault.previewText.useMutation();
  const previewPdf=trpc.vehicleVault.previewPdf.useMutation();
  const save=trpc.vehicleVault.save.useMutation();
  const link=trpc.vehicleVault.linkCustomer.useMutation();
  const unlink=trpc.vehicleVault.unlinkCustomer.useMutation();
  const setInactive=trpc.vehicleVault.setInactive.useMutation();
  const openPdf=trpc.vehicleVault.openPdf.useMutation();
  const preview=(result:{plate:string;renavam:string;chassis:string;model:string;color:string;manufactureYear:number|null;modelYear:number|null;category:string;exerciseYear:number|null;text:string;missing:string[]})=>{
    setFields({plate:result.plate||"",renavam:result.renavam||"",chassis:result.chassis||"",
      model:result.model||"",color:result.color||"",
      manufactureYear:result.manufactureYear?String(result.manufactureYear):"",
      modelYear:result.modelYear?String(result.modelYear):"",
      category:result.category||"",exerciseYear:result.exerciseYear?String(result.exerciseYear):""});
    setText(result.text||"");
    setMissing(result.missing||[]);
    toast.success("Dados extraídos. Confira os dados antes de salvar.");
  };
  const extractText=async()=>{
    if(text.trim().length<5)return toast.error("Cole o texto completo do documento.");
    try{preview(await previewText.mutateAsync({text}));}
    catch(error){toast.error(error instanceof Error?error.message:"Falha na leitura do texto.");}
  };
  const extractPdf=async(file:File)=>{
    if(!/\.pdf$/i.test(file.name)||file.size>10*1024*1024||!file.size){
      toast.error("Selecione PDF com até 10 MB.");return;
    }
    setReadingPdf(true);
    try{
      const base64=await base64File(file);
      const data=await previewPdf.mutateAsync({base64});
      setEditId(null);setPdfBase64(base64);setPdfName(file.name);
      preview(data);
    }catch(error){toast.error(error instanceof Error?error.message:"Falha ao extrair PDF.");}
    finally{setReadingPdf(false);}
  };
  const reset=()=>{
    setFields({...EMPTY});setEditId(null);setText("");setPdfName("");setPdfBase64("");
    setMissing([]);setMode("extract");
  };
  const saveVehicle=async()=>{
    if(NAMES.slice(0,7).some(([key])=>!String(fields[key]).trim())){
      toast.error("Preencha os 7 campos obrigatórios.");return;
    }
    if(!/^\d{4}$/.test(fields.manufactureYear)||!/^\d{4}$/.test(fields.modelYear)){
      toast.error("Informe os dois anos com quatro dígitos.");return;
    }
    const category=fields.category.trim().toUpperCase();
    const exerciseYear=fields.exerciseYear.trim();
    if(category && category!=="PARTICULAR" && category!=="ALUGUEL")return toast.error("Categoria deve ser PARTICULAR ou ALUGUEL.");
    if(exerciseYear && (!/^\d{4}$/.test(exerciseYear) || Number(exerciseYear)<1900 || Number(exerciseYear)>2100))return toast.error("Exercício inválido.");
    try{
      const data=await save.mutateAsync({
        ...(editId?{id:editId}:{}),
        plate:fields.plate,renavam:fields.renavam,chassis:fields.chassis,
        model:fields.model,color:fields.color,
        manufactureYear:Number(fields.manufactureYear),modelYear:Number(fields.modelYear),
        category:category || null,exerciseYear:exerciseYear?Number(exerciseYear):null,
        sourceText:text,pdfBase64:pdfBase64||undefined,pdfFilename:pdfName||undefined,
      });
      toast.success("Documento guardado no Cofre da Frota.");
      setEditId(null);setPdfBase64("");setPdfName("");
      setSelected(data.id);setMode("search");
      await utils.vehicleVault.invalidate();
    }catch(error){toast.error(error instanceof Error?error.message:"Falha ao salvar documento.");}
  };
  const editVehicle=()=>{
    const d=details.data;if(!d)return;
    setFields({
      plate:d.plate,renavam:d.renavam,chassis:d.chassis,model:d.model,color:d.color,
      manufactureYear:String(d.manufactureYear),modelYear:String(d.modelYear),
      category:d.category||"",exerciseYear:d.exerciseYear?String(d.exerciseYear):"",
    });
    setText(d.sourceText||"");setPdfBase64("");setPdfName("");
    setEditId(d.id);setMissing([]);setMode("extract");
  };
  const linkCustomer=async(customerId:number)=>{
    if(!selected)return;
    try{
      const result=await link.mutateAsync({vehicleId:selected,customerId});
      toast[result.already?"info":"success"](result.already?"Cliente já vinculado.":"Cliente vinculado ao documento.");
      setClientQuery("");setPendingClientQuery("");
      await utils.vehicleVault.invalidate();
    }catch(error){toast.error(error instanceof Error?error.message:"Falha ao vincular cliente.");}
  };
  const unlinkCustomer=async(customerId:number)=>{
    if(!selected||!window.confirm("Desvincular este cliente do documento? O histórico será mantido."))return;
    try{
      await unlink.mutateAsync({vehicleId:selected,customerId});
      await utils.vehicleVault.invalidate();
      toast.success("Cliente desvinculado; histórico preservado.");
    }catch(error){toast.error(error instanceof Error?error.message:"Falha ao desvincular.");}
  };
  const toggleInactive=async()=>{
    const d=details.data;if(!d)return;
    try{
      await setInactive.mutateAsync({id:d.id,inactive:!d.inactive});
      await utils.vehicleVault.invalidate();toast.success("Situação do arquivo atualizada.");
    }catch(error){toast.error(error instanceof Error?error.message:"Falha ao atualizar situação.");}
  };
  const getPdf=async(id:number,print:boolean)=>{
    if(!selected)return;
    try{
      const value=await openPdf.mutateAsync({vehicleId:selected,pdfId:id});
      downloadPdf(value.base64,value.filename,print);
    }catch(error){toast.error(error instanceof Error?error.message:"Falha ao abrir PDF.");}
  };
  return <div className="space-y-4 rounded-3xl border border-cyan-400/25 bg-slate-950/80 p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black text-cyan-200"><Archive className="h-6 w-6"/>COFRE DA FROTA</h2>
        <p className="text-xs text-white/55">PDFs originais, dados pesquisáveis e vários clientes por documento. Controle de chassi usado continua separado.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>setMode("search")} className={"rounded-xl px-3 py-2 text-xs font-bold "+(mode==="search"?"bg-cyan-500 text-black":"border border-white/20")}>PESQUISAR</button>
        <button onClick={reset} className={"rounded-xl px-3 py-2 text-xs font-bold "+(mode==="extract"?"bg-amber-500 text-black":"border border-white/20")}><Plus className="mr-1 inline h-4 w-4"/>NOVO DOCUMENTO</button>
      </div>
    </div>
    {mode==="extract"&&<div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
      {!editId&&<VehicleVaultBatchPanel onSaved={async()=>{await utils.vehicleVault.invalidate();}}/>}
      <h3 className="font-black text-amber-200">{editId?"EDITAR DOCUMENTO EXISTENTE":"EXTRATOR PDF OU TEXTO"}</h3>
      <div className="flex flex-wrap gap-2">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-3 text-sm font-bold">
          <FolderOpen className="h-5 w-5"/> {readingPdf?"EXTRAINDO PDF...":"ESCOLHER PDF"}
          <input type="file" accept=".pdf,application/pdf" disabled={readingPdf||save.isPending} className="hidden"
            onChange={e=>{const f=e.target.files?.[0];if(f)void extractPdf(f);e.target.value="";}}/>
        </label>
        {pdfName&&<span className="self-center break-all text-xs text-emerald-300">PDF anexado: {pdfName}</span>}
        {previewPdf.isPending&&<span className="self-center text-xs text-amber-200"><Loader2 className="mr-1 inline h-4 w-4 animate-spin"/>Lendo texto/OCR...</span>}
      </div>
      <label className="block text-xs font-bold text-slate-300">OU COLE O TEXTO COMPLETO DO DOCUMENTO</label>
      <textarea className="min-h-28 w-full rounded-xl border border-white/15 bg-black/55 p-3 text-xs text-white"
        value={text} onChange={e=>setText(e.target.value)} placeholder="Cole os dados do CRLV aqui..."/>
      <button onClick={()=>void extractText()} disabled={previewText.isPending||readingPdf}
        className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-200">
        <ClipboardPaste className="mr-2 inline h-4 w-4"/>EXTRAIR DO TEXTO
      </button>
      {missing.length>0&&<p className="rounded-lg border border-amber-400/30 p-2 text-xs text-amber-200">
        Campos não identificados automaticamente: {missing.join(", ")}. Confira e preencha manualmente.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {NAMES.map(([key,label])=><label key={key} className="block text-xs font-bold text-slate-300">
          {label}<input className="mt-1 w-full rounded-xl border border-white/20 bg-black/55 p-3 text-sm font-semibold text-white"
            value={fields[key]} onChange={e=>setFields(v=>({...v,[key]:e.target.value}))}
            placeholder={label}/>
          {key==="color"&&fields.color.trim()&&<span className="mt-2 block"><VehicleColorBadge color={fields.color} compact/></span>}
          </label>)}
      </div>
      <button onClick={()=>void saveVehicle()} disabled={save.isPending||readingPdf||previewPdf.isPending}
        className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40">
        {save.isPending?"SALVANDO...":editId?"SALVAR ALTERAÇÕES":"CONFERIR E GUARDAR DOCUMENTO"}
      </button>
      <p className="text-xs text-slate-400">O PDF original só é salvo quando anexado. O texto original permanece guardado. Nada é registrado sem confirmar.</p>
    </div>}
    {mode==="search"&&<>
      <div className="space-y-2 rounded-2xl border border-cyan-500/20 bg-black/35 p-3">
        <div className="flex gap-2">
          <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")setSearchQuery(query);}}
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-slate-950 p-3 text-sm" placeholder="Ex.: HB20 cinza, placa, Renavam, chassi..."/>
          <button onClick={()=>setSearchQuery(query)} className="rounded-xl bg-cyan-500 px-4 font-black text-black"><Search className="h-5 w-5"/></button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <input value={model} onChange={e=>setModel(e.target.value)} placeholder="Modelo" className="min-w-0 rounded-lg border border-white/15 bg-slate-900 p-2 text-xs"/>
          <input value={color} onChange={e=>setColor(e.target.value)} placeholder="Cor" className="min-w-0 rounded-lg border border-white/15 bg-slate-900 p-2 text-xs"/>
          <input value={yearFab} onChange={e=>setYearFab(e.target.value)} placeholder="Ano fabricação" inputMode="numeric" className="min-w-0 rounded-lg border border-white/15 bg-slate-900 p-2 text-xs"/>
          <input value={yearMod} onChange={e=>setYearMod(e.target.value)} placeholder="Ano modelo" inputMode="numeric" className="min-w-0 rounded-lg border border-white/15 bg-slate-900 p-2 text-xs"/>
          <select value={status} onChange={e=>setStatus(e.target.value as typeof status)}
            className="min-w-0 rounded-lg border border-white/15 bg-slate-900 p-2 text-xs">
            <option value="all">Todos</option><option value="available">Sem cliente em uso</option>
            <option value="in_use">Em uso</option><option value="used">Já utilizado</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>
      </div>
      <div className="text-xs text-slate-400">{search.isFetching?"Consultando...":search.error?"Não foi possível consultar os documentos.":(search.data?.length||0)+" documento(s) encontrado(s)"} · Busque modelo + cor juntos.</div>
      <div className="max-h-[34rem] space-y-2 overflow-auto">
        {(search.data||[]).map(item=><button type="button" key={item.id} onClick={()=>{setSelected(item.id);setClientQuery("");setPendingClientQuery("");}}
          className={"w-full rounded-xl border p-3 text-left "+(selected===item.id?"border-cyan-300 bg-cyan-500/15":"border-white/10 bg-white/[.03] hover:border-white/30")}>
          <div className="flex items-start justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2"><strong>{item.model}</strong><VehicleColorBadge color={item.color} compact/></span>
            <span className={"text-xs font-bold "+(item.inactive?"text-slate-400":item.activeClients?"text-amber-300":"text-emerald-300")}>
              {item.inactive?"INATIVO":item.activeClients?"EM USO":"SEM CLIENTE ATIVO"}</span>
          </div>
          <div className="mt-2 text-xs text-white/70">Placa {item.plate} · Renavam {item.renavam} · Chassi {item.chassis}</div>
          <div className="mt-1 text-xs text-white/50">Fabricação {item.manufactureYear} · Modelo {item.modelYear} · Categoria {item.category||"N/I"} · Exercício {item.exerciseYear||"N/I"} · {item.activeClients} cliente(s) ativo(s) · {item.usageCount} vinculação(ões) · {item.pdfCount} PDF(s)</div>
          {item.chassisUsed&&<div className="mt-1 text-xs font-bold text-red-300">CHASSI MARCADO COMO USADO NO CONTROLE DEFINITIVO</div>}
        </button>)}
      </div>
      {selected&&<div className="space-y-4 rounded-2xl border border-cyan-400/25 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black text-cyan-200">FICHA DO DOCUMENTO</h3>
          <button onClick={()=>setSelected(null)} aria-label="Fechar ficha"><X className="h-5 w-5"/></button>
        </div>
        {details.isLoading&&<p className="text-sm">Carregando ficha...</p>}
        {details.data&&<>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {NAMES.map(([key,label])=><div key={key}><div className="mb-1 text-[10px] font-bold text-white/45">{label}</div>{key==="color"?<VehicleColorBadge color={details.data?.color||""}/>:<div className="break-all font-bold">{String(details.data?.[key]||"")}</div>}</div>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={editVehicle} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-bold"><Pencil className="mr-1 inline h-4 w-4"/>EDITAR DADOS / ANEXAR PDF</button>
            <button onClick={()=>void toggleInactive()} disabled={setInactive.isPending} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-bold">{details.data.inactive?"REATIVAR":"MARCAR INATIVO"}</button>
          </div>
          <div className="space-y-2 rounded-xl border border-white/15 p-3">
            <h4 className="flex items-center gap-1 text-sm font-black"><FileText className="h-4 w-4"/>PDF ORIGINAL — ARQUIVO PRIVADO</h4>
            {details.data.pdfs.length===0&&<p className="text-xs text-amber-200">Este documento foi criado sem PDF. Você pode anexar o original em Editar.</p>}
            {details.data.pdfs.map(pdf=><div key={pdf.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 py-2">
              <span className="break-all text-xs">{pdf.filename}</span>
              <div className="flex gap-2">
                <button disabled={openPdf.isPending} className="rounded-lg border border-cyan-400/30 px-2 py-1 text-xs" onClick={()=>void getPdf(pdf.id,false)}>BAIXAR</button>
                <button disabled={openPdf.isPending} className="rounded-lg border border-cyan-400/30 px-2 py-1 text-xs" onClick={()=>void getPdf(pdf.id,true)}><Printer className="mr-1 inline h-3 w-3"/>ABRIR / IMPRIMIR</button>
              </div>
            </div>)}
          </div>
          <div className="space-y-2 rounded-xl border border-white/15 p-3">
            <h4 className="flex items-center gap-1 text-sm font-black"><Users className="h-4 w-4"/>CLIENTES VINCULADOS — CADASTRO PRINCIPAL</h4>
            <div className="flex gap-2">
              <input value={clientQuery} onChange={e=>setClientQuery(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")setPendingClientQuery(clientQuery.trim());}}
                placeholder="Nome, CPF, telefone ou nº cadastro" className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/40 p-2 text-xs"/>
              <button onClick={()=>setPendingClientQuery(clientQuery.trim())} className="rounded-lg bg-cyan-500 px-3 text-xs font-black text-black">BUSCAR</button>
            </div>
            {customers.data?.map(person=><div key={person.id} className="flex items-center justify-between gap-2 border-b border-white/10 py-2 text-xs">
              <span>{person.name} · {person.phone} {person.customerNumber?" · #"+person.customerNumber:""}</span>
              <button disabled={link.isPending} onClick={()=>void linkCustomer(person.id)} className="rounded-lg border border-emerald-400/40 px-2 py-1 font-bold text-emerald-300">VINCULAR</button>
            </div>)}
            {details.data.links.filter(l=>!l.unlinkedAt).map(l=><div key={l.id} className="flex items-center justify-between gap-2 border-b border-white/10 py-2 text-xs">
              <span>{l.name||"Cliente cadastrado"} · {l.phone||"Sem telefone"}</span>
              <button disabled={unlink.isPending} onClick={()=>void unlinkCustomer(l.customerId)} className="rounded-lg border border-red-400/40 px-2 py-1 text-red-200">DESVINCULAR</button>
            </div>)}
            {!details.data.links.some(l=>!l.unlinkedAt)&&<p className="text-xs text-white/45">Nenhum cliente usando este documento atualmente.</p>}
          </div>
          <details className="rounded-xl border border-white/15 p-3">
            <summary className="cursor-pointer text-sm font-black">HISTÓRICO E TEXTO ORIGINAL</summary>
            <div className="mt-3 max-h-48 space-y-1 overflow-auto text-xs">
              {details.data.history.map(h=><div key={h.id} className="border-b border-white/10 py-1">{h.event} · {h.customerName||"ADM"} · {String(h.happenedAt||"")}</div>)}
            </div>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/50 p-2 text-xs">{details.data.sourceText||"Nenhum texto original salvo."}</pre>
          </details>
        </>}
      </div>}
    </>}
  </div>;
}
