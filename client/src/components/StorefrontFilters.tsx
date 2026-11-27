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
    <div data-testid="storefront-compact-filters" className="mb-3 space-y-2 sm:mb-8 sm:space-y-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/45" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar serviço, opção ou documento"
          aria-label="Buscar serviço, opção ou documento"
          className="h-11 w-full rounded-xl border border-white/15 bg-slate-950/80 py-2 pl-11 pr-11 sm:h-12 sm:rounded-2xl sm:py-3 sm:pl-12 text-sm font-medium text-white placeholder:text-white/40 outline-none transition-colors focus:border-violet-400"
        />
        {search && (
          <button type="button" onClick={() => onSearchChange("")} aria-label="Limpar busca" className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/55 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>
      <div data-testid="storefront-category-strip" data-category-count={categories.length} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-5" role="group" aria-label="Categorias com produtos disponíveis">
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
              className={`group relative flex min-h-[46px] min-w-0 items-center justify-center rounded-xl border bg-gradient-to-br px-2 py-1.5 text-left text-white transition-all duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] sm:min-h-[104px] sm:flex-col sm:items-start sm:justify-between sm:overflow-hidden sm:rounded-2xl sm:p-4 sm:shadow-lg sm:hover:-translate-y-0.5 ${palette[category] || palette.Outros} ${active ? "ring-1 ring-inset ring-white brightness-110 sm:ring-2 sm:ring-offset-2 sm:ring-offset-slate-950" : "opacity-90"}`}
            >
              <span className="hidden w-full items-center justify-between gap-2 sm:flex">
                <Icon className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden="true" />
                <ArrowUpRight className="h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </span>
              <span className="flex items-center justify-center gap-1 sm:w-full sm:flex-wrap sm:items-end sm:justify-between sm:gap-1.5">
                <span className="text-[12px] font-bold leading-tight sm:text-lg sm:font-black">{category}</span>
                <span className="rounded-full border border-white/25 bg-black/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums sm:px-2 sm:text-[11px]">{count}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs font-semibold text-white/60 sm:text-sm">{resultCount} produto{resultCount !== 1 ? "s" : ""} encontrado{resultCount !== 1 ? "s" : ""}</p>
    </div>
  );
}
