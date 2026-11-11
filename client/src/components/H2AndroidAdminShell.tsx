import type { ReactNode } from "react";
import { Activity, Globe2, LayoutDashboard, Settings, Smartphone, type LucideIcon } from "lucide-react";

export type AndroidAdminSection = "overview" | "devices" | "web" | "activity" | "settings";

const navigation: Array<{ id: AndroidAdminSection; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "devices", label: "Aparelhos", icon: Smartphone },
  { id: "web", label: "Celular HTML", icon: Globe2 },
  { id: "activity", label: "Atividade", icon: Activity },
  { id: "settings", label: "Configurações", icon: Settings },
];

const sectionTitles: Record<AndroidAdminSection, string> = {
  overview: "Visão geral",
  devices: "Aparelhos",
  web: "Celular HTML",
  activity: "Atividade",
  settings: "Configurações",
};

export default function H2AndroidAdminShell({
  children,
  activeSection = "overview",
  onNavigate,
}: {
  children: ReactNode;
  activeSection?: AndroidAdminSection;
  onNavigate?: (section: AndroidAdminSection) => void;
}) {
  const Brand = () => (
    <div className="flex items-center gap-3">
      <div className="relative flex h-11 w-8 shrink-0 items-center justify-center rounded-[11px] border border-[#7ddbb5]/65 bg-[#11221f] text-[#91e4bf]">
        <Smartphone className="h-5 w-5" strokeWidth={1.8} />
        <div className="absolute -bottom-1 left-0.5 right-0.5 flex h-[3px] overflow-hidden rounded-full">
          <span className="w-1/3 bg-[#f1c84b]" />
          <span className="w-1/3 bg-[#3179df]" />
          <span className="w-1/3 bg-[#dc5555]" />
        </div>
      </div>
      <div className="leading-tight">
        <p className="text-[15px] font-extrabold tracking-wide text-[#e9edf2]">H2 Android</p>
        <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#82909e]">Central de controle</p>
      </div>
    </div>
  );

  const NavigationItems = ({ compact = false }: { compact?: boolean }) => (
    <>
      {!compact && <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-[#758291]">Gerenciamento</p>}
      <div className={compact ? "flex gap-2" : "space-y-1"}>
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={!onNavigate}
              onClick={() => onNavigate?.(item.id)}
              aria-current={active ? "page" : undefined}
              className={
                (compact
                  ? "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs "
                  : "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ") +
                (active
                  ? "border-[#315b50] bg-[#18382f] text-[#9ae8c7]"
                  : "border-transparent text-[#94a0ad] hover:bg-white/[0.04] hover:text-[#e9edf2]") +
                (!onNavigate ? " cursor-default" : "")
              }
            >
              <Icon className={compact ? "h-4 w-4" : "h-4 w-4"} strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#0b121c] text-[#e6ebf1] lg:grid lg:grid-cols-[196px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[196px] flex-col border-r border-[#202d3a] bg-[#0e1722] lg:flex">
        <div className="px-4 pb-8 pt-7"><Brand /></div>
        <nav className="px-3"><NavigationItems /></nav>
        <div className="mt-auto px-5 pb-6">
          <div className="mb-2 flex items-center gap-2 text-[10px] text-[#8794a2]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#80dfb8]" />
            Ambiente independente
          </div>
          <p className="text-xs font-bold text-[#dce3ea]">H2 Colombiano</p>
          <p className="mt-1 text-[10px] text-[#788696]">Controle Android · v1.0</p>
        </div>
      </aside>

      <div className="min-h-screen min-w-0 lg:col-start-2">
        <div className="flex items-center justify-between border-b border-[#202d3a] px-4 py-3 lg:hidden">
          <Brand />
          <span className="rounded-full border border-[#334152] bg-[#17212d] px-2.5 py-1 text-[10px] text-[#aab4c0]">Acesso restrito</span>
        </div>
        <header className="flex h-14 items-center justify-between border-b border-[#202d3a] px-4 sm:px-6 lg:px-7">
          <div className="text-xs text-[#8b98a6]">
            <span>Central de controle</span>
            <span className="mx-3 text-[#526071]">/</span>
            <span className="text-[#e1e7ed]">{sectionTitles[activeSection]}</span>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="rounded-full border border-[#344150] bg-[#17212d] px-2.5 py-1 text-[10px] text-[#9ba8b5]">Acesso restrito</span>
            <span className="text-[11px] text-[#96a2ae]">Administrador</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#202d3b] text-[10px] font-bold text-[#d8e1e8]">AD</span>
          </div>
        </header>
        <nav className="overflow-x-auto border-b border-[#202d3a] px-3 py-2.5 lg:hidden">
          <NavigationItems compact />
        </nav>
        <main className="min-h-[calc(100vh-8rem)]">{children}</main>
        <footer className="flex flex-wrap justify-between gap-2 px-4 pb-5 pt-2 text-[10px] text-[#778493] sm:px-6 lg:px-7">
          <span>H2 Colombiano · Android</span>
          <span>Ambiente independente · Acesso administrativo</span>
        </footer>
      </div>
    </div>
  );
}
