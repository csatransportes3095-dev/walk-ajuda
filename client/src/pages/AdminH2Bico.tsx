import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Archive, CheckCircle2, ChevronDown, Copy, Eye, EyeOff, FileText, FolderOpen, Images, Search, UploadCloud, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import H2BicoScreenshotImporter from "@/components/H2BicoScreenshotImporter";
import H2BicoBulkManager from "@/components/H2BicoBulkManager";
import H2BicoReviewLotes from "@/components/H2BicoReviewLotes";
import H2BicoIntelligence from "@/components/H2BicoIntelligence";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { extractCpfCandidatesFromText, extractCpfPeopleFromText, isValidCpf, H2BICO_CPF_MAX_FILES, readCpfSourceFile } from "@/lib/h2bicoCpfExtractor";

const STATUS:any = {available:"Disponível",reserved:"Reservado",in_use:"Em uso",used:"Usado",archived:"Arquivado"};
const maskCpf=(cpf:string)=> cpf?.length===11 ? `${cpf.slice(0,3)}.***.***-${cpf.slice(-2)}` : cpf;

const H2BICO_GROUPS = [
  {id:"bulk",title:"Gestão em massa",subtitle:"Consultar e atualizar CPFs",Icon:CheckCircle2},
  {id:"intelligence",title:"Conferências",subtitle:"Confirmados e histórico",Icon:Search},
  {id:"lotes",title:"Lotes de 1.500",subtitle:"Copiar listas por lote",Icon:Copy},
  {id:"fotos",title:"Fotos em lote",subtitle:"Importar fotos e pastas",Icon:Images},
  {id:"prints",title:"Extrator de prints",subtitle:"Foto, nome e CPF",Icon:Eye},
  {id:"cpf",title:"Extrator de CPF",subtitle:"TXT, Word e texto colado",Icon:FileText},
  {id:"cadastros",title:"Cards de clientes",subtitle:"Consultar e marcar EAR",Icon:UserCheck},
] as const;
type H2BicoGroupId = (typeof H2BICO_GROUPS)[number]["id"];
const H2BICO_CARD_PAGE_SIZE = 24;


type ParsedFile = {
  file: File;
  name: string;
  cpf: string;
  uf: string | null;
  valid: boolean;
  reason?: string;
  duplicateInSelection?: boolean;
  alreadyExists?: boolean;
};

function parsePhotoFilename(file: File): ParsedFile {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)\s*$/, "").trim();
  const match = base.match(/\d{11}/);
  if (!match || match.index == null) return { file, name: "", cpf: "", uf: null, valid: false, reason: "CPF não encontrado no nome do arquivo" };
  const cpf = match[0];
  const extractedName = base.slice(0, match.index).replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  const name = extractedName.length >= 2 ? extractedName : "SEM NOME";
  const suffix = base.slice(match.index + 11).replace(/^[_\-\s]+/, "").trim();
  const ufMatch = suffix.match(/^([A-Za-z]{2})(?:\b|[_\-\s])/i) || suffix.match(/^([A-Za-z]{2})$/i);
  const uf = ufMatch?.[1]?.toUpperCase() || null;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) return { file, name, cpf, uf, valid: false, reason: "Formato de imagem não permitido" };
  if (file.size > 8 * 1024 * 1024) return { file, name, cpf, uf, valid: false, reason: "Foto acima de 8 MB" };
  return { file, name, cpf, uf, valid: true };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onerror=()=>reject(new Error("Falha ao ler arquivo"));
    reader.onload=()=>resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

