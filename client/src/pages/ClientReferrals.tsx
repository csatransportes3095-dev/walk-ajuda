import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, ArrowUpRight, CheckCircle2, CircleDollarSign, Clock3,
  Gift, HandCoins, LockKeyhole, Search, ShieldCheck, Sparkles,
  TrendingUp, Users, Wallet, XCircle, RefreshCw, ChevronDown,
  ChevronUp, CreditCard,
} from "lucide-react";

type Filter = "todas" | "aguardando_agendamento" | "liberada" | "paga" | "nao_elegivel";
const money = (value: number) => (Math.max(0,Number(value)||0)/100).toLocaleString("pt-BR",{
  style:"currency",currency:"BRL",
});
const titleByState:Record<Exclude<Filter,"todas">,string>={
  aguardando_agendamento:"A LIBERAR",
  liberada:"LIBERADO",
  paga:"PAGA",
  nao_elegivel:"NÃO VÁLIDA",
};
const styles:Record<Exclude<Filter,"todas">,{pill:string,accent:string,icon:typeof Clock3}>={
  aguardando_agendamento:{pill:"border-amber-400/35 bg-amber-500/15 text-amber-300",accent:"from-amber-500/20",icon:Clock3},
  liberada:{pill:"border-emerald-400/35 bg-emerald-500/15 text-emerald-300",accent:"from-emerald-500/20",icon:CheckCircle2},
  paga:{pill:"border-sky-400/35 bg-sky-500/15 text-sky-300",accent:"from-sky-500/20",icon:CreditCard},
  nao_elegivel:{pill:"border-rose-400/35 bg-rose-500/15 text-rose-300",accent:"from-rose-500/20",icon:XCircle},
};
function MoneyCard({ label, value, icon:Icon, tone, caption }: {
  label:string;value:number;icon:typeof Wallet;tone:"cyan"|"amber"|"emerald"|"violet";caption:string;
}){
  const toneClasses={
    cyan:"border-cyan-400/30 shadow-cyan-500/10 text-cyan-300",
    amber:"border-amber-400/30 shadow-amber-500/10 text-amber-300",
    emerald:"border-emerald-400/30 shadow-emerald-500/10 text-emerald-300",
    violet:"border-violet-400/30 shadow-violet-500/10 text-violet-300",
  };
  return <div className={"relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white/[.07] to-[#0a1021] p-4 shadow-[0_15px_35px_rgba(0,0,0,.22)] sm:p-5 "+toneClasses[tone]}>
    <div className="mb-4 flex items-center justify-between gap-2">
      <span className="text-[11px] font-black uppercase tracking-[.12em] text-slate-200">{label}</span>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true"/>
    </div>
    <p className="break-words text-2xl font-black tracking-tight text-white sm:text-3xl">{money(value)}</p>
    <p className="mt-2 text-xs text-slate-400">{caption}</p>
  </div>;
}
export default function ClientReferrals() {
  const token = typeof window !== "undefined" ? localStorage.getItem("cp_token")||"" : "";
  const [filter,setFilter] = useState<Filter>("todas");
  const [search,setSearch] = useState("");
  const [expanded,setExpanded] = useState<number | null>(null);
  const query = trpc.clientReferrals.list.useQuery({token},{
    enabled:token.length>=32,
    refetchOnWindowFocus:true,
    staleTime:15000,
    retry:false,
  });
  const all = query.data?.commissions||[];
  const visible=useMemo(()=>all.filter(item=>
    (filter==="todas" || item.commissionState===filter) &&
    (!search.trim() || [item.customerName,item.orderNumber,item.orderStatus]
      .some(value=>String(value||"").toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR").trim())))
  ),[all,filter,search]);
  const details=query.data;
  const needLogin=token.length<32 || (query.error as any)?.data?.code==="UNAUTHORIZED" ||
    (query.error as any)?.data?.code==="FORBIDDEN";
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050918] px-3 pb-16 pt-5 text-white sm:px-6 sm:pt-9">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_8%,rgba(6,182,212,.17),transparent_38%),radial-gradient(ellipse_at_90%_15%,rgba(124,58,237,.16),transparent_45%),linear-gradient(to_bottom,#070d20,#040714)]"/>
      <div className="relative mx-auto max-w-6xl space-y-6">
        <nav aria-label="Navegação da página" className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-slate-200 transition hover:border-cyan-400/40 hover:text-white">
            <ArrowLeft className="h-4 w-4"/> Início
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">
            <ShieldCheck className="h-4 w-4"/> CONSULTA PROTEGIDA
          </div>
        </nav>
        <header className="relative overflow-hidden rounded-[28px] border border-cyan-400/25 bg-gradient-to-br from-[#102a47] via-[#111536] to-[#261044] px-5 py-7 shadow-[0_25px_65px_rgba(8,145,178,.12)] sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full border-[30px] border-cyan-300/5"/>
          <div className="relative">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.23em] text-cyan-200"><Sparkles className="h-4 w-4"/> H2 COLOMBIANO 🇨🇴</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">MINHAS <span className="bg-gradient-to-r from-cyan-300 via-white to-violet-300 bg-clip-text text-transparent">INDICAÇÕES</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">Acompanhe seus clientes indicados, os pedidos e cada etapa das comissões: a liberar, liberadas e pagas.</p>
          </div>
        </header>
        {needLogin ? (
          <section className="mx-auto max-w-xl rounded-3xl border border-amber-400/30 bg-slate-900/90 p-6 text-center shadow-xl sm:p-9">
            <LockKeyhole className="mx-auto h-12 w-12 text-amber-300"/>
            <h2 className="mt-4 text-xl font-black">ACESSO AO EXTRATO DE INDICAÇÕES</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">Entre na sua conta H2 Colombiano com telefone e código enviado ao e-mail cadastrado. Apenas suas próprias indicações serão exibidas.</p>
            <a href="/login" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 font-black text-slate-950 hover:brightness-110">ENTRAR NA MINHA CONTA <ArrowUpRight className="h-4 w-4"/></a>
          </section>
        ) : query.isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-16 text-center"><RefreshCw className="mx-auto h-9 w-9 animate-spin text-cyan-300"/><p className="mt-3 text-sm text-slate-300">Consultando suas indicações...</p></div>
        ) : query.error ? (
          <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-center">
            <XCircle className="mx-auto h-8 w-8 text-rose-300"/>
            <h2 className="mt-3 font-bold">Não foi possível carregar as indicações</h2>
            <p className="mt-1 text-sm text-slate-300">Se o problema continuar, procure o atendimento.</p>
            <button type="button" onClick={()=>void query.refetch()} className="mt-4 rounded-xl border border-white/20 px-5 py-3 text-sm font-bold">TENTAR NOVAMENTE</button>
          </div>
        ) : (
          <>
            <section aria-label="Resumo financeiro" className="grid grid-cols-2 gap-3 lg:grid-cols-4 sm:gap-4">
              <MoneyCard label="Total acumulado" value={details?.amountTotal||0} icon={TrendingUp} tone="violet" caption="A liberar + liberado + pago"/>
              <MoneyCard label="A liberar" value={details?.amountPending||0} icon={Clock3} tone="amber" caption="Aguardando liberação"/>
              <MoneyCard label="Liberado" value={details?.amountReleased||0} icon={HandCoins} tone="emerald" caption="Disponível para pagamento"/>
              <MoneyCard label="Já recebido" value={details?.amountPaid||0} icon={Wallet} tone="cyan" caption="Comissões marcadas como pagas"/>
            </section>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-cyan-400/20 bg-[#0d172d] p-5 sm:col-span-2">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-cyan-300">MEU SALDO A RECEBER</p>
                  <p className="mt-2 text-3xl font-black text-white sm:text-4xl">{money(details?.amountReceivable||0)}</p>
                  <p className="mt-2 text-xs text-slate-400">Soma dos valores a liberar e liberados. Valores pagos não entram neste saldo.</p>
                </div><CircleDollarSign className="h-10 w-10 shrink-0 text-cyan-400/70"/></div>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-violet-400/25 bg-[#151129] p-5">
                <div><p className="text-xs font-black uppercase tracking-widest text-violet-300">CLIENTES INDICADOS</p><p className="mt-2 text-4xl font-black">{details?.totalReferrals||0}</p><p className="mt-1 text-xs text-slate-400">Indicações válidas</p><p className="mt-1 text-xs text-amber-300">🏷️ {details?.promotionalCount||0} promocionais sem comissão</p></div>
                <Users className="h-9 w-9 text-violet-300"/>
              </div>
            </section>
            <section className="space-y-4" aria-label="Histórico de indicações">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="flex items-center gap-2 text-xl font-black sm:text-2xl"><Gift className="h-6 w-6 text-cyan-300"/> HISTÓRICO DE INDICAÇÕES</h2><p className="mt-1 text-xs text-slate-400">Clique em um card para ver os detalhes do pedido.</p></div>
                <button type="button" onClick={()=>void query.refetch()} disabled={query.isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 text-xs font-black text-cyan-200 disabled:opacity-50"><RefreshCw className={"h-4 w-4 "+(query.isFetching?"animate-spin":"")}/> ATUALIZAR</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {([["todas","TODAS",details?.historyCount||0],["aguardando_agendamento","A LIBERAR",details?.pendingCount||0],["liberada","LIBERADAS",details?.releasedCount||0],["paga","PAGAS",details?.paidCount||0],["nao_elegivel","NÃO VÁLIDAS",details?.invalidCount||0]] as const).map(([key,label,count])=>(
                  <button key={key} type="button" onClick={()=>setFilter(key)} aria-pressed={filter===key} className={"min-h-10 rounded-xl border px-3 py-2 text-[11px] font-black tracking-wide transition sm:px-4 "+(filter===key?"border-cyan-300 bg-cyan-500/20 text-cyan-100 shadow-[0_0_14px_rgba(6,182,212,.15)]":"border-white/10 bg-white/5 text-slate-300 hover:border-white/30")}>{label} <span className="ml-1 opacity-70">{count}</span></button>
                ))}
              </div>
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/15 bg-[#0d1729] px-4 focus-within:border-cyan-400/60">
                <Search className="h-5 w-5 shrink-0 text-cyan-300"/><span className="sr-only">Buscar indicação por cliente, pedido ou status</span>
                <input value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500" placeholder="Buscar cliente, número do pedido ou status..."/>
              </label>
              {visible.length===0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-12 text-center">
                  <Gift className="mx-auto h-10 w-10 text-slate-500"/>
                  <p className="mt-3 font-bold">Nenhuma indicação encontrada</p>
                  <p className="mt-1 text-sm text-slate-400">Experimente outro filtro ou atualize a consulta.</p>
                </div>
              ) : <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{visible.map((item,index)=>{
                const state=item.commissionState as Exclude<Filter,"todas">;
                const style=styles[state]||styles.aguardando_agendamento;
                const promotional=Boolean(item.promotionNoCommission);
                const Icon=style.icon;
                const open=expanded===item.registrationId;
                return <article key={item.registrationId} className={"overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br "+style.accent+" via-[#0c1326] to-[#0a0e1e] shadow-[0_16px_42px_rgba(0,0,0,.18)]"}>
                  <button type="button" onClick={()=>setExpanded(open?null:item.registrationId)} aria-expanded={open} className="flex w-full flex-col gap-4 p-4 text-left sm:p-5">
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400"><Users className="h-3.5 w-3.5"/> INDICAÇÃO {index+1}</span>
                      <span className={"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black "+style.pill}><Icon className="h-3.5 w-3.5"/>{promotional?"PROMOÇÃO — SEM COMISSÃO":titleByState[state]||"EM ANÁLISE"}</span>
                    </div>
                    <div className="w-full"><h3 className="break-words text-lg font-black text-white sm:text-xl">{item.customerName}</h3><p className="mt-1 text-xs font-medium text-slate-400">Pedido {item.orderNumber?"#"+item.orderNumber:"em acompanhamento"}</p></div>
                    <div className="flex w-full items-end justify-between gap-3 border-t border-white/10 pt-4">
                      <div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Comissão</p><p className="mt-1 text-2xl font-black text-white">{money(promotional?0:item.commissionValue)}</p></div>
                      <span className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">DETALHES {open?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</span>
                    </div>
                  </button>
                  {open&&<div className="space-y-3 border-t border-white/10 bg-black/20 px-4 py-4 text-sm sm:px-5">
                    <div><p className="text-xs font-semibold uppercase text-slate-400">Cliente indicado</p><p className="mt-1 font-bold text-white">{item.customerName}</p></div>
                    <div><p className="text-xs font-semibold uppercase text-slate-400">Status do pedido</p><p className="mt-1 font-bold text-slate-200">{item.orderStatus}</p></div>
                    <div><p className="text-xs font-semibold uppercase text-slate-400">Situação da comissão</p><p className="mt-1 font-bold text-white">{item.commissionLabel}</p></div>
                    <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-slate-300">{promotional?"Este pedido foi realizado em promoção. A indicação fica no histórico, mas não gera comissão e não entra na contagem válida.":state==="paga"?"Pagamento confirmado pela equipe.":state==="liberada"?"Valor liberado para pagamento.":state==="nao_elegivel"?"Esta indicação não está apta para comissão.":"Aguardando liberação conforme o andamento do pedido."}</p>
                  </div>}
                </article>;
              })}</div>}
            </section>
            <footer className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-xs leading-relaxed text-slate-400"><ShieldCheck className="mx-auto mb-2 h-5 w-5 text-emerald-300"/>Seus valores são atualizados conforme as comissões registradas no H2 Colombiano. A situação <strong>liberado</strong> não significa <strong>pago</strong>.</footer>
          </>
        )}
      </div>
    </main>
  );
}
