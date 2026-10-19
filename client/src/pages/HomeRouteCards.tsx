import { Link } from "wouter";
import { ClipboardList, PackageCheck, Wallet, HandCoins, ArrowUpRight } from "lucide-react";

export const HOME_ROUTE_CARDS = [
  { label:"FAZER PEDIDO", description:"Escolha seus serviços e acompanhe a contratação", href:"/login", Icon:ClipboardList, color:"border-violet-400/40 from-violet-700/45 to-indigo-950/80", iconColor:"text-violet-300" },
  { label:"ACOMPANHAR PEDIDO", description:"Consulte o andamento do seu pedido", href:"/acompanhar", Icon:PackageCheck, color:"border-cyan-400/40 from-cyan-700/40 to-sky-950/80", iconColor:"text-cyan-300" },
  { label:"PLANILHA DE GASTOS", description:"Controle de ganhos e despesas", href:"/gastos", Icon:Wallet, color:"border-emerald-400/40 from-emerald-700/40 to-green-950/80", iconColor:"text-emerald-300" },
  { label:"EMPRÉSTIMO", description:"Consulte os serviços de empréstimo", href:"/emprestimo", Icon:HandCoins, color:"border-amber-400/40 from-amber-700/40 to-orange-950/80", iconColor:"text-amber-300" },
] as const;

/** Public route selector only. Each service keeps its own existing access gate. */
export default function HomeRouteCards() {
  return (
    <main className="min-h-screen bg-[#060916] px-4 py-10 text-white sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 text-center sm:mb-12">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[.23em] text-cyan-300">Bem-vindo ao site</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">H2 COLOMBIANO</h1>
          <p className="mt-3 text-sm text-slate-300 sm:text-base">Selecione abaixo o serviço que deseja acessar.</p>
        </header>
        <nav aria-label="Rotas do H2 Colombiano" className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {HOME_ROUTE_CARDS.map(({label,description,href,Icon,color,iconColor})=>(
            <Link key={href} href={href} className={`group relative flex min-h-[150px] flex-col justify-between rounded-3xl border bg-gradient-to-br p-5 shadow-xl transition hover:-translate-y-1 hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:min-h-[180px] sm:p-7 ${color}`}>
              <div className="flex items-start justify-between">
                <Icon aria-hidden="true" className={`h-9 w-9 sm:h-11 sm:w-11 ${iconColor}`}/>
                <ArrowUpRight aria-hidden="true" className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:-translate-y-1"/>
              </div>
              <div>
                <h2 className="text-lg font-black sm:text-xl">{label}</h2>
                <p className="mt-1 text-sm text-slate-300">{description}</p>
              </div>
            </Link>
          ))}
        </nav>
        <p className="mt-9 text-center text-xs text-slate-500">O acesso a cada serviço segue as regras de segurança do site.</p>
      </div>
    </main>
  );
}
