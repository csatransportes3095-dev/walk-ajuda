import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Copy, CreditCard, FileUp, Loader2, LockKeyhole, ReceiptText, WalletCards } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { uploadOrderFileReliably } from "@/lib/reliableOrderUpload";

const PAYOFF_PROOF_PREFIX = "h2-payoff:";

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function statusLabel(status: string) {
  if (status === "paid") return "PAGA";
  if (status === "awaiting_confirmation") return "AGUARDANDO CONFERÊNCIA";
  if (status === "overdue") return "VENCIDA";
  if (status === "cancelled") return "CANCELADA";
  return "PENDENTE";
}

export default function VipInstallmentPayments() {
  const [, navigate] = useLocation();
  const cpToken = typeof window !== "undefined" ? localStorage.getItem("cp_token") || "" : "";
  const phone = typeof window !== "undefined" ? localStorage.getItem("walk_client_phone") || undefined : undefined;
  const requestedAction = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("acao") : null;
  const [paymentMode, setPaymentMode] = useState<"installment" | "payoff">(requestedAction === "quitar" ? "payoff" : "installment");
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const plansQuery = trpc.vipInstallments.myPlans.useQuery(
    { cpToken, phone },
    { enabled: cpToken.length >= 32, staleTime: 3_000, refetchOnWindowFocus: true },
  );
  const pixQuery = trpc.pix.getActive.useQuery(undefined, { staleTime: 30_000 });
  const submitProof = trpc.vipInstallments.submitProof.useMutation({
    onSuccess: async () => {
      toast.success("Comprovante enviado. Aguarde a conferência do ADM.");
      await plansQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar o comprovante."),
  });

  const plans = (plansQuery.data || []) as any[];
  const openPlan = useMemo(() => plans.find((plan) => Number(plan.balanceCents || 0) > 0 && !["paid", "cancelled"].includes(String(plan.status || ""))) || null, [plans]);
  const nextPayable = useMemo(() => {
    if (!openPlan) return null;
    const installments = (openPlan.installments || []) as any[];
    return installments.find((item) => item.status !== "paid" && item.status !== "cancelled") || null;
  }, [openPlan]);
  const planStats = useMemo(() => {
    if (!openPlan) return null;
    const installments = (openPlan.installments || []) as any[];
    return {
      paidCount: installments.filter((item) => item.status === "paid").length,
      pendingCount: installments.filter((item) => !["paid", "cancelled"].includes(item.status)).length,
    };
  }, [openPlan]);

  const awaitingConfirmation = nextPayable?.status === "awaiting_confirmation";

  const copyPix = async () => {
    const key = String((pixQuery.data as any)?.pixKey || "").trim();
    if (!key) return toast.error("PIX indisponível no momento.");
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast.success("Chave PIX copiada.");
    } catch {
      toast.error("Não foi possível copiar a chave PIX.");
    }
  };

  const handleProof = async (file: File | null, mode: "installment" | "payoff") => {
    if (!file || uploadingId != null || submitProof.isPending || !openPlan || !nextPayable) return;
    if (awaitingConfirmation) {
      toast.error("Já existe um comprovante aguardando conferência do ADM.");
      return;
    }

    setUploadingId(Number(nextPayable.id));
    try {
      const label = mode === "payoff" ? `comprovante-quitacao-vip-${openPlan.id}` : `comprovante-parcela-vip-${nextPayable.installmentNumber}`;
      const uploaded = await uploadOrderFileReliably(file, label);
      if (!uploaded.ok) {
        toast.error(uploaded.message);
        return;
      }
      const mime = mode === "payoff"
        ? `${PAYOFF_PROOF_PREFIX}${uploaded.mimeType || "application/octet-stream"}`.slice(0, 128)
        : uploaded.mimeType;
      await submitProof.mutateAsync({
        cpToken,
        phone,
        installmentId: Number(nextPayable.id),
        paymentProofUrl: uploaded.url,
        paymentProofMime: mime,
      });
    } finally {
      setUploadingId(null);
    }
  };

  if (!cpToken || cpToken.length < 32) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-md rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6 text-center">
          <LockKeyhole className="mx-auto h-10 w-10 text-amber-300" />
          <h1 className="mt-3 text-xl font-black">Sessão necessária</h1>
          <p className="mt-2 text-sm text-slate-300">Entre no sistema para consultar e pagar suas parcelas.</p>
          <button onClick={() => navigate("/login")} className="mt-5 w-full rounded-xl bg-amber-400 px-4 py-3 font-black text-slate-950">ENTRAR</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,.12),transparent_32%),#020617] px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <button onClick={() => navigate("/login")} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Voltar ao início
        </button>

        <div className="rounded-[28px] border border-emerald-400/30 bg-slate-950/90 p-5 shadow-2xl sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-400/15 p-3"><CreditCard className="h-7 w-7 text-emerald-300" /></div>
            <div>
              <h1 className="text-2xl font-black">Minhas Parcelas</h1>
              <p className="mt-1 text-sm text-slate-400">Pague a parcela atual ou quite todo o saldo por PIX e envie o comprovante para conferência do ADM.</p>
            </div>
          </div>

          {plansQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Carregando...</div>
          ) : plansQuery.error ? (
            <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{plansQuery.error.message}</div>
          ) : !openPlan ? (
            <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-7 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
              <p className="mt-3 text-lg font-black">Nenhuma parcela pendente</p>
              <p className="mt-1 text-sm text-slate-400">Seu saldo parcelado está quitado.</p>
              <button onClick={() => navigate("/login")} className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-black text-emerald-950">VOLTAR AO SISTEMA</button>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                <div className="border-b border-white/10 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Produto</p>
                  <p className="mt-1 text-lg font-black">{openPlan.productName}</p>
                  <p className="mt-1 text-xs text-slate-500">Pedido #{openPlan.orderNumber || openPlan.id}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                  <div><p className="text-[10px] font-black uppercase text-slate-500">Valor total</p><p className="mt-1 font-black text-cyan-300">{money(openPlan.totalAmountCents)}</p></div>
                  <div><p className="text-[10px] font-black uppercase text-slate-500">Já pago</p><p className="mt-1 font-black text-emerald-300">{money(openPlan.paidAmountCents)}</p></div>
                  <div><p className="text-[10px] font-black uppercase text-slate-500">Pagas</p><p className="mt-1 font-black">{planStats?.paidCount ?? 0}</p></div>
                  <div><p className="text-[10px] font-black uppercase text-slate-500">Pendentes</p><p className="mt-1 font-black text-amber-300">{planStats?.pendingCount ?? 0}</p></div>
                </div>
                <div className="mx-4 mb-4 rounded-xl border border-amber-400/25 bg-amber-500/10 p-4">
                  <p className="text-[10px] font-black uppercase text-amber-200">Saldo pendente</p>
                  <p className="mt-1 text-3xl font-black text-amber-300">{money(openPlan.balanceCents)}</p>
                </div>
              </section>

              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setPaymentMode("installment")} className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${paymentMode === "installment" ? "bg-cyan-400 text-slate-950" : "border border-cyan-400/30 bg-cyan-500/10 text-cyan-200"}`}>
                  <CreditCard className="h-5 w-5" /> PAGAR PARCELA
                </button>
                <button type="button" onClick={() => setPaymentMode("payoff")} className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${paymentMode === "payoff" ? "bg-emerald-400 text-emerald-950" : "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>
                  <WalletCards className="h-5 w-5" /> QUITAR TODAS
                </button>
              </div>

              {nextPayable ? (
                <section className={`rounded-2xl border p-4 ${paymentMode === "payoff" ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-cyan-400/30 bg-cyan-500/[0.06]"}`}>
                  {paymentMode === "payoff" ? (
                    <>
                      <p className="text-xs font-black uppercase tracking-wider text-emerald-300">Quitação total</p>
                      <h2 className="mt-1 text-xl font-black">PAGAR TODAS AS PARCELAS</h2>
                      <p className="mt-2 text-sm text-slate-300">Faça um PIX no valor exato do saldo abaixo e envie um único comprovante.</p>
                      <div className="mt-4 rounded-xl border border-emerald-400/25 bg-black/20 p-4 text-center">
                        <p className="text-xs font-black uppercase text-slate-400">Valor para quitar</p>
                        <p className="mt-1 text-4xl font-black text-emerald-300">{money(openPlan.balanceCents)}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-black uppercase tracking-wider text-cyan-300">Próxima parcela</p>
                      <h2 className="mt-1 text-xl font-black">{nextPayable.installmentNumber === 0 ? "Entrada" : `Parcela ${nextPayable.installmentNumber}`} de {openPlan.installmentCount}</h2>
                      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-cyan-400/20 bg-black/20 p-4">
                        <div><p className="text-xs font-black uppercase text-slate-400">Valor a pagar</p><p className="mt-1 text-3xl font-black text-cyan-300">{money(nextPayable.amountCents)}</p></div>
                        <p className="text-xs font-bold text-slate-400">Vencimento: {dateLabel(nextPayable.dueDate)}</p>
                      </div>
                    </>
                  )}

                  {nextPayable.lastRejectionReason && !awaitingConfirmation ? (
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                      <div><p className="font-black">Comprovante anterior rejeitado</p><p className="mt-1 text-xs text-red-200">Motivo: {nextPayable.lastRejectionReason}</p></div>
                    </div>
                  ) : null}

                  {awaitingConfirmation ? (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-yellow-400/25 bg-yellow-500/10 p-4 text-sm font-bold text-yellow-200">
                      <Clock3 className="h-5 w-5" /> Comprovante enviado. Aguarde a conferência do ADM. Enquanto houver saldo, novos pedidos continuam bloqueados.
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button type="button" onClick={copyPix} disabled={!((pixQuery.data as any)?.pixKey)} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 text-sm font-black text-cyan-200 disabled:opacity-40">
                        <Copy className="h-4 w-4" /> {copied ? "PIX COPIADO" : "COPIAR CHAVE PIX"}
                      </button>
                      <label className={`inline-flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${paymentMode === "payoff" ? "bg-emerald-400 text-emerald-950" : "bg-cyan-400 text-slate-950"}`}>
                        {uploadingId === Number(nextPayable.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        {uploadingId === Number(nextPayable.id) ? "ENVIANDO..." : "ENVIAR COMPROVANTE"}
                        <input type="file" accept="image/*,application/pdf,.heic,.heif" className="hidden" disabled={uploadingId != null} onChange={(event) => { const file = event.target.files?.[0] || null; void handleProof(file, paymentMode); event.currentTarget.value = ""; }} />
                      </label>
                    </div>
                  )}
                  <p className="mt-3 text-center text-[11px] font-semibold text-slate-500">O pagamento só será baixado depois da conferência e aprovação do ADM.</p>
                </section>
              ) : null}

              <section className="space-y-2">
                <div className="flex items-center gap-2"><ReceiptText className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-black">Todas as parcelas</h3></div>
                {(openPlan.installments || []).map((installment: any) => {
                  const paid = installment.status === "paid";
                  const awaiting = installment.status === "awaiting_confirmation";
                  return (
                    <div key={installment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                      <div>
                        <p className="font-black">{installment.installmentNumber === 0 ? "Entrada" : `Parcela ${installment.installmentNumber}`} de {openPlan.installmentCount}</p>
                        <p className="mt-1 text-xs text-slate-500">Vencimento: {dateLabel(installment.dueDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black">{money(installment.amountCents)}</p>
                        <p className={`text-[10px] font-black ${paid ? "text-emerald-300" : awaiting ? "text-yellow-300" : installment.status === "overdue" ? "text-red-300" : "text-slate-400"}`}>{statusLabel(installment.status)}</p>
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
