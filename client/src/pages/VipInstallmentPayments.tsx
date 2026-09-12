import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Copy, CreditCard, FileUp, Loader2, LockKeyhole, ReceiptText } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { uploadOrderFileReliably } from "@/lib/reliableOrderUpload";

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
  if (status === "awaiting_confirmation") return "AGUARDANDO CONFIRMAÇÃO";
  if (status === "overdue") return "VENCIDA";
  if (status === "cancelled") return "CANCELADA";
  return "PENDENTE";
}

export default function VipInstallmentPayments() {
  const [, navigate] = useLocation();
  const cpToken = typeof window !== "undefined" ? localStorage.getItem("cp_token") || "" : "";
  const phone = typeof window !== "undefined" ? localStorage.getItem("walk_client_phone") || undefined : undefined;
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const plansQuery = trpc.vipInstallments.myPlans.useQuery(
    { cpToken, phone },
    { enabled: cpToken.length >= 32, staleTime: 5_000, refetchOnWindowFocus: true },
  );
  const pixQuery = trpc.pix.getActive.useQuery(undefined, { staleTime: 30_000 });
  const submitProof = trpc.vipInstallments.submitProof.useMutation({
    onSuccess: async () => {
      toast.success("Comprovante enviado. Aguarde a confirmação do pagamento.");
      await plansQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar o comprovante."),
  });

  const plans = (plansQuery.data || []) as any[];
  const openPlan = useMemo(() => plans.find((plan) => Number(plan.balanceCents || 0) > 0 && plan.status !== "cancelled") || null, [plans]);
  const nextPayable = useMemo(() => {
    if (!openPlan) return null;
    const installments = (openPlan.installments || []) as any[];
    return installments.find((item) => item.status !== "paid" && item.status !== "cancelled") || null;
  }, [openPlan]);

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

  const handleProof = async (installment: any, file: File | null) => {
    if (!file || uploadingId != null || submitProof.isPending) return;
    if (!nextPayable || Number(nextPayable.id) !== Number(installment.id)) {
      toast.error("Pague as parcelas na ordem correta.");
      return;
    }
    setUploadingId(Number(installment.id));
    try {
      const uploaded = await uploadOrderFileReliably(file, `comprovante-parcela-vip-${installment.installmentNumber}`);
      if (!uploaded.ok) {
        toast.error(uploaded.message);
        return;
      }
      await submitProof.mutateAsync({
        cpToken,
        phone,
        installmentId: Number(installment.id),
        paymentProofUrl: uploaded.url,
        paymentProofMime: uploaded.mimeType,
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
          <p className="mt-2 text-sm text-slate-300">Entre no sistema para consultar e pagar suas Parcelas VIP.</p>
          <button onClick={() => navigate("/login")} className="mt-5 w-full rounded-xl bg-amber-400 px-4 py-3 font-black text-slate-950">ENTRAR</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,.12),transparent_32%),#020617] px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <button onClick={() => navigate("/acompanhar")} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <div className="rounded-[28px] border border-emerald-400/30 bg-slate-950/90 p-5 shadow-2xl sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-400/15 p-3"><CreditCard className="h-7 w-7 text-emerald-300" /></div>
            <div>
              <h1 className="text-2xl font-black">Minhas Parcelas VIP</h1>
              <p className="mt-1 text-sm text-slate-400">Consulte seu saldo, pague a parcela atual por PIX e envie o comprovante para confirmação.</p>
            </div>
          </div>

          {plansQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /> Carregando...</div>
          ) : plansQuery.error ? (
            <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{plansQuery.error.message}</div>
          ) : plans.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-7 text-center">
              <ReceiptText className="mx-auto h-9 w-9 text-slate-500" />
              <p className="mt-3 font-bold">Você ainda não possui compras parceladas.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {plans.map((plan) => (
                <section key={plan.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
                  <div className="grid gap-3 border-b border-white/10 p-4 sm:grid-cols-4">
                    <div><p className="text-[10px] font-black uppercase text-slate-500">Pedido</p><p className="font-black">#{plan.orderNumber || plan.id}</p></div>
                    <div><p className="text-[10px] font-black uppercase text-slate-500">Produto</p><p className="font-bold">{plan.productName}</p></div>
                    <div><p className="text-[10px] font-black uppercase text-slate-500">Total</p><p className="font-black text-cyan-300">{money(plan.totalAmountCents)}</p></div>
                    <div><p className="text-[10px] font-black uppercase text-slate-500">Saldo</p><p className="font-black text-amber-300">{money(plan.balanceCents)}</p></div>
                  </div>

                  <div className="space-y-2 p-4">
                    {(plan.installments || []).map((installment: any) => {
                      const isCurrent = nextPayable && Number(nextPayable.id) === Number(installment.id);
                      const awaiting = installment.status === "awaiting_confirmation";
                      const paid = installment.status === "paid";
                      return (
                        <div key={installment.id} className={`rounded-xl border p-3 ${isCurrent ? "border-emerald-400/35 bg-emerald-500/[0.06]" : "border-white/10 bg-black/20"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-black">Parcela {installment.installmentNumber} de {plan.installmentCount}</p>
                              <p className="mt-1 text-xs text-slate-400">Vencimento: {dateLabel(installment.dueDate)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black">{money(installment.amountCents)}</p>
                              <p className={`text-[10px] font-black ${paid ? "text-emerald-300" : awaiting ? "text-yellow-300" : "text-slate-400"}`}>{statusLabel(installment.status)}</p>
                            </div>
                          </div>

                          {isCurrent && !paid && (
                            <div className="mt-3 border-t border-white/10 pt-3">
                              {awaiting ? (
                                <div className="flex items-center gap-2 rounded-xl border border-yellow-400/25 bg-yellow-500/10 p-3 text-sm font-bold text-yellow-200"><Clock3 className="h-4 w-4" /> Comprovante enviado. Aguarde a confirmação do ADM.</div>
                              ) : (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <button type="button" onClick={copyPix} disabled={!((pixQuery.data as any)?.pixKey)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-200 disabled:opacity-40"><Copy className="h-4 w-4" /> {copied ? "PIX COPIADO" : "COPIAR PIX"}</button>
                                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-emerald-950">
                                    {uploadingId === Number(installment.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                                    {uploadingId === Number(installment.id) ? "ENVIANDO..." : "ENVIAR COMPROVANTE"}
                                    <input type="file" accept="image/*,application/pdf,.heic,.heif" className="hidden" disabled={uploadingId != null} onChange={(event) => { const file = event.target.files?.[0] || null; void handleProof(installment, file); event.currentTarget.value = ""; }} />
                                  </label>
                                </div>
                              )}
                            </div>
                          )}
                          {paid && <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Pagamento confirmado</div>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
