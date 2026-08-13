import { Building2, LockKeyhole, ArrowRight, Car, ClipboardList, DollarSign } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function LocadoraPortal() {
  const [, navigate] = useLocation();
  const tenants = trpc.locadora.tenants.list.useQuery();
  const unavailable = tenants.isError;
  return <main className="min-h-screen bg-[#07111f] px-4 py-10 text-white">
    <section className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-sky-400/20 bg-gradient-to-br from-slate-900 via-[#0c1d32] to-slate-950 shadow-2xl">
      <div className="border-b border-white/10 p-7 sm:p-10"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-300/30 bg-sky-400/15 text-sky-200"><Building2 className="h-7 w-7" /></div><p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-300">Módulo integrado</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">LOCADORA</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/60">Gestão de clientes, frota, contratos, cobranças, manutenção, multas e equipe em ambiente isolado dentro do H2 Colombiano.</p></div>
      <div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8"><Feature icon={Car} title="Frota" text="Veículos, disponibilidade e manutenção"/><Feature icon={ClipboardList} title="Contratos" text="Locações, caução e controle operacional"/><Feature icon={DollarSign} title="Financeiro" text="Cobranças, pagamentos e inadimplência"/></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/15 p-6"><div className="flex items-center gap-2 text-xs text-white/45"><LockKeyhole className="h-3.5 w-3.5"/>Acesso controlado pelo administrador do H2</div><button className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-black text-slate-950 hover:bg-sky-300" onClick={()=>navigate(unavailable ? "/admin/login" : "/admin/locadora")}>{unavailable?"Entrar no ADM":"Abrir locadora"}<ArrowRight className="h-4 w-4"/></button></div>
    </section>
  </main>;
}
function Feature({icon:Icon,title,text}:{icon:typeof Car;title:string;text:string}){return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><Icon className="mb-3 h-5 w-5 text-sky-300"/><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs leading-5 text-white/50">{text}</p></div>}
