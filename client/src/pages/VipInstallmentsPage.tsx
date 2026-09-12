import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Copy, CreditCard, FileUp, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { uploadOrderFileReliably } from "@/lib/reliableOrderUpload";
import { toast } from "sonner";

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function statusLabel(status: string) {
  if (status === "paid") return "PAGA";
  if (status === "awaiting_confirmation") return "AGUARDANDO CONFIRMAÇÃO";
  if (status === "overdue") return "VENCIDA";
  if (status === "cancelled") return "CANCELADA";
  return "PENDENTE";
}

export default function VipInstallmentsPage() {
  const cpToken = typeof window !== "undefined" ? localStorage.getItem("cp_token") || "" : "";
  const phone = typeof window !== "undefined" ? localStorage.getItem("walk_client_phone") || "" : "";
  const utils = trpc.useUtils();
  const { data: activePix } = trpc.pix.getActive.useQuery();
  const plansQuery = trpc.vipInstallmentPayments.myPlans.useQuery(
    { cpToken, phone: phone || undefined },
    { enabled: cpToken.length >= 32, staleTime: 5_000, refetchOnWindowFocus: true },
  );
  const submitProof = trpc.vipInstallmentPayments.submitProof.useMutation({
    onSuccess: async () => {
      toast.success("Comprovante enviado para confirmação.");
      await utils.vipInstallmentPayments.myPlans.invalidate();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar o comprovante."),
  });
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const activePlan = useMemo(() => (plansQuery.data || []).find((plan: any) => Number(plan.balanceCents || 0) > 0 && plan.status !== "cancelled") || null, [plansQuery.data]);
  const pixKey = String(activePix?.pixKey || "").trim();
  const pixName = String(activePix?.pixName || "").trim();
  const pixBank = String(activePix?.pixBank || "").trim();

  const copyPix = async () => {
    if (!pixKey) return toast.error("PIX indisponível. Fale com o atendimento.");
    try {
      await navigator.clipboard.writeText(pixKey);
      toast.success("Chave PIX copiada.");
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  const handleProof = async (installment: any, file: File | null) => {
    if (!file || uploadingId || submitProof.isPending) return;
    setUploadingId(Number(installment.id));
    try {
      const uploaded = await uploadOrderFileReliably(file, `Comprovante Parcela ${installment.installmentNumber} VIP`);
      if (!uploaded.ok) {
        toast.error(uploaded.message);
        return;
      }
      await submitProof.mutateAsync({
        cpToken,
        phone: phone || undefined,
        installmentId: Number(installment.id),
        proofUrl: uploaded.url,
        proofMimeType: uploaded.mimeType,
      });
    } finally {
      setUploadingId(null);
    }
  };

  if (!cpToken) {
    return (
      <main className="min-h-screen bg-[#050816] px-4 py-10 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-amber-300" />
          <h1 className="mt-3 text-2xl font-black">Minhas Parcelas VIP</h1>
          <p className="mt-2 text-sm text-slate-400">Entre na sua conta para consultar e pagar suas parcelas.</p>
          <a href="/login" className="mt-5 inline-flex rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950">ENTRAR</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050816] px-3 py-5 text-white sm:px-5 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <a href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-300"><ArrowLeft className="h-4 w-4" /> Voltar</a>
          <button type="button" onClick={() => plansQuery.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-slate-300"><RefreshCw className={`h-4 w-4 ${plansQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar</button>
        </div>

        <section className="rounded-[28px] border border-amber-400/25 bg-[linear-gradient(160deg,rgba(245,158,11,.12),rgba(15,23,42,.95))] p-5 shadow-2xl sm:p-7">
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-amber-300/15 p-3"><CreditCard className="h-7 w-7 text-amber-300" /></div><div><h1 className="text-2xl font-black">Minhas Parcelas VIP</h1><p className="text-sm text-slate-400">Acompanhe saldo, vencimentos e envie o comprovante da próxima parcela.</p></div></div>
          {activePlan && <div className="mt-5 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-black/25 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Total</p><p className="mt-1 font-black">{money(activePlan.totalAmountCents)}</p></div><div className="rounded-2xl bg-black/25 p-3"><p className="text-[10px] font-black uppercase text-emerald-400">Pago</p><p className="mt-1 font-black text-emerald-300">{money(activePlan.paidAmountCents)}</p></div><div className="rounded-2xl bg-black/25 p-3"><p className="text-[10px] font-black uppercase text-amber-400">Saldo</p><p className="mt-1 font-black text-amber-300">{money(activePlan.balanceCents)}</p></div></div>}
        </section>

        {plansQuery.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-300" /></div> : null}
        {plansQuery.error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{plansQuery.error.message}</div> : null}
        {!plansQuery.isLoading && !plansQuery.error && (plansQuery.data || []).length === 0 ? <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center text-slate-400">Você ainda não possui compras parceladas.</div> : null}

        {(plansQuery.data || []).map((plan: any) => {
          const nextPayable = plan.installments.find((item: any) => item.status === "pending" || item.status === "overdue");
          return (
            <section key={plan.id} className="overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/80">
              <div className="border-b border-white/10 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-amber-300">Compra parcelada #{plan.orderNumber || plan.registrationId || plan.id}</p><h2 className="mt-1 text-xl font-black">{plan.productName}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-black ${Number(plan.balanceCents) === 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{Number(plan.balanceCents) === 0 ? "QUITADO" : `${plan.installmentCount}x • ${plan.frequency === "daily" ? "DIÁRIO" : plan.frequency === "weekly" ? "SEMANAL" : "MENSAL"}`}</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white/[0.04] p-2"><p className="text-[9px] font-black uppercase text-slate-500">Contratado</p><p className="mt-1 text-sm font-black">{money(plan.totalAmountCents)}</p></div><div className="rounded-xl bg-white/[0.04] p-2"><p className="text-[9px] font-black uppercase text-slate-500">Pago</p><p className="mt-1 text-sm font-black text-emerald-300">{money(plan.paidAmountCents)}</p></div><div className="rounded-xl bg-white/[0.04] p-2"><p className="text-[9px] font-black uppercase text-slate-500">Saldo</p><p className="mt-1 text-sm font-black text-amber-300">{money(plan.balanceCents)}</p></div></div>
              </div>

              <div className="divide-y divide-white/[0.07]">
                {plan.installments.map((installment: any) => {
                  const paid = installment.status === "paid";
                  const awaiting = installment.status === "awaiting_confirmation";
                  const overdue = installment.status === "overdue";
                  const payable = nextPayable?.id === installment.id && !paid && !awaiting;
                  return (
                    <div key={installment.id} className="p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">{paid ? <CheckCircle2 className="h-6 w-6 text-emerald-400" /> : overdue ? <TriangleAlert className="h-6 w-6 text-red-400" /> : <Clock3 className="h-6 w-6 text-amber-300" />}<div><p className="font-black">Parcela {installment.installmentNumber}/{plan.installmentCount} — {money(installment.amountCents)}</p><p className={`text-xs ${overdue ? "text-red-300" : "text-slate-500"}`}>Vencimento: {dateLabel(installment.dueDate)}</p></div></div>
                        <span className={`text-[10px] font-black ${paid ? "text-emerald-300" : awaiting ? "text-cyan-300" : overdue ? "text-red-300" : "text-amber-300"}`}>{statusLabel(installment.status)}</span>
                      </div>

                      {payable && <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4"><p className="text-xs font-black uppercase text-amber-200">Pagamento desta parcela</p><p className="mt-2 text-2xl font-black text-white">{money(installment.amountCents)}</p>{pixKey ? <><div className="mt-3 rounded-xl bg-black/30 p-3 text-sm"><p className="break-all font-bold">{pixKey}</p>{pixName ? <p className="mt-1 text-xs text-slate-400">{pixName}{pixBank ? ` • ${pixBank}` : ""}</p> : null}</div><button type="button" onClick={copyPix} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-200"><Copy className="h-4 w-4" /> COPIAR PIX</button></> : <p className="mt-3 text-sm text-red-300">PIX indisponível. Entre em contato com o atendimento.</p>}
                        <label className={`mt-3 flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-emerald-950 ${uploadingId === installment.id ? "pointer-events-none opacity-60" : ""}`}>{uploadingId === installment.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}{uploadingId === installment.id ? "ENVIANDO..." : "ENVIAR COMPROVANTE"}<input type="file" accept="image/*,application/pdf,.heic,.heif" className="hidden" onChange={(event) => handleProof(installment, event.target.files?.[0] || null)} /></label></div>}
                      {awaiting && <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.07] p-3 text-sm font-bold text-cyan-200">Comprovante enviado. Aguarde a confirmação do ADM.</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
