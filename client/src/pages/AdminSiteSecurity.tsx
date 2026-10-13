import { useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, ArrowLeft, UserPlus, Trash2, RefreshCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
type Mode = "public" | "restricted" | "blocked";
export default function AdminSiteSecurity() {
 const [, navigate]=useLocation();
 const status=trpc.siteSecurity.status.useQuery(undefined,{retry:false,refetchOnWindowFocus:true});
 const people=trpc.siteSecurity.list.useQuery(undefined,{retry:false});
 const utils=trpc.useUtils();
 const [name,setName]=useState("");const [email,setEmail]=useState("");const [phone,setPhone]=useState("");
 const setMode=trpc.siteSecurity.setMode.useMutation({onSuccess:()=>{void utils.siteSecurity.status.invalidate();toast.success("Modo atualizado.");},onError:e=>toast.error(e.message)});
 const add=trpc.siteSecurity.add.useMutation({onSuccess:()=>{void people.refetch();setName("");setEmail("");setPhone("");toast.success("Autorização registrada.");},onError:e=>toast.error(e.message)});
 const change=trpc.siteSecurity.changeStatus.useMutation({onSuccess:()=>void people.refetch(),onError:e=>toast.error(e.message)});
 const remove=trpc.siteSecurity.remove.useMutation({onSuccess:()=>void people.refetch(),onError:e=>toast.error(e.message)});
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
 <form className="grid gap-2 sm:grid-cols-3" onSubmit={e=>{e.preventDefault();add.mutate({displayName:name.trim(),email:email.trim(),phone:phone.trim()||undefined});}}>
 <input required minLength={2} maxLength={128} value={name} onChange={e=>setName(e.target.value)} placeholder="Nome" className="w-full rounded-lg p-3 bg-white/10 border border-white/20"/>
 <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail autorizado" className="w-full rounded-lg p-3 bg-white/10 border border-white/20"/>
 <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Telefone (opcional)" className="w-full rounded-lg p-3 bg-white/10 border border-white/20"/>
 <button disabled={add.isPending} className="sm:col-span-3 rounded-lg p-3 bg-yellow-500 text-black font-black flex items-center gap-2 justify-center"><UserPlus size={18}/> Adicionar pessoa</button></form>
 {people.isLoading?<p>Carregando lista...</p>:people.error?<p className="text-red-300">Não foi possível carregar as autorizações.</p>:people.data?.length===0?<p className="text-white/50 text-sm">Nenhuma pessoa autorizada cadastrada.</p>:(people.data||[]).map(p=><div key={p.id} className="rounded-xl bg-black/20 border border-white/10 p-3 flex flex-wrap justify-between items-center gap-3"><div><p className="font-bold">{p.displayName}</p><p className="text-xs text-white/55 break-all">{p.email} · {p.status}</p></div><div className="flex gap-2"><button onClick={()=>change.mutate({id:p.id,status:p.status==="active"?"suspended":"active"})} className="rounded-lg border border-white/20 p-2 text-xs">{p.status==="active"?"Suspender":"Reativar"}</button><button aria-label={"Remover "+p.displayName} onClick={()=>{if(window.confirm("Remover autorização?"))remove.mutate({id:p.id});}} className="rounded-lg border border-red-500/30 p-2 text-red-300"><Trash2 size={16}/></button></div></div>)}
 </section></div></main>;
}
