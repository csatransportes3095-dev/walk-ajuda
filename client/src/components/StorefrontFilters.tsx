import { Search, X, Layers3, CarFront, CarTaxiFront, FileText, Sparkles, ArrowUpRight } from "lucide-react";

export function StorefrontFilters({
  search,
  onSearchChange,
  categories,
  categoryCounts,
  activeCategory,
  onCategoryChange,
  resultCount,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categories: string[];
  categoryCounts: Record<string, number>;
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  resultCount: number;
}) {
  return (
    <div className="mb-8 space-y-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/45" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar serviço, opção ou documento"
          className="h-12 w-full rounded-2xl border border-white/15 bg-slate-950/80 py-3 pl-12 pr-11 text-sm font-medium text-white placeholder:text-white/40 outline-none transition-colors focus:border-violet-400"
        />
        {search && (
          <button type="button" onClick={() => onSearchChange("")} aria-label="Limpar busca" className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/55 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Categorias com produtos disponíveis">
        {categories.map((category) => {
          const active = category === activeCategory;
          const count = categoryCounts[category] || 0;
          const icons: Record<string, typeof Layers3> = { Todos: Layers3, Uber: CarFront, "Táxi": CarTaxiFront, Documentos: FileText, "99": CarFront, Outros: Sparkles };
          const Icon = icons[category] || Layers3;
          const palette: Record<string, string> = {
            Todos: "from-violet-600 via-fuchsia-600 to-indigo-700 border-violet-300/70 shadow-violet-500/20",
            Uber: "from-emerald-600 via-emerald-700 to-teal-950 border-emerald-400/60 shadow-emerald-500/20",
            "Táxi": "from-amber-500 via-orange-600 to-amber-950 border-amber-300/60 shadow-orange-500/20",
            Documentos: "from-sky-600 via-blue-700 to-indigo-950 border-sky-300/60 shadow-blue-500/20",
            "99": "from-yellow-500 via-amber-600 to-amber-900 border-yellow-300/60 shadow-yellow-500/20",
            Outros: "from-pink-600 via-rose-700 to-purple-950 border-pink-300/60 shadow-rose-500/20",
          };
          return (
            <button
              type="button"
              key={category}
              aria-pressed={active}
              onClick={() => onCategoryChange(category)}
              className={`group relative flex min-h-[88px] min-w-0 flex-col items-start justify-between overflow-hidden rounded-2xl border bg-gradient-to-br px-3 py-3.5 text-left text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] sm:min-h-[104px] sm:p-4 ${palette[category] || palette.Outros} ${active ? "ring-2 ring-white ring-offset-2 ring-offset-slate-950 brightness-110" : "opacity-90"}`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <Icon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden="true" />
                <ArrowUpRight className="h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </span>
              <span className="flex w-full flex-wrap items-end justify-between gap-1.5">
                <span className="text-base font-black leading-tight sm:text-lg">{category}</span>
                <span className="rounded-full border border-white/25 bg-black/20 px-2 py-0.5 text-[11px] font-bold tabular-nums">{count}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm font-semibold text-white/60">{resultCount} produto{resultCount !== 1 ? "s" : ""} encontrado{resultCount !== 1 ? "s" : ""}</p>
    </div>
  );
}
