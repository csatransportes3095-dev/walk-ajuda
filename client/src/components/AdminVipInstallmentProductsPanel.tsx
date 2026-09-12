import { useMemo, useState } from "react";
import { PackageCheck, Save, Search, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type TriState = "inherit" | "yes" | "no";

type FormState = {
  enabled: boolean;
  minOrder: string;
  maxInstallments: string;
  interestPercent: string;
  allowDaily: TriState;
  allowWeekly: TriState;
  allowMonthly: TriState;
  notes: string;
};

function centsToInput(value: number | null | undefined) {
  if (value == null) return "";
  return (value / 100).toFixed(2).replace(".", ",");
}

function inputToCents(value: string): number | null {
  const raw = String(value || "").trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")
    : raw.replace(/[^0-9.-]/g, "");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric * 100);
}

function triFrom(value: boolean | null | undefined): TriState {
  if (value == null) return "inherit";
  return value ? "yes" : "no";
}

function triTo(value: TriState): boolean | null {
  if (value === "inherit") return null;
  return value === "yes";
}

export default function AdminVipInstallmentProductsPanel() {
  const utils = trpc.useUtils();
  const rulesQuery = trpc.vipInstallments.adminProductRules.useQuery(undefined, {
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({
    enabled: false,
    minOrder: "",
    maxInstallments: "",
    interestPercent: "",
    allowDaily: "inherit",
    allowWeekly: "inherit",
    allowMonthly: "inherit",
    notes: "",
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ((rulesQuery.data || []) as any[]).filter((row) => {
      if (!query) return true;
      return String(row.productName || "").toLowerCase().includes(query)
        || String(row.productId || "").includes(query);
    });
  }, [rulesQuery.data, search]);

  const mutation = trpc.vipInstallments.setProductRule.useMutation({
    onSuccess: async () => {
      toast.success("Regra de parcelamento do produto salva.");
      setSelectedId(null);
      await utils.vipInstallments.adminProductRules.invalidate();
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar a regra do produto."),
  });

  const open = (row: any) => {
    setSelectedId(Number(row.productId));
    setForm({
      enabled: Boolean(row.enabled),
      minOrder: centsToInput(row.minOrderCents),
      maxInstallments: row.maxInstallments == null ? "" : String(row.maxInstallments),
      interestPercent: row.interestBps == null ? "" : String(Number(row.interestBps) / 100).replace(".", ","),
      allowDaily: triFrom(row.allowDaily),
      allowWeekly: triFrom(row.allowWeekly),
      allowMonthly: triFrom(row.allowMonthly),
      notes: String(row.notes || ""),
    });
  };

  const selected = rows.find((row) => Number(row.productId) === selectedId)
    || ((rulesQuery.data || []) as any[]).find((row) => Number(row.productId) === selectedId)
    || null;

  const save = () => {
    if (!selected) return;
    const maxInstallments = form.maxInstallments.trim() ? Number(form.maxInstallments) : null;
    const interest = form.interestPercent.trim() ? Number(form.interestPercent.replace(",", ".")) : null;
    const minOrderCents = inputToCents(form.minOrder);

    if (maxInstallments != null && (!Number.isInteger(maxInstallments) || maxInstallments < 2 || maxInstallments > 120)) {
      toast.error("Máximo de parcelas inválido.");
      return;
    }
    if (interest != null && (!Number.isFinite(interest) || interest < 0 || interest > 1000)) {
      toast.error("Juros do produto inválido.");
      return;
    }
    if (form.minOrder.trim() && minOrderCents == null) {
      toast.error("Valor mínimo inválido.");
      return;
    }

    mutation.mutate({
      productId: Number(selected.productId),
      enabled: form.enabled,
      minOrderCents,
      maxInstallments,
      interestBps: interest == null ? null : Math.round(interest * 100),
      allowDaily: triTo(form.allowDaily),
      allowWeekly: triTo(form.allowWeekly),
      allowMonthly: triTo(form.allowMonthly),
      notes: form.notes.trim() || null,
    });
  };

  const inputClass = "mt-2 w-full rounded-xl border border-white/15 bg-slate-950/85 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-cyan-300/60";

  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <PackageCheck className="h-5 w-5" />
            <h3 className="text-lg font-black">Produtos liberados</h3>
          </div>
          <p className="mt-1 text-xs text-slate-400">Por segurança, todos começam OFF. Ative somente os produtos que poderão usar Parcelamento VIP.</p>
        </div>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase text-cyan-200">
          {rows.filter((row) => row.enabled).length} ativos
        </span>
      </div>

      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto" className="w-full rounded-xl border border-white/10 bg-slate-950/80 py-2.5 pl-10 pr-3 text-sm font-semibold text-white outline-none focus:border-cyan-300/50" />
      </div>

      <div className="mt-4 grid gap-2">
        {rulesQuery.isLoading ? (
          <p className="py-5 text-center text-sm text-slate-500">Carregando produtos...</p>
        ) : rows.length === 0 ? (
          <p className="py-5 text-center text-sm text-slate-500">Nenhum produto encontrado.</p>
        ) : rows.map((row) => (
          <div key={row.productId} className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-3 ${row.enabled ? "border-cyan-400/30 bg-cyan-500/[0.07]" : "border-white/10 bg-black/15"}`}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-black text-white">{row.productName}</p>
                {!row.isActive && <span className="rounded-full border border-slate-500/30 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">Produto inativo</span>}
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${row.enabled ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-slate-500/25 bg-slate-500/10 text-slate-400"}`}>
                  Parcelamento {row.enabled ? "ON" : "OFF"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">ID {row.productId}{row.maxInstallments ? ` • até ${row.maxInstallments}x` : " • parcelas herdadas"}{row.interestBps != null ? ` • ${Number(row.interestBps) / 100}%` : " • juros herdados"}</p>
            </div>
            <button type="button" onClick={() => open(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-200">
              <Settings2 className="h-3.5 w-3.5" /> Configurar
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4">
          <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[26px] border border-cyan-400/35 bg-[#07111a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-300">Regra por produto</p>
                <h3 className="mt-1 text-xl font-black text-white">{selected.productName}</h3>
                <p className="mt-1 text-xs text-slate-500">Produto #{selected.productId}</p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} disabled={mutation.isPending} className="rounded-lg bg-white/5 p-2 text-slate-400"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 flex items-center justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4">
                <div><p className="font-black text-white">Permitir Parcelamento VIP</p><p className="mt-1 text-xs text-slate-400">OFF impede este produto mesmo quando cliente e sistema estiverem liberados.</p></div>
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((value) => ({ ...value, enabled: event.target.checked }))} className="h-5 w-5 accent-cyan-400" />
              </label>
              <label className="text-[11px] font-black uppercase text-slate-300">Valor mínimo da compra<input value={form.minOrder} onChange={(event) => setForm((value) => ({ ...value, minOrder: event.target.value }))} placeholder="Vazio = sem mínimo" className={inputClass} /></label>
              <label className="text-[11px] font-black uppercase text-slate-300">Máximo de parcelas<input type="number" min={2} max={120} value={form.maxInstallments} onChange={(event) => setForm((value) => ({ ...value, maxInstallments: event.target.value }))} placeholder="Herdar regra global/cliente" className={inputClass} /></label>
              <label className="sm:col-span-2 text-[11px] font-black uppercase text-slate-300">Juros deste produto (%)<input inputMode="decimal" value={form.interestPercent} onChange={(event) => setForm((value) => ({ ...value, interestPercent: event.target.value }))} placeholder="Vazio = herdar" className={inputClass} /></label>
              {([['allowDaily','Diário'],['allowWeekly','Semanal'],['allowMonthly','Mensal']] as const).map(([key, label]) => (
                <label key={key} className="text-[11px] font-black uppercase text-slate-300">{label}<select value={form[key]} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value as TriState }))} className={inputClass}><option value="inherit">Herdar</option><option value="yes">Permitir</option><option value="no">Bloquear</option></select></label>
              ))}
              <label className="sm:col-span-2 text-[11px] font-black uppercase text-slate-300">Observação<textarea rows={2} value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} className={inputClass} /></label>
              <div className="sm:col-span-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs text-amber-100">
                Ativar este produto não libera ninguém sozinho. Ainda será obrigatório: VIP ativo + permissão individual do ADM + sistema global ON + nenhuma dívida aberta.
              </div>
              <button type="button" onClick={save} disabled={mutation.isPending} className="sm:col-span-2 inline-flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black uppercase text-cyan-950 disabled:opacity-50">
                <Save className="h-4 w-4" /> {mutation.isPending ? "Salvando..." : "Salvar regra do produto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
