import { useMemo, useState } from "react";
import { PackageCheck, Save, Search, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type EntryMode = "none" | "fixed" | "percent";
type FrequencyKey = "daily" | "weekly" | "monthly";

type FrequencyForm = {
  enabled: boolean;
  minInstallments: string;
  maxInstallments: string;
  interestPercent: string;
  entryMode: EntryMode;
  entryValue: string;
};

type FormState = {
  enabled: boolean;
  minOrder: string;
  dailyMode: "all_days" | "mon_sat";
  notes: string;
  daily: FrequencyForm;
  weekly: FrequencyForm;
  monthly: FrequencyForm;
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

function blankFrequency(): FrequencyForm {
  return {
    enabled: false,
    minInstallments: "2",
    maxInstallments: "",
    interestPercent: "",
    entryMode: "none",
    entryValue: "",
  };
}

function rowFrequency(row: any, key: FrequencyKey): FrequencyForm {
  const cap = key[0].toUpperCase() + key.slice(1);
  const ownMin = row[`${key}MinInstallments`];
  const ownMax = row[`${key}MaxInstallments`];
  const ownInterest = row[`${key}InterestBps`];
  const ownEntryMode = row[`${key}EntryMode`];
  const hasOwn = ownMin != null || ownMax != null || ownInterest != null || ownEntryMode != null;

  const min = hasOwn ? ownMin : row.minInstallments;
  const max = hasOwn ? ownMax : row.maxInstallments;
  const interest = hasOwn ? ownInterest : row.interestBps;
  const entryMode = (hasOwn ? ownEntryMode : row.entryMode) as EntryMode | null;
  const fixed = hasOwn ? row[`${key}EntryFixedCents`] : row.entryFixedCents;
  const percent = hasOwn ? row[`${key}EntryPercentBps`] : row.entryPercentBps;

  return {
    enabled: Boolean(row[`allow${cap}`]),
    minInstallments: min == null ? "2" : String(min),
    maxInstallments: max == null ? "" : String(max),
    interestPercent: interest == null ? "" : String(Number(interest) / 100).replace(".", ","),
    entryMode: entryMode === "fixed" || entryMode === "percent" ? entryMode : "none",
    entryValue: entryMode === "fixed"
      ? centsToInput(fixed)
      : entryMode === "percent"
        ? String(Number(percent || 0) / 100).replace(".", ",")
        : "",
  };
}

function parseFrequency(label: string, value: FrequencyForm) {
  if (!value.enabled) {
    return {
      enabled: false,
      minInstallments: null,
      maxInstallments: null,
      interestBps: null,
      entryMode: null,
      entryFixedCents: null,
      entryPercentBps: null,
    };
  }

  const min = Number(value.minInstallments);
  const max = Number(value.maxInstallments);
  const interest = Number(value.interestPercent.replace(",", "."));
  if (!Number.isInteger(min) || min < 2 || min > 120) throw new Error(`Mínimo de parcelas do ${label} inválido.`);
  if (!Number.isInteger(max) || max < min || max > 120) throw new Error(`Máximo de parcelas do ${label} inválido.`);
  if (!Number.isFinite(interest) || interest < 0 || interest > 1000) throw new Error(`Juros do ${label} inválido.`);

  let entryFixedCents: number | null = null;
  let entryPercentBps: number | null = null;
  if (value.entryMode !== "none") {
    const entry = Number(value.entryValue.replace(",", "."));
    if (!Number.isFinite(entry) || entry <= 0) throw new Error(`Entrada do ${label} inválida.`);
    if (value.entryMode === "percent" && entry >= 100) throw new Error(`Entrada percentual do ${label} deve ser menor que 100%.`);
    if (value.entryMode === "fixed") entryFixedCents = Math.round(entry * 100);
    if (value.entryMode === "percent") entryPercentBps = Math.round(entry * 100);
  }

  return {
    enabled: true,
    minInstallments: min,
    maxInstallments: max,
    interestBps: Math.round(interest * 100),
    entryMode: value.entryMode,
    entryFixedCents,
    entryPercentBps,
  };
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
    dailyMode: "all_days",
    notes: "",
    daily: blankFrequency(),
    weekly: blankFrequency(),
    monthly: blankFrequency(),
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
      toast.success("Regras do produto salvas.");
      setSelectedId(null);
      await utils.vipInstallments.adminProductRules.invalidate();
    },
    onError: (error) => toast.error(error.message || "Não foi possível salvar as regras do produto."),
  });

  const open = (row: any) => {
    setSelectedId(Number(row.productId));
    setForm({
      enabled: Boolean(row.enabled),
      minOrder: centsToInput(row.minOrderCents),
      dailyMode: row.dailyMode === "mon_sat" ? "mon_sat" : "all_days",
      notes: String(row.notes || ""),
      daily: rowFrequency(row, "daily"),
      weekly: rowFrequency(row, "weekly"),
      monthly: rowFrequency(row, "monthly"),
    });
  };

  const selected = rows.find((row) => Number(row.productId) === selectedId)
    || ((rulesQuery.data || []) as any[]).find((row) => Number(row.productId) === selectedId)
    || null;

  const save = () => {
    if (!selected) return;

    const minOrderCents = inputToCents(form.minOrder);
    if (form.minOrder.trim() && minOrderCents == null) {
      toast.error("Valor mínimo inválido.");
      return;
    }

    let daily;
    let weekly;
    let monthly;
    try {
      daily = parseFrequency("Diário", form.daily);
      weekly = parseFrequency("Semanal", form.weekly);
      monthly = parseFrequency("Mensal", form.monthly);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }

    if (!daily.enabled && !weekly.enabled && !monthly.enabled) {
      toast.error("Ative pelo menos uma modalidade.");
      return;
    }

    mutation.mutate({
      productId: Number(selected.productId),
      enabled: form.enabled,
      minOrderCents,

      // Legado zerado: a partir desta gravação cada modalidade trabalha isoladamente.
      minInstallments: null,
      maxInstallments: null,
      interestBps: null,
      entryMode: null,
      entryFixedCents: null,
      entryPercentBps: null,

      allowDaily: daily.enabled,
      allowWeekly: weekly.enabled,
      allowMonthly: monthly.enabled,

      dailyMinInstallments: daily.minInstallments,
      dailyMaxInstallments: daily.maxInstallments,
      dailyInterestBps: daily.interestBps,
      dailyEntryMode: daily.entryMode,
      dailyEntryFixedCents: daily.entryFixedCents,
      dailyEntryPercentBps: daily.entryPercentBps,

      weeklyMinInstallments: weekly.minInstallments,
      weeklyMaxInstallments: weekly.maxInstallments,
      weeklyInterestBps: weekly.interestBps,
      weeklyEntryMode: weekly.entryMode,
      weeklyEntryFixedCents: weekly.entryFixedCents,
      weeklyEntryPercentBps: weekly.entryPercentBps,

      monthlyMinInstallments: monthly.minInstallments,
      monthlyMaxInstallments: monthly.maxInstallments,
      monthlyInterestBps: monthly.interestBps,
      monthlyEntryMode: monthly.entryMode,
      monthlyEntryFixedCents: monthly.entryFixedCents,
      monthlyEntryPercentBps: monthly.entryPercentBps,

      dailyMode: form.dailyMode,
      notes: form.notes.trim() || null,
    });
  };

  const inputClass = "mt-2 w-full rounded-xl border border-white/15 bg-slate-950/85 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-cyan-300/60";

  const frequencyCard = (key: FrequencyKey, title: string, subtitle: string) => {
    const value = form[key];
    return (
      <div className={`rounded-2xl border p-4 ${value.enabled ? "border-cyan-400/30 bg-cyan-500/[0.07]" : "border-white/10 bg-black/20"}`}>
        <label className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase text-white">{title}</p>
            <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>
          </div>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => setForm((current) => ({ ...current, [key]: { ...current[key], enabled: event.target.checked } }))}
            className="h-5 w-5 accent-cyan-400"
          />
        </label>

        {value.enabled && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-black uppercase text-slate-300">Mínimo de parcelas
              <input type="number" min={2} max={120} value={value.minInstallments} onChange={(event) => setForm((current) => ({ ...current, [key]: { ...current[key], minInstallments: event.target.value } }))} className={inputClass} />
            </label>
            <label className="text-[10px] font-black uppercase text-slate-300">Máximo de parcelas
              <input type="number" min={2} max={120} value={value.maxInstallments} onChange={(event) => setForm((current) => ({ ...current, [key]: { ...current[key], maxInstallments: event.target.value } }))} className={inputClass} />
            </label>
            <label className="text-[10px] font-black uppercase text-slate-300">Juros (%)
              <input inputMode="decimal" value={value.interestPercent} onChange={(event) => setForm((current) => ({ ...current, [key]: { ...current[key], interestPercent: event.target.value } }))} placeholder="Ex.: 15" className={inputClass} />
            </label>
            <label className="text-[10px] font-black uppercase text-slate-300">Entrada
              <select value={value.entryMode} onChange={(event) => setForm((current) => ({ ...current, [key]: { ...current[key], entryMode: event.target.value as EntryMode, entryValue: "" } }))} className={inputClass}>
                <option value="none">Sem entrada especial</option>
                <option value="fixed">Valor fixo (R$)</option>
                <option value="percent">Percentual (%)</option>
              </select>
            </label>
            {value.entryMode !== "none" && (
              <label className="sm:col-span-2 text-[10px] font-black uppercase text-slate-300">
                {value.entryMode === "fixed" ? "Valor pago hoje (R$)" : "Percentual pago hoje (%)"}
                <input inputMode="decimal" value={value.entryValue} onChange={(event) => setForm((current) => ({ ...current, [key]: { ...current[key], entryValue: event.target.value } }))} className={inputClass} />
              </label>
            )}
            {key === "daily" && (
              <label className="sm:col-span-2 text-[10px] font-black uppercase text-slate-300">Dias de cobrança
                <select value={form.dailyMode} onChange={(event) => setForm((current) => ({ ...current, dailyMode: event.target.value as "all_days" | "mon_sat" }))} className={inputClass}>
                  <option value="all_days">Todos os dias</option>
                  <option value="mon_sat">Segunda a sábado</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <PackageCheck className="h-5 w-5" />
            <h3 className="text-lg font-black">Produtos liberados</h3>
          </div>
          <p className="mt-1 text-xs text-slate-400">Cada modalidade possui sua própria regra financeira. Diário, Semanal e Mensal não compartilham juros, parcelas ou entrada.</p>
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
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${row.enabled ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-slate-500/25 bg-slate-500/10 text-slate-400"}`}>
                  Parcelamento {row.enabled ? "ON" : "OFF"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                ID {row.productId}
                {row.allowDaily ? " • Diário" : ""}
                {row.allowWeekly ? " • Semanal" : ""}
                {row.allowMonthly ? " • Mensal" : ""}
              </p>
            </div>
            <button type="button" onClick={() => open(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-200">
              <Settings2 className="h-3.5 w-3.5" /> Configurar
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-cyan-400/35 bg-[#07111a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-300">Regra financeira por produto</p>
                <h3 className="mt-1 text-xl font-black text-white">{selected.productName}</h3>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} disabled={mutation.isPending} className="rounded-lg bg-white/5 p-2 text-slate-400"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] p-4">
                <div><p className="font-black text-white">Permitir Parcelamento VIP</p><p className="mt-1 text-xs text-slate-400">Chave geral deste produto.</p></div>
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((value) => ({ ...value, enabled: event.target.checked }))} className="h-5 w-5 accent-cyan-400" />
              </label>

              <label className="block text-[11px] font-black uppercase text-slate-300">Valor mínimo da compra
                <input value={form.minOrder} onChange={(event) => setForm((value) => ({ ...value, minOrder: event.target.value }))} placeholder="Vazio = sem mínimo" className={inputClass} />
              </label>

              {frequencyCard("daily", "Diário", "Quantidade, juros e entrada exclusivos do Diário.")}
              {frequencyCard("weekly", "Semanal", "Quantidade, juros e entrada exclusivos do Semanal.")}
              {frequencyCard("monthly", "Mensal", "Quantidade, juros e entrada exclusivos do Mensal.")}

              <label className="block text-[11px] font-black uppercase text-slate-300">Observação
                <textarea rows={2} value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} className={inputClass} />
              </label>

              <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs text-amber-100">
                Alterar juros, entrada ou parcelas de uma modalidade não altera nenhuma das outras.
              </div>

              <button type="button" onClick={save} disabled={mutation.isPending} className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black uppercase text-cyan-950 disabled:opacity-50">
                <Save className="h-4 w-4" /> {mutation.isPending ? "Salvando..." : "Salvar regras do produto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
