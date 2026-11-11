import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, ClipboardPaste, FileSearch, FileText, FolderOpen, Loader2, Pencil, Plus, Printer, Search, ShieldCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import VehicleVaultBatchPanel from "./VehicleVaultBatchPanel";

type ApprovalStatus = "pending" | "approved" | "rejected";
type ApprovalFilter = "all" | ApprovalStatus;
const APPROVAL_LABELS: Record<ApprovalStatus,string> = {pending:"NÃO AVALIADO",approved:"APROVADO",rejected:"REPROVADO"};
function ApprovalBadge({status}:{status:ApprovalStatus}) {
  const appearance=status==="approved"
    ?"border-emerald-400/65 bg-emerald-500/20 text-emerald-200"
    :status==="rejected"
      ?"border-rose-400/65 bg-rose-500/20 text-rose-200"
      :"border-slate-500/50 bg-slate-500/15 text-slate-300";
  return <span className={"inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-black "+appearance}>
    <span aria-hidden="true" className={"h-2 w-2 rounded-full "+(status==="approved"?"bg-emerald-400":status==="rejected"?"bg-rose-400":"bg-slate-400")}/>
    {APPROVAL_LABELS[status]}
  </span>;
}
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
  const [editorTab,setEditorTab]=useState<"single"|"batch">("single");
  const [text,setText]=useState("");
  const [pendingText,setPendingText]=useState<string|null>(null);
  const [autoTextStatus,setAutoTextStatus]=useState<"idle"|"pending"|"reading"|"done"|"error">("idle");
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
  const [status,setStatus]=useState<"all"|"available"|"in_use"|"used">("all");
  const [approval,setApproval]=useState<ApprovalFilter>("all");
  const [selected,setSelected]=useState<number|null>(null);
  const [clientQuery,setClientQuery]=useState("");
  const [pendingClientQuery,setPendingClientQuery]=useState("");
  const [readingPdf,setReadingPdf]=useState(false);
  // A vitrine inicial não carrega 150 veículos; os resultados aparecem apenas com uma pesquisa ou filtro.
  const hasActiveSearch=Boolean(searchQuery.trim()||model.trim()||color.trim()||yearFab.trim()||yearMod.trim()||status!=="all"||approval!=="all");
  const search=trpc.vehicleVault.search.useQuery({
    query:searchQuery,model,color,
    manufactureYear:/^\d{4}$/.test(yearFab)?Number(yearFab):undefined,
    modelYear:/^\d{4}$/.test(yearMod)?Number(yearMod):undefined,
    status,approval,limit:150,
  },{enabled:hasActiveSearch,retry:false});
  const totalCount=trpc.vehicleVault.totalCount.useQuery(undefined,{retry:false});
  const details=trpc.vehicleVault.details.useQuery({id:selected||1},{enabled:!!selected,retry:false});
  const customers=trpc.vehicleVault.findCustomers.useQuery({query:pendingClientQuery},
    {enabled:!!selected&&pendingClientQuery.length>=2,retry:false});
  const previewText=trpc.vehicleVault.previewText.useMutation();
  const previewPdf=trpc.vehicleVault.previewPdf.useMutation();
  const save=trpc.vehicleVault.save.useMutation();
  const link=trpc.vehicleVault.linkCustomer.useMutation();
  const unlink=trpc.vehicleVault.unlinkCustomer.useMutation();
  const setInactive=trpc.vehicleVault.setInactive.useMutation();
  const setApprovalMutation=trpc.vehicleVault.setApproval.useMutation();
  const openPdf=trpc.vehicleVault.openPdf.useMutation();
  // O ADM só fecha o cadastro pelo X. Esc, salvamento e clique externo não fecham.
  useEffect(()=>{
    if(mode!=="extract")return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{document.body.style.overflow=previousOverflow;};
  },[mode]);
  const preview=(result:{plate:string;renavam:string;chassis:string;model:string;color:string;manufactureYear:number|null;modelYear:number|null;category:string;exerciseYear:number|null;text:string;missing:string[]},silent=false)=>{
    setFields({plate:result.plate||"",renavam:result.renavam||"",chassis:result.chassis||"",
      model:result.model||"",color:result.color||"",
      manufactureYear:result.manufactureYear?String(result.manufactureYear):"",
      modelYear:result.modelYear?String(result.modelYear):"",
      category:result.category||"",exerciseYear:result.exerciseYear?String(result.exerciseYear):""});
    setText(result.text||"");
    setMissing(result.missing||[]);
    if(!silent)toast.success("Dados extraídos. Confira os dados antes de salvar.");
  };
  // Atualiza os campos ao colar ou digitar texto, sem gravar automaticamente no Cofre.
  useEffect(()=>{
    if(pendingText===null||pendingText.trim().length<5||mode!=="extract")return;
    let active=true;
    const timer=setTimeout(async()=>{
      if(!active)return;
      setAutoTextStatus("reading");
      try{
        const result=await previewText.mutateAsync({text:pendingText});
        if(!active)return; // Ignora resultado antigo caso o usuário altere o texto.
        preview(result,true);
        setAutoTextStatus("done");
      }catch(error){
        if(!active)return;
        setFields({...EMPTY});
        setMissing([]);
        setAutoTextStatus("error");
        toast.error(error instanceof Error?error.message:"Falha na leitura automática do texto.");
      }
    },550);
    return ()=>{active=false;clearTimeout(timer);};
  },[pendingText,mode]);
  const changeText=(value:string)=>{
    setText(value);
    setPendingText(value);
    setMissing([]);
    if(value.trim().length<5){
      setFields({...EMPTY});
      setAutoTextStatus("idle");
    }else setAutoTextStatus("pending");
  };
  const extractText=async()=>{
    if(text.trim().length<5)return toast.error("Cole o texto completo do documento.");
    setPendingText(null);
    setAutoTextStatus("reading");
    try{
      preview(await previewText.mutateAsync({text}));
      setAutoTextStatus("done");
    }catch(error){
      setAutoTextStatus("error");
      toast.error(error instanceof Error?error.message:"Falha na leitura do texto.");
    }
  };
  const extractPdf=async(file:File)=>{
    if(!/\.pdf$/i.test(file.name)||file.size>10*1024*1024||!file.size){
      toast.error("Selecione PDF com até 10 MB.");return;
    }
    setPendingText(null);setAutoTextStatus("idle");
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
    setEditorTab("single");
    setPendingText(null);setAutoTextStatus("idle");
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
      toast.success("Documento guardado! Pode adicionar o próximo.");
      // Manter o popup aberto; começar um cadastro limpo após cada salvamento.
      setSelected(data.id);
      setPendingText(null);setAutoTextStatus("idle");
      setText("");setFields({...EMPTY});setMissing([]);
      setPdfBase64("");setPdfName("");setEditId(null);setEditorTab("single");
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
    setPendingText(null);setAutoTextStatus("idle");
    setText(d.sourceText||"");setPdfBase64("");setPdfName("");
    setEditorTab("single");
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
  const changeApproval=async(next:ApprovalStatus)=>{
    const d=details.data;
    if(!d||setApprovalMutation.isPending)return;
    const target:ApprovalStatus=d.approvalStatus===next?"pending":next;
    try{
      await setApprovalMutation.mutateAsync({id:d.id,approvalStatus:target});
      await utils.vehicleVault.invalidate();
      toast.success(target==="pending"?"Avaliação retirada.":target==="approved"?"Documento aprovado.":"Documento reprovado.");
    }catch(error){toast.error(error instanceof Error?error.message:"Não foi possível atualizar a avaliação.");}
  };
  const toggleInactive=async()=>{
    const d=details.data;if(!d)return;
    try{
      await setInactive.mutateAsync({id:d.id,inactive:!d.inactive});
      if(!d.inactive)setSelected(null); // Inativado: fechar a ficha que deixa de fazer parte da consulta.
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
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={()=>setMode("search")} className={"rounded-xl px-3 py-2 text-xs font-bold "+(mode==="search"?"bg-cyan-500 text-black":"border border-white/20")}>PESQUISAR</button>
        <button onClick={reset} className={"rounded-xl px-3 py-2 text-xs font-bold "+(mode==="extract"?"bg-amber-500 text-black":"border border-white/20")}><Plus className="mr-1 inline h-4 w-4"/>NOVO DOCUMENTO</button>
        <div className="min-w-[154px] rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-center shadow-[0_0_18px_rgba(34,211,238,.12)]" title="Quantidade total de documentos cadastrados no Cofre, independentemente do limite de 150 da pesquisa.">
          <span className="block text-[10px] font-black tracking-[.12em] text-cyan-200">TOTAL NO COFRE</span>
          <strong className="block text-xl font-black tabular-nums text-white" aria-live="polite">{totalCount.isLoading?"...":totalCount.isError?"—":(totalCount.data?.total??0).toLocaleString("pt-BR")}</strong>
        </div>
      </div>
    </div>
    {mode==="extract"&&createPortal(
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-5">
        <section role="dialog" aria-modal="true" aria-labelledby="cofre-editor-title"
          className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-cyan-400/40 bg-[#090f20] text-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h3 id="cofre-editor-title" className="flex items-center gap-2 text-base font-black text-cyan-200 sm:text-lg">
                <FileText className="h-5 w-5 shrink-0"/>{editId?"EDITAR DOCUMENTO":"NOVO DOCUMENTO"}
              </h3>
              <p className="text-xs text-white/50">Cofre da Frota · Cadastro e conferência na mesma janela</p>
            </div>
            <button type="button" onClick={()=>setMode("search")}
              disabled={save.isPending||readingPdf||previewPdf.isPending}
              className="shrink-0 rounded-xl border border-white/20 p-2.5 text-white/80 hover:border-red-400/50 hover:bg-red-500/10 disabled:opacity-40"
              aria-label="Fechar janela" title="Fechar"><X className="h-5 w-5"/></button>
          </header>
          {!editId&&<div role="tablist" aria-label="Modo de cadastro"
            className="grid shrink-0 grid-cols-2 gap-2 border-b border-white/10 bg-slate-900/70 p-3 sm:px-5">
            <button type="button" role="tab" aria-selected={editorTab==="single"} onClick={()=>setEditorTab("single")}
              className={"flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black sm:text-sm "+(editorTab==="single"?"border-amber-300/60 bg-amber-400/15 text-amber-200":"border-white/10 bg-black/20 text-slate-400 hover:text-white")}>
              <FileText className="h-4 w-4"/> PDF OU TEXTO
            </button>
            <button type="button" role="tab" aria-selected={editorTab==="batch"} onClick={()=>setEditorTab("batch")}
              className={"flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black sm:text-sm "+(editorTab==="batch"?"border-cyan-300/60 bg-cyan-400/15 text-cyan-200":"border-white/10 bg-black/20 text-slate-400 hover:text-white")}>
              <FolderOpen className="h-4 w-4"/> PDFs EM LOTE
            </button>
          </div>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
            {!editId&&editorTab==="batch"?
              <VehicleVaultBatchPanel onSaved={async()=>{await utils.vehicleVault.invalidate();}}/>:
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="space-y-3 rounded-2xl border border-amber-400/20 bg-amber-500/[.04] p-3 sm:p-4">
                  <h4 className="text-sm font-black text-amber-200">1. ADICIONAR DOCUMENTO</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2.5 text-xs font-black text-cyan-100 hover:bg-cyan-500/20">
                      <FolderOpen className="h-4 w-4"/> {readingPdf?"LENDO PDF...":"ESCOLHER PDF"}
                      <input type="file" accept=".pdf,application/pdf" disabled={readingPdf||save.isPending} className="hidden"
                        onChange={e=>{const file=e.target.files?.[0];if(file)void extractPdf(file);e.target.value="";}}/>
                    </label>
                    {pdfName&&<span className="min-w-0 break-all text-xs text-emerald-300">{pdfName}</span>}
                    {previewPdf.isPending&&<span className="flex items-center gap-1 text-xs text-amber-200"><Loader2 className="h-4 w-4 animate-spin"/>Lendo OCR...</span>}
                  </div>
                  <label className="block text-xs font-bold text-slate-300" htmlFor="cofre-texto-documento">OU COLE O TEXTO · PREENCHIMENTO AUTOMÁTICO</label>
                  <textarea id="cofre-texto-documento" className="h-40 w-full resize-y rounded-xl border border-white/15 bg-black/55 p-3 text-xs text-white outline-none focus:border-cyan-300/50"
                    value={text} onChange={e=>changeText(e.target.value)}
                    placeholder="Cole aqui os dados do veículo. Os campos ao lado serão preenchidos automaticamente."/>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={()=>void extractText()} disabled={previewText.isPending||readingPdf}
                      className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 disabled:opacity-40">
                      <ClipboardPaste className="mr-1 inline h-4 w-4"/> EXTRAIR NOVAMENTE
                    </button>
                    {(autoTextStatus==="pending"||autoTextStatus==="reading")&&
                      <span className="flex items-center gap-1 text-xs text-cyan-200"><Loader2 className="h-4 w-4 animate-spin"/>Preenchendo...</span>}
                    {autoTextStatus==="done"&&<span className="text-xs text-emerald-300">Preenchido automaticamente</span>}
                  </div>
                  {missing.length>0&&<p className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-xs text-amber-200">
                    Conferir campos não identificados: {missing.join(", ")}.</p>}
                </div>
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[.03] p-3 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-cyan-200">2. CONFERIR OS DADOS</h4>
                    <span className="text-[11px] text-white/45">Campos editáveis</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    {NAMES.map(([key,label])=><label key={key} className={"min-w-0 text-[11px] font-bold text-slate-300 "+(key==="chassis"||key==="model"?"col-span-2 sm:col-span-1":"")}>
                      {label}<input className="mt-1 w-full min-w-0 rounded-lg border border-white/20 bg-black/55 px-2.5 py-2.5 text-sm font-semibold text-white outline-none focus:border-cyan-300/50"
                        value={fields[key]} onChange={e=>setFields(v=>({...v,[key]:e.target.value}))} placeholder={label}/>
                      {key==="color"&&fields.color.trim()&&<span className="mt-1 block"><VehicleColorBadge color={fields.color} compact/></span>}
                    </label>)}
                  </div>
                </div>
              </div>}
          </div>
          {(editId||editorTab==="single")&&<footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950 px-4 py-3 sm:px-5">
            <span className="text-[11px] text-slate-400">Cadastre quantos documentos quiser. A janela só fecha no X.</span>
            <button type="button" onClick={()=>void saveVehicle()}
              disabled={save.isPending||readingPdf||previewPdf.isPending||autoTextStatus==="pending"||autoTextStatus==="reading"}
              className="rounded-xl bg-emerald-500 px-5 py-3 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm">
              {save.isPending?"SALVANDO...":editId?"SALVAR E CONTINUAR":"GUARDAR E ADICIONAR OUTRO"}
            </button>
          </footer>}
        </section>
      </div>,document.body)}
    <>
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
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por aprovação do documento">
          <span className="mr-1 text-[11px] font-black uppercase tracking-wide text-slate-400">Avaliação:</span>
          {([
            ["all","TODOS","border-white/30 bg-slate-700/70 text-white"],
            ["approved","APROVADOS","border-emerald-400/70 bg-emerald-500/25 text-emerald-100"],
            ["rejected","REPROVADOS","border-rose-400/70 bg-rose-500/25 text-rose-100"],
            ["pending","NÃO AVALIADOS","border-slate-400/60 bg-slate-500/20 text-slate-100"],
          ] as const).map(([value,label,selectedClass])=><button key={value} type="button"
            aria-pressed={approval===value} onClick={()=>setApproval(value)}
            className={"rounded-xl border px-3 py-2 text-xs font-black transition-colors "+(approval===value?selectedClass:"border-white/15 bg-slate-900 text-slate-400 hover:border-white/35 hover:text-white")}>
            {label}
          </button>)}
        </div>
      </div>
      {hasActiveSearch&&<>
      {search.isFetching?<p className="text-xs text-slate-400">Consultando...</p>:search.error?<p className="text-xs text-amber-200">Não foi possível consultar os documentos.</p>:search.data?.length===0?<p className="text-xs text-slate-400">Nenhum veículo encontrado para os filtros informados.</p>:null}
      <div className="max-h-[34rem] space-y-2 overflow-auto">
        {(search.data||[]).map(item=><button type="button" key={item.id} onClick={()=>{setSelected(item.id);setClientQuery("");setPendingClientQuery("");}}
          className={"w-full rounded-xl border p-3 text-left "+(selected===item.id?"border-cyan-300 bg-cyan-500/15":"border-white/10 bg-white/[.03] hover:border-white/30")}>
          <div className="flex items-start justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2"><strong>{item.model}</strong><VehicleColorBadge color={item.color} compact/></span>
            <span className="flex flex-wrap items-center justify-end gap-2">
              <ApprovalBadge status={(item.approvalStatus||"pending") as ApprovalStatus}/>
              <span className={"text-xs font-bold "+(item.inactive?"text-slate-400":item.activeClients?"text-amber-300":"text-emerald-300")}>
                {item.inactive?"INATIVO":item.activeClients?"EM USO":"SEM CLIENTE ATIVO"}</span>
            </span>
          </div>
          <div className="mt-2 text-xs text-white/70">Placa {item.plate} · Renavam {item.renavam} · Chassi {item.chassis}</div>
          <div className="mt-1 text-xs text-white/50">Fabricação {item.manufactureYear} · Modelo {item.modelYear} · Categoria {item.category||"N/I"} · Exercício {item.exerciseYear||"N/I"} · {item.activeClients} cliente(s) ativo(s) · {item.usageCount} vinculação(ões) · {item.pdfCount} PDF(s)</div>
          {item.chassisUsed&&<div className="mt-1 text-xs font-bold text-red-300">CHASSI MARCADO COMO USADO NO CONTROLE DEFINITIVO</div>}
        </button>)}
      </div>
      </>}
      {selected&&<div className="space-y-4 rounded-2xl border border-cyan-400/25 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black text-cyan-200">FICHA DO DOCUMENTO</h3>
          <button onClick={()=>setSelected(null)} aria-label="Fechar ficha"><X className="h-5 w-5"/></button>
        </div>
        {details.isLoading&&<p className="text-sm">Carregando ficha...</p>}
        {details.data&&<>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {NAMES.map(([key,label])=><div key={key}><div className="mb-1 text-[10px] font-bold text-white/45">{label}</div>{key==="color"?<VehicleColorBadge color={details.data?.color||""}/>:<div className="break-all font-bold">{String(details.data?.[key]||"")}</div>}
              {key==="category"&&<div className="mt-4 space-y-2" role="group" aria-label="Avaliação do documento">
                <p className="text-[10px] font-black uppercase tracking-wider text-white/60">AVALIAÇÃO DO DOCUMENTO</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["approved","APROVADO","border-emerald-400 bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,.28)]","border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"],
                    ["rejected","REPROVADO","border-red-400 bg-red-600 text-white shadow-[0_0_18px_rgba(239,68,68,.28)]","border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20"],
                  ] as const).map(([value,label,activeClass,idleClass])=><button key={value} type="button"
                    disabled={setApprovalMutation.isPending||details.data.inactive}
                    aria-pressed={details.data.approvalStatus===value}
                    onClick={()=>void changeApproval(value)}
                    title={details.data.approvalStatus===value?"Clique novamente para retirar a avaliação":undefined}
                    className={"flex min-h-12 items-center justify-center rounded-xl border-2 px-2 py-3 text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-50 "+(details.data.approvalStatus===value?activeClass:idleClass)}>
                    {setApprovalMutation.isPending?<Loader2 className="mr-1 h-4 w-4 animate-spin"/>:<span aria-hidden="true" className="mr-1.5 text-base">{details.data.approvalStatus===value?"●":"○"}</span>}{label}
                  </button>)}
                </div>
                {details.data.approvalStatus==="pending"&&<p className="text-[10px] text-slate-400">Não avaliado — selecione uma situação.</p>}
                {details.data.approvalStatus!=="pending"&&<p className="text-[10px] text-slate-400">Clique no card selecionado para voltar a não avaliado.</p>}
              </div>}
            </div>)}
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
    </>
  </div>;
}
