import { useState, type FormEvent } from "react";
import { Clock, Save } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MAX_CUSTOMER_SESSION_HOURS, MIN_CUSTOMER_SESSION_HOURS } from "@shared/customerSessionPolicy";

export function AdminCustomerSessionSettings() {
  const utils = trpc.useUtils();
  const policy = trpc.customerPassword.getSessionPolicy.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  // Keep an explicit draft so a background refresh cannot replace an edit.
  const [draft, setDraft] = useState<string | null>(null);
  const [savedHours, setSavedHours] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const update = trpc.customerPassword.updateSessionPolicy.useMutation({
    onMutate: async () => {
      setSaveError(null);
      setSavedHours(null);
      await utils.customerPassword.getSessionPolicy.cancel();
    },
    onSuccess: result => {
      utils.customerPassword.getSessionPolicy.setData(undefined, result);
      setDraft(null);
      setSavedHours(result.hours);
    },
    onError: error => setSaveError(error.message || "Não foi possível salvar o tempo conectado."),
  });

  const value = draft ?? (policy.data ? String(policy.data.hours) : "");
  const hours = Number(value);
  const valid = /^\d+$/.test(value.trim()) && Number.isInteger(hours)
    && hours >= MIN_CUSTOMER_SESSION_HOURS && hours <= MAX_CUSTOMER_SESSION_HOURS;
  const showInvalid = draft !== null && !valid;
  const canSave = !!policy.data && valid && hours !== policy.data.hours && !update.isPending;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    try {
      await update.mutateAsync({ hours });
    } catch { /* The mutation error is displayed without discarding the draft. */ }
  }

  return (
    <section id="tempo-login" aria-labelledby="customer-session-title"
      className="scroll-mt-24 space-y-4 rounded-xl border border-cyan-500/30 bg-[#111128] p-5">
      <h3 id="customer-session-title" className="flex items-center gap-2 text-lg font-bold text-cyan-200">
        <Clock className="h-5 w-5 shrink-0" aria-hidden /> Tempo conectado do cliente
      </h3>
      <p className="text-sm text-slate-300">Defina por quantas horas o cliente permanece conectado após confirmar o código. O padrão inicial é de 30 dias (720 horas), com limite de 90 dias.</p>

      {policy.isPending && <p role="status" className="text-sm text-slate-300">Carregando tempo conectado...</p>}
      {policy.isError && (
        <div className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
          <p role="alert" className="text-sm text-amber-200">Não foi possível carregar o tempo conectado.</p>
          <button type="button" onClick={() => void policy.refetch()} disabled={policy.isFetching}
            className="rounded-lg border border-amber-300/40 px-3 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50">
            {policy.isFetching ? "Consultando..." : "Tentar novamente"}
          </button>
        </div>
      )}
      {policy.data && (
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-cyan-100">Duração atual: <strong>{policy.data.hours} horas.</strong>{policy.data.hours % 24 === 0 && <span> ({policy.data.hours / 24} dias)</span>}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="customer-session-hours" className="mb-1 block text-sm font-semibold text-slate-200">
                Tempo conectado do cliente (horas)
              </label>
              <input id="customer-session-hours" type="number" inputMode="numeric"
                min={MIN_CUSTOMER_SESSION_HOURS} max={MAX_CUSTOMER_SESSION_HOURS} step={1}
                value={value} disabled={update.isPending} required
                aria-invalid={showInvalid || undefined}
                aria-describedby={showInvalid ? "customer-session-range customer-session-invalid" : "customer-session-range"}
                onChange={event => {
                  setDraft(event.target.value);
                  setSaveError(null);
                  setSavedHours(null);
                }}
                className="w-full rounded-lg border border-cyan-500/40 bg-slate-900 px-3 py-3 text-base text-white outline-none focus:border-cyan-300 disabled:opacity-50" />
            </div>
            <button type="submit" disabled={!canSave}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50">
              <Save className="h-4 w-4" aria-hidden /> {update.isPending ? "Salvando..." : "Salvar"}
            </button>
          </div>
          <p id="customer-session-range" className="text-xs text-slate-400">De {MIN_CUSTOMER_SESSION_HOURS} a {MAX_CUSTOMER_SESSION_HOURS} horas (até 90 dias).</p>
          {showInvalid && <p id="customer-session-invalid" role="alert" className="text-sm text-amber-200">Informe um número inteiro entre {MIN_CUSTOMER_SESSION_HOURS} e {MAX_CUSTOMER_SESSION_HOURS} horas.</p>}
          {saveError && <p role="alert" className="text-sm text-rose-300">{saveError}</p>}
          {savedHours !== null && <p role="status" className="text-sm text-emerald-300">Salvo: {savedHours} horas para os próximos logins.</p>}
        </form>
      )}

      <div className="space-y-1 text-xs leading-relaxed text-slate-300">
        <p>A duração vale para novos logins e renovações de sessões válidas. O cliente permanece conectado enquanto acessar dentro desse prazo de inatividade.</p>
        <p>O código continua válido por 10 minutos e pode ser usado uma única vez.</p>
      </div>
    </section>
  );
}
