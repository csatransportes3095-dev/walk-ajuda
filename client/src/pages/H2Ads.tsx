import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  CircleAlert,
  Globe2,
  LockKeyhole,
  MapPin,
  Monitor,
  Network,
  Plus,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

const H2ADS_LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663911003862/NUtvqlTplGBXXVCr.png";

const capabilities = [
  {
    icon: Globe2,
    title: "Perfis isolados",
    description: "Cada instância terá armazenamento próprio, sem partilha de cookies ou dados de navegação.",
    tone: "text-[#F5B800] bg-[#F5B800]/10 border-[#F5B800]/20",
  },
  {
    icon: Network,
    title: "Saída validada",
    description: "O painel exibirá IP público, localização aproximada, ASN/ISP, latência e última verificação.",
    tone: "text-[#148CFF] bg-[#148CFF]/10 border-[#148CFF]/20",
  },
  {
    icon: ShieldCheck,
    title: "Regra fail-closed",
    description: "Sem proxy saudável, nenhuma sessão de navegador poderá iniciar ou continuar navegando.",
    tone: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  },
];

export default function H2Ads() {
  const [, setLocation] = useLocation();

  const showSetupMessage = () => {
    toast.info("A criação de instâncias será liberada após a configuração isolada da infraestrutura de navegador.");
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#06070A] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_-5%,rgba(245,184,0,0.18),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(20,140,255,0.16),transparent_28%),radial-gradient(circle_at_78%_100%,rgba(232,66,66,0.10),transparent_30%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(255,255,255,.55)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.55)_1px,transparent_1px)] [background-size:42px_42px]" />

      <header className="relative border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setLocation("/admin/codes")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-[#F5B800]/40 hover:bg-[#F5B800]/10 hover:text-[#FFE37A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5B800]"
              aria-label="Voltar ao painel administrativo"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <img src={H2ADS_LOGO} alt="H2 Colombia" className="h-11 w-11 rounded-xl border border-[#F5B800]/45 object-cover shadow-[0_0_24px_rgba(245,184,0,0.22)]" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#FFE37A]">H2 Colombia</p>
              <h1 className="truncate text-lg font-black tracking-tight text-white sm:text-xl">H2 ADS <span className="font-medium text-slate-400">· Browser Hub</span></h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[#F5B800]/25 bg-[#F5B800]/10 px-3 py-1.5 text-xs font-bold text-[#FFE37A] sm:flex">
            <LockKeyhole className="h-3.5 w-3.5" />
            Acesso administrativo
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <section className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#148CFF]/25 bg-[#148CFF]/10 px-3 py-1.5 text-xs font-bold text-[#8CC8FF]">
              <Activity className="h-3.5 w-3.5" />
              Painel de instâncias autorizado
            </div>
            <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight text-white sm:text-4xl">Gerencie perfis, conexões e saúde de cada instância.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              O H2 ADS é um módulo interno e isolado. Não utiliza cadastros de clientes, pedidos, empréstimos, gastos ou regras operacionais das demais áreas.
            </p>
          </div>

          <div className="rounded-2xl border border-[#F5B800]/25 bg-gradient-to-br from-[#171208]/90 to-[#101823]/90 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.3)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFE37A]">Estado da infraestrutura</p>
                <p className="mt-1 text-sm font-semibold text-white">Preparação inicial</p>
              </div>
              <CircleAlert className="h-5 w-5 text-[#F5B800]" />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">Nenhum proxy, segredo ou navegador remoto foi configurado nesta versão inicial.</p>
          </div>
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          {capabilities.map(({ icon: Icon, title, description, tone }) => (
            <article key={title} className="rounded-2xl border border-white/8 bg-[#10131A]/85 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.16)] backdrop-blur-sm">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tone}`}><Icon className="h-5 w-5" /></div>
              <h3 className="mt-4 text-sm font-black text-white">{title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-slate-400">{description}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0D1016]/90 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FFE37A]">Instâncias de navegador</p>
              <h3 className="mt-1 text-xl font-black text-white">Nenhuma instância criada</h3>
            </div>
            <button
              type="button"
              onClick={showSetupMessage}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#F5B800] px-4 py-2.5 text-sm font-black text-[#171003] shadow-[0_10px_26px_rgba(245,184,0,0.24)] transition hover:bg-[#FFE37A] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE37A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1016]"
            >
              <Plus className="h-4 w-4" />
              Nova instância
            </button>
          </div>

          <div className="grid min-h-[300px] place-items-center px-5 py-12 text-center">
            <div className="max-w-md">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#148CFF]/25 bg-[#148CFF]/10 text-[#66B5FF] shadow-[0_0_32px_rgba(20,140,255,0.12)]">
                <Monitor className="h-8 w-8" />
              </div>
              <h4 className="mt-5 text-lg font-black text-white">Ambiente isolado em preparação</h4>
              <p className="mt-2 text-sm leading-6 text-slate-400">A criação de perfis, a validação da saída do proxy e a abertura de navegadores serão liberadas somente após a infraestrutura segura estar configurada e testada.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-bold">
                <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-slate-400">0 perfis</span>
                <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-slate-400">0 proxies validados</span>
                <span className="rounded-full border border-[#E84242]/20 bg-[#E84242]/10 px-3 py-1.5 text-[#FF9C9C]">Navegação remota indisponível</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-2">
          <article className="rounded-2xl border border-[#148CFF]/20 bg-[#148CFF]/[0.055] p-5">
            <div className="flex items-center gap-2 text-[#8CC8FF]"><MapPin className="h-4 w-4" /><p className="text-sm font-black">IP e localização</p></div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Quando cada proxy for validado, o painel apresentará o IP de saída, país, cidade/região aproximada, ISP/ASN, latência e última verificação.</p>
          </article>
          <article className="rounded-2xl border border-[#E84242]/20 bg-[#E84242]/[0.055] p-5">
            <div className="flex items-center gap-2 text-[#FF9C9C]"><WifiOff className="h-4 w-4" /><p className="text-sm font-black">Bloqueio por segurança</p></div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Se o proxy falhar ou o IP de saída divergir, a sessão será suspensa. Não haverá continuidade automática por outra rede.</p>
          </article>
        </section>
      </main>
    </div>
  );
}
