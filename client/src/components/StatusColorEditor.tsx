import { normalizeHex, statusSelectionStyle, type StatusColorSelection } from "@/lib/statusCustomColors";

const QUICK_COLORS = [
  "#3b82f6", "#06b6d4", "#10b981", "#22c55e", "#84cc16", "#eab308",
  "#f97316", "#ef4444", "#ec4899", "#a855f7", "#6366f1", "#64748b",
];

type Props = {
  value: StatusColorSelection;
  onChange: (value: StatusColorSelection) => void;
};

export default function StatusColorEditor({ value, onChange }: Props) {
  const update = (patch: Partial<StatusColorSelection>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/35 mb-2">Atalhos de cor</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              onClick={() => update({ primary: color })}
              className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${normalizeHex(value.primary) === color ? "border-white scale-110" : "border-white/15"}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Cor 1</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={normalizeHex(value.primary)}
              onChange={(event) => update({ primary: event.target.value })}
              className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
            />
            <input
              value={value.primary}
              onChange={(event) => update({ primary: event.target.value })}
              onBlur={() => update({ primary: normalizeHex(value.primary) })}
              maxLength={7}
              className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0d0d1a] px-3 text-xs font-mono uppercase text-white outline-none focus:border-primary/70"
              placeholder="#3B82F6"
            />
          </div>
        </div>

        {value.split && (
          <div className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Cor 2</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={normalizeHex(value.secondary, "#ef4444")}
                onChange={(event) => update({ secondary: event.target.value })}
                className="h-10 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent p-1"
              />
              <input
                value={value.secondary}
                onChange={(event) => update({ secondary: event.target.value })}
                onBlur={() => update({ secondary: normalizeHex(value.secondary, "#ef4444") })}
                maxLength={7}
                className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0d0d1a] px-3 text-xs font-mono uppercase text-white outline-none focus:border-primary/70"
                placeholder="#EF4444"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => update({ split: false })}
          className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${!value.split ? "border-primary bg-primary/20 text-white" : "border-white/10 bg-white/5 text-white/45"}`}
        >
          1 COR
        </button>
        <button
          type="button"
          onClick={() => update({ split: true })}
          className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${value.split ? "border-primary bg-primary/20 text-white" : "border-white/10 bg-white/5 text-white/45"}`}
        >
          2 CORES 50/50
        </button>
      </div>

      <div
        className="flex h-14 items-center justify-center rounded-xl border-2 px-3 text-xs font-black tracking-wider text-white shadow-inner"
        style={statusSelectionStyle(value)}
      >
        {value.split ? "PREVIEW • METADE / METADE" : "PREVIEW • COR ÚNICA"}
      </div>
    </div>
  );
}
