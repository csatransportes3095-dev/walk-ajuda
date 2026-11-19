import { useId, useRef, useState } from "react";
import { AlertTriangle, Loader2, LockKeyhole, Search, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { OrderLoginCopyButton } from "@/components/OrderLoginCopyButton";
import { formatCPF, isValidCPF, normalizeCpf } from "@shared/cpf";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type CheckResult = inferRouterOutputs<AppRouter>["cpfVault"]["check"];

type Props = {
  registrationId?: number;
  subOrderIndex?: number;
  orderNumber?: number | null;
  orderRootId?: number | null;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: () => void;
};

export default function CpfVaultCheck({ registrationId, subOrderIndex = 0, orderNumber, orderRootId, onBusyChange, onSaved }: Props) {
  const inputId = useId();
  const utils = trpc.useUtils();
  const save = trpc.cpfVault.save.useMutation();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const busyRef = useRef(false);

  const start = (action: "check" | "save") => {
    busyRef.current = true;
    setBusy(action);
    setError("");
    setResult(null);
    onBusyChange?.(true);
  };
  const finish = () => {
    busyRef.current = false;
    setBusy(null);
    onBusyChange?.(false);
  };

  const checkCpf = async () => {
    if (busyRef.current) return;
    const cpf = normalizeCpf(value);
    setResult(null);
    if (!/^[\d.\-\s]+$/.test(value) || !isValidCPF(cpf)) {
      setError("CPF inválido. Confira os 11 números e os dígitos verificadores.");
      return;
    }
    start("check");
    try {
      // staleTime zero also refreshes an identical query submitted a second time.
      const current = await utils.cpfVault.check.fetch({ cpf }, { staleTime: 0 });
      setResult(current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar o cofre. Tente novamente.");
    } finally {
      finish();
    }
  };

  const saveCpf = async () => {
    if (busyRef.current || !result || result.exists) return;
    if (registrationId && (!orderRootId || orderRootId <= 0)) return;
    const cpf = result.normalizedCpf;
    start("save");
    try {
      const saved = await save.mutateAsync({
        cpf,
        ...(registrationId ? { registrationId, subOrderIndex } : {}),
        ...(registrationId && orderRootId ? { expectedOrderRootId: orderRootId } : {}),
        ...(registrationId && orderNumber && orderNumber > 0 ? { expectedOrderNumber: orderNumber } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      // The server decides ownership atomically. A racing save remains USED here.
      setResult({ exists: true, normalizedCpf: saved.normalizedCpf, record: saved.record });
      if (saved.saved) {
        setNote("");
        toast.success(registrationId ? "CPF registrado neste pedido e marcado como usado." : "CPF guardado como usado.");
      } else {
        toast.warning("Este CPF já estava usado. O registro anterior foi preservado.");
      }
      onSaved?.();
      await Promise.allSettled([
        utils.cpfVault.check.invalidate(),
        utils.cpfVault.list.invalidate(),
      ]);
    } catch (cause) {
      // A lost response cannot be interpreted as permission to reuse the CPF.
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o registro. Consulte o CPF novamente.");
    } finally {
      finish();
    }
  };

  const owner = result?.record;
  const thisOrder = Boolean(registrationId && orderRootId && owner?.registrationId === registrationId && owner.orderRootId === orderRootId);

  return <section className="space-y-4" aria-label="Consultar e registrar CPF">
    <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); void checkCpf(); }} className="space-y-3">
      <label htmlFor={inputId} className="block text-xs font-bold uppercase tracking-wider text-slate-300">CPF para consulta</label>
      <input id={inputId} value={value} inputMode="numeric" autoComplete="off" maxLength={32}
        placeholder="000.000.000-00" disabled={Boolean(busy)}
        onChange={event => { setValue(event.target.value); setResult(null); setError(""); }}
        className="h-14 w-full rounded-xl border border-cyan-400/30 bg-black/40 px-4 text-center font-mono text-xl font-bold tracking-wide text-white outline-none focus:border-cyan-300 disabled:opacity-60" />
      <button type="submit" disabled={Boolean(busy) || !value.trim()}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-500/15 px-4 py-3 text-sm font-bold text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50">
        {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {busy === "check" ? "Consultando..." : "Consultar CPF"}
      </button>
    </form>

    {error && <div role="alert" className="flex gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 p-3 text-sm text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
    </div>}

    {busy === "save" && <p role="status" className="flex items-center gap-2 rounded-xl border border-cyan-400/25 p-4 text-sm text-cyan-200">
      <Loader2 className="h-4 w-4 animate-spin" />Registrando CPF como usado...
    </p>}

    {!busy && result && <div role="status" className={`space-y-3 rounded-2xl border p-4 ${result.exists
      ? "border-red-400/40 bg-red-500/10 text-red-200"
      : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"}`}>
      <div className="flex items-start gap-3">
        {result.exists ? <ShieldX className="mt-0.5 h-7 w-7 shrink-0 text-red-300" /> : <ShieldCheck className="mt-0.5 h-7 w-7 shrink-0 text-emerald-300" />}
        <div className="min-w-0 flex-1">
          <p className="text-base font-black">{result.exists ? "USADO — NÃO REUTILIZAR" : "NÃO USADO — DISPONÍVEL"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold">{formatCPF(result.normalizedCpf)}</span>
            <OrderLoginCopyButton value={result.normalizedCpf} label="CPF" />
          </div>
        </div>
      </div>

      {result.exists ? <div className="space-y-1 text-xs leading-relaxed text-slate-300">
        <p>{thisOrder ? "Este CPF já está registrado neste pedido." : "Este CPF já consta no cofre e está bloqueado para novo uso."}</p>
        {owner?.customerName && <p>Cliente: {owner.customerNumber ? `*${owner.customerNumber} · ` : ""}{owner.customerName}</p>}
        {owner?.registrationId && <p>Pedido: #{owner.orderNumber ?? owner.registrationId}{owner.subOrderIndex > 0 ? ` · item ${owner.subOrderIndex + 1}` : ""}</p>}
        {owner?.note && <p className="whitespace-pre-wrap break-words">{owner.note}</p>}
      </div> : <div className="space-y-3">
        <p className="text-xs leading-relaxed text-slate-300">Ao guardar, o CPF passa a ficar usado e indisponível para reutilização.</p>
        <label className="block text-xs text-slate-300">
          Observação (opcional)
          <input value={note} onChange={event => setNote(event.target.value)} maxLength={500}
            placeholder="Referência deste uso" className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300" />
        </label>
        <button type="button" onClick={() => void saveCpf()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-sm font-black text-amber-200 hover:bg-amber-400/25">
          <LockKeyhole className="h-4 w-4" />{registrationId ? "Registrar neste pedido como usado" : "Guardar como usado"}
        </button>
      </div>}
    </div>}
  </section>;
}
