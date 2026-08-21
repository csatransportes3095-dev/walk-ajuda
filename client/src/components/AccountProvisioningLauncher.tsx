import { useState } from "react";
import { Loader2, Search, ShieldCheck, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function AccountProvisioningLauncher({ onOpenOrder }: { onOpenOrder: (registrationId: number) => void }) {
  const [open, setOpen] = useState(false);
  const [typedQuery, setTypedQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const resultQuery = trpc.accountProvisioning.searchOpenOrders.useQuery(
    { query: submittedQuery || "#0" },
    { enabled: Boolean(submittedQuery), retry: false },
  );

  const close = () => {
    setOpen(false);
    setTypedQuery("");
    setSubmittedQuery(null);
  };

  const search = () => {
    const value = typedQuery.trim();
    if (!value) return;
    setSubmittedQuery(value);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-xl border border-lime-400/40 bg-lime-500/15 px-3 py-2 text-xs font-bold text-lime-200 transition-colors hover:bg-lime-500/25"
      >
        + Criar conta
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <section className="w-full max-w-2xl rounded-t-3xl border border-white/15 bg-[#0b1020] shadow-2xl sm:rounded-3xl" role="dialog" aria-modal="true" aria-label="Criar conta para cliente">
            <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <p className="text-xs font-black tracking-[0.16em] text-lime-300">CRIAÇÃO RÁPIDA</p>
                <h2 className="mt-1 text-lg font-black text-white">Localize o pedido em aberto</h2>
                <p className="mt-1 text-sm text-slate-400">Use telefone, CPF, <strong className="text-slate-200">*código de cadastro</strong> ou <strong className="text-slate-200">#número do pedido</strong>. Pedidos entregues não aparecem.</p>
              </div>
              <button onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </header>
            <div className="space-y-4 p-5">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input autoFocus value={typedQuery} onChange={(event) => setTypedQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="Ex.: 11999999999, 123.456.789-09, *397 ou #4540000" className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-lime-400/60" /></div>
                <button onClick={search} disabled={!typedQuery.trim() || resultQuery.isFetching} className="rounded-xl bg-lime-400 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">{resultQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}</button>
              </div>
              {resultQuery.isError && <p className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{resultQuery.error.message}</p>}
              {submittedQuery && !resultQuery.isFetching && !resultQuery.isError && resultQuery.data?.length === 0 && <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">Este cliente não tem pedido em aberto para criar conta.</div>}
              {resultQuery.data && resultQuery.data.length > 0 && <div className="space-y-2"><p className="text-xs font-bold text-slate-400">Escolha o pedido correto. Nenhum dado será criado antes da escolha.</p>{resultQuery.data.map((order) => <button key={order.registrationId} onClick={() => { close(); onOpenOrder(order.registrationId); }} className="w-full rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition-colors hover:border-lime-400/45 hover:bg-lime-400/[0.06]"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-white">#{order.orderNumber || order.registrationId} · {order.customerName || "Cliente sem nome"}</p><p className="mt-1 text-xs text-slate-400">Cadastro {order.customerNumber ? `*${order.customerNumber}` : "não informado"} · {order.customerPhone || "telefone não informado"}{order.customerCpfMasked ? ` · CPF ${order.customerCpfMasked}` : ""}</p><p className="mt-2 text-xs text-lime-200">{order.serviceName || "Pedido"}{order.serviceOption ? ` — ${order.serviceOption}` : ""}</p></div><span className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold text-cyan-200">{order.latestStatus || "Em aberto"}</span></div><div className="mt-3 flex items-center gap-2 text-xs font-bold text-lime-300"><ShieldCheck className="h-4 w-4" />Abrir pedido para criar conta</div></button>)}</div>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
