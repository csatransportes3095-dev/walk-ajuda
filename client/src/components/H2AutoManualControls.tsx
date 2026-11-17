import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type PauseDiagnostic = {
  apkVersionCode?: number;
  localPauseActiveRecords?: number;
  localPauseLastReleaseId?: string;
  localPauseLastSyncId?: string;
  localPauseEntries?: Array<{
    id: string; name: string; phone?: string;
    identitySource: string; mode: string; origin: string; until: number;
  }>;
};

export default function H2AutoManualControls({
  deviceId, deviceLabel, revision, appliedRevision, diagnostics, localPauseRelease, pauseSync,
}: {
  deviceId: string; deviceLabel: string; revision: number; appliedRevision: number;
  diagnostics?: PauseDiagnostic | null;
  localPauseRelease?: {requestId:string} | null;
  pauseSync?: {requestId:string;phone:string;mode:"active"|"paused"|"silenced"} | null;
}) {
  const [phone,setPhone]=useState("");
  const [minutes,setMinutes]=useState(60);
  const utils=trpc.useUtils();
  const list=trpc.h2AutoAdmin.manualControls.useQuery({id:deviceId},{refetchInterval:15000});
  const blocked=trpc.h2AutoAdmin.silencedContacts.useQuery({id:deviceId},{refetchInterval:15000});
  const refresh=async()=>{
    await Promise.all([
      utils.h2AutoAdmin.manualControls.invalidate({id:deviceId}),
      utils.h2AutoAdmin.silencedContacts.invalidate({id:deviceId}),
      utils.h2AutoAdmin.list.invalidate(),
    ]);
  };
  const update=trpc.h2AutoAdmin.setUnifiedPause.useMutation({
    onSuccess:async()=>{
      await refresh();
      toast.success("Estado salvo no ADM. Confira abaixo a confirmação do APK.");
    },
    onError:error=>toast.error(error.message),
  });
  const releaseLocalPause=trpc.h2AutoAdmin.releaseLocalPause.useMutation({
    onSuccess:async()=>{ await refresh();toast.success("Liberação local enviada; confira o retorno do APK."); },
    onError:error=>toast.error(error.message),
  });
  const releaseLegacy=trpc.h2AutoAdmin.releaseLegacySilencedContact.useMutation({
    onSuccess:async()=>{ await refresh();toast.success("Bloqueio antigo retirado. Aguarde a sincronização."); },
    onError:error=>toast.error(error.message),
  });
  const act=(mode:"active"|"paused"|"silenced",target=phone)=>{
    const digits=target.replace(/\D/g,"");
    if(!/^[1-9]\d{10}$/.test(digits)){toast.error("Informe um telefone válido com DDD e 11 dígitos.");return;}
    if(mode==="paused"&&(!Number.isInteger(minutes)||minutes<1||minutes>1440)){
      toast.error("Tempo permitido: 1 a 1440 minutos.");return;
    }
    update.mutate({id:deviceId,phone:digits,mode,...(mode==="paused"?{minutes}:{})});
  };
  const synced=list.data?.appliedRevision===list.data?.revision;
  const verified=!!pauseSync?.requestId && diagnostics?.localPauseLastSyncId===pauseSync.requestId;
  const pending=!!pauseSync?.requestId && !verified;
  const localEntries=diagnostics?.localPauseEntries || [];
  const localReleasePending=!!localPauseRelease?.requestId &&
    diagnostics?.localPauseLastReleaseId!==localPauseRelease.requestId;
  const legacyNames=blocked.data?.legacyNames || [];
  const numericBlocks=blocked.data?.phones || [];
  const rows=new Map((list.data?.contacts||[]).map(x=>[x.phone,x]));
  for(const p of numericBlocks) if(!rows.has(p))rows.set(p,{phone:p,mode:"silenced" as const,until:0});
  return <section className="space-y-4 rounded-2xl border border-cyan-400/40 bg-cyan-950/20 p-4" data-testid="h2auto-single-pause-center">
    <div className="space-y-1">
      <h3 className="text-lg font-black text-cyan-100">⏱ CENTRAL ÚNICA DE PAUSAS — H2 AUTO</h3>
      <p className="text-sm text-slate-300">Aparelho: {deviceLabel}. Todos os controles de contato estão reunidos aqui. Pausa e liberação são independentes para cada telefone.</p>
      <p className="text-xs text-amber-200">O ADM é a autoridade para números identificados. Pausas geradas no aparelho são sincronizadas e limpas por contato com APK 2.11 ou superior. Bloqueios antigos por nome precisam de revisão individual.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
      <label className="text-xs font-bold text-slate-200">Telefone com DDD
        <input className="mt-1 w-full rounded-xl border border-cyan-400/30 bg-slate-950 px-3 py-3 text-sm text-white"
          value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="11999999999"/>
      </label>
      <label className="text-xs font-bold text-slate-200">Pausa (minutos)
        <input className="mt-1 w-full rounded-xl border border-cyan-400/30 bg-slate-950 px-3 py-3 text-sm text-white"
          type="number" min={1} max={1440} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/>
      </label>
    </div>
    <div className="grid gap-2 sm:grid-cols-3">
      <button disabled={update.isPending} onClick={()=>act("paused")} className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">PAUSAR</button>
      <button disabled={update.isPending} onClick={()=>act("silenced")} className="rounded-xl bg-rose-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">PAUSA PERMANENTE</button>
      <button disabled={update.isPending} onClick={()=>act("active")} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">LIBERAR</button>
    </div>
    <p className={"text-xs "+(synced?"text-emerald-300":"text-amber-200")}>
      {synced?"Configuração recebida pelo aparelho.":"ADM aguardando o APK aplicar a última revisão."}
      {pending && (diagnostics?.apkVersionCode||0)<111
        ?" Este APK precisa de atualização para 2.11: pausas locais antigas ainda podem estar ativas."
        :pending?" Limpeza das pausas locais ainda não confirmada pelo APK."
        :verified?" Limpeza local confirmada pelo APK.":""}
    </p>
    <div className="space-y-2">
      {[...rows.values()].map(entry=><div key={entry.phone} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-500/20 bg-slate-950/70 p-3">
        <div className="text-sm">
          <p className="font-bold text-white">{entry.phone}</p>
          <p className={entry.mode==="active"?"text-emerald-300":entry.mode==="silenced"?"text-rose-300":"text-amber-200"}>
            {entry.mode==="active"?"ATIVO":entry.mode==="silenced"?"PAUSA PERMANENTE":"PAUSA TEMPORÁRIA"}
            {entry.mode==="paused"?" · "+(entry.until>Date.now()?new Date(entry.until).toLocaleString("pt-BR"):"Prazo encerrado"):""}
            {numericBlocks.includes(entry.phone)?" · bloqueio antigo cadastrado":""}
          </p>
        </div>
        <div className="flex gap-2">
          <button disabled={update.isPending} onClick={()=>act("paused",entry.phone)} className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs text-amber-200">Pausar</button>
          <button disabled={update.isPending} onClick={()=>act("active",entry.phone)} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs text-emerald-200">Liberar</button>
        </div>
      </div>)}
    </div>
    <div className="space-y-2 border-t border-cyan-500/20 pt-3">
      <h4 className="text-sm font-bold text-cyan-200">Pausas locais do APK: {diagnostics?.localPauseActiveRecords ?? "não informado"}</h4>
      <p className="text-xs text-slate-400">O APK identifica registros antigos por histórico e contatos locais. Os desconhecidos nunca são associados a um número por suposição.</p>
      {localEntries.map((item,index)=><div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-violet-400/20 p-3">
        <div className="text-xs"><p className="font-bold">{item.name||item.phone||`Pausa não identificada #${index+1}`}</p>
          <p className="text-slate-400">{item.mode==="permanent"?"Permanente":"Temporária"} · {item.origin==="operator"?"Atendente":"Automática"}</p>
        </div>
        <button disabled={releaseLocalPause.isPending||localReleasePending} onClick={()=>{
          if(!window.confirm("Liberar apenas esta pausa local identificada no aparelho?"))return;
          releaseLocalPause.mutate({id:deviceId,expectedRevision:revision,scope:"one",target:item.id});
        }} className="rounded-lg border border-emerald-400/50 px-3 py-2 text-xs font-bold text-emerald-200 disabled:opacity-50">Liberar registro</button>
      </div>)}
      {localReleasePending && <p className="text-xs text-amber-200">Última liberação local ainda aguarda confirmação do APK.</p>}
    </div>
    {legacyNames.length>0 && <div className="space-y-2 border-t border-amber-500/20 pt-3">
      <h4 className="text-sm font-bold text-amber-200">Bloqueios antigos por nome — revisão necessária</h4>
      <p className="text-xs text-slate-400">Estes bloqueios ainda funcionam, mas não podem ser associados automaticamente a telefones sem confirmar o nome.</p>
      {legacyNames.map(name=><div key={name} className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/20 p-3">
        <span className="text-xs font-bold break-all">{name}</span>
        <button disabled={releaseLegacy.isPending} className="rounded-lg border border-emerald-400/50 px-3 py-2 text-xs" onClick={()=>{
          if(!window.confirm(`Remover somente o bloqueio antigo por nome "${name}"?`))return;
          releaseLegacy.mutate({id:deviceId,legacyEntry:name});
        }}>Liberar nome</button>
      </div>)}
    </div>}
  </section>;
