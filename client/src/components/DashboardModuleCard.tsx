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

function cardStyle(theme: ModuleTheme, selected: boolean): CSSProperties {
  return {
    background: selected
      ? `radial-gradient(circle at 20% -8%, ${theme.active}95 0%, ${theme.active}38 30%, transparent 58%), linear-gradient(145deg, ${theme.base}f4 0%, #080d1be8 100%)`
      : `radial-gradient(circle at 18% -12%, ${theme.active}48 0%, transparent 46%), linear-gradient(145deg, ${theme.base}df 0%, #080d1bea 100%)`,
    borderColor: selected ? `${theme.active}dd` : `${theme.border}b8`,
    color: selected ? "#ffffff" : theme.icon,
    boxShadow: selected
      ? `0 0 0 1px ${theme.active}55, 0 12px 28px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,.21), inset 0 -16px 28px rgba(0,0,0,.18)`
      : `0 8px 18px rgba(1,5,18,.28), inset 0 1px 0 rgba(255,255,255,.10), inset 0 -14px 24px rgba(0,0,0,.16)`,
    backdropFilter: "blur(11px)",
  };
}

function iconStyle(theme: ModuleTheme, selected: boolean): CSSProperties {
  return {
    color: selected ? "#ffffff" : theme.icon,
    background: `linear-gradient(145deg, ${theme.active}${selected ? "42" : "25"}, rgba(4,10,23,.44))`,
    borderColor: `${theme.icon}${selected ? "8f" : "52"}`,
    boxShadow: selected ? `0 0 16px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,.14)` : `inset 0 1px 0 rgba(255,255,255,.1)`,
  };
}

function CardContents({ label, icon, theme, selected, badge }: Omit<DashboardModuleCardProps, "value">) {
  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-70" />
      <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-12 w-24 rounded-br-full bg-white/[.045] blur-xl" />
      {badge && (
        <span className="absolute right-1.5 top-1.5 rounded-full border border-cyan-50/70 bg-cyan-300 px-1.5 py-0.5 text-[8px] font-black tracking-wider leading-none text-slate-950 shadow-[0_2px_8px_rgba(34,211,238,.4)]">
          {badge}
        </span>
      )}
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200" style={iconStyle(theme, selected)}>
        {icon}
      </span>
      <span className="relative min-w-0 max-w-full text-center whitespace-nowrap">{label}</span>
    </>
  );
}

export function DashboardModuleCard({ value, label, icon, theme, selected, badge }: DashboardModuleCardProps) {
  return (
    <TabsTrigger
      value={value}
      aria-label={`Abrir módulo ${label}`}
      className="relative min-w-0 h-[96px] sm:h-[100px] flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border px-1.5 py-2 font-bold text-[clamp(9px,2.7vw,12px)] uppercase tracking-wide leading-tight transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.98] data-[state=active]:-translate-y-0.5"
      style={cardStyle(theme, selected)}
    >
      <CardContents label={label} icon={icon} theme={theme} selected={selected} badge={badge} />
    </TabsTrigger>
  );
}

type DashboardExternalModuleCardProps = Omit<DashboardModuleCardProps, "value"> & { onClick: () => void };

export function DashboardExternalModuleCard({ label, icon, theme, selected, badge, onClick }: DashboardExternalModuleCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir módulo ${label}`}
      className="relative min-w-0 h-[96px] sm:h-[100px] flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border px-1.5 py-2 font-bold text-[clamp(9px,2.7vw,12px)] uppercase tracking-wide leading-tight transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.98]"
      style={cardStyle(theme, selected)}
    >
      <CardContents label={label} icon={icon} theme={theme} selected={selected} badge={badge} />
    </button>
  );
}

export type { ModuleTheme };
