import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Archive, CheckCircle2, Copy, Eye, EyeOff, FileText, FolderOpen, Images, Search, UploadCloud, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const STATUS:any = {available:"Disponível",reserved:"Reservado",in_use:"Em uso",used:"Usado",archived:"Arquivado"};
const maskCpf=(cpf:string)=> cpf?.length===11 ? `${cpf.slice(0,3)}.***.***-${cpf.slice(-2)}` : cpf;

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
  const name = base.slice(0, match.index).replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  const suffix = base.slice(match.index + 11).replace(/^[_\-\s]+/, "").trim();
  const ufMatch = suffix.match(/^([A-Za-z]{2})(?:\b|[_\-\s])/i) || suffix.match(/^([A-Za-z]{2})$/i);
  const uf = ufMatch?.[1]?.toUpperCase() || null;
  if (name.length < 2) return { file, name, cpf, uf, valid: false, reason: "Nome não identificado" };
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

export default function AdminH2Bico(){
  const [,navigate]=useLocation();
  const filesRef=useRef<HTMLInputElement>(null);
  const folderRef=useRef<HTMLInputElement>(null);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState<any>("available");
  const [showCpf,setShowCpf]=useState(false);
  const [batch,setBatch]=useState<ParsedFile[]>([]);
  const [importing,setImporting]=useState(false);
  const [progress,setProgress]=useState({done:0,total:0,name:""});
  const [summary,setSummary]=useState<{imported:number;duplicates:number;errors:number}|null>(null);
  const [extractText,setExtractText]=useState("");
  const utils=trpc.useUtils();

  const list=trpc.h2bico.list.useQuery({search,status});
  const allRecords=trpc.h2bico.list.useQuery({search:"",status:"all"});
  const stats=trpc.h2bico.stats.useQuery();
  const importer=trpc.h2bico.importPhoto.useMutation();
  const setSt=trpc.h2bico.setStatus.useMutation({
    onSuccess:()=>utils.h2bico.invalidate(),
    onError:e=>toast.error(e.message)
  });

  const existingCpfs=useMemo(()=>new Set((allRecords.data||[]).map((r:any)=>String(r.cpf))),[allRecords.data]);
  const cpfs=useMemo(()=>Array.from(new Set((extractText.match(/\d[\d.\-\s]{9,16}\d/g)||[]).map(v=>v.replace(/\D/g,"")).filter(v=>v.length===11))),[extractText]);

  const prepareFiles=(files:FileList|File[])=>{
    const parsed=Array.from(files).map(parsePhotoFilename);
    const counts=new Map<string,number>();
    for(const p of parsed){if(p.cpf) counts.set(p.cpf,(counts.get(p.cpf)||0)+1);}
    const final=parsed.map(p=>({...p,duplicateInSelection:!!p.cpf&&(counts.get(p.cpf)||0)>1,alreadyExists:!!p.cpf&&existingCpfs.has(p.cpf)}));
    setBatch(final);
    setSummary(null);
    const valid=final.filter(p=>p.valid&&!p.duplicateInSelection&&!p.alreadyExists).length;
    toast.success(`${final.length} foto(s) lida(s). ${valid} pronta(s) para importar.`);
  };

  const readyBatch=batch.filter(p=>p.valid&&!p.duplicateInSelection&&!p.alreadyExists);
  const invalidCount=batch.filter(p=>!p.valid).length;
  const duplicateSelectionCount=batch.filter(p=>p.duplicateInSelection).length;
  const existingCount=batch.filter(p=>p.alreadyExists).length;

  const importAll=async()=>{
    if(!readyBatch.length){toast.error("Nenhuma foto válida para importar.");return;}
    setImporting(true);
    setSummary(null);
    let imported=0,duplicates=0,errors=0;
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
        if(result.result==="imported") imported++; else duplicates++;
      }catch(e){errors++;}
      setProgress({done:i+1,total:readyBatch.length,name:item.file.name});
    }
    setImporting(false);
    setSummary({imported,duplicates,errors});
    setBatch([]);
    await utils.h2bico.invalidate();
    toast.success(`Importação concluída: ${imported} adicionada(s).`);
  };

  const markUsed=(id:number)=>{
    const order=window.prompt("Número do pedido (opcional):")||null;
    if(!window.confirm("Confirmar como USADO? Depois disso este CPF nunca mais poderá voltar para Disponível.")) return;
    setSt.mutate({id,status:"used",linkedOrder:order});
  };

  return <div className="min-h-screen bg-gray-950 text-white">
    <AdminHeader title="H2BICO" backTo="/admin/codes"/>
    <main className="max-w-7xl mx-auto p-4 space-y-4">

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[["Total",stats.data?.total],["Disponíveis",stats.data?.available],["Reservados",stats.data?.reserved],["Em uso",stats.data?.in_use],["Usados",stats.data?.used],["Arquivados",stats.data?.archived]].map(([l,v])=>
          <Card key={String(l)} className="bg-gray-900 border-gray-800 p-3">
            <div className="text-xs text-gray-400">{l}</div><div className="text-2xl font-bold">{v??0}</div>
          </Card>)}
      </div>

      <Card className="bg-gradient-to-br from-emerald-950/60 to-gray-900 border-emerald-500/35 p-5 space-y-4">
        <div>
          <div className="text-xs font-black tracking-[0.18em] text-emerald-300 uppercase">Importação principal</div>
          <h2 className="text-2xl font-black mt-1">Importar fotos em lote</h2>
          <p className="text-sm text-gray-400 mt-1">Selecione centenas de fotos ou uma pasta inteira. O H2BICO lê automaticamente NOME + CPF + UF pelo nome do arquivo.</p>
          <p className="text-xs text-gray-500 mt-2 font-mono">Exemplo: RAFAEL ANTERIO BARBOSA_44249385817_SP.jpg</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Button className="h-16 text-base font-black" onClick={()=>filesRef.current?.click()} disabled={importing}>
            <Images className="w-6 h-6 mr-2"/>SELECIONAR VÁRIAS FOTOS
          </Button>
          <Button className="h-16 text-base font-black" variant="outline" onClick={()=>folderRef.current?.click()} disabled={importing}>
            <FolderOpen className="w-6 h-6 mr-2"/>SELECIONAR PASTA INTEIRA
          </Button>
        </div>
        <input ref={filesRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>{if(e.target.files)prepareFiles(e.target.files);e.currentTarget.value="";}}/>
        <input ref={folderRef} type="file" multiple accept="image/*" className="hidden" {...({webkitdirectory:"",directory:""} as any)} onChange={e=>{if(e.target.files)prepareFiles(e.target.files);e.currentTarget.value="";}}/>

        {batch.length>0&&<>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Card className="bg-black/25 border-white/10 p-3"><div className="text-xs text-gray-400">Selecionadas</div><div className="text-xl font-black">{batch.length}</div></Card>
            <Card className="bg-black/25 border-emerald-500/20 p-3"><div className="text-xs text-gray-400">Prontas</div><div className="text-xl font-black text-emerald-300">{readyBatch.length}</div></Card>
            <Card className="bg-black/25 border-amber-500/20 p-3"><div className="text-xs text-gray-400">CPF já existe</div><div className="text-xl font-black text-amber-300">{existingCount}</div></Card>
            <Card className="bg-black/25 border-orange-500/20 p-3"><div className="text-xs text-gray-400">Duplicadas no lote</div><div className="text-xl font-black text-orange-300">{duplicateSelectionCount}</div></Card>
            <Card className="bg-black/25 border-red-500/20 p-3"><div className="text-xs text-gray-400">Inválidas</div><div className="text-xl font-black text-red-300">{invalidCount}</div></Card>
          </div>

          <div className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/20">
            {batch.slice(0,500).map((p,i)=><div key={i} className="flex items-center gap-3 border-b border-white/5 px-3 py-2 text-xs">
              {p.valid&&!p.duplicateInSelection&&!p.alreadyExists?<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0"/>:<XCircle className="w-4 h-4 text-red-400 shrink-0"/>}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.file.name}</div>
                <div className="text-gray-500 truncate">{p.name||"Nome não identificado"} {p.cpf&&`• CPF ${p.cpf}`} {p.uf&&`• ${p.uf}`}</div>
              </div>
              <div className="shrink-0 text-right">
                {!p.valid?<span className="text-red-300">{p.reason}</span>:p.alreadyExists?<span className="text-amber-300">CPF já cadastrado</span>:p.duplicateInSelection?<span className="text-orange-300">CPF repetido no lote</span>:<span className="text-emerald-300">Pronto</span>}
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
          <strong>Importação concluída.</strong> {summary.imported} adicionada(s) • {summary.duplicates} duplicada(s) ignorada(s) • {summary.errors} erro(s).
        </div>}
      </Card>

      <Card className="bg-gray-900 border-cyan-500/20 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="font-black">Comparar com o banco H2BICO</div>
          <div className="text-sm text-gray-400">Na Similaridade, coloque somente a Foto Mestre e carregue todos os CPFs DISPONÍVEIS do H2BICO.</div>
        </div>
        <Button onClick={()=>navigate("/similaridade")} variant="outline">Abrir Similaridade</Button>
      </Card>

      <Card className="bg-gray-900 border-gray-800 p-4 space-y-3">
        <div className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4"/>Extrator de CPF</div>
        <Textarea placeholder="Cole o texto com vários CPFs..." value={extractText} onChange={e=>setExtractText(e.target.value)}/>
        <div className="text-sm text-gray-400">{cpfs.length} CPF(s) encontrado(s)</div>
        {cpfs.length>0&&<><Textarea readOnly value={cpfs.join("\n")} className="font-mono min-h-32"/><Button variant="outline" onClick={()=>{navigator.clipboard.writeText(cpfs.join("\n"));toast.success("CPFs copiados")}}><Copy className="w-4 h-4 mr-2"/>Copiar em coluna</Button></>}
      </Card>

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-3 text-gray-500"/><Input className="pl-9" placeholder="Pesquisar nome ou CPF" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <Button variant="outline" onClick={()=>setShowCpf(!showCpf)}>{showCpf?<EyeOff className="w-4 h-4 mr-2"/>:<Eye className="w-4 h-4 mr-2"/>}{showCpf?"Ocultar CPF":"Mostrar CPF"}</Button>
        <select className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{String(v)}</option>)}</select>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(list.data||[]).map((r:any)=><Card key={r.id} className="bg-gray-900 border-gray-800 p-4">
          <div className="flex gap-3">{r.photoUrl?<img src={r.photoUrl} className="w-20 h-20 rounded-xl object-cover border border-gray-700"/>:<div className="w-20 h-20 rounded-xl bg-gray-800 grid place-items-center"><UserCheck/></div>}
            <div className="min-w-0 flex-1"><div className="font-bold truncate">{r.name}</div><div className="text-sm text-gray-400 font-mono">{showCpf?r.cpf:maskCpf(r.cpf)}</div>{r.uf&&<div className="text-xs text-gray-500">{r.uf}</div>}<div className="text-xs mt-1 font-bold">{STATUS[r.status]}</div>{r.linkedOrder&&<div className="text-xs text-amber-300">Pedido: {r.linkedOrder}</div>}</div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {r.status==="available"&&<Button size="sm" variant="outline" onClick={()=>setSt.mutate({id:r.id,status:"reserved"})}>Reservar</Button>}
            {r.status==="reserved"&&<Button size="sm" variant="outline" onClick={()=>setSt.mutate({id:r.id,status:"in_use"})}>Em uso</Button>}
            {r.status!=="used"&&r.status!=="archived"&&<Button size="sm" onClick={()=>markUsed(r.id)}><CheckCircle2 className="w-4 h-4 mr-1"/>Usado</Button>}
            {r.status!=="used"&&r.status!=="archived"&&<Button size="sm" variant="outline" onClick={()=>setSt.mutate({id:r.id,status:"archived"})}><Archive className="w-4 h-4 mr-1"/>Arquivar</Button>}
            {r.status==="archived"&&<Button size="sm" variant="outline" onClick={()=>setSt.mutate({id:r.id,status:"available"})}>Restaurar</Button>}
            {r.status==="used"&&<span className="text-xs rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 font-bold">USADO • NÃO REUTILIZÁVEL</span>}
          </div>
        </Card>)}
      </div>
      {!list.isLoading&&(list.data?.length??0)===0&&<div className="text-center text-gray-500 py-12">Nenhum registro encontrado.</div>}
    </main>
  </div>
}
