import {useState} from "react";
import {trpc} from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import H2AutoTreeEditor from "@/components/H2AutoTreeEditor";
import {Bot, Smartphone, RefreshCw, ShieldCheck, Save, Power, Clock, Mic, Image} from "lucide-react";
import {toast} from "sonner";

const Box=({children}:{children:React.ReactNode})=><div className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-5 space-y-3">{children}</div>;
export default function AdminH2Auto(){
 const utils=trpc.useUtils();
 const {data=[],isLoading}=trpc.h2AutoAdmin.list.useQuery(undefined,{refetchInterval:15000});
 const create=trpc.h2AutoAdmin.create.useMutation({onSuccess:x=>{setPair({id:x.id,code:x.code});utils.h2AutoAdmin.list.invalidate();},onError:()=>toast.error("Falha ao criar aparelho")});
 const pairCode=trpc.h2AutoAdmin.pairCode.useMutation({onSuccess:x=>setPair({id:pairId,code:x.code})});
 const save=trpc.h2AutoAdmin.save.useMutation({onSuccess:()=>{toast.success("Salvo: aguardando sincronização do celular");utils.h2AutoAdmin.list.invalidate();},onError:(e)=>toast.error(e.message || "Falha ao salvar")});
 const merge=trpc.h2AutoAdmin.mergeLocal.useMutation({onSuccess:()=>{toast.success("Configurações locais mescladas sem apagar as atuais");utils.h2AutoAdmin.list.invalidate();},onError:(e)=>toast.error(e.message)});
 const revoke=trpc.h2AutoAdmin.revoke.useMutation({onSuccess:()=>{toast.success("Celular desvinculado. Configurações preservadas.");utils.h2AutoAdmin.list.invalidate();},onError:e=>toast.error(e.message)});
 const remove=trpc.h2AutoAdmin.remove.useMutation({onSuccess:()=>{toast.success("Celular removido do H2 AUTO.");utils.h2AutoAdmin.list.invalidate();},onError:e=>toast.error(e.message)});
 const [label,setLabel]=useState("Celular principal");const[pair,setPair]=useState<{id:string,code:string}|null>(null);const[pairId,setPairId]=useState("");const[editing,setEditing]=useState<Record<string,any>>({});
 const mediaDefaults={enabled:false,transcribeAudio:false,audioFallback:"🎤 Recebemos seu áudio. Por favor, envie sua dúvida por escrito ou digite 6 para falar com um atendente.",photoReply:"📸 Recebemos sua foto. Descreva sua dúvida por escrito ou digite 6.",videoReply:"🎥 Recebemos seu vídeo. Descreva sua dúvida por escrito ou digite 6.",documentReply:"📄 Recebemos seu documento. Descreva sua solicitação por escrito ou digite 6.",stickerReply:"📎 Recebemos sua mídia. Digite MENU para escolher uma opção.",unknownReply:"📎 Recebemos sua mídia. Escreva sua dúvida ou digite MENU.",cooldownSeconds:120,maxAudioSeconds:30};
 const field="w-full rounded-xl border border-cyan-500/30 bg-slate-950 px-3 py-2 text-white";
 return <div className="min-h-screen bg-[#050c18] text-white"><AdminHeader title="H2 AUTO — CONTROLE REMOTO" icon={<Bot className="h-5 w-5"/>}/>
 <main className="mx-auto max-w-5xl p-4 space-y-5">
 <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/30 p-4 text-sm text-emerald-200"><ShieldCheck className="inline h-4 w-4 mr-2"/>Sem API do WhatsApp. Apenas configurações sincronizadas com o APK. O aparelho continua responsável por responder.</div>
 <Box><h2 className="font-black text-cyan-300 flex gap-2"><Smartphone/> VINCULAR APARELHO</h2><div className="flex gap-2"><input className={field} value={label} maxLength={80} onChange={e=>setLabel(e.target.value)} placeholder="Nome do aparelho"/><button className="rounded-xl bg-cyan-500 px-4 font-bold text-slate-950" disabled={!label.trim()||create.isPending} onClick={()=>create.mutate({label})}>ADICIONAR</button></div>
 {pair&&<div className="rounded-xl border border-yellow-400/40 p-4"><p className="text-yellow-300 font-black">CÓDIGO TEMPORÁRIO — 10 MINUTOS</p><p className="text-3xl tracking-widest font-black">{pair.code}</p><p className="text-xs opacity-70">Aparelho: {pair.id}. Insira este código no H2 AUTO. Ele aparece somente agora.</p></div>}</Box>
 {isLoading&&<p>Carregando aparelhos...</p>}
 {data.map(d=>{const value=editing[d.id]||d.config;const change=(f:string,v:any)=>setEditing(p=>({...p,[d.id]:{...value,[f]:v}}));return <Box key={d.id}>
 <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-black">{d.label}</h3><p className="text-xs opacity-65">{d.paired?"VINCULADO":"AGUARDANDO VÍNCULO"} · Config. {d.revision} · Aplicada {d.appliedRevision} · {d.lastSeen?"Última sincronização: "+new Date(d.lastSeen).toLocaleString("pt-BR"):"Nunca sincronizado"}</p></div><div className="flex flex-wrap gap-2"><button className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs" onClick={()=>{setPairId(d.id);pairCode.mutate({id:d.id},{onSuccess:x=>setPair({id:d.id,code:x.code})})}}>NOVO CÓDIGO</button><button disabled={!d.paired||revoke.isPending} className="rounded-lg border border-amber-500/50 px-3 py-2 text-xs font-bold text-amber-300 disabled:opacity-40" onClick={()=>{if(confirm("DESVINCULAR "+d.label+"?\\nO celular perderá a autorização de sincronizar e consultar pedidos. As configurações do ADM serão preservadas."))revoke.mutate({id:d.id})}}>DESVINCULAR CELULAR</button><button disabled={remove.isPending} className="rounded-lg border border-red-500/50 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-40" onClick={()=>{if(confirm("REMOVER DEFINITIVAMENTE "+d.label+"?\\nIsso apagará somente o aparelho H2 AUTO, sua cópia local armazenada no ADM e as sessões de consulta. Não apaga pedidos, clientes nem outros serviços."))remove.mutate({id:d.id})}}>REMOVER APARELHO</button></div></div>
 {d.snapshotConfig&&<div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 space-y-2"><div className="font-bold text-amber-200">CÓPIA DAS CONFIGURAÇÕES DO CELULAR DISPONÍVEL</div><p className="text-xs text-white/70">Recebida em {d.snapshotReceivedAt?new Date(d.snapshotReceivedAt).toLocaleString("pt-BR"):"data desconhecida"}. A cópia original fica preservada. Mesclar preenche os campos vazios e adiciona regras que ainda não existem no ADM.</p><button className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-black" disabled={merge.isPending} onClick={()=>{if(confirm("Mesclar dados locais sem apagar configurações atuais do ADM?"))merge.mutate({id:d.id,expectedRevision:d.revision})}}>IMPORTAR CONFIGURAÇÕES DO CELULAR</button></div>}
 <H2AutoTreeEditor key={d.id} id={d.id} revision={d.revision} initial={d.config.tree} />
 <div className="grid gap-3 md:grid-cols-2">
 <label className="text-xs flex flex-col gap-2">APLICATIVO WHATSAPP
 <select className={field} value={value.whatsappMode} onChange={e=>change("whatsappMode",Number(e.target.value))}>
 <option value={-1}>Manter seleção do celular</option>
 <option value={0}>WhatsApp Normal</option>
 <option value={1}>WhatsApp Business</option>
 </select>
 </label>
 <label className="flex items-center gap-2"><input type="checkbox" checked={value.enabled} onChange={e=>change("enabled",e.target.checked)}/><Power className="h-4 w-4"/> Robô habilitado remotamente</label>
 <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(value.ordersEnabled)} onChange={e=>change("ordersEnabled",e.target.checked)}/>Consulta de pedidos por WhatsApp (exige APK atualizado e teste)</label>
 <div className="col-span-full rounded-xl border border-cyan-400/30 bg-cyan-950/20 p-3 space-y-3">
 <h4 className="font-black text-cyan-300">INTEGRAÇÃO COM PEDIDOS DO SITE</h4>
 <p className="text-xs text-white/60">Ative somente após instalar e testar o APK compatível. Código de e-mail sempre obrigatório.</p>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <label className="text-xs">Sessão autenticada (horas)<input type="number" min={1} max={72} className={field} value={value.orderSessionHours??24} onChange={e=>change("orderSessionHours",Number(e.target.value))}/></label>
 <label className="text-xs">Validade do código (minutos)<input type="number" min={5} max={30} className={field} value={value.orderCodeTtlMinutes??10} onChange={e=>change("orderCodeTtlMinutes",Number(e.target.value))}/></label>
 <label className="text-xs">Tentativas de código<input type="number" min={3} max={10} className={field} value={value.orderCodeMaxAttempts??5} onChange={e=>change("orderCodeMaxAttempts",Number(e.target.value))}/></label>
 </div>
 <label className="block text-xs">Mensagem para cliente sem pedidos<textarea rows={3} className={field} maxLength={600} value={value.orderNoOrdersMessage??"Cadastro localizado com sucesso, mas não encontramos nenhum pedido associado a este cadastro no momento."} onChange={e=>change("orderNoOrdersMessage",e.target.value)}/></label>
 </div>
 <label className="flex items-center gap-2"><Clock className="h-4 w-4"/>Pausa atendente (min)<input type="number" min={1} max={1440} className={field} value={value.pauseMinutes} onChange={e=>change("pauseMinutes",Number(e.target.value))}/></label>
 <label className="flex items-center gap-2"><input type="checkbox" checked={value.scheduleOn} onChange={e=>change("scheduleOn",e.target.checked)}/> Horários ativos</label>
 <div className="flex gap-2"><input className={field} value={value.scheduleStart} onChange={e=>change("scheduleStart",e.target.value)} placeholder="09:00"/><input className={field} value={value.scheduleEnd} onChange={e=>change("scheduleEnd",e.target.value)} placeholder="18:00"/></div>
 </div>
 <label className="block text-xs text-cyan-200">RESPOSTA INICIAL<textarea rows={5} className={field} value={value.welcome} onChange={e=>change("welcome",e.target.value)}/></label>
 <div className="grid gap-3 md:grid-cols-2">{value.menu.map((m:string,i:number)=><label key={i} className="text-xs">OPÇÃO {i+1}<textarea className={field} rows={3} value={m} onChange={e=>change("menu",value.menu.map((x:string,j:number)=>j===i?e.target.value:x))}/></label>)}</div>
 <div className="rounded-xl border border-violet-500/25 bg-slate-950/60 p-4 space-y-3">
 <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-black text-violet-300">PALAVRAS-CHAVE AUTOMÁTICAS</h4><button className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-black" onClick={()=>change("rules",[...value.rules,{trigger:"",reply:"",mode:"exact",enabled:true}])}>+ NOVA REGRA</button></div>
 {value.rules.map((rule:{trigger:string,reply:string,mode:"exact"|"contains",enabled:boolean},i:number)=>{
 const update=(key:string,v:unknown)=>change("rules",value.rules.map((x:any,j:number)=>i===j?{...x,[key]:v}:x));
 return <div key={i} className="grid gap-2 rounded-xl border border-violet-500/25 p-3">
  <div className="flex items-center justify-between"><label className="text-xs"><input type="checkbox" checked={rule.enabled} onChange={e=>update("enabled",e.target.checked)} className="mr-2"/>Regra {i+1} ativa</label><button className="rounded-lg border border-red-500/40 px-3 py-1 text-red-300" onClick={()=>change("rules",value.rules.filter((_x:any,j:number)=>i!==j))}>Excluir</button></div>
  <input className={field} value={rule.trigger} maxLength={120} placeholder="Ex.: bom dia, boa tarde, boa noite" onChange={e=>update("trigger",e.target.value)}/>
  <p className="text-[11px] text-violet-200/70">Separe várias palavras ou frases por vírgula. Todas usarão a mesma resposta.</p>
  <select className={field} value={rule.mode} onChange={e=>update("mode",e.target.value)}><option value="exact">Mensagem exata</option><option value="contains">Contém a palavra</option></select>
  <textarea className={field} rows={3} value={rule.reply} maxLength={6000} placeholder="Resposta automática" onChange={e=>update("reply",e.target.value)}/>
 </div>})}
 </div>
 <section className="rounded-2xl border border-sky-400/35 bg-sky-950/25 p-4 space-y-3">
 <h4 className="font-black text-sky-300 flex items-center gap-2"><Mic className="h-5 w-5"/> CENTRAL DE ÁUDIOS E MÍDIAS</h4>
 <p className="text-xs text-slate-300">Configuração exclusiva deste aparelho. Sem alterar o menu, pedidos ou regras existentes. A transcrição local só funciona quando o áudio estiver acessível ao Android.</p>
 {(()=>{const m={...mediaDefaults,...(value.media||{})};const updateMedia=(key:string,val:any)=>change("media",{...m,[key]:val});return <div className="space-y-3">
 <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={m.enabled} onChange={e=>updateMedia("enabled",e.target.checked)}/>Responder mídias recebidas</label>
 <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={m.transcribeAudio} onChange={e=>updateMedia("transcribeAudio",e.target.checked)}/>Tentar transcrever áudio localmente quando acessível</label>
 <div className="grid grid-cols-2 gap-3">
 <label className="text-xs">Intervalo por conversa (segundos)<input type="number" min={15} max={3600} className={field} value={m.cooldownSeconds} onChange={e=>updateMedia("cooldownSeconds",Number(e.target.value))}/></label>
 <label className="text-xs">Duração máxima de áudio (segundos)<input type="number" min={5} max={120} className={field} value={m.maxAudioSeconds} onChange={e=>updateMedia("maxAudioSeconds",Number(e.target.value))}/></label>
 </div>
 {([["audioFallback","ÁUDIO NÃO TRANSCRITO"],["photoReply","FOTO"],["videoReply","VÍDEO"],["documentReply","DOCUMENTO"],["stickerReply","FIGURINHA"],["unknownReply","MÍDIA DESCONHECIDA"]] as const).map(([key,label])=><label key={key} className="block text-xs font-bold text-sky-200">{label}<textarea className={field} rows={2} maxLength={3000} value={m[key]} onChange={e=>updateMedia(key,e.target.value)}/></label>)}
 </div>})()}
 </section>
 <label className="block text-xs">CONTATOS BLOQUEADOS (um por linha)<textarea className={field} rows={2} value={value.blocked} onChange={e=>change("blocked",e.target.value)}/></label>
 <button className="w-full rounded-xl bg-emerald-400 p-3 text-slate-950 font-black" disabled={save.isPending} onClick={()=>save.mutate({id:d.id,config:value,expectedRevision:d.revision})}><Save className="inline h-4 w-4 mr-1"/>SALVAR CONFIGURAÇÃO</button>
 </Box>})}
 <p className="text-xs text-slate-500">Alterações só funcionam quando o APK atualizado está vinculado e conectado à internet. As permissões do Android não podem ser liberadas remotamente.</p>
 </main></div>
}
