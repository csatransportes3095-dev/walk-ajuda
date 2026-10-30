import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function H2AutoManualControls({deviceId,deviceLabel}:{deviceId:string;deviceLabel:string}) {
  const [phone,setPhone]=useState("");
  const [minutes,setMinutes]=useState(60);
  const utils=trpc.useUtils();
  const list=trpc.h2AutoAdmin.manualControls.useQuery({id:deviceId},{refetchInterval:15000});
  const update=trpc.h2AutoAdmin.setManualControl.useMutation({
    onSuccess:async()=>{
      await utils.h2AutoAdmin.manualControls.invalidate({id:deviceId});
      await utils.h2AutoAdmin.list.invalidate();
      toast.success("Controle salvo. Aguarde o APK sincronizar.");
    },
    onError:error=>toast.error(error.message),
  });
  const act=(mode:"active"|"paused"|"silenced",target=phone)=>{
    const digits=target.replace(/\D/g,"");
    if(digits.length!==11){toast.error("Informe telefone com 11 números e DDD.");return;}
    if(mode==="paused" && (!Number.isInteger(minutes)||minutes<1||minutes>1440)){toast.error("Tempo permitido: 1 a 1440 minutos.");return;}
    update.mutate({id:deviceId,phone:digits,mode,...mode==="paused"?{minutes}:{}});
  };
  const synced=list.data && list.data.appliedRevision===list.data.revision;
  return <section className="space-y-4 rounded-2xl border border-cyan-400/40 bg-cyan-950/20 p-4">
    <div>
      <h3 className="text-lg font-black text-cyan-100">⏱️ PAUSA E COMANDOS POR CONTATO — H2 AUTO</h3>
      <p className="text-sm text-slate-300">Aparelho: {deviceLabel}. Cada contato é independente; os outros continuam recebendo atendimento automático.</p>
      <p className="mt-1 text-xs text-slate-300">Uma resposta manual no celular inicia a pausa configurada. Comandos enviados pelo próprio atendente: /H2 ATIVA, /H3 DESATIVA e /H2 PAUSAR 120. Comandos enviados pelo cliente não têm efeito. No computador, utilize os botões abaixo.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
      <label className="text-xs font-bold text-slate-200">Telefone com DDD
        <input className="mt-1 w-full rounded-xl border border-cyan-400/30 bg-slate-950 px-3 py-3 text-sm text-white"
          value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="11999999999"/>
      </label>
      <label className="text-xs font-bold text-slate-200">Pausar (minutos)
        <input className="mt-1 w-full rounded-xl border border-cyan-400/30 bg-slate-950 px-3 py-3 text-sm text-white"
          type="number" min={1} max={1440} value={minutes}
          onChange={e=>setMinutes(Number(e.target.value))}/>
      </label>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      <button disabled={update.isPending} onClick={()=>act("paused")} className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">⏱ PAUSAR CONTATO</button>
      <button disabled={update.isPending} onClick={()=>act("silenced")} className="rounded-xl bg-rose-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">⛔ SILENCIAR ATÉ LIBERAR</button>
      <button disabled={update.isPending} onClick={()=>act("active")} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">✅ REATIVAR CONTATO</button>
    </div>
    <p className={"text-xs "+(synced?"text-emerald-300":"text-amber-200")}>{synced?"Revisão confirmada pelo aparelho.":"Sincronização com o APK ainda pendente ou não confirmada."}</p>
    {list.isLoading?<p className="text-xs text-slate-400">Carregando contatos...</p>:null}
    <div className="space-y-2">
      {(list.data?.contacts||[]).map(entry=><div key={entry.phone} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-slate-950/70 p-3">
        <div className="text-sm">
          <p className="font-bold text-white">{entry.phone}</p>
          <p className={entry.mode==="active"?"text-emerald-300":entry.mode==="silenced"?"text-rose-300":"text-amber-200"}>
            {entry.mode==="active"?"ATIVO":entry.mode==="silenced"?"SILENCIADO":"PAUSA TEMPORÁRIA"}
            {entry.mode==="paused"?" · "+(entry.until>Date.now()?new Date(entry.until).toLocaleString("pt-BR"):"Prazo encerrado"):""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={update.isPending} onClick={()=>act("paused",entry.phone)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs text-amber-200">Pausar</button>
          <button disabled={update.isPending} onClick={()=>act("active",entry.phone)} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs text-emerald-200">Liberar</button>
        </div>
      </div>)}
    </div>
    <p className="text-xs text-amber-200">Somente números reconhecidos com segurança pelo WhatsApp poderão ser controlados pelo ADM. A pausa manual local exige Android com acessibilidade ou notificação de saída identificada.</p>
  </section>;
}
