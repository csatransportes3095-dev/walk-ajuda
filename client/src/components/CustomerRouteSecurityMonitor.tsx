import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Copy, CreditCard, FileUp, Loader2, LockKeyhole, WalletCards } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { uploadOrderFileReliably } from "@/lib/reliableOrderUpload";
import { getCustomerRouteAuditTarget } from "@shared/customerRouteAudit";

const CP_TOKEN_KEY = "cp_token";
const PHONE_KEY = "walk_client_phone";
const HEARTBEAT_MS = 60_000;
const SESSION_SYNC_MS = 750;
const PAYOFF_PROOF_PREFIX = "h2-payoff:";

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function statusLabel(status: string, hasProof?: boolean) {
  if (status === "paid") return "PAGA";
  if (status === "awaiting_confirmation" && hasProof) return "AGUARDANDO CONFERÊNCIA";
  if (status === "overdue") return "VENCIDA";
  if (status === "cancelled") return "CANCELADA";
  return "PENDENTE";
}

export default function CustomerRouteSecurityMonitor() {
  const [location] = useLocation();
  const mutation = trpc.system.customerRouteHeartbeat.useMutation();
  const lastRouteKeyRef = useRef<string | null>(null);
  const sendInFlightRef = useRef(false);
  const lastSendRef = useRef<{ key: string; sentAt: number } | null>(null);
  const queueRef = useRef<Array<{ sessionToken: string; pathname: string; trigger: "route_change" | "heartbeat" | "tab_visible" }>>([]);
  const trackedRoute = useMemo(() => getCustomerRouteAuditTarget(location), [location]);
  const [paymentMode, setPaymentMode] = useState<"installment" | "payoff" | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const orderEntryRoute = useMemo(() => {
    const path = location.toLowerCase();
    return path === "/" || path === "/login" || path === "/bot" || path.startsWith("/r/");
  }, [location]);

  const [customerSession, setCustomerSession] = useState(() => ({
    cpToken: typeof window !== "undefined" ? localStorage.getItem(CP_TOKEN_KEY) || "" : "",
    phone: typeof window !== "undefined" ? localStorage.getItem(PHONE_KEY) || "" : "",
  }));

  useEffect(() => {
    const sync = () => {
      const next = {
        cpToken: localStorage.getItem(CP_TOKEN_KEY) || "",
        phone: localStorage.getItem(PHONE_KEY) || "",
      };
      setCustomerSession((current) => current.cpToken === next.cpToken && current.phone === next.phone ? current : next);
    };
    sync();
    const timer = window.setInterval(sync, SESSION_SYNC_MS);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const debtQuery = trpc.system.customerInstallmentDebt.useQuery(
    { sessionToken: customerSession.cpToken },
    {
      enabled: orderEntryRoute && customerSession.cpToken.length >= 32,
      staleTime: 2_000,
      refetchInterval: orderEntryRoute && customerSession.cpToken.length >= 32 ? 10_000 : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  );
  const pixQuery = trpc.pix.getActive.useQuery(undefined, {
    enabled: orderEntryRoute && customerSession.cpToken.length >= 32,
    staleTime: 30_000,
  });
  const submitProof = trpc.vipInstallments.submitProof.useMutation({
    onSuccess: async () => {
      toast.success("Comprovante enviado. Aguarde a conferência do ADM.");
      await debtQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Não foi possível enviar o comprovante."),
  });

  const openPlan = (debtQuery.data as any)?.plan || null;
  const planStats = useMemo(() => {
    if (!openPlan) return null;
    const installments = (openPlan.installments || []) as any[];
    return {
      paidCount: installments.filter((item) => Number(item.installmentNumber) > 0 && item.status === "paid").length,
      pendingCount: installments.filter((item) => Number(item.installmentNumber) > 0 && !["paid", "cancelled"].includes(String(item.status || ""))).length,
      installments,
    };
  }, [openPlan]);

  const nextPayable = useMemo(() => {
    if (!openPlan) return null;
    return ((openPlan.installments || []) as any[]).find((item) => !["paid", "cancelled"].includes(String(item.status || ""))) || null;
  }, [openPlan]);

  const awaitingWithProof = Boolean(nextPayable?.status === "awaiting_confirmation" && nextPayable?.hasProof);

  useEffect(() => {
    if (!openPlan) setPaymentMode(null);
  }, [openPlan?.id]);

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

  const handleProof = async (file: File | null) => {
    if (!file || !paymentMode || !nextPayable || uploadingId != null || submitProof.isPending) return;
    if (awaitingWithProof) {
      toast.error("Já existe um comprovante aguardando conferência do ADM.");
      return;
    }

    setUploadingId(Number(nextPayable.id));
    try {
      const label = paymentMode === "payoff"
        ? `comprovante-quitacao-vip-${openPlan.id}`
        : `comprovante-parcela-vip-${nextPayable.installmentNumber}`;
      const uploaded = await uploadOrderFileReliably(file, label);
      if (!uploaded.ok) {
        toast.error(uploaded.message);
        return;
      }
      const mime = paymentMode === "payoff"
        ? `${PAYOFF_PROOF_PREFIX}${uploaded.mimeType || "application/octet-stream"}`.slice(0, 128)
        : uploaded.mimeType;
      await submitProof.mutateAsync({
        cpToken: customerSession.cpToken,
        phone: customerSession.phone || undefined,
        installmentId: Number(nextPayable.id),
        paymentProofUrl: uploaded.url,
        paymentProofMime: mime,
      });
    } finally {
      setUploadingId(null);
    }
  };

  const drainQueue = () => {
    sendInFlightRef.current = true;
    const next = queueRef.current.shift();
    if (!next) {
      sendInFlightRef.current = false;
      return;
    }
    void mutation.mutateAsync({
      sessionToken: next.sessionToken,
      pathname: next.pathname,
      trigger: next.trigger,
    }).catch(() => undefined).finally(() => {
      sendInFlightRef.current = false;
      if (queueRef.current.length > 0) drainQueue();
    });
  };

  const send = (trigger: "route_change" | "heartbeat" | "tab_visible") => {
    if (typeof window === "undefined") return;
    const sessionToken = localStorage.getItem(CP_TOKEN_KEY) || "";
    if (!sessionToken || !trackedRoute.tracked) return;
    const pathname = `${window.location.pathname || location || "/"}${window.location.search || ""}${window.location.hash || ""}`;
    const dedupeKey = `${trackedRoute.routeKey}:${trigger}`;
    const now = Date.now();
    if (lastSendRef.current?.key === dedupeKey && now - lastSendRef.current.sentAt < 2_000) return;
    lastSendRef.current = { key: dedupeKey, sentAt: now };
    queueRef.current.push({ sessionToken, pathname, trigger });
    if (!sendInFlightRef.current) drainQueue();
  };

  useEffect(() => {
    if (!trackedRoute.tracked) {
      lastRouteKeyRef.current = null;
      return;
    }
    if (lastRouteKeyRef.current !== trackedRoute.routeKey) {
      lastRouteKeyRef.current = trackedRoute.routeKey;
      send("route_change");
    }
  }, [trackedRoute.routeKey, trackedRoute.tracked]);

  useEffect(() => {
    if (!trackedRoute.tracked) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      send("heartbeat");
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [trackedRoute.routeKey, trackedRoute.tracked]);

  useEffect(() => {
    if (!trackedRoute.tracked) return;
    const onVisible = () => {
      if (!document.hidden) send("tab_visible");
    };
    const onFocus = () => send("tab_visible");
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [trackedRoute.routeKey, trackedRoute.tracked]);

  if (!orderEntryRoute || !openPlan || !planStats || customerSession.cpToken.length < 32) return null;

  const paymentAmount = paymentMode === "payoff" ? Number(openPlan.balanceCents || 0) : Number(nextPayable?.amountCents || 0);

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto bg-slate-950/98 px-4 py-6 text-white backdrop-blur-md">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-[28px] border border-red-400/35 bg-[radial-gradient(circle_at_top,rgba(239,68,68,.13),transparent_38%),#07101f] shadow-2xl">
          <div className="border-b border-red-400/20 p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-red-500/15 p-3"><LockKeyhole className="h-7 w-7 text-red-300" /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">Novo pedido bloqueado</p>
                <h1 className="mt-1 text-2xl font-black">PARCELAS PENDENTES</h1>
                <p className="mt-2 text-sm text-slate-300">Você possui saldo em aberto. Quite suas parcelas para liberar um novo pedido.</p>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-7">
            <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Produto</p>
              <p className="mt-1 text-lg font-black text-white">{openPlan.productName}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Pedido #{openPlan.orderNumber}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><p className="text-[10px] font-black uppercase text-slate-500">Valor total</p><p className="mt-1 font-black text-cyan-300">{money(openPlan.totalAmountCents)}</p></div>
                <div><p className="text-[10px] font-black uppercase text-slate-500">Já pago</p><p className="mt-1 font-black text-emerald-300">{money(openPlan.paidAmountCents)}</p></div>
                <div><p className="text-[10px] font-black uppercase text-slate-500">Pagas</p><p className="mt-1 font-black">{planStats.paidCount}</p></div>
                <div><p className="text-[10px] font-black uppercase text-slate-500">Pendentes</p><p className="mt-1 font-black text-amber-300">{planStats.pendingCount}</p></div>
              </div>
              <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 p-4">
                <p className="text-xs font-black uppercase text-amber-200">Saldo pendente</p>
                <p className="mt-1 text-3xl font-black text-amber-300">{money(openPlan.balanceCents)}</p>
              </div>
            </section>

            <section className="space-y-2">
              {planStats.installments.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {item.status === "paid" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : item.status === "awaiting_confirmation" && item.hasProof ? <Clock3 className="h-4 w-4 text-yellow-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                    <div>
                      <p className="text-sm font-black">{item.installmentNumber === 0 ? "Entrada" : `Parcela ${item.installmentNumber} de ${openPlan.installmentCount}`}</p>
                      <p className="text-[10px] font-bold text-slate-500">{statusLabel(String(item.status || ""), Boolean(item.hasProof))}</p>
                    </div>
                  </div>
                  <p className="text-sm font-black">{money(item.amountCents)}</p>
                </div>
              ))}
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setPaymentMode("installment")} className={`inline-flex min-h-[54px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black ${paymentMode === "installment" ? "bg-cyan-300 text-slate-950 ring-2 ring-cyan-100/50" : "bg-cyan-400 text-slate-950"}`}>
                <CreditCard className="h-5 w-5" /> PAGAR PARCELA
              </button>
              <button type="button" onClick={() => setPaymentMode("payoff")} className={`inline-flex min-h-[54px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black ${paymentMode === "payoff" ? "bg-emerald-300 text-emerald-950 ring-2 ring-emerald-100/50" : "bg-emerald-400 text-emerald-950"}`}>
                <WalletCards className="h-5 w-5" /> QUITAR TODAS — {money(openPlan.balanceCents)}
              </button>
            </div>

            {paymentMode && nextPayable ? (
              <section className={`rounded-2xl border p-4 ${paymentMode === "payoff" ? "border-emerald-400/35 bg-emerald-500/[0.07]" : "border-cyan-400/35 bg-cyan-500/[0.07]"}`}>
                <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${paymentMode === "payoff" ? "text-emerald-300" : "text-cyan-300"}`}>
                  {paymentMode === "payoff" ? "Quitação total" : "Parcela atual"}
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {paymentMode === "payoff"
                    ? "PAGAR TODO O SALDO"
                    : nextPayable.installmentNumber === 0
                      ? "PAGAR ENTRADA"
                      : `PAGAR PARCELA ${nextPayable.installmentNumber} DE ${openPlan.installmentCount}`}
                </h2>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-4 text-center">
                  <p className="text-[10px] font-black uppercase text-slate-400">Valor a pagar</p>
                  <p className={`mt-1 text-4xl font-black ${paymentMode === "payoff" ? "text-emerald-300" : "text-cyan-300"}`}>{money(paymentAmount)}</p>
                  {paymentMode === "installment" ? <p className="mt-2 text-xs font-semibold text-slate-500">Vencimento: {dateLabel(nextPayable.dueDate)}</p> : null}
                </div>

                {nextPayable.lastRejectionReason && !awaitingWithProof ? (
                  <div className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
                    <p className="font-black">Comprovante anterior rejeitado</p>
                    <p className="mt-1 text-xs text-red-200">Motivo: {nextPayable.lastRejectionReason}</p>
                  </div>
                ) : null}

                {awaitingWithProof ? (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-yellow-400/25 bg-yellow-500/10 p-4 text-sm font-bold text-yellow-100">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" />
                    <div>
                      <p>Comprovante enviado. Aguarde a conferência do ADM.</p>
                      <p className="mt-1 text-xs font-semibold text-yellow-200/70">Enquanto houver saldo, novos pedidos continuam bloqueados.</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={copyPix} disabled={!((pixQuery.data as any)?.pixKey)} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 text-sm font-black text-cyan-100 disabled:opacity-40">
                      <Copy className="h-4 w-4" /> {copied ? "PIX COPIADO" : "COPIAR CHAVE PIX"}
                    </button>
                    <label className={`inline-flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${paymentMode === "payoff" ? "bg-emerald-400 text-emerald-950" : "bg-cyan-400 text-slate-950"}`}>
                      {uploadingId === Number(nextPayable.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                      {uploadingId === Number(nextPayable.id) ? "ENVIANDO..." : "ENVIAR COMPROVANTE"}
                      <input type="file" accept="image/*,application/pdf,.heic,.heif" className="hidden" disabled={uploadingId != null || submitProof.isPending} onChange={(event) => { const file = event.target.files?.[0] || null; void handleProof(file); event.currentTarget.value = ""; }} />
                    </label>
                  </div>
                )}

                <p className="mt-3 text-center text-[11px] font-semibold text-slate-500">O pagamento só será baixado após a conferência e aprovação do ADM.</p>
              </section>
            ) : null}

            <p className="text-center text-xs font-semibold text-slate-500">O novo pedido será liberado automaticamente somente depois que o ADM confirmar o pagamento e o saldo ficar zerado.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