async function readDroppedEntry(entry: any): Promise<File[]> {
  if (!entry) return [];
  if (entry.isFile) {
    return await new Promise<File[]>((resolve) => entry.file((file: File) => resolve([file]), () => resolve([])));
  }
  if (!entry.isDirectory) return [];

  const reader = entry.createReader();
  const files: File[] = [];
  while (true) {
    const entries: any[] = await new Promise((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (!entries.length) break;
    for (const child of entries) files.push(...await readDroppedEntry(child));
  }
  return files;
}

async function readDroppedFiles(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];
  for (const item of Array.from(items)) {
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) files.push(...await readDroppedEntry(entry));
    else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

export default function AdminH2Bico(){
  const [,navigate]=useLocation();

  // Abre apenas um grupo. Depois da primeira visita, fica montado e somente
  // oculto, sem perder textos, seleções ou operações de importação em curso.
  const [activeGroup,setActiveGroup]=useState<H2BicoGroupId|null>(null);
  const [visitedGroups,setVisitedGroups]=useState<Set<H2BicoGroupId>>(()=>new Set());
  const [cardPage,setCardPage]=useState(0);
  const toggleGroup=(group:H2BicoGroupId)=>{
    setVisitedGroups(current=>new Set(current).add(group));
    setActiveGroup(current=>current===group?null:group);
  };

  const filesRef=useRef<HTMLInputElement>(null);
  const folderRef=useRef<HTMLInputElement>(null);
  const cpfFileRef=useRef<HTMLInputElement>(null);
  const [readingCpfFiles,setReadingCpfFiles]=useState(false);
  const [cpfFileReport,setCpfFileReport]=useState("");
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState<any>("available");
  const [review,setReview]=useState<"all"|"confirmed"|"pending"|"discarded">("all");
  const [showCpf,setShowCpf]=useState(false);
  const [batch,setBatch]=useState<ParsedFile[]>([]);
  const [importing,setImporting]=useState(false);
  const [progress,setProgress]=useState({done:0,total:0,name:""});
  const [summary,setSummary]=useState<{imported:number;repaired:number;duplicates:number;errors:number}|null>(null);
  const [extractText,setExtractText]=useState("");
  const [cpfExtractMode,setCpfExtractMode]=useState<"cpf"|"full">("cpf");
  const [professionFilter,setProfessionFilter]=useState("");
  const [showPastedData,setShowPastedData]=useState(false);
  const [cpfCheck,setCpfCheck]=useState<{key:string;existing:string[];error?:string}|null>(null);
  const [brokenPhotos,setBrokenPhotos]=useState<Set<number>>(new Set());
  const utils=trpc.useUtils();

  const list=trpc.h2bico.list.useQuery({search,status,review},{enabled:activeGroup==="cadastros"});
  const allRecords=trpc.h2bico.list.useQuery({search:"",status:"all"});
  const stats=trpc.h2bico.stats.useQuery();
  const importer=trpc.h2bico.importPhoto.useMutation();
  const [savingEar,setSavingEar]=useState<Set<number>>(new Set());
  const setEar=trpc.h2bico.setEarMarker.useMutation({
    onSuccess:()=>{void utils.h2bico.invalidate();},
    onError:e=>toast.error("Não foi possível salvar EAR: " + e.message),
  });
  const changeEar=async(id:number, previous:"com_ear"|"sem_ear"|null, selected:"com_ear"|"sem_ear")=>{
    if(savingEar.has(id)) return;
    setSavingEar(state=>new Set(state).add(id));
    try{
      await setEar.mutateAsync({id,earStatus:previous===selected?null:selected});
    }catch{
      // onError da mutation informa a falha ao administrador.
    }finally{
      setSavingEar(state=>{const next=new Set(state);next.delete(id);return next;});
    }
  };
  const setSt=trpc.h2bico.setStatus.useMutation({
    onSuccess:()=>utils.h2bico.invalidate(),
    onError:e=>toast.error(e.message)
  });

  useEffect(()=>{setCardPage(0);},[search,status,review]);
  const existingCpfs=useMemo(()=>new Set((allRecords.data||[]).map((r:any)=>String(r.cpf))),[allRecords.data]);
  const candidates=useMemo(()=>extractCpfCandidatesFromText(extractText),[extractText]);
  const extractedPeople=useMemo(()=>extractCpfPeopleFromText(extractText),[extractText]);
  const validCpfs=useMemo(()=>candidates.filter(isValidCpf),[candidates]);
  const cpfKey=validCpfs.join(",");
  const checkReady=cpfCheck?.key===cpfKey && !cpfCheck.error;
  const checkingCpfs=validCpfs.length>0 && cpfCheck?.key!==cpfKey;
  const savedCpfs=useMemo(()=>new Set(cpfCheck?.existing||[]),[cpfCheck]);
  const cpfs=useMemo(()=>checkReady?validCpfs.filter(cpf=>!savedCpfs.has(cpf)):[],[checkReady,validCpfs,savedCpfs]);
  useEffect(()=>{
    if(!validCpfs.length){setCpfCheck({key:cpfKey,existing:[]});return;}
    let cancelled=false;
    const timer=window.setTimeout(async()=>{
      try{
        const existing=new Set<string>();
        for(let i=0;i<validCpfs.length;i+=300){
          const response=await utils.h2bico.checkExtractedCpfs.fetch({cpfs:validCpfs.slice(i,i+300)}, {staleTime:0});
          if(cancelled)return;
          response.existing.forEach(cpf=>existing.add(cpf));
        }
        if(!cancelled)setCpfCheck({key:cpfKey,existing:[...existing]});
      }catch(error){
        if(!cancelled)setCpfCheck({key:cpfKey,existing:[],error:error instanceof Error?error.message:"Falha na consulta"});
      }
    },250);
    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[cpfKey,utils.h2bico.checkExtractedCpfs]);
  const rejectedCount=candidates.length-validCpfs.length;
  const savedCount=checkReady?savedCpfs.size:0;
  const importCpfFiles=async(files:FileList|File[])=>{
    if(readingCpfFiles) return;
    const selected=Array.from(files).slice(0,H2BICO_CPF_MAX_FILES);
    if(!selected.length) return;
    setReadingCpfFiles(true);
    let read=0,failed=0,added=0;
    const found:string[]=[];
    for(const file of selected){
      try{
        const content=await readCpfSourceFile(file);
        const extracted=extractCpfCandidatesFromText(content);
        found.push(content);
        added+=extracted.length;
        read++;
      }catch(error){
        failed++;
        toast.error(`${file.name}: ${error instanceof Error?error.message:"Falha ao ler arquivo."}`);
      }
    }
    if(found.length) setExtractText(current=>[current,...found].filter(Boolean).join("\n"));
    setCpfFileReport(`${read} arquivo(s) lido(s), ${added} CPF(s) localizado(s)${failed?`, ${failed} falha(s)`:""}.`);
    setReadingCpfFiles(false);
  };
  const copyAllCpfs=async()=>{
    if(!checkReady || !cpfs.length) return;
    try{
      await navigator.clipboard.writeText(cpfs.join("\n"));
      toast.success(`${cpfs.length} CPF(s) copiado(s), um por linha.`);
    }catch{
      toast.error("Não foi possível copiar. Verifique a permissão do navegador.");
    }
  };
  const fullRows=useMemo(()=>{
    const allowed=new Set(cpfs);
    const byCpf=new Map(extractedPeople.map(person=>[person.cpf,person]));
    return cpfs.map(cpf=>{
      const person=byCpf.get(cpf);
      return {
        cpf,
        name:person?.name||"",
        profession:person?.profession||"",
      };
    }).filter(row=>allowed.has(row.cpf));
  },[cpfs,extractedPeople]);
  const normalizedProfessionFilter=useMemo(()=>professionFilter.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase(),[professionFilter]);
  const filteredFullRows=useMemo(()=>{
    if(!normalizedProfessionFilter) return fullRows;
    return fullRows.filter(row=>
      row.profession.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().includes(normalizedProfessionFilter)
    );
  },[fullRows,normalizedProfessionFilter]);
  const copyAllFull=async()=>{
    if(!checkReady || !filteredFullRows.length) return;
    try{
      await navigator.clipboard.writeText(filteredFullRows.map(row=>`${row.cpf} | ${row.name} | ${row.profession}`).join("\n"));
      toast.success(`${filteredFullRows.length} registro(s) copiado(s) com CPF, nome e profissão.`);
    }catch{
      toast.error("Não foi possível copiar. Verifique a permissão do navegador.");
    }
  };
  const copyFilteredCpfs=async()=>{
    if(!checkReady || !filteredFullRows.length) return;
    try{
      await navigator.clipboard.writeText(filteredFullRows.map(row=>row.cpf).join("\n"));
      toast.success(`${filteredFullRows.length} CPF(s) copiado(s) do filtro de profissão.`);
    }catch{
      toast.error("Não foi possível copiar. Verifique a permissão do navegador.");
    }
  };

  const prepareFiles=(files:FileList|File[])=>{
    const incoming=Array.from(files);
    setBatch(current=>{
      const uniqueFiles=new Map<string,File>();
      for(const item of current){
        const key=`${item.file.webkitRelativePath||item.file.name}|${item.file.size}|${item.file.lastModified}`;
        uniqueFiles.set(key,item.file);
      }
      for(const file of incoming){
        const key=`${(file as any).webkitRelativePath||file.name}|${file.size}|${file.lastModified}`;
        if(!uniqueFiles.has(key)) uniqueFiles.set(key,file);
      }

      const parsed=Array.from(uniqueFiles.values()).map(parsePhotoFilename);
      const seen=new Set<string>();
      const final=parsed.map(p=>{
        const duplicateInSelection=!!p.cpf&&seen.has(p.cpf);
        if(p.cpf&&!duplicateInSelection) seen.add(p.cpf);
        return {...p,duplicateInSelection,alreadyExists:!!p.cpf&&existingCpfs.has(p.cpf)};
      });
      const valid=final.filter(p=>p.valid&&!p.duplicateInSelection).length;
      toast.success(`${incoming.length} arquivo(s) adicionado(s). Lote atual: ${final.length} • ${valid} para verificar/importar.`);
      return final;
    });
    setSummary(null);
  };

  const onDropFolders=async(e:React.DragEvent<HTMLDivElement>)=>{
    e.preventDefault();
    if(importing) return;
    const files=await readDroppedFiles(e.dataTransfer.items);
    if(!files.length){toast.error("Nenhuma imagem encontrada nas pastas soltas.");return;}
    prepareFiles(files);
  };

  const readyBatch=batch.filter(p=>p.valid&&!p.duplicateInSelection);
  const invalidCount=batch.filter(p=>!p.valid).length;
  const duplicateSelectionCount=batch.filter(p=>p.duplicateInSelection).length;
  const existingCount=batch.filter(p=>p.alreadyExists).length;
  const cardsTotal=list.data?.length??0;
  const cardsPageCount=Math.max(1,Math.ceil(cardsTotal/H2BICO_CARD_PAGE_SIZE));
  const safeCardPage=Math.min(cardPage,cardsPageCount-1);
  const cardsOnPage=(list.data||[]).slice(
    safeCardPage*H2BICO_CARD_PAGE_SIZE,(safeCardPage+1)*H2BICO_CARD_PAGE_SIZE,
  );

  const importAll=async()=>{
    if(!readyBatch.length){toast.error("Nenhuma foto válida para importar.");return;}
    setImporting(true);
    setSummary(null);
    let imported=0,repaired=0,duplicates=0,errors=0;
    setProgress({done:0,total:readyBatch.length,name:"Preparando..."});
    for(let i=0;i<readyBatch.length;i++){
      const item=readyBatch[i];
      setProgress({done:i,total:readyBatch.length,name:item.file.name});
      try{
        const base64=await fileToBase64(item.file);
        const result=await importer.mutateAsync({
          filename:item.file.name,
          base64,
          mimeType:(item.file.type as "image/jpeg"|"image/png"|"image/webp") || "image/jpeg",
        });
        if(result.result==="imported") imported++;
        else if(result.result==="repaired") repaired++;
        else duplicates++;
      }catch(e){errors++;}
      setProgress({done:i+1,total:readyBatch.length,name:item.file.name});
    }
    setImporting(false);
    setSummary({imported,repaired,duplicates,errors});
    setBatch([]);
    await utils.h2bico.invalidate();
    toast.success(`Concluído: ${imported} nova(s) • ${repaired} foto(s) reparada(s).`);
  };

  const markUsed=(id:number)=>{
    const order=window.prompt("Número do pedido (opcional):")||null;
    if(!window.confirm("Confirmar como USADO? Depois disso este CPF nunca mais poderá voltar para Disponível.")) return;
    setSt.mutate({id,status:"used",linkedOrder:order});
  };

  return <div className="min-h-screen bg-gray-950 text-white">
    <AdminHeader title="H2BICO" backTo="/admin/codes"/>
    <main className="w-full max-w-none mx-auto p-3 sm:p-4 lg:px-7 space-y-3">

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {[["Total",stats.data?.total],["Disponíveis",stats.data?.available],["Reservados",stats.data?.reserved],["Em uso",stats.data?.in_use],["Usados",stats.data?.used],["Arquivados",stats.data?.archived]].map(([l,v])=>
          <Card key={String(l)} className="bg-gray-900 border-gray-800 px-3 py-2">
            <div className="text-[11px] text-gray-400">{l}</div><div className="text-xl font-bold">{v??0}</div>
          </Card>)}
      </div>


      <nav aria-label="Grupos de funções do H2BICO" className="rounded-2xl border border-cyan-500/25 bg-slate-900/70 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black tracking-wide">PAINEL ORGANIZADO · H2BICO</h2>
            <p className="text-xs text-slate-400">Abra apenas a função necessária. Clique novamente para recolher, sem perder o que digitou.</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={!activeGroup} onClick={()=>setActiveGroup(null)}>RECOLHER TUDO</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {H2BICO_GROUPS.map(group=>{
            const Icon=group.Icon;
            const opened=activeGroup===group.id;
            return <button key={group.id} id={"h2bico-tab-"+group.id} type="button"
              aria-controls={"h2bico-panel-"+group.id} aria-expanded={opened}
              onClick={()=>toggleGroup(group.id)}
              className={"flex min-h-[72px] w-full items-start gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 "+
                (opened?"border-cyan-400 bg-cyan-500/15":"border-slate-700 bg-slate-950/55 hover:border-cyan-500/50 hover:bg-slate-800/80")}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300"/>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-tight text-white">{group.title}</span>
                <span className="mt-1 block text-[11px] leading-snug text-slate-400">{group.subtitle}</span>
              </span>
              <ChevronDown className={"mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform "+(opened?"rotate-180":"")}/>
            </button>;
          })}
        </div>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-500/20 bg-slate-900 px-3 py-2">
        <span className="text-xs text-slate-400"><strong className="text-slate-200">Similaridade:</strong> compare a Foto Mestre com os cadastros disponíveis do banco H2BICO.</span>
        <Button size="sm" variant="outline" onClick={()=>navigate("/similaridade")}>Abrir Similaridade</Button>
      </div>
      {!activeGroup&&<p role="status" className="px-1 text-xs text-slate-400">Selecione um dos 7 grupos acima para trabalhar. Os demais ficam recolhidos.</p>}

      {visitedGroups.has("fotos")&&<section id="h2bico-panel-fotos" role="region" aria-labelledby="h2bico-tab-fotos" hidden={activeGroup!=="fotos"} className={activeGroup==="fotos"?"":"hidden"}>
      <Card className="bg-gradient-to-br from-emerald-950/60 to-gray-900 border-emerald-500/35 p-4 space-y-3">
        <div>
          <div className="text-xs font-black tracking-[0.18em] text-emerald-300 uppercase">Importação principal</div>
          <h2 className="text-2xl font-black mt-1">Importar fotos em lote</h2>
          <p className="text-sm text-gray-400 mt-1">Selecione fotos, adicione várias pastas uma após outra ou arraste várias pastas ao mesmo tempo. Tudo fica acumulado no mesmo lote. O CPF é obrigatório; sem nome entra como SEM NOME.</p>
          <p className="text-xs text-gray-500 mt-2 font-mono">Exemplo: RAFAEL ANTERIO BARBOSA_44249385817_SP.jpg</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Button className="h-16 text-base font-black" onClick={()=>filesRef.current?.click()} disabled={importing}>
            <Images className="w-6 h-6 mr-2"/>SELECIONAR VÁRIAS FOTOS
          </Button>
          <Button className="h-16 text-base font-black" variant="outline" onClick={()=>folderRef.current?.click()} disabled={importing}>
            <FolderOpen className="w-6 h-6 mr-2"/>ADICIONAR PASTA
          </Button>
        </div>
        <input ref={filesRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{if(e.target.files)prepareFiles(e.target.files);e.currentTarget.value="";}}/>
        <input ref={folderRef} type="file" multiple accept="image/*" className="hidden" {...({webkitdirectory:"",directory:""} as any)} onChange={e=>{if(e.target.files)prepareFiles(e.target.files);e.currentTarget.value="";}}/>

        <div
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>void onDropFolders(e)}
          className="rounded-xl border-2 border-dashed border-cyan-400/35 bg-cyan-500/5 p-6 text-center transition hover:border-cyan-300/60"
        >
          <FolderOpen className="mx-auto h-8 w-8 text-cyan-300"/>
          <div className="mt-2 font-black">ARRASTE VÁRIAS PASTAS AQUI</div>
          <div className="mt-1 text-xs text-gray-400">Pode soltar várias pastas do Windows ao mesmo tempo. As fotos serão acumuladas no mesmo lote.</div>
          {batch.length>0&&<div className="mt-2 text-xs font-bold text-emerald-300">Lote atual: {batch.length} arquivo(s). Você pode adicionar mais pastas antes de importar.</div>}
        </div>

        {batch.length>0&&<>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Card className="bg-black/25 border-white/10 p-3"><div className="text-xs text-gray-400">Selecionadas</div><div className="text-xl font-black">{batch.length}</div></Card>
            <Card className="bg-black/25 border-emerald-500/20 p-3"><div className="text-xs text-gray-400">Prontas</div><div className="text-xl font-black text-emerald-300">{readyBatch.length}</div></Card>
            <Card className="bg-black/25 border-amber-500/20 p-3"><div className="text-xs text-gray-400">CPF já existe</div><div className="text-xl font-black text-amber-300">{existingCount}</div><div className="mt-1 text-[10px] text-gray-500">será verificado/reparado</div></Card>
            <Card className="bg-black/25 border-orange-500/20 p-3"><div className="text-xs text-gray-400">Duplicadas no lote</div><div className="text-xl font-black text-orange-300">{duplicateSelectionCount}</div></Card>
            <Card className="bg-black/25 border-red-500/20 p-3"><div className="text-xs text-gray-400">Inválidas</div><div className="text-xl font-black text-red-300">{invalidCount}</div></Card>
          </div>

          <div className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/20">
            {batch.slice(0,500).map((p,i)=><div key={i} className="flex items-center gap-3 border-b border-white/5 px-3 py-2 text-xs">
              {p.valid&&!p.duplicateInSelection?<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0"/>:<XCircle className="w-4 h-4 text-red-400 shrink-0"/>}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.file.name}</div>
                <div className="text-gray-500 truncate">{p.name||"Nome não identificado"} {p.cpf&&`• CPF ${p.cpf}`} {p.uf&&`• ${p.uf}`}</div>
              </div>
              <div className="shrink-0 text-right">
                {!p.valid?<span className="text-red-300">{p.reason}</span>:p.duplicateInSelection?<span className="text-orange-300">CPF repetido no lote</span>:p.alreadyExists?<span className="text-amber-300">Verificar foto existente</span>:<span className="text-emerald-300">Pronto</span>}
              </div>
            </div>)}
          </div>

          {importing&&<div>
            <div className="flex justify-between text-xs text-gray-400 mb-1"><span className="truncate pr-4">{progress.name}</span><span>{progress.done}/{progress.total}</span></div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{width:`${progress.total?(progress.done/progress.total)*100:0}%`}}/></div>
          </div>}

          <div className="flex flex-wrap gap-2">
            <Button className="font-black" onClick={importAll} disabled={importing||readyBatch.length===0}>
              <UploadCloud className="w-5 h-5 mr-2"/>{importing?"IMPORTANDO...":`IMPORTAR ${readyBatch.length} FOTO(S)`}
            </Button>
            <Button variant="outline" disabled={importing} onClick={()=>setBatch([])}>Limpar seleção</Button>
          </div>
        </>}

        {summary&&<div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm">
          <strong>Importação concluída.</strong> {summary.imported} adicionada(s) • {summary.repaired} foto(s) reparada(s) • {summary.duplicates} duplicada(s) mantida(s) • {summary.errors} erro(s).
        </div>}
      </Card>
      </section>}

      {visitedGroups.has("lotes")&&<section id="h2bico-panel-lotes" role="region" aria-labelledby="h2bico-tab-lotes" hidden={activeGroup!=="lotes"} className={activeGroup==="lotes"?"":"hidden"}>
        <H2BicoReviewLotes/>
      </section>}

      {visitedGroups.has("intelligence")&&<section id="h2bico-panel-intelligence" role="region" aria-labelledby="h2bico-tab-intelligence" hidden={activeGroup!=="intelligence"} className={activeGroup==="intelligence"?"":"hidden"}>
        <H2BicoIntelligence/>
      </section>}

      {visitedGroups.has("bulk")&&<section id="h2bico-panel-bulk" role="region" aria-labelledby="h2bico-tab-bulk" hidden={activeGroup!=="bulk"} className={activeGroup==="bulk"?"":"hidden"}>
        <H2BicoBulkManager/>
      </section>}

      {visitedGroups.has("prints")&&<section id="h2bico-panel-prints" role="region" aria-labelledby="h2bico-tab-prints" hidden={activeGroup!=="prints"} className={activeGroup==="prints"?"":"hidden"}>
        <H2BicoScreenshotImporter/>
      </section>}

      {visitedGroups.has("cpf")&&<section id="h2bico-panel-cpf" role="region" aria-labelledby="h2bico-tab-cpf" hidden={activeGroup!=="cpf"} className={activeGroup==="cpf"?"":"hidden"}>
      <Card className="bg-gray-900 border-gray-800 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4"/>Extrator de CPF <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-300">{cpfs.length} CPF(s)</span></div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={()=>void (cpfExtractMode==="full"?copyAllFull():copyAllCpfs())} disabled={!checkReady||!cpfs.length}><Copy className="w-4 h-4 mr-2"/>{cpfExtractMode==="full"?"COPIAR TUDO":"COPIAR TODOS"}</Button>
            {cpfExtractMode==="full"&&<Button type="button" variant="outline" onClick={()=>void copyFilteredCpfs()} disabled={!checkReady||!filteredFullRows.length}><Copy className="w-4 h-4 mr-2"/>COPIAR CPFs</Button>}
            <Button type="button" variant="outline" disabled={!extractText&& !cpfFileReport} onClick={()=>{setExtractText("");setCpfFileReport("");setProfessionFilter("");setShowPastedData(false);}}><XCircle className="w-4 h-4 mr-2"/>LIMPAR</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3">
          <span className="text-xs font-black text-cyan-200">EXTRAIR:</span>
          <button type="button" onClick={()=>setCpfExtractMode("cpf")} className={`rounded-lg border px-3 py-2 text-xs font-black transition ${cpfExtractMode==="cpf"?"border-cyan-400 bg-cyan-500/20 text-cyan-100":"border-slate-700 bg-slate-950/40 text-slate-400"}`}>SOMENTE CPF</button>
          <button type="button" onClick={()=>setCpfExtractMode("full")} className={`rounded-lg border px-3 py-2 text-xs font-black transition ${cpfExtractMode==="full"?"border-cyan-400 bg-cyan-500/20 text-cyan-100":"border-slate-700 bg-slate-950/40 text-slate-400"}`}>CPF + NOME + PROFISSÃO</button>
          {cpfExtractMode==="full"&&<div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500"/>
            <Input className="pl-9" placeholder="Filtrar profissão. Ex.: MOTORISTA" value={professionFilter} onChange={e=>setProfessionFilter(e.target.value)}/>
          </div>}
          {cpfExtractMode==="full"&&professionFilter&&<Button type="button" size="sm" variant="outline" onClick={()=>setProfessionFilter("")}>LIMPAR FILTRO</Button>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-800 p-2">Encontrados<br/><strong className="text-lg">{candidates.length}</strong></div>
          <div className="rounded-lg bg-red-950/50 p-2">Inválidos descartados<br/><strong className="text-lg text-red-300">{rejectedCount}</strong></div>
          <div className="rounded-lg bg-amber-950/40 p-2">Foto já salva<br/><strong className="text-lg text-amber-300">{checkReady?savedCount:"—"}</strong></div>
          <div className="rounded-lg bg-emerald-950/40 p-2">Novos para copiar<br/><strong className="text-lg text-emerald-300">{checkReady?cpfs.length:"—"}</strong></div>
        </div>
        {checkingCpfs&&<p role="status" className="text-amber-300 text-sm">Consultando o banco de fotos. Aguarde a verificação para copiar.</p>}
        {cpfCheck?.key===cpfKey&&cpfCheck.error&&<div role="alert" className="text-red-300 text-sm">Falha ao verificar o banco: {cpfCheck.error}. A cópia está bloqueada. <Button type="button" variant="outline" size="sm" onClick={()=>setCpfCheck(null)}>TENTAR NOVAMENTE</Button></div>}
        <input ref={cpfFileRef} type="file" multiple className="hidden" accept=".txt,.csv,.log,.md,.rtf,.htm,.html,.xml,.docx,.doc"
          onChange={e=>{if(e.target.files)void importCpfFiles(e.target.files);e.currentTarget.value="";}}/>
        <div className="rounded-xl border-2 border-dashed border-cyan-400/40 bg-cyan-500/5 p-5 text-center transition hover:border-cyan-300"
          onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!readingCpfFiles)void importCpfFiles(e.dataTransfer.files);}}>
          <FileText className="mx-auto h-7 w-7 text-cyan-300"/>
          <div className="mt-2 font-bold">ARRASTE ARQUIVOS DE TEXTO OU WORD AQUI</div>
          <div className="mt-1 text-xs text-slate-400">Bloco de Notas (.txt), CSV, RTF, HTML e Word (.docx). Até 30 arquivos de 8 MB. Word .doc antigo: converta para .docx.</div>
          <Button type="button" variant="outline" className="mt-3" disabled={readingCpfFiles} onClick={()=>cpfFileRef.current?.click()}>
            <UploadCloud className="w-4 h-4 mr-2"/>{readingCpfFiles?"LENDO ARQUIVOS...":"SELECIONAR ARQUIVOS"}
          </Button>
          {cpfFileReport&&<p role="status" className="mt-2 text-xs text-emerald-300">{cpfFileReport}</p>}
        </div>
                {!extractText||showPastedData?<div className="space-y-2">
          <Textarea
            placeholder="Ou cole aqui o texto com vários CPFs..."
            value={extractText}
            onChange={e=>setExtractText(e.target.value)}
            onBlur={()=>{if(extractText.trim())setShowPastedData(false);}}
            className="min-h-28 max-h-56 resize-y"
          />
          {extractText&&<div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={()=>setShowPastedData(false)}>RECOLHER DADOS COLADOS</Button></div>}
        </div>:<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
          <div>
            <div className="text-sm font-bold text-slate-200">DADOS COLADOS RECOLHIDOS</div>
            <div className="text-xs text-slate-400">{candidates.length} CPF(s) localizado(s) • {extractText.split(/\r?\n/).filter(Boolean).length} linha(s)</div>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={()=>setShowPastedData(true)}>ABRIR DADOS COLADOS</Button>
        </div>}
        {checkReady&&cpfs.length>0&&cpfExtractMode==="cpf"&&<Textarea readOnly value={cpfs.join("\n")} className="font-mono min-h-28" aria-label="CPFs extraídos, um por linha"/>}
        {checkReady&&cpfs.length>0&&cpfExtractMode==="full"&&<div className="overflow-hidden rounded-xl border border-slate-700">
          <div className="flex items-center justify-between gap-2 bg-slate-800 px-3 py-2 text-xs">
            <div className="grid flex-1 grid-cols-[150px_1fr_1fr] gap-0 font-black text-slate-200">
              <span>CPF</span><span>NOME</span><span>PROFISSÃO</span>
            </div>
            <span className="shrink-0 font-bold text-cyan-300">{filteredFullRows.length}{professionFilter?` de ${fullRows.length}`:""} resultado(s)</span>
          </div>
          <div className="max-h-72 overflow-auto">
            {filteredFullRows.map(row=><div key={row.cpf} className="grid grid-cols-[150px_1fr_1fr] gap-0 border-t border-slate-800 px-3 py-2 text-xs">
              <span className="font-mono text-cyan-200">{row.cpf}</span>
              <span className="pr-3">{row.name||"—"}</span>
              <span>{row.profession||"—"}</span>
            </div>)}
          </div>
        </div>}
      </Card>
      </section>}

      {visitedGroups.has("cadastros")&&<section id="h2bico-panel-cadastros" role="region" aria-labelledby="h2bico-tab-cadastros" hidden={activeGroup!=="cadastros"} className={activeGroup==="cadastros"?"":"hidden"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-black">CARDS DE CLIENTES · ACERVO H2BICO</h2><p className="text-xs text-slate-400">{cardsTotal} registro(s) no filtro · até 24 por página</p></div><span className="text-sm text-slate-300">Página {safeCardPage+1} de {cardsPageCount}</span></div>
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-3 text-gray-500"/><Input className="pl-9" placeholder="Pesquisar nome ou CPF" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <Button variant="outline" onClick={()=>setShowCpf(!showCpf)}>{showCpf?<EyeOff className="w-4 h-4 mr-2"/>:<Eye className="w-4 h-4 mr-2"/>}{showCpf?"Ocultar CPF":"Mostrar CPF"}</Button>
        <select className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{String(v)}</option>)}</select>
        <select aria-label="Filtrar conferência" className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2" value={review} onChange={e=>setReview(e.target.value as typeof review)}><option value="all">Todas as conferências</option><option value="confirmed">Confirmados</option><option value="pending">Pendentes</option><option value="discarded">Descartados</option></select>
      </div>

      <div className="mt-3 grid max-h-[70vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
        {cardsOnPage.map((r:any)=><Card key={r.id} className="bg-gray-900 border-gray-800 p-3">
          <div className="flex gap-3">{r.photoUrl&&!brokenPhotos.has(r.id)?<img src={`/api/admin/h2bico/photo/${r.id}`} onError={()=>setBrokenPhotos(current=>{const next=new Set(current);next.add(r.id);return next;})} className="h-14 w-14 shrink-0 rounded-lg object-cover border border-gray-700"/>:<div className="h-14 w-14 shrink-0 rounded-lg bg-gray-800 grid place-items-center"><UserCheck/></div>}
            <div className="min-w-0 flex-1"><div className="font-bold truncate">{r.name}</div><div className="text-sm text-gray-400 font-mono">{showCpf?r.cpf:maskCpf(r.cpf)}</div>{r.uf&&<div className="text-xs text-gray-500">{r.uf}</div>}<div className="text-xs mt-1 font-bold">Situação: {STATUS[r.status]}</div><div className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-black ${r.reviewState==="confirmed"?"border-emerald-500/40 bg-emerald-500/15 text-emerald-300":r.reviewState==="discarded"?"border-red-500/40 bg-red-500/15 text-red-300":"border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>{r.reviewState==="confirmed"?"✓ CPF CONFERIDO":r.reviewState==="discarded"?"⛔ DESCARTADO — BLOQUEADO":"⏳ CPF PENDENTE DE CONFERÊNCIA"}</div>{r.reviewState==="confirmed"&&r.reviewedAt&&<div className="text-xs mt-1 text-emerald-200/80">Conferido em {new Date(r.reviewedAt).toLocaleString("pt-BR")}</div>}{r.linkedOrder&&<div className="text-xs text-amber-300">Pedido: {r.linkedOrder}</div>}</div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={`Marcação EAR de ${r.name}`}>
            {(["com_ear","sem_ear"] as const).map(option=>{
              const active=r.earStatus===option;
              const positive=option==="com_ear";
              return <button key={option} type="button" disabled={savingEar.has(r.id)}
                aria-pressed={active}
                onClick={()=>void changeEar(r.id,r.earStatus??null,option)}
                className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-black transition disabled:opacity-50 ${active
                  ? positive?"border-emerald-400 bg-emerald-500/25 text-emerald-200":"border-red-400 bg-red-500/25 text-red-200"
                  :"border-gray-700 bg-gray-950/60 text-gray-400 hover:border-gray-500"}`}>
                {positive?"🟢 COM EAR":"🔴 SEM EAR"} {active?"✓":""}
              </button>;
            })}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {r.status==="available"&&<Button size="sm" variant="outline" onClick={()=>setSt.mutate({id:r.id,status:"reserved"})}>Reservar</Button>}
            {r.status==="reserved"&&<Button size="sm" variant="outline" onClick={()=>setSt.mutate({id:r.id,status:"in_use"})}>Em uso</Button>}
            {r.status!=="used"&&r.status!=="archived"&&<Button size="sm" variant="outline" className="border-gray-700 bg-transparent text-gray-300 hover:text-white" onClick={()=>markUsed(r.id)}><CheckCircle2 className="w-4 h-4 mr-1"/>Marcar como usado</Button>}
            {r.status!=="used"&&r.status!=="archived"&&<Button size="sm" variant="outline" disabled={r.reviewState==="discarded"} onClick={()=>setSt.mutate({id:r.id,status:"archived"})}><Archive className="w-4 h-4 mr-1"/>Arquivar</Button>}
            {r.status==="archived"&&<Button size="sm" variant="outline" disabled={r.reviewState==="discarded"} onClick={()=>setSt.mutate({id:r.id,status:"available"})}>Restaurar</Button>}
            {r.status==="used"&&<span className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 font-bold">USADO • NÃO REUTILIZÁVEL</span>}
          </div>
        </Card>)}
      </div>
      {!list.isLoading&&(list.data?.length??0)===0&&<div className="text-center text-gray-500 py-12">Nenhum registro encontrado.</div>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
        <span className="text-xs text-slate-400">{cardsTotal?Math.min(safeCardPage*H2BICO_CARD_PAGE_SIZE+1,cardsTotal):0}–{Math.min((safeCardPage+1)*H2BICO_CARD_PAGE_SIZE,cardsTotal)} de {cardsTotal} cadastros</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={safeCardPage===0} onClick={()=>setCardPage(p=>Math.max(0,p-1))}>ANTERIOR</Button>
          <Button size="sm" variant="outline" disabled={safeCardPage>=cardsPageCount-1} onClick={()=>setCardPage(p=>p+1)}>PRÓXIMA</Button>
        </div>
      </div>
      </section>}
    </main>
  </div>
}
