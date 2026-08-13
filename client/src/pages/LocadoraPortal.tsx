import { LockKeyhole, ArrowRight, Car, ClipboardList, DollarSign } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

const logoFull = "/locadora/assets/locacar-logo-full-v1.webp";
const logoIcon = "/locadora/assets/locacar-icon-192-v1.png";

export default function LocadoraPortal() {
  const [, navigate] = useLocation();
  const tenants = trpc.locadora.tenants.list.useQuery();
  const unavailable = tenants.isError;
  return <main className="min-h-screen bg-[#090a0d] px-4 py-8 text-white sm:py-12">
    <section className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-[#b98a2d]/35 bg-[radial-gradient(circle_at_75%_0%,rgba(185,138,45,0.16),transparent_32%),linear-gradient(145deg,#18191d,#090a0d_55%,#161211)] shadow-2xl shadow-black/50">
      <div className="grid gap-8 border-b border-white/10 p-6 sm:grid-cols-[230px_1fr] sm:items-center sm:p-10">
        <div className="mx-auto w-full max-w-[210px] rounded-3xl border border-[#b98a2d]/25 bg-black/30 p-2 shadow-xl"><img src={logoFull} alt="LocaCar — Sistema de Locação" className="aspect-square w-full rounded-2xl object-contain" /></div>
        <div><div className="mb-4 flex items-center gap-2"><img src={logoIcon} alt="" className="h-8 w-8 rounded-lg object-cover"/><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d9b968]">Módulo integrado</p></div><h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">LOCACAR</h1><p className="mt-1 text-sm font-semibold tracking-[0.18em] text-white/55">SISTEMA DE LOCAÇÃO</p><p className="mt-4 max-w-xl text-sm leading-6 text-white/65">Gestão de clientes, frota, contratos, cobranças, manutenção, multas e equipe em ambiente isolado dentro do H2 Colombiano.</p></div>
      </div>
      <div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8"><Feature icon={Car} title="Frota" text="Veículos, disponibilidade e manutenção"/><Feature icon={ClipboardList} title="Contratos" text="Locações, caução e controle operacional"/><Feature icon={DollarSign} title="Financeiro" text="Cobranças, pagamentos e inadimplência"/></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/25 p-6"><div className="flex items-center gap-2 text-xs text-white/45"><LockKeyhole className="h-3.5 w-3.5 text-[#d9b968]"/>Acesso controlado pelo administrador do H2</div><button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#d4b15a] to-[#a97721] px-4 py-2.5 text-sm font-black text-[#15110b] shadow-lg shadow-[#b98a2d]/15 transition hover:brightness-110" onClick={()=>navigate(unavailable ? "/admin/login" : "/admin/locadora")}>{unavailable?"Entrar no ADM":"Abrir locadora"}<ArrowRight className="h-4 w-4"/></button></div>
    </section>
  </main>;
}
function Feature({icon:Icon,title,text}:{icon:typeof Car;title:string;text:string}){return <div className="rounded-2xl border border-[#b98a2d]/20 bg-white/[0.025] p-4"><Icon className="mb-3 h-5 w-5 text-[#d9b968]"/><h2 className="font-bold text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-white/50">{text}</p></div>}
