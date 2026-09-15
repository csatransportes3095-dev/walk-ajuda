import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, LockKeyhole, WalletCards } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getCustomerRouteAuditTarget } from "@shared/customerRouteAudit";

const CP_TOKEN_KEY = "cp_token";
const PHONE_KEY = "walk_client_phone";
const HEARTBEAT_MS = 60_000;
const SESSION_SYNC_MS = 750;

function money(cents: number | null | undefined) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(status: string) {
  if (status === "paid") return "PAGA";
  if (status === "awaiting_confirmation") return "AGUARDANDO CONFERÊNCIA";
  if (status === "overdue") return "VENCIDA";
  if (status === "cancelled") return "CANCELADA";
  return "PENDENTE";
}

export default function CustomerRouteSecurityMonitor() {
  const [location, navigate] = useLocation();
  const mutation = trpc.system.customerRouteHeartbeat.useMutation();
  const lastRouteKeyRef = useRef<string | null>(null);
  const sendInFlightRef = useRef(false);
  const lastSendRef = useRef<{ key: string; sentAt: number } | null>(null);
  const queueRef = useRef<Array<{ sessionToken: string; pathname: string; trigger: "route_change" | "heartbeat" | "tab_visible" }>>([]);
  const trackedRoute = useMemo(() => getCustomerRouteAuditTarget(location), [location]);

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

  const plansQuery = trpc.vipInstallments.myPlans.useQuery(
    { cpToken: customerSession.cpToken, phone: customerSession.phone || undefined },
    {
      enabled: customerSession.cpToken.length >= 32,
      staleTime: 3_000,
      refetchInterval: customerSession.cpToken.length >= 32 ? 10_000 : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  );

  const openPlan = useMemo(() => {
    return ((plansQuery.data || []) as any[]).find((plan) =>
      Number(plan.balanceCents || 0) > 0 && !["paid", "cancelled"].includes(String(plan.status || "")),
    ) || null;
  }, [plansQuery.data]);

  const planStats = useMemo(() => {
    if (!openPlan) return null;
    const installments = (openPlan.installments || []) as any[];
    const paid = installments.filter((item) => item.status === "paid");
    const pending = installments.filter((item) => !["paid", "cancelled"].includes(item.status));
    return {
      paidCount: paid.length,
      pendingCount: pending.length,
      installments,
    };
  }, [openPlan]);

  const orderEntryRoute = useMemo(() => {
    const path = location.toLowerCase();
    return path === "/" || path === "/login" || path === "/bot" || path.startsWith("/r/");
  }, [location]);

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
                    {item.status === "paid" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                    <div><p className="text-sm font-black">{item.installmentNumber === 0 ? "Entrada" : `Parcela ${item.installmentNumber}`} de {openPlan.installmentCount}</p><p className="text-[10px] font-bold text-slate-500">{statusLabel(String(item.status || ""))}</p></div>
                  </div>
                  <p className="text-sm font-black">{money(item.amountCents)}</p>
                </div>
              ))}
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => navigate("/parcelas-vip?acao=parcela")} className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 text-sm font-black text-slate-950">
                <CreditCard className="h-5 w-5" /> PAGAR PARCELA
              </button>
              <button type="button" onClick={() => navigate("/parcelas-vip?acao=quitar")} className="inline-flex min-h-[54px] items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 text-sm font-black text-emerald-950">
                <WalletCards className="h-5 w-5" /> QUITAR TODAS — {money(openPlan.balanceCents)}
              </button>
            </div>

            <p className="text-center text-xs font-semibold text-slate-500">O pedido será liberado automaticamente somente depois que o ADM confirmar o pagamento e o saldo ficar zerado.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
