import { useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ListChecks, Loader2, LockKeyhole, Search, ShieldX } from "lucide-react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import AdminHeader from "@/components/AdminHeader";
import CpfVaultCheck from "@/components/CpfVaultCheck";
import CpfVaultRecords from "@/components/CpfVaultRecords";
import { copyLoginText } from "@/components/OrderLoginCopyButton";
import { formatCPF } from "@shared/cpf";
import { CPF_VAULT_BATCH_LIMIT, CPF_VAULT_TEXT_LIMIT } from "@shared/cpfVault";

type BatchResult = inferRouterOutputs<AppRouter>["cpfVault"]["checkBatch"];
type BatchSaved = inferRouterOutputs<AppRouter>["cpfVault"]["saveBatch"];

function BatchCpfVault({ revision, onSaved }: { revision: number; onSaved: () => void }) {
  const inputId = useId();
  const utils = trpc.useUtils();
  const check = trpc.cpfVault.checkBatch.useMutation();
  const save = trpc.cpfVault.saveBatch.useMutation();
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<BatchResult | null>(null);
  const [resultRevision, setResultRevision] = useState(revision);
  const [saved, setSaved] = useState<BatchSaved | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const busyRef = useRef(false);
  const currentResult = resultRevision === revision ? result : null;

  const consult = async () => {
    if (busyRef.current || !text.trim()) return;
    if (text.length > CPF_VAULT_TEXT_LIMIT) {
      setResult(null);
      setSaved(null);
      setError("A lista excede 64.000 caracteres. Divida o conteúdo em lotes menores.");
      return;
    }
    busyRef.current = true;
    setBusy("check");
    setResult(null);
    setSaved(null);
    setError("");
    try {
      setResult(await check.mutateAsync({ text }));
      setResultRevision(revision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar o lote. Tente novamente.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const saveAvailable = async () => {
    if (busyRef.current || !currentResult?.available.length) return;
    busyRef.current = true;
    setBusy("save");
    setResult(null);
    setSaved(null);
    setError("");
    try {
      const response = await save.mutateAsync({ text, ...(note.trim() ? { note: note.trim() } : {}) });
      setSaved(response);
      onSaved();
      setNote("");
      toast.success(`${response.savedCount} CPF(s) guardado(s) como usados.`);
      await Promise.allSettled([utils.cpfVault.list.invalidate(), utils.cpfVault.check.invalidate()]);
      // Require a new explicit consultation after writing; never preserve green results.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o lote. Consulte novamente antes de reutilizar qualquer CPF.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const copyAvailable = async () => {
    if (busyRef.current || !currentResult?.available.length) return;
    if (await copyLoginText(currentResult.available.join("\n"))) toast.success("CPFs não usados copiados.");
    else toast.error("Não foi possível copiar. Selecione os CPFs e copie manualmente.");
  };

  return <section className="space-y-4 rounded-2xl border border-fuchsia-400/25 bg-black/30 p-4 sm:p-5" aria-label="Consulta de CPFs em lote">
    <div>
      <h2 className="flex items-center gap-2 text-base font-black text-fuchsia-200"><ListChecks className="h-5 w-5" />Consulta e cadastro em lote</h2>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">Cole até {CPF_VAULT_BATCH_LIMIT.toLocaleString("pt-BR")} CPFs separados por linha, espaço, vírgula ou ponto e vírgula. Pontos e traços são ignorados na comparação.</p>
    </div>
    <label htmlFor={inputId} className="block text-xs font-semibold text-slate-300">Lista de CPFs</label>
    <textarea id={inputId} value={text} rows={6} disabled={Boolean(busy)}
      onChange={event => { setText(event.target.value); setResult(null); setSaved(null); setError(""); }}
      placeholder={"000.000.000-00\nCole um CPF por linha"}
      className="w-full resize-y rounded-xl border border-white/15 bg-black/40 px-3 py-3 font-mono text-sm text-white outline-none focus:border-fuchsia-300 disabled:opacity-50" />
    <button type="button" onClick={() => void consult()} disabled={Boolean(busy) || !text.trim()}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/15 px-4 py-3 text-sm font-bold text-fuchsia-100 hover:bg-fuchsia-500/25 disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      {busy === "check" ? "Consultando lote..." : busy === "save" ? "Guardando CPFs..." : "Consultar lote"}
    </button>

    {error && <p role="alert" className="flex gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 p-3 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></p>}
    {saved && <div role="status" className="space-y-1 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-slate-200">
      <p className="font-bold text-red-200">{saved.savedCount} CPF(s) registrado(s) como usados.</p>
      <p>{saved.alreadyUsedCount} já estavam usados e permaneceram no registro original.</p>
      {saved.invalid.length > 0 && <p>{saved.invalid.length} entrada(s) inválida(s) não foram guardadas.</p>}
      {saved.duplicateCount > 0 && <p>{saved.duplicateCount} repetição(ões) na lista foram ignoradas.</p>}
      <p className="pt-1 text-xs text-slate-400">Consulte o lote novamente para ver a situação atual.</p>
    </div>}

    {!busy && result && resultRevision !== revision && <p role="status" className="text-xs text-amber-200">O cofre foi atualizado. Consulte este lote novamente.</p>}
    {!busy && currentResult && <div className="space-y-4" aria-live="polite">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-2 py-3"><p className="text-xl font-black text-emerald-300">{currentResult.available.length}</p><p className="mt-1 text-[10px] font-bold uppercase text-emerald-200">Não usados</p></div>
        <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-2 py-3"><p className="text-xl font-black text-red-300">{currentResult.used.length}</p><p className="mt-1 text-[10px] font-bold uppercase text-red-200">Usados</p></div>
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-2 py-3"><p className="text-xl font-black text-amber-300">{currentResult.invalid.length}</p><p className="mt-1 text-[10px] font-bold uppercase text-amber-200">Inválidos</p></div>
      </div>
      {currentResult.duplicateCount > 0 && <p className="text-xs text-slate-400">{currentResult.duplicateCount} repetição(ões) na lista foram ignoradas.</p>}

      {currentResult.available.length > 0 && <div className="space-y-3 rounded-xl border border-emerald-400/30 bg-emerald-500/[.05] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-black text-emerald-200"><CheckCircle2 className="h-4 w-4" />NÃO USADOS</h3>
          <button type="button" onClick={() => void copyAvailable()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-300/30 px-2.5 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/10"><Copy className="h-3.5 w-3.5" />Copiar disponíveis</button>
        </div>
        <ul className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto font-mono text-sm text-emerald-200 sm:grid-cols-2">{currentResult.available.map(cpf => <li key={cpf}>{formatCPF(cpf)}</li>)}</ul>
        <label className="block text-xs text-slate-300">Observação do lote (opcional)
          <input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="Referência destes usos"
            className="mt-1.5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-300" />
        </label>
        <p className="text-xs leading-relaxed text-slate-400">Ao guardar, todos os CPFs disponíveis deste lote passam a ficar usados.</p>
        <button type="button" onClick={() => void saveAvailable()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-3 text-xs font-black text-amber-200 hover:bg-amber-400/25">
          <LockKeyhole className="h-4 w-4 shrink-0" />Guardar {currentResult.available.length} disponível(is) como usados
        </button>
      </div>}

      {currentResult.used.length > 0 && <div className="space-y-2 rounded-xl border border-red-400/30 bg-red-500/[.05] p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-black text-red-200"><ShieldX className="h-4 w-4" />USADOS — NÃO REUTILIZAR</h3>
        <ul className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto font-mono text-sm text-red-200 sm:grid-cols-2">{currentResult.used.map(cpf => <li key={cpf}>{formatCPF(cpf)}</li>)}</ul>
      </div>}

      {currentResult.invalid.length > 0 && <div className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-500/[.05] p-3">
        <h3 className="text-xs font-black text-amber-200">INVÁLIDOS — CONFIRA A DIGITAÇÃO</h3>
        <ul className="max-h-36 space-y-1 overflow-y-auto break-all font-mono text-xs text-amber-200">{currentResult.invalid.map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}</ul>
        <p className="text-xs text-slate-400">Entradas inválidas não são marcadas como disponíveis e não serão guardadas.</p>
      </div>}
    </div>}
  </section>;
}

export default function AdminCpfVault() {
  const [revision, setRevision] = useState(0);
  const [singleVersion, setSingleVersion] = useState(0);

  return <div className="min-h-screen bg-[#04030a] text-white">
    <AdminHeader title="COFRE DE CPF" icon={<LockKeyhole className="h-5 w-5" />} stackOnMobile />
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
      <header className="rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/10 via-violet-500/10 to-transparent p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Controle de uso</p>
        <h1 className="mt-2 text-2xl font-black text-white">Cofre de CPF</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">Consulte antes de usar. Ao adicionar um CPF ao cofre, ele fica marcado como usado e bloqueado para reutilização.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">Verde: não usado</span><span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-red-200">Vermelho: usado</span></div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-cyan-400/25 bg-black/30 p-4 sm:p-5">
          <h2 className="text-base font-black text-cyan-200">Consulta individual</h2>
          <CpfVaultCheck key={singleVersion} onSaved={() => setRevision(previous => previous + 1)} />
        </section>
        <BatchCpfVault revision={revision} onSaved={() => { setRevision(previous => previous + 1); setSingleVersion(previous => previous + 1); }} />
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5"><CpfVaultRecords /></section>
    </main>
  </div>;
}
