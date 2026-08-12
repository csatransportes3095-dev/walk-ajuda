import { Search, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";

type Client = { id: number | string; name: string; phone?: string | null; isActive?: number | boolean | null };

function normalized(value: unknown) { return String(value || "").toLocaleLowerCase("pt-BR").replace(/\D/g, ""); }

export function ClientSearchPicker({ clients, value, onChange, required = true }: { clients: Client[]; value: string; onChange: (clientId: string) => void; required?: boolean }) {
  const [search, setSearch] = useState("");
  const activeClients = clients.filter((client) => client.isActive === undefined || Number(client.isActive) === 1);
  const digits = normalized(search);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const matches = activeClients.filter((client) => !term || String(client.name || "").toLocaleLowerCase("pt-BR").includes(term) || (digits && normalized(client.phone).includes(digits))).slice(0, 8);
  const selected = activeClients.find((client) => String(client.id) === String(value));

  return <div className="space-y-2"><label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-300">Buscar passageiro{required && <span className="ml-1 text-cyan-300">*</span>}</span><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite nome ou telefone" className="pl-9" /></div></label>{selected && <div className="flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-sm"><UserRound className="h-4 w-4 text-cyan-200" /><span className="font-bold text-cyan-100">{selected.name}</span><span className="text-cyan-200/75">• {selected.phone || "Sem telefone"}</span></div>}<div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/70 p-1">{matches.length === 0 ? <p className="px-3 py-3 text-xs text-slate-500">Nenhum passageiro encontrado.</p> : matches.map((client) => <button type="button" key={client.id} onClick={() => { onChange(String(client.id)); setSearch(""); }} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${String(client.id) === String(value) ? "bg-cyan-500/20 text-cyan-100" : "text-slate-200 hover:bg-white/5"}`}><span className="min-w-0 truncate font-bold">{client.name}</span><span className="flex-none text-xs text-slate-400">{client.phone || "Sem telefone"}</span></button>)}</div><p className="text-[11px] text-slate-500">Pesquise pelo nome ou telefone e toque no passageiro para selecionar.</p></div>;
}
