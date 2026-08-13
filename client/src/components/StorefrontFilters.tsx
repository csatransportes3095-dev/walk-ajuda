import { Search, X } from "lucide-react";

export function StorefrontFilters({
  search,
  onSearchChange,
  categories,
  activeCategory,
  onCategoryChange,
  resultCount,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categories: string[];
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
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {categories.map((category) => {
          const active = category === activeCategory;
          return (
            <button
              type="button"
              key={category}
              onClick={() => onCategoryChange(category)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-black transition-all ${active ? "border-violet-300 bg-violet-500 text-white shadow-lg shadow-violet-500/25" : "border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:text-white"}`}
            >
              {category}
            </button>
          );
        })}
      </div>
      <p className="text-sm font-semibold text-white/60">{resultCount} produto{resultCount !== 1 ? "s" : ""} encontrado{resultCount !== 1 ? "s" : ""}</p>
    </div>
  );
}
