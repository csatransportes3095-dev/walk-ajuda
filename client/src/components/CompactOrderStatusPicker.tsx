import { useState, type ReactNode } from "react";
import { ChevronDown, CheckCircle2, Layers } from "lucide-react";
import { groupOrderStatusChoices } from "@/lib/orderCardCompactUtils";

export type OrderStatusOption = {
  key: string;
  label: string;
  bg: string;
  color: string;
  icon: ReactNode;
  appliedAt?: string | null;
};

export default function CompactOrderStatusPicker({
  options, selectedKey, selectedLabel, onSelect,
}: {
  options: OrderStatusOption[];
  selectedKey: string | null | undefined;
  selectedLabel?: string | null;
  onSelect: (key: string) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const groups = groupOrderStatusChoices(options);
  const chosen = options.find(item => item.key === selectedKey);
  const display = chosen?.label || selectedLabel || "Nenhum status selecionado";

  return (
    <div className="space-y-2.5" aria-label="Etapas do pedido">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs text-muted-foreground">Status selecionado:</span>
          <strong className="text-xs text-foreground">{display}</strong>
        </div>
        <span className="text-[10px] text-muted-foreground">Escolha uma etapa para alterar</span>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
          As opções deste produto ainda estão carregando ou não foram configuradas.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {groups.map(group => {
              const expanded = openGroup === group.id;
              const containsSelected = group.items.some(item => item.key === selectedKey);
              return (
                <button
                  key={group.id}
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={"order-stage-" + group.id}
                  onClick={() => setOpenGroup(expanded ? null : group.id)}
                  className={
                    "flex min-h-[52px] items-center justify-between gap-1 rounded-xl border px-2.5 py-2 text-left transition-colors " +
                    (expanded
                      ? "border-primary/80 bg-primary/15 text-foreground shadow-sm"
                      : containsSelected
                        ? "border-emerald-400/45 bg-emerald-500/[0.08] text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground")
                  }
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold leading-tight">{group.icon} {group.label}</span>
                    <span className="mt-0.5 block text-[10px] opacity-70">
                      {group.items.length} status{group.items.length === 1 ? "" : " ·"}
                      {containsSelected ? " · atual" : ""}
                    </span>
                  </span>
                  <ChevronDown className={"h-3.5 w-3.5 shrink-0 transition-transform " + (expanded ? "rotate-180" : "")} />
                </button>
              );
            })}
          </div>

          {groups.filter(group => group.id === openGroup).map(group => (
            <div
              key={group.id}
              id={"order-stage-" + group.id}
              className="max-h-[190px] overflow-y-auto overscroll-contain rounded-xl border border-primary/25 bg-card/40 p-2"
              aria-label={"Status: " + group.label}
            >
              <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold text-foreground">
                <Layers className="h-3.5 w-3.5 text-primary" /> {group.label}
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map(item => {
                  const isSelected = selectedKey === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => { onSelect(item.key); setOpenGroup(null); }}
                      className={
                        "flex min-h-[39px] flex-col items-start justify-center gap-0.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors " +
                        (isSelected
                          ? item.bg + " " + item.color + " border-current ring-1 ring-current"
                          : "border-border bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-foreground")
                      }
                    >
                      <span className="flex items-center gap-1.5 leading-tight">{item.icon}{item.label}</span>
                      {item.appliedAt && (
                        <span className={"text-[10px] font-normal " + (isSelected ? "opacity-70" : "text-green-400/70")}>
                          ✓ {item.appliedAt}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
