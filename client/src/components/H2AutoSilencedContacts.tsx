import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Ban, LockKeyhole, UnlockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function H2AutoSilencedContacts({deviceId,deviceLabel}:{deviceId:string;deviceLabel:string}) {
  const [phone,setPhone]=useState("");
  const utils=trpc.useUtils();
  const list=trpc.h2AutoAdmin.silencedContacts.useQuery({id:deviceId},{refetchInterval:15000});
  const update=trpc.h2AutoAdmin.setSilencedContact.useMutation({
    onSuccess:async()=>{setPhone("");await utils.h2AutoAdmin.silencedContacts.invalidate({id:deviceId});toast.success("Lista atualizada no ADM. Aguarde confirmação da sincronização do APK.");},
    onError:e=>toast.error(e.message),
  });
  const block=()=>update.mutate({id:deviceId,phone:phone.trim(),action:"block"});
  const release=(number:string)=>{
    if(!window.confirm("LIBERAR "+number+" para receber respostas automáticas?"))return;
    update.mutate({id:deviceId,phone:number,action:"release"});
  };
  const synced=list.data?.appliedRevision===list.data?.revision;
  return <section className="rounded-2xl border border-fuchsia-400/35 bg-gradient-to-br from-[#121530] via-[#140e28] to-[#070c1a] p-4 shadow-[0_0_25px_rgba(217,70,239,.12)] sm:p-6">
    <div className="mb-4 flex items-start gap-3">
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/15 p-3"><Ban className="h-6 w-6 text-rose-300"/></div>
      <div><h3 className="text-xl font-black tracking-wide text-white">⛔ CONTATOS SILENCIADOS</h3>
        <p className="mt-1 text-sm text-slate-300">Bloqueio manual por telefone · {deviceLabel}</p>
      </div>
    </div>
    <p className="mb-4 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-xs leading-relaxed text-slate-200">O robô não responderá aos contatos correspondentes. Este bloqueio não envia aviso, não expira e não interfere nos bloqueios por validação. Atenção: se o WhatsApp mostrar apenas um nome, e não o telefone, é necessário confirmar a identificação da conversa para garantir o bloqueio.</p>
    <label htmlFor={"silence-"+deviceId} className="mb-2 block text-xs font-black uppercase tracking-wider text-cyan-200">Telefone com DDD</label>
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-cyan-400/30 bg-slate-950/80 px-3"><Phone className="h-4 w-4 text-cyan-300"/><input id={"silence-"+deviceId} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Ex.: 11999999999" inputMode="tel" className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500"/></div>
      <button type="button" onClick={block} disabled={update.isPending || phone.trim().length<10} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-500 px-4 text-sm font-black text-white disabled:opacity-50"><LockKeyhole className="h-4 w-4"/> BLOQUEAR CONTATO</button>
    </div>
    <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4"><h4 className="text-sm font-black text-white">CONTATOS BLOQUEADOS <span className="ml-1 text-fuchsia-300">{list.data?.phones.length||0}</span></h4>
      <span className={"text-[11px] font-bold "+(synced?"text-emerald-300":"text-amber-300")}>{synced?"✓ APK SINCRONIZADO":"⏳ SINCRONIZAÇÃO PENDENTE"}</span>
    </div>
    {list.isLoading?<p className="mt-4 text-xs text-slate-300">Carregando lista...</p>:null}
    {list.isError?<p role="alert" className="mt-4 text-sm text-rose-300">Não foi possível consultar os contatos.</p>:null}
    {list.data?.phones.length===0?<p className="mt-4 rounded-xl bg-slate-950/50 p-4 text-sm text-slate-400">Nenhum telefone silenciado neste aparelho.</p>:null}
    <div className="mt-3 space-y-2">
    {list.data?.phones.map(number=><div key={number} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-500/5 p-3">
      <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-rose-300"/><div><p className="font-bold text-white">{number}</p><p className="text-xs font-semibold text-rose-300">Silenciado até liberação manual</p></div></div>
      <button type="button" onClick={()=>release(number)} disabled={update.isPending} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 text-xs font-black text-emerald-300 disabled:opacity-40"><UnlockKeyhole className="h-4 w-4"/> LIBERAR</button>
    </div>)}
    </div>
  </section>;
}
