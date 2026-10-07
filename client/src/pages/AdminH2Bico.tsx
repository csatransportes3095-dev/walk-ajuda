import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Archive, ArrowLeft, CheckCircle2, Copy, Database, Eye, EyeOff, FileText, ImagePlus, Search, Upload, UserCheck } from "lucide-react";
import { toast } from "sonner";
import AdminHeader from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const STATUS:any = {available:"Disponível",reserved:"Reservado",in_use:"Em uso",used:"Usado",archived:"Arquivado"};
const maskCpf=(cpf:string)=> cpf?.length===11 ? `${cpf.slice(0,3)}.***.***-${cpf.slice(-2)}` : cpf;

export default function AdminH2Bico(){
  const [,navigate]=useLocation();
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState<any>("available");
  const [showCpf,setShowCpf]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [name,setName]=useState(""); const [cpf,setCpf]=useState(""); const [notes,setNotes]=useState(""); const [source,setSource]=useState("");
  const [photoUrl,setPhotoUrl]=useState<string|null>(null);
  const [extractText,setExtractText]=useState("");
  const utils=trpc.useUtils();
  const list=trpc.h2bico.list.useQuery({search,status});
  const stats=trpc.h2bico.stats.useQuery();
  const upload=trpc.h2bico.uploadPhoto.useMutation();
  const create=trpc.h2bico.create.useMutation({onSuccess:()=>{toast.success("Registro salvo no H2BICO"); setName("");setCpf("");setNotes("");setSource("");setPhotoUrl(null);setShowForm(false);utils.h2bico.invalidate();},onError:e=>toast.error(e.message)});
  const setSt=trpc.h2bico.setStatus.useMutation({onSuccess:()=>utils.h2bico.invalidate(),onError:e=>toast.error(e.message)});
  const cpfs=useMemo(()=>Array.from(new Set((extractText.match(/\d[\d.\-\s]{9,16}\d/g)||[]).map(v=>v.replace(/\D/g,"")).filter(v=>v.length===11))),[extractText]);
  const onPhoto=async(e:React.ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0]; if(!f)return; if(f.size>8*1024*1024){toast.error("Foto acima de 8MB");return;} const reader=new FileReader(); reader.onload=async()=>{try{const b=String(reader.result).split(",")[1]; const r=await upload.mutateAsync({filename:f.name,base64:b,mimeType:(f.type as any)||"image/jpeg"});setPhotoUrl(r.url);toast.success("Foto enviada");}catch(err:any){toast.error(err.message||"Erro no upload")}};reader.readAsDataURL(f)};
  const markUsed=(id:number)=>{const order=window.prompt("Número do pedido (opcional):")||null;setSt.mutate({id,status:"used",linkedOrder:order});};
  return <div className="min-h-screen bg-gray-950 text-white"><AdminHeader title="H2BICO" backTo="/admin/codes"/>
    <main className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[["Total",stats.data?.total],["Disponíveis",stats.data?.available],["Reservados",stats.data?.reserved],["Em uso",stats.data?.in_use],["Usados",stats.data?.used],["Arquivados",stats.data?.archived]].map(([l,v])=><Card key={String(l)} className="bg-gray-900 border-gray-800 p-3"><div className="text-xs text-gray-400">{l}</div><div className="text-2xl font-bold">{v??0}</div></Card>)}
      </div>
      <Card className="bg-gray-900 border-gray-800 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={()=>setShowForm(!showForm)}><Database className="w-4 h-4 mr-2"/>Novo cadastro</Button>
          <Button variant="outline" onClick={()=>setShowCpf(!showCpf)}>{showCpf?<EyeOff className="w-4 h-4 mr-2"/>:<Eye className="w-4 h-4 mr-2"/>}{showCpf?"Ocultar CPF":"Mostrar CPF"}</Button>
        </div>
        {showForm&&<div className="grid md:grid-cols-2 gap-3">
          <Input placeholder="Nome completo" value={name} onChange={e=>setName(e.target.value)}/>
          <Input placeholder="CPF - somente números ou formatado" value={cpf} onChange={e=>setCpf(e.target.value)}/>
          <Input placeholder="Origem (opcional)" value={source} onChange={e=>setSource(e.target.value)}/>
          <label className="flex items-center gap-2 border border-dashed border-gray-700 rounded-md p-2 cursor-pointer"><ImagePlus className="w-4 h-4"/> {photoUrl?"Foto pronta":"Adicionar foto"}<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto}/></label>
          <Textarea className="md:col-span-2" placeholder="Observações" value={notes} onChange={e=>setNotes(e.target.value)}/>
          <Button className="md:col-span-2" disabled={create.isPending||upload.isPending} onClick={()=>create.mutate({name,cpf,photoUrl,notes,source})}>Salvar no H2BICO</Button>
        </div>}
      </Card>
      <Card className="bg-gray-900 border-gray-800 p-4 space-y-3">
        <div className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4"/>Extrator de CPF</div>
        <Textarea placeholder="Cole o texto com vários CPFs..." value={extractText} onChange={e=>setExtractText(e.target.value)}/>
        <div className="text-sm text-gray-400">{cpfs.length} CPF(s) encontrado(s)</div>
        {cpfs.length>0&&<><Textarea readOnly value={cpfs.join("\n")} className="font-mono min-h-32"/><Button variant="outline" onClick={()=>{navigator.clipboard.writeText(cpfs.join("\n"));toast.success("CPFs copiados")}}><Copy className="w-4 h-4 mr-2"/>Copiar em coluna</Button></>}
      </Card>
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-3 text-gray-500"/><Input className="pl-9" placeholder="Pesquisar nome ou CPF" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <select className="bg-gray-900 border border-gray-700 rounded-md px-3 py-2" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos</option>{Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{String(v)}</option>)}</select>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(list.data||[]).map((r:any)=><Card key={r.id} className="bg-gray-900 border-gray-800 p-4">
          <div className="flex gap-3">{r.photoUrl?<img src={r.photoUrl} className="w-20 h-20 rounded-xl object-cover border border-gray-700"/>:<div className="w-20 h-20 rounded-xl bg-gray-800 grid place-items-center"><UserCheck/></div>}
            <div className="min-w-0 flex-1"><div className="font-bold truncate">{r.name}</div><div className="text-sm text-gray-400 font-mono">{showCpf?r.cpf:maskCpf(r.cpf)}</div><div className="text-xs mt-1">{STATUS[r.status]}</div>{r.linkedOrder&&<div className="text-xs text-amber-300">Pedido: {r.linkedOrder}</div>}</div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {r.photoUrl&&<Button size="sm" variant="outline" onClick={()=>navigate(`/similaridade?h2bico=${r.id}&foto=${encodeURIComponent(r.photoUrl)}`)}>Comparar</Button>}
            {r.status!=="used"&&<Button size="sm" onClick={()=>markUsed(r.id)}><CheckCircle2 className="w-4 h-4 mr-1"/>Usado</Button>}
            {r.status!=="archived"?<Button size="sm" variant="outline" onClick={()=>setSt.mutate({id:r.id,status:"archived"})}><Archive className="w-4 h-4 mr-1"/>Arquivar</Button>:<Button size="sm" variant="outline" onClick={()=>setSt.mutate({id:r.id,status:"available"})}>Restaurar</Button>}
          </div>
        </Card>)}
      </div>
      {!list.isLoading&&(list.data?.length??0)===0&&<div className="text-center text-gray-500 py-12">Nenhum registro encontrado.</div>}
    </main></div>
}
