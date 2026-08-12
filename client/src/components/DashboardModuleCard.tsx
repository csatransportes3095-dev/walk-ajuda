import type { CSSProperties, ReactNode } from "react";
import { TabsTrigger } from "@/components/ui/tabs";

type ModuleTheme = {
  base: string;
  active: string;
  border: string;
  icon: string;
  glow: string;
};

type DashboardModuleCardProps = {
  value: string;
  label: string;
  icon: ReactNode;
  theme: ModuleTheme;
  selected: boolean;
  badge?: string;
};

export function DashboardModuleCard({ value, label, icon, theme, selected, badge }: DashboardModuleCardProps) {
  const style = {
    background: selected
      ? `linear-gradient(135deg, ${theme.active} 0%, ${theme.base} 100%)`
      : `linear-gradient(135deg, ${theme.base} 0%, color-mix(in srgb, ${theme.base} 72%, #020617) 100%)`,
    borderColor: selected ? theme.active : theme.border,
    color: selected ? "#ffffff" : theme.icon,
    boxShadow: selected
      ? `0 0 0 1px ${theme.active}, 0 9px 24px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,.16)`
      : `inset 0 1px 0 rgba(255,255,255,.07), 0 5px 12px rgba(0,0,0,.18)`,
  } as CSSProperties;

  return (
    <TabsTrigger
      value={value}
      aria-label={`Abrir módulo ${label}`}
      className="relative min-w-0 h-[104px] sm:h-[108px] flex flex-col items-center justify-center gap-2 rounded-xl border px-1.5 py-2 font-bold text-[clamp(9px,2.7vw,12px)] uppercase tracking-wide leading-tight transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.98] data-[state=active]:-translate-y-0.5"
      style={style}
    >
      {badge && (
        <span className="absolute right-1.5 top-1.5 rounded-full border border-cyan-50/70 bg-cyan-300 px-1.5 py-0.5 text-[8px] font-black tracking-wider leading-none text-slate-950 shadow-[0_2px_8px_rgba(34,211,238,.4)]">
          {badge}
        </span>
      )}
      <span className={`flex h-7 w-7 items-center justify-center transition-all duration-200 ${selected ? "drop-shadow-[0_0_7px_currentColor]" : ""}`}>
        {icon}
      </span>
      <span className="min-w-0 max-w-full text-center whitespace-nowrap">{label}</span>
    </TabsTrigger>
  );
}

type DashboardExternalModuleCardProps = Omit<DashboardModuleCardProps, "value"> & { onClick: () => void };

export function DashboardExternalModuleCard({ label, icon, theme, selected, badge, onClick }: DashboardExternalModuleCardProps) {
  const style = {
    background: selected
      ? `linear-gradient(135deg, ${theme.active} 0%, ${theme.base} 100%)`
      : `linear-gradient(135deg, ${theme.base} 0%, color-mix(in srgb, ${theme.base} 72%, #020617) 100%)`,
    borderColor: selected ? theme.active : theme.border,
    color: selected ? "#ffffff" : theme.icon,
    boxShadow: selected
      ? `0 0 0 1px ${theme.active}, 0 9px 24px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,.16)`
      : `inset 0 1px 0 rgba(255,255,255,.07), 0 5px 12px rgba(0,0,0,.18)`,
  } as CSSProperties;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir módulo ${label}`}
      className="relative min-w-0 h-[104px] sm:h-[108px] flex flex-col items-center justify-center gap-2 rounded-xl border px-1.5 py-2 font-bold text-[clamp(9px,2.7vw,12px)] uppercase tracking-wide leading-tight transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.98]"
      style={style}
    >
      {badge && <span className="absolute right-1.5 top-1.5 rounded-full border border-cyan-50/70 bg-cyan-300 px-1.5 py-0.5 text-[8px] font-black tracking-wider leading-none text-slate-950 shadow-[0_2px_8px_rgba(34,211,238,.4)]">{badge}</span>}
      <span className="flex h-7 w-7 items-center justify-center">{icon}</span>
      <span className="min-w-0 max-w-full text-center whitespace-nowrap">{label}</span>
    </button>
  );
}

export type { ModuleTheme };
